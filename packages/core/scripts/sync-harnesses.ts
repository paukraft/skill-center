/**
 * Regenerates src/harnesses.json from the `skills` CLI itself, so
 * the app knows exactly the harnesses `skills` does, with the same folders.
 *
 * The CLI ships as one unminified bundle with no importable API. Its harness
 * table (src/agents.ts) is cut out of that bundle and run with stand-ins:
 * paths come back as templates (`~`, `$config`) instead of this Mac's, and
 * every `existsSync` a harness's detection makes is written down rather than
 * answered — those paths are what the app checks at runtime.
 *
 *   bun run sync
 */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

const out = join(import.meta.dir, "../src/harnesses.json")

const work = await mkdtemp(join(tmpdir(), "skills-cli-"))
try {
  const pack = Bun.spawnSync(["npm", "pack", "skills@latest", "--silent"], { cwd: work })
  if (pack.exitCode !== 0) throw new Error(`npm pack failed: ${pack.stderr}`)
  const tarball = pack.stdout.toString().trim().split("\n").at(-1)!
  Bun.spawnSync(["tar", "xzf", tarball], { cwd: work })
  const pkg = JSON.parse(await readFile(join(work, "package/package.json"), "utf8")) as {
    version: string
  }
  const bundle = await readFile(join(work, "package/dist/cli.mjs"), "utf8")

  const start = bundle.indexOf("const home = homedir();")
  const end = bundle.indexOf("async function detectInstalledAgents")
  if (start < 0 || end < start) throw new Error("The harness table moved; update this script.")
  const source = bundle.slice(start, end)

  // `X = process.env.VAR?.trim() || join(home, ".x")`: a harness folder its
  // own variable can move. The app swaps the default for the variable's value.
  const homeVars = [
    ...source.matchAll(/process\.env\.(\w+)\?\.trim\(\) \|\| join\(home, "([^"]+)"\)/g),
  ].map(([, name, dir]) => ({ name: name!, dir: `~/${dir}` }))

  const touched: string[] = []
  const table = new Function(
    "homedir",
    "xdgConfig",
    "join",
    "existsSync",
    "readFileSync",
    "readdirSync",
    "process",
    `${source}\nreturn agents`
  )(
    () => "~",
    "$config",
    (...parts: string[]) => parts.join("/").replace(/\/+/g, "/"),
    (path: string) => {
      touched.push(path)
      return false
    },
    () => {
      throw new Error("not read at build time")
    },
    () => [],
    { env: {}, cwd: () => "$cwd", platform: "darwin" }
  ) as Record<
    string,
    {
      name: string
      displayName: string
      skillsDir: string
      globalSkillsDir?: string
      detectInstalled: () => Promise<boolean>
    }
  >

  const harnesses = []
  for (const agent of Object.values(table)) {
    touched.length = 0
    await agent.detectInstalled()
    // Project-only harnesses (no global folder, or detected by the current
    // directory) have nothing to show in a Mac-wide app.
    const detect = touched.filter((path) => !path.startsWith("$cwd"))
    if (!agent.globalSkillsDir || !detect.length) continue
    harnesses.push({
      id: agent.name,
      name: agent.displayName,
      dir: agent.globalSkillsDir,
      // What `skills` calls universal: reads the shared ~/.agents/skills.
      shared: agent.skillsDir === ".agents/skills",
      detect: [...new Set(detect)],
    })
  }

  await writeFile(
    out,
    `${JSON.stringify({ cli: pkg.version, homeVars, harnesses }, null, 2)}\n`
  )
  console.log(`✓ ${harnesses.length} harnesses from skills ${pkg.version}`)
} finally {
  await rm(work, { recursive: true, force: true })
}
