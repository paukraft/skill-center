import registry from "./harnesses.json"

/**
 * The harnesses the `skills` CLI knows, as it knows them: harnesses.json is
 * generated from the CLI's own bundle (scripts/sync-harnesses.ts), with
 * each harness's global skills folder and the paths that tell it is
 * installed. Here those templates become this computer's paths.
 *
 * "Shared" harnesses read the one folder `skills` installs into,
 * ~/.agents/skills, so a skill there is theirs without a link. The others
 * get a symlink into their own folder.
 */

type Env = {
  home: string
  /** Environment variables from the user's login shell. */
  vars: Record<string, string | undefined>
}

type Control =
  /** `skillOverrides` in Claude Code's settings.json. */
  | "claude"
  /** `[[skills.config]]` in Codex's config.toml. */
  | "codex"
  /** On while the harness's folder links to the skill. */
  | "link"
  /** Reads the shared folder only: on for every skill there, or off for none. */
  | "none"

type Agent = {
  /** The `skills` CLI's name for it — what `-a` takes. */
  id: string
  name: string
  /** Its own global skills folder. */
  dir: string
  /** The folder that one sits in, where the harness keeps its config. */
  home: string
  shared: boolean
  control: Control
  /** It is installed when any of these exists. */
  detect: string[]
}

/** The variables a path template depends on. */
const HOST_VARS = ["XDG_CONFIG_HOME", "XDG_STATE_HOME", ...registry.homeVars.map((v) => v.name)]

/**
 * A template from harnesses.json as a path on this computer: `$config` is the
 * XDG config folder, `~` home — after any harness folder its own variable
 * moves (`~/.codex` → `$CODEX_HOME`).
 */
function resolver({ home, vars }: Env) {
  const moved = registry.homeVars.flatMap(({ name, dir }) => {
    const value = vars[name]?.trim()
    return value ? [{ from: dir, to: value }] : []
  })
  const config = vars.XDG_CONFIG_HOME?.trim() || `${home}/.config`
  return (template: string) => {
    const move = moved.find(({ from }) => template === from || template.startsWith(`${from}/`))
    const path = move ? move.to + template.slice(move.from.length) : template
    return path.replace(/^\$config(?=\/|$)/, config).replace(/^~(?=\/|$)/, home)
  }
}

function allAgents(env: Env): Agent[] {
  const resolve = resolver(env)
  return registry.harnesses.map((h) => ({
    id: h.id,
    name: h.name,
    dir: resolve(h.dir),
    home: resolve(h.dir).replace(/\/skills$/, ""),
    shared: h.shared,
    control:
      h.id === "claude-code" ? "claude" : h.id === "codex" ? "codex" : h.shared ? "none" : "link",
    detect: h.detect.map(resolve),
  }))
}

/** The harnesses a skill can be switched in, one by one. */
function switchable(agents: Agent[]) {
  return agents.filter((agent) => agent.control !== "none")
}

/** The ones that read the shared folder as a whole, so always get a skill there. */
function sharedOnly(agents: Agent[]) {
  return agents.filter((agent) => agent.control === "none")
}

/** A new skill goes to every switchable harness unless told otherwise. */
function allChosen(agents: Agent[]) {
  return Object.fromEntries(switchable(agents).map((agent) => [agent.id, true]))
}

export {
  allAgents,
  allChosen,
  HOST_VARS,
  sharedOnly,
  switchable,
  type Agent,
  type Control,
  type Env,
}
