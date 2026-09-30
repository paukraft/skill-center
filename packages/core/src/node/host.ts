import { execFile, spawn } from "node:child_process"
import { watch, type FSWatcher } from "node:fs"
import {
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  readlink,
  realpath,
  rename,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises"
import { homedir } from "node:os"
import { basename, dirname, join, relative, resolve } from "node:path"
import { promisify } from "node:util"

import type { Entry, Host, RunResult } from "../host"

/**
 * The host answered from Node: the MCP server and the dev host use it as is,
 * the desktop app with the desktop's own Trash and file manager on top.
 *
 * On Windows paths cross into the core with forward slashes — Windows takes
 * them, and the core joins with `/` everywhere.
 */

const windows = process.platform === "win32"
/** Without the `\\?\` a junction's target comes back with, and with forward slashes. */
const toCore = (path: string) => (windows ? path.replace(/^\\\\\?\\/, "").replaceAll("\\", "/") : path)

const execFileAsync = promisify(execFile)

const home = toCore(homedir())
const SKIP = new Set([".git", "node_modules", ".DS_Store"])

/** Where Skill Center keeps its own files: the OS's app data folder. */
const dataDir = toCore(
  process.platform === "darwin"
    ? `${home}/Library/Application Support/Skill Center`
    : windows
      ? `${process.env.APPDATA ?? `${home}/AppData/Roaming`}/Skill Center`
      : `${process.env.XDG_CONFIG_HOME?.trim() || `${home}/.config`}/Skill Center`,
)

/**
 * The environment a terminal would have, read once from a login shell — an
 * app started from the Dock or a launcher gets a bare PATH, and npx usually
 * lives in nvm's or Homebrew's folders. A shell that hangs on its rc files is
 * given up on after 5s. Windows has no login shell: its PATH is already whole.
 */
let loginEnvRead: Promise<Record<string, string | undefined>> | undefined

function loginEnv() {
  return (loginEnvRead ??= readLoginEnv())
}

async function readLoginEnv() {
  const env: Record<string, string | undefined> = { ...process.env }
  if (windows) return env
  const marker = "__SKILL_CENTER_ENV__"
  const shell = process.env.SHELL ?? "/bin/sh"
  const { stdout } = await execFileAsync(shell, ["-ilc", `printf '${marker}'; env -0; printf '${marker}'`], {
    timeout: 5000,
    // An interactive shell ignores SIGTERM.
    killSignal: "SIGKILL",
  }).catch((error: { stdout?: string }) => ({ stdout: error.stdout ?? "" }))
  const parts = stdout.split(marker)
  if (parts.length < 3) return env
  for (const pair of parts[1]!.split("\0")) {
    const equals = pair.indexOf("=")
    if (equals > 0) env[pair.slice(0, equals)] = pair.slice(equals + 1)
  }
  return env
}

async function kindOf(path: string): Promise<Entry["kind"]> {
  try {
    return (await stat(path)).isDirectory() ? "dir" : "file"
  } catch {
    return "missing"
  }
}

async function exists(path: string) {
  return lstat(path).then(
    () => true,
    () => false,
  )
}

/** An argument as cmd.exe reads it back. */
function quoteForCmd(arg: string) {
  return /[\s"&|<>^%]/.test(arg) ? `"${arg.replaceAll('"', '""')}"` : arg
}

/**
 * Runs a program to its end. `viaShell`: on Windows, npx is npx.cmd, which
 * only cmd.exe runs.
 */
async function runProgram(
  argv: string[],
  env: Record<string, string | undefined>,
  viaShell = false,
): Promise<RunResult> {
  const shell = viaShell && windows
  const [program, ...args] = shell ? argv.map(quoteForCmd) : argv
  const running = execFileAsync(program!, args, { cwd: home, env, shell, maxBuffer: 64 * 1024 * 1024 })
  // Nothing to type in: a prompt ends rather than waits.
  running.child.stdin?.end()
  try {
    return { code: 0, ...(await running) }
  } catch (error) {
    const failed = error as { code?: unknown; stdout?: string; stderr?: string }
    // A number is the exit code; anything else means it never ran.
    if (typeof failed.code !== "number") throw error
    return { code: failed.code, stdout: failed.stdout ?? "", stderr: failed.stderr ?? "" }
  }
}

/** Fire and forget: a file manager or browser, detached from this process. */
function launch(argv: string[]) {
  const [program, ...args] = argv
  spawn(program!, args, { detached: true, stdio: "ignore" }).unref()
}

// ── Trash ────────────────────────────────────────────────────────────────

/** Numbered as Finder does: several of one name can go in the same instant. */
async function freeName(dir: string, name: string) {
  let target = join(dir, name)
  for (let n = 2; await exists(target); n++) target = join(dir, `${name} ${n}`)
  return target
}

/** The freedesktop.org Trash: the item into files/, where it came from into info/. */
async function xdgTrash(path: string) {
  const trash = join(process.env.XDG_DATA_HOME?.trim() || join(home, ".local/share"), "Trash")
  await mkdir(join(trash, "files"), { recursive: true })
  await mkdir(join(trash, "info"), { recursive: true })
  const target = await freeName(join(trash, "files"), basename(path))
  // Local time, as the spec has it.
  const now = new Date()
  const date = new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 19)
  await writeFile(
    join(trash, "info", `${basename(target)}.trashinfo`),
    `[Trash Info]\nPath=${encodeURI(resolve(path))}\nDeletionDate=${date}\n`,
  )
  await rename(path, target)
}

/** The Recycle Bin, through the shell's own delete — a junction goes, not its target. */
async function recycle(path: string) {
  const directory = (await lstat(path)).isDirectory()
  const quoted = `'${resolve(path).replaceAll("'", "''")}'`
  const script = [
    "Add-Type -AssemblyName Microsoft.VisualBasic",
    `[Microsoft.VisualBasic.FileIO.FileSystem]::${directory ? "DeleteDirectory" : "DeleteFile"}(${quoted}, 'OnlyErrorDialogs', 'SendToRecycleBin')`,
  ].join("; ")
  const result = await runProgram(["powershell", "-NoProfile", "-Command", script], process.env)
  if (result.code !== 0) throw new Error(result.stderr.trim() || `Couldn't recycle ${path}`)
}

// ── Watching ─────────────────────────────────────────────────────────────

const listeners = new Set<() => void>()
let pending: ReturnType<typeof setTimeout> | undefined
/** Each watched path's parent folder, and each path itself while it is a folder. */
let parents: FSWatcher[] = []
const inside = new Map<string, FSWatcher | null>()

/** Settled for a moment, so a whole install arrives as one change. */
function changed() {
  clearTimeout(pending)
  pending = setTimeout(() => listeners.forEach((listener) => listener()), 250)
}

function tryWatch(path: string, recursive: boolean, onEvent: (name: string | null) => void) {
  try {
    return watch(path, { recursive }, (_, name) => onEvent(name && toCore(name)))
  } catch {
    // Not there (yet); nothing to hear from it.
    return null
  }
}

async function watchInside(path: string) {
  inside.get(path)?.close()
  inside.set(path, (await kindOf(path)) === "dir" ? tryWatch(path, true, changed) : null)
}

/**
 * A folder is watched through and through; every path also through its
 * parent, so a file an editor replaces by renaming, or a folder made later,
 * is still seen — the folder's own watch is set up again when it appears.
 */
async function watchAll(paths: string[]) {
  for (const watcher of [...parents, ...inside.values()]) watcher?.close()
  parents = []
  inside.clear()
  const byParent = new Map<string, Set<string>>()
  for (const path of paths) {
    const parent = dirname(path)
    byParent.set(parent, (byParent.get(parent) ?? new Set()).add(basename(path)))
  }
  for (const [parent, names] of byParent) {
    const watcher = tryWatch(parent, false, (name) => {
      if (name === null || !names.has(name)) return
      void watchInside(`${parent}/${name}`)
      changed()
    })
    if (watcher) parents.push(watcher)
  }
  await Promise.all(paths.map(watchInside))
}

// ── The calls ────────────────────────────────────────────────────────────

const calls: Omit<Host, "onChange"> = {
  async info() {
    return { home, dataDir, mcpServer: null }
  },
  async env(names) {
    const env = await loginEnv()
    return Object.fromEntries(names.map((name) => [name, env[name] && toCore(env[name])]))
  },
  async list(dir) {
    const names = await readdir(dir).catch(() => [] as string[])
    const entries = await Promise.all(
      names.map(async (name) => {
        const path = `${dir}/${name}`
        try {
          const stat = await lstat(path)
          return {
            name,
            path,
            kind: await kindOf(path),
            link: stat.isSymbolicLink() ? toCore(await readlink(path)) : null,
          }
        } catch {
          // Gone between readdir and here: drop it rather than fail the scan.
          return null
        }
      }),
    )
    return entries.filter((entry) => entry !== null)
  },
  async realpath(path) {
    return realpath(path).then(toCore, () => null)
  },
  async read(path) {
    // Missing or not UTF-8 text (a binary file) alike: null.
    return readFile(path)
      .then((bytes) => new TextDecoder("utf-8", { fatal: true }).decode(bytes))
      .catch(() => null)
  },
  async write(path, text) {
    await mkdir(dirname(path), { recursive: true })
    // Not atomic: an atomic write would replace a symlinked config with a
    // plain file instead of writing through the link.
    await writeFile(path, text)
  },
  async symlink(target, path) {
    await mkdir(dirname(path), { recursive: true })
    // Windows makes links to folders without admin rights only as
    // junctions, which point at an absolute path — as `skills` does there.
    if (windows) await symlink(resolve(dirname(path), target), path, "junction")
    else await symlink(target, path)
  },
  async move(from, to) {
    await mkdir(dirname(to), { recursive: true })
    await rename(from, to)
  },
  async copy(from, to) {
    // `cp` would merge into a folder already there.
    if (await exists(to)) throw new Error(`${to} already exists`)
    await mkdir(dirname(to), { recursive: true })
    await cp(from, to, { recursive: true, verbatimSymlinks: true })
  },
  async trash(path) {
    if (process.platform === "darwin") await rename(path, await freeName(join(home, ".Trash"), basename(path)))
    else if (windows) await recycle(path)
    else await xdgTrash(path)
  },
  async files(dir) {
    const root = await realpath(dir)
    const out: string[] = []
    async function walk(current: string) {
      for (const entry of await readdir(current, { withFileTypes: true })) {
        if (SKIP.has(entry.name)) continue
        const path = join(current, entry.name)
        // Dirent doesn't follow links: a linked folder can't loop the walk.
        if (entry.isDirectory()) await walk(path)
        else out.push(toCore(relative(root, path)))
      }
    }
    await walk(root)
    return out.sort()
  },
  async run(argv) {
    // Plain output: no spinners or colour codes to parse around.
    return runProgram(argv, { ...(await loginEnv()), CI: "1", NO_COLOR: "1" }, true)
  },
  async http(url, headers) {
    const response = await fetch(url, {
      headers: { "User-Agent": "SkillCenter", ...headers },
      signal: AbortSignal.timeout(30_000),
    })
    return { status: response.status, body: await response.text() }
  },
  async watch(paths) {
    await watchAll(paths)
  },
  async reveal(path) {
    if (process.platform === "darwin") launch(["open", "-R", path])
    else if (windows) launch(["explorer", `/select,${resolve(path)}`])
    else launch(["xdg-open", dirname(path)])
  },
  async open(url) {
    if (process.platform === "darwin") launch(["open", url])
    else if (windows) launch(["rundll32", "url.dll,FileProtocolHandler", url])
    else launch(["xdg-open", url])
  },
}

const nodeHost: Host = {
  ...calls,
  onChange(listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}

export { nodeHost }
