import { claudeDisabled, codexEnabled, codexRules, parseClaudeSettings } from "./agent-config"
import { allAgents, HOST_VARS, type Agent } from "./agents"
import { editFile, formatJson } from "./config-file"
import { host, type Entry } from "./host"
import { folderName, parseSkillMd } from "./skill-md"

/**
 * Every skill on this computer as one identity, however many places it sits in.
 *
 * A skill is a folder with a SKILL.md. The `skills` CLI keeps the real
 * folder in ~/.agents/skills — which the shared harnesses read directly —
 * and links it into the folder of each harness that has its own. Older
 * installs and hand-made skills sit in a harness's own folder, sometimes in
 * several as separate copies. Folders of the same name are the same skill.
 */

type AgentState = "on" | "off" | "absent"

type Location = {
  /** Where the harnesses find it — a symlink, possibly. */
  path: string
  /** The folder it resolves to. */
  real: string
  /** A link to a folder elsewhere, rather than the folder itself. */
  linked: boolean
  /** The shared folder, a harness's own, or one a harness ships and manages. */
  kind: "shared" | "own" | "built-in"
  /** The harnesses that read it here. */
  readers: string[]
}

type LockEntry = {
  source: string
  sourceType: string
  sourceUrl: string
  /** A well-known source's site, where its index is. */
  sourceBaseUrl?: string
  ref?: string
  skillPath?: string
  skillFolderHash?: string
  installedAt?: string
  updatedAt?: string
}

type Origin =
  { kind: "skills.sh"; lock: LockEntry } | { kind: "built-in"; by: string[] } | { kind: "local" }

type Skill = {
  /** The folder name: the identity. */
  id: string
  name: string
  description: string
  /** The folder read for its files — the one the others point at, if any. */
  dir: string
  locations: Location[]
  /** By harness id, for every harness on this computer. */
  agents: Record<string, AgentState>
  origin: Origin
  /** Separate folders of the user's holding it, rather than links to one. */
  copies: string[]
  /** Codex's disable rules match the canonical SKILL.md path. */
  codexSkillMd: string | null
}

type Setup = {
  store: string
  lock: string
  claudeSettings: string
  codexConfig: string
  /** Skill Center's own settings, shared by the app and the MCP server. */
  settings: string
  /** The harnesses whose folders are on this computer, in the registry's order. */
  found: Agent[]
  /** Those of them the user has not hidden: the ones the app works with. */
  agents: Agent[]
}

type Settings = {
  /**
   * A harness counts as found once its folder exists — the `skills` CLI's
   * own rule — and those folders outlive an uninstall. Which found ones the
   * user no longer has is theirs to say.
   */
  hiddenHarnesses?: string[]
}

/** Where everything is on this computer — looked up every time, so a new harness shows up. */
async function detect() {
  const [{ home, dataDir }, vars] = await Promise.all([host.info(), host.env(HOST_VARS)])
  const all = allAgents({ home, vars })
  const markers = [...new Set(all.flatMap((agent) => agent.detect))]
  const resolved = await Promise.all(markers.map((path) => host.realpath(path)))
  const exists = new Set(markers.filter((_, i) => resolved[i]))
  const found = all.filter((agent) => agent.detect.some((path) => exists.has(path)))
  const homeOf = (id: string) => all.find((a) => a.id === id)!.home
  const store = `${home}/.agents/skills`
  // A harness folder that is a link to the shared one is the shared folder.
  const [shared, ...dirs] = await Promise.all(
    [store, ...found.map((a) => a.dir)].map((path) => host.realpath(path)),
  )
  const stateHome = vars.XDG_STATE_HOME?.trim()
  return {
    store,
    lock: stateHome ? `${stateHome}/skills/.skill-lock.json` : `${home}/.agents/.skill-lock.json`,
    claudeSettings: `${homeOf("claude-code")}/settings.json`,
    codexConfig: `${homeOf("codex")}/config.toml`,
    settings: `${dataDir}/settings.json`,
    found: found.map((a, i): Agent =>
      shared && dirs[i] === shared
        ? { ...a, dir: store, shared: true, control: a.control === "link" ? "none" : a.control }
        : a,
    ),
  }
}

function parseSettings(text: string | null): Settings {
  try {
    return JSON.parse(text ?? "{}") as Settings
  } catch {
    return {}
  }
}

/** The settings are read every time: the app or an agent may have changed them. */
async function setup(): Promise<Setup> {
  const base = await detect()
  const hidden = new Set(parseSettings(await host.read(base.settings)).hiddenHarnesses)
  return { ...base, agents: base.found.filter((agent) => !hidden.has(agent.id)) }
}

async function setHarnessHidden(id: string, hidden: boolean) {
  const { settings: path, found } = await detect()
  if (!found.some((agent) => agent.id === id)) throw new Error(`No harness ${id} on this computer.`)
  await editFile(path, (text) => {
    const settings = parseSettings(text)
    const ids = new Set(settings.hiddenHarnesses)
    if (hidden) ids.add(id)
    else ids.delete(id)
    return formatJson(text, { ...settings, hiddenHarnesses: [...ids] })
  })
}

/**
 * What to watch: every folder skills are read from, and the files that
 * switch them — hidden harnesses too, so showing one needs no new watch.
 */
async function watchedPaths() {
  const s = await detect()
  return [
    ...new Set([
      s.store,
      s.lock,
      s.claudeSettings,
      s.codexConfig,
      s.settings,
      ...s.found.map((a) => a.dir),
    ]),
  ]
}

type Root = { dir: string; kind: Location["kind"]; readers: string[]; skip?: string[] }

/** Every folder skills are read from, with who reads it. */
function rootsOf(s: Setup): Root[] {
  const own = new Map<string, string[]>()
  for (const agent of s.agents) {
    if (agent.dir !== s.store) own.set(agent.dir, [...(own.get(agent.dir) ?? []), agent.id])
  }
  const roots: Root[] = [
    { dir: s.store, kind: "shared", readers: s.agents.filter((a) => a.shared).map((a) => a.id) },
    ...[...own].map(([dir, readers]): Root => ({ dir, kind: "own", readers, skip: ["synced"] })),
  ]
  // What two harnesses ship themselves: claude.ai's synced skills, Codex's system skills.
  const claude = s.agents.find((a) => a.id === "claude-code")
  const codex = s.agents.find((a) => a.id === "codex")
  if (claude) roots.push({ dir: `${claude.dir}/synced/*`, kind: "built-in", readers: [claude.id] })
  if (codex) roots.push({ dir: `${codex.dir}/.system`, kind: "built-in", readers: [codex.id] })
  return roots
}

/** Entries directly under a root; a trailing `*` stands for one level of buckets. */
async function entriesOf(root: Root): Promise<Entry[]> {
  if (!root.dir.endsWith("/*")) return host.list(root.dir)
  const buckets = await host.list(root.dir.slice(0, -2))
  const inner = await Promise.all(
    buckets.filter((b) => b.kind === "dir").map((b) => host.list(b.path)),
  )
  return inner.flat()
}

/** By folder name: `skills` keys its lock by the skill's name, which the folder is made from. */
async function readLock(path: string): Promise<Record<string, LockEntry>> {
  const text = await host.read(path)
  if (!text) return {}
  try {
    const skills = (JSON.parse(text) as { skills?: Record<string, LockEntry> }).skills ?? {}
    return Object.fromEntries(Object.entries(skills).map(([name, entry]) => [folderName(name), entry]))
  } catch {
    return {}
  }
}

type Scan = {
  skills: Skill[]
  found: Agent[]
  agents: Agent[]
  /** Links in a harness's folder whose skill is gone. */
  broken: string[]
}

async function scanSkills(s?: Setup): Promise<Scan> {
  s ??= await setup()
  const roots = rootsOf(s)
  const [listed, lock, settings, codexConfig] = await Promise.all([
    Promise.all(roots.map(entriesOf)),
    readLock(s.lock),
    host.read(s.claudeSettings),
    host.read(s.codexConfig),
  ])
  const claudeOff = claudeDisabledIn(settings)
  const rules = codexRules(codexConfig)

  const broken: string[] = []
  const found = await Promise.all(
    roots.flatMap((root, i) =>
      listed[i]!.map(async (entry): Promise<(Location & { id: string }) | null> => {
        if (entry.name.startsWith(".") || root.skip?.includes(entry.name)) return null
        if (entry.kind === "missing") {
          if (entry.link !== null && root.kind !== "built-in") broken.push(entry.path)
          return null
        }
        if (entry.kind !== "dir") return null
        const real = await host.realpath(entry.path)
        if (!real || !(await host.realpath(`${real}/SKILL.md`))) return null
        return {
          id: entry.name,
          path: entry.path,
          real,
          linked: entry.link !== null,
          kind: root.kind,
          readers: root.readers,
        }
      }),
    ),
  )
  // In root order — shared, own, built-in — so the first is where it is edited.
  const byId = new Map<string, Location[]>()
  for (const location of found) {
    if (!location) continue
    const { id, ...rest } = location
    byId.set(id, [...(byId.get(id) ?? []), rest])
  }

  const skills = await Promise.all(
    [...byId].map(async ([id, locations]) => {
      const dir = locations[0]!.real
      const text = await host.read(`${dir}/SKILL.md`)
      if (text === null) return null
      const { data } = parseSkillMd(text)
      const name = typeof data.name === "string" ? data.name : id
      const description = typeof data.description === "string" ? data.description : ""

      const codexAt = locations.find((l) => l.readers.includes("codex"))
      const codexSkillMd = codexAt ? `${codexAt.real}/SKILL.md` : null

      const agents: Record<string, AgentState> = {}
      for (const agent of s.agents) {
        const off =
          (agent.control === "claude" && claudeOff.has(name)) ||
          (agent.control === "codex" &&
            codexSkillMd !== null &&
            !codexEnabled(rules, codexSkillMd, name))
        agents[agent.id] = !locations.some((l) => l.readers.includes(agent.id))
          ? "absent"
          : off
            ? "off"
            : "on"
      }

      const skill: Skill = {
        id,
        name,
        description,
        dir,
        locations,
        agents,
        origin: originOf(id, locations, lock, s.agents),
        copies: [...new Set(locations.filter((l) => l.kind !== "built-in").map((l) => l.real))],
        codexSkillMd,
      }
      return skill
    }),
  )

  return {
    skills: skills
      .filter((skill): skill is Skill => skill !== null)
      .sort((a, b) => a.name.localeCompare(b.name)),
    found: s.found,
    agents: s.agents,
    broken: broken.sort(),
  }
}

/** A settings.json that does not parse switches nothing off — until it is written to. */
function claudeDisabledIn(settings: string | null) {
  try {
    return claudeDisabled(parseClaudeSettings(settings))
  } catch {
    return new Set<string>()
  }
}

function originOf(
  id: string,
  locations: Location[],
  lock: Record<string, LockEntry>,
  agents: Agent[],
): Origin {
  const entry = lock[id]
  if (entry && locations.some((l) => l.kind !== "built-in")) return { kind: "skills.sh", lock: entry }
  const by = locations
    .filter((l) => l.kind === "built-in")
    .flatMap((l) => l.readers.map((r) => agents.find((a) => a.id === r)?.name ?? r))
  if (by.length) return { kind: "built-in", by }
  return { kind: "local" }
}

/** Built-in skills come with their harness: they can be switched off, not changed. */
function isManaged(skill: Skill) {
  return skill.origin.kind === "built-in"
}

export {
  isManaged,
  scanSkills,
  setHarnessHidden,
  setup,
  watchedPaths,
  type AgentState,
  type Location,
  type LockEntry,
  type Origin,
  type Scan,
  type Setup,
  type Skill,
}
