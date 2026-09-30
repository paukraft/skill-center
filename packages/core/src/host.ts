/**
 * The few things the core needs from the computer, and nothing domain-shaped:
 * every rule about skills lives in TypeScript on top of these. They are
 * answered in Node (node/host.ts) — in the MCP server and the dev host
 * directly, in the app from its main process (web-host.ts reaches it).
 * Paths use forward slashes on every OS.
 */

type Entry = {
  name: string
  path: string
  /** What the entry is once symlinks are followed; "missing" for a dangling link. */
  kind: "dir" | "file" | "missing"
  /** The raw target when the entry itself is a symlink. */
  link: string | null
}

type RunResult = { code: number; stdout: string; stderr: string }
type HttpResult = { status: number; body: string }

type HostCalls = {
  /**
   * `dataDir`: where Skill Center keeps its own files. `mcpServer`: its MCP
   * server binary, when running as the app.
   */
  info(): { home: string; dataDir: string; mcpServer: string | null }
  /** Variables from the user's login shell — where harness folders get moved. */
  env(names: string[]): Record<string, string | undefined>
  /** Entries of a directory; empty when it does not exist. */
  list(dir: string): Entry[]
  realpath(path: string): string | null
  read(path: string): string | null
  /** Writes the file, creating missing parent directories. */
  write(path: string, text: string): void
  symlink(target: string, path: string): void
  move(from: string, to: string): void
  /** Copies a folder, links inside it as links; fails if `to` exists. */
  copy(from: string, to: string): void
  /** Moves to the Trash — a symlink goes, not what it points at. */
  trash(path: string): void
  /** Every file under a directory, relative to it. */
  files(dir: string): string[]
  /** Runs a program with the user's login-shell PATH (npx lives there). */
  run(argv: string[]): RunResult
  http(url: string, headers?: Record<string, string>): HttpResult
  /** Replaces what is watched; changes under these paths fire `onChange`. */
  watch(paths: string[]): void
  reveal(path: string): void
  open(url: string): void
}

type Host = {
  [K in keyof HostCalls]: (...args: Parameters<HostCalls[K]>) => Promise<ReturnType<HostCalls[K]>>
} & {
  /** Fires when anything under the skill roots or the agents' configs changes. */
  onChange(listener: () => void): () => void
}

let host: Host

/** Where the calls go: the app's bridge to its main process, or Node itself. */
function setHost(implementation: Host) {
  host = implementation
}

export { host, setHost, type Entry, type Host, type HostCalls, type HttpResult, type RunResult }
