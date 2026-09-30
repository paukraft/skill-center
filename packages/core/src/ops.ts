import { setClaudeEnabled, setCodexEnabled } from "./agent-config"
import type { Agent } from "./agents"
import { editFile } from "./config-file"
import { host } from "./host"
import { relativeTo } from "./paths"
import registry from "./harnesses.json"
import { folderName, slugify, writeSkillMd } from "./skill-md"
import { isManaged, scanSkills, setup, type LockEntry, type Setup, type Skill } from "./skills"
import { skillFolder } from "./skills-sh"

/**
 * Everything the app changes on disk. Claude Code and Codex are switched in
 * their own configs, without touching the skill; a harness with a folder of
 * its own is switched by linking the skill into it or not. Files move only
 * to share a skill, merge copies or delete it — and deleting goes to the
 * Trash.
 */

/** The `skills` version harnesses.json was generated from. */
const SKILLS_CLI = ["npx", "-y", `skills@${registry.cli}`]

/**
 * A relative link, as `skills` makes them: from the folder the link really
 * sits in, so it still resolves when that folder is itself a symlink.
 */
async function link(path: string, target: string) {
  await host.symlink(relativeTo(await realDir(path), target), path)
}

/** The path with its deepest existing folder resolved — the rest is yet to be made. */
async function realDir(path: string): Promise<string> {
  const slash = path.lastIndexOf("/")
  if (slash <= 0) return path
  const dir = path.slice(0, slash)
  const real = (await host.realpath(dir)) ?? (await realDir(dir))
  return real + path.slice(slash)
}

/**
 * A new or reinstalled skill as chosen in the harnesses switched in their
 * config: on where chosen — no leftover rule hides it — and off in one that
 * reads it anyway (Codex, from the shared folder) but was left out.
 * Gives back the skill as scanned, if there is one.
 */
async function applyChoice(s: Setup, id: string, chosen: Record<string, boolean>) {
  const { skills } = await scanSkills(s)
  const skill = skills.find((candidate) => candidate.id === id)
  if (!skill) return
  for (const agent of s.agents) {
    if (skill.agents[agent.id] === "absent") continue
    await setConfig(s, skill, agent, chosen[agent.id] === true)
  }
  return skill
}

/**
 * Moves the skill's folder. Codex's rules go by path, so one switched off
 * in Codex is switched off again at its new place.
 */
async function moving(s: Setup, skill: Skill, move: () => Promise<void>) {
  const codex = s.agents.find((a) => a.control === "codex" && skill.agents[a.id] === "off")
  await move()
  if (!codex) return
  await setConfig(s, skill, codex, true)
  await setConfig(s, { ...skill, codexSkillMd: null }, codex, false)
}

/**
 * Makes sure the skill's real folder is the shared one in ~/.agents/skills,
 * the way `skills` installs. A folder in a harness's own directory is moved
 * over and, if that harness does not read the shared folder, linked back.
 * One that lives somewhere else entirely (a repo) is linked, not moved.
 */
async function shareFolder(s: Setup, skill: Skill) {
  const stored = `${s.store}/${skill.id}`
  if (skill.locations.some((l) => l.kind === "shared")) return stored

  const own = skill.locations.find((l) => l.kind === "own" && !l.linked)
  if (!own) {
    await host.symlink(skill.dir, stored)
    return stored
  }
  await moving(s, skill, async () => {
    await host.move(own.path, stored)
    if (own.readers.some((id) => !s.agents.find((a) => a.id === id)?.shared)) {
      await link(own.path, stored)
    }
    // Other harnesses' links into the old folder would dangle.
    for (const location of skill.locations) {
      if (!location.linked || location.real !== own.real) continue
      await host.trash(location.path)
      await link(location.path, stored)
    }
  })
  return stored
}

async function setConfig(s: Setup, skill: Skill, agent: Agent, enabled: boolean) {
  if (agent.control === "claude") {
    await editFile(s.claudeSettings, (text) => setClaudeEnabled(text, skill.name, enabled))
  } else if (agent.control === "codex") {
    const skillMd =
      skill.codexSkillMd ?? `${await host.realpath(`${s.store}/${skill.id}`)}/SKILL.md`
    await editFile(s.codexConfig, (text) => setCodexEnabled(text, skillMd, skill.name, enabled))
  }
}

/** Adds the skill where it is absent, then clears any rule that would still hide it. */
async function switchOn(s: Setup, skill: Skill, agent: Agent) {
  if (skill.agents[agent.id] === "absent") {
    if (isManaged(skill)) throw new Error("Built-in skills stay with their harness.")
    const stored = await shareFolder(s, skill)
    if (!agent.shared) await link(`${agent.dir}/${skill.id}`, stored)
  }
  await setConfig(s, skill, agent, true)
}

async function switchOff(s: Setup, skill: Skill, agent: Agent) {
  if (skill.agents[agent.id] === "absent") return
  if (agent.control === "claude" || agent.control === "codex") {
    return setConfig(s, skill, agent, false)
  }
  if (agent.control !== "link") throw new Error(`${agent.name} reads the shared folder as a whole.`)
  const own = skill.locations.find((l) => l.kind === "own" && l.readers.includes(agent.id))
  if (!own) return
  // Harnesses sharing a folder (Zencoder and Zenflow) would all lose it.
  if (own.readers.length > 1) {
    const names = own.readers.map((id) => s.agents.find((a) => a.id === id)?.name ?? id)
    const list = new Intl.ListFormat("en").format(names)
    throw new Error(`${list} share one skills folder, so they can't be switched separately.`)
  }
  // A link goes; a folder only when another copy of the skill remains and
  // no other harness's link leads into it.
  if (!own.linked && skill.copies.length < 2) {
    throw new Error(`This is ${agent.name}'s only copy — delete the skill instead.`)
  }
  if (!own.linked && skill.locations.some((l) => l !== own && l.linked && l.real === own.real)) {
    throw new Error(`Other harnesses link to ${agent.name}'s copy — merge the copies first.`)
  }
  await host.trash(own.path)
}

async function setEnabled(skill: Skill, agent: Agent, enabled: boolean) {
  const s = await setup()
  await (enabled ? switchOn(s, skill, agent) : switchOff(s, skill, agent))
}

/** Into the shared folder, for every harness that reads it. */
async function share(skill: Skill) {
  if (isManaged(skill)) throw new Error("Built-in skills stay with their harness.")
  await shareFolder(await setup(), skill)
}

/**
 * One folder instead of several copies: the copy at `keep` becomes the
 * shared folder, the others go to the Trash, and each harness with a folder
 * of its own is linked to what is left.
 */
async function mergeCopies(skill: Skill, keep: string) {
  if (!skill.copies.includes(keep)) throw new Error(`Keep one of: ${skill.copies.join(", ")}.`)
  const s = await setup()
  const stored = `${s.store}/${skill.id}`
  const own = skill.locations.filter((l) => l.kind !== "built-in")
  // The kept folder itself, when it sits in one of the roots; otherwise it
  // lives elsewhere (a repo) and only gets linked.
  const kept = own.find((l) => l.real === keep && !l.linked)

  await moving(s, skill, async () => {
    for (const location of own) {
      if (location !== kept) await host.trash(location.path)
    }
    if (!kept) await host.symlink(keep, stored)
    else if (kept.kind !== "shared") await host.move(kept.path, stored)

    const linkBack = own.filter(
      (l) => l.kind === "own" && l.readers.some((id) => !s.agents.find((a) => a.id === id)?.shared),
    )
    for (const location of linkBack) await link(location.path, stored)
  })
}

/**
 * Every folder and link of the skill to the Trash. One `skills` installed
 * then leaves the CLI only its lock entry to take away.
 */
async function remove(skill: Skill) {
  if (isManaged(skill)) throw new Error("Built-in skills can only be switched off.")
  const s = await setup()
  if (skill.origin.kind === "skills.sh") {
    // `skills remove` wipes that name in every harness's folder, hidden ones
    // and folders that aren't skills too, then the shared one — links first,
    // so none is left dangling.
    const own = s.found.filter((a) => a.dir !== s.store).map((a) => `${a.dir}/${skill.id}`)
    for (const path of new Set([...own, `${s.store}/${skill.id}`])) {
      if (await host.realpath(path)) await host.trash(path)
    }
    await runSkills(["remove", skill.id, "-g", "-y"])
  } else {
    // A hidden harness's link into it would dangle, out of sight.
    const reals = new Set(skill.locations.map((l) => l.real))
    const hidden = s.found.filter((a) => !s.agents.includes(a) && a.dir !== s.store)
    // One Set: harnesses can share a folder (Zencoder and Zenflow).
    const paths = new Set(skill.locations.filter((l) => l.kind !== "built-in").map((l) => l.path))
    for (const path of hidden.map((a) => `${a.dir}/${skill.id}`)) {
      const real = await host.realpath(path)
      if (real && reals.has(real)) paths.add(path)
    }
    for (const path of paths) await host.trash(path)
  }
  // Leave nothing behind that would switch off a later skill of this name.
  for (const agent of s.agents) {
    if (skill.agents[agent.id] === "off") await setConfig(s, skill, agent, true)
  }
}

/** Links whose skill is gone, to the Trash. */
async function removeBroken(paths: string[]) {
  for (const path of paths) await host.trash(path)
}

type Draft = { name: string; description: string; body: string }

/** No folder of that name in any harness — `skills` would wipe it, not trash it. */
async function assertFree(s: Setup, id: string) {
  const taken = await Promise.all(
    [s.store, ...s.agents.map((a) => a.dir)].map((root) => host.realpath(`${root}/${id}`)),
  )
  if (taken.some(Boolean)) throw new Error(`There is already a skill called ${id}.`)
}

/**
 * A new skill of the user's own, in the shared folder. `chosen` says, for
 * each harness that can be switched, whether it gets it.
 */
async function create(draft: Draft, chosen: Record<string, boolean>) {
  const s = await setup()
  const id = slugify(draft.name)
  if (!id) throw new Error("Give it a name.")
  await assertFree(s, id)

  const stored = `${s.store}/${id}`
  await host.write(
    `${stored}/SKILL.md`,
    writeSkillMd({ name: id, description: draft.description.trim() }, draft.body),
  )
  // Harnesses can share a folder (Zencoder and Zenflow): one link each.
  const dirs = new Set(s.agents.filter((a) => chosen[a.id] && !a.shared).map((a) => a.dir))
  for (const dir of dirs) await link(`${dir}/${id}`, stored)
  await applyChoice(s, id, chosen)
  return id
}

async function runSkills(args: string[]) {
  const result = await host.run([...SKILLS_CLI, ...args]).catch(() => null)
  if (!result) throw new Error("Installing needs Node.js — npx was not found.")
  if (result.code !== 0) {
    // `skills` marks its error with ■ — the first one, a later ■ only says
    // it gave up. npm's notices can fill stderr.
    const lines = stripAnsi(`${result.stderr}\n${result.stdout}`).split("\n")
    const error = lines.find((line) => line.startsWith("■"))?.slice(1).trim()
    // Otherwise its last line, without the box drawing around it.
    const last = lines.findLast((line) => line.trim())?.replace(/^[─-◿\s]+/, "")
    throw new Error(error || last || "skills exited with an error")
  }
  return result
}

/**
 * Installs through the `skills` CLI itself, so its lock and updates keep
 * working: into the folders of the harnesses `agentIds` names. Gives back
 * what failed when it reached only some of them.
 */
async function runAdd(source: string, name: string, agentIds: string[]) {
  const flags = agentIds.flatMap((id) => ["-a", id])
  const { stdout } = await runSkills(["add", source, "--skill", name, "-g", ...flags, "-y"])
  // `skills` reports a harness it failed to install for, yet still exits 0.
  const output = stripAnsi(stdout)
  const failed = output.match(/Failed to install \d+/)
  if (!failed) return null
  const errors = output.split("\n").filter((line) => line.includes("✗"))
  return errors.map((line) => line.slice(line.indexOf("✗"))).join("\n") || failed[0]
}

/**
 * A skill from elsewhere, for every harness chosen and every one that reads
 * the shared folder anyway. Codex, left out, is switched off after.
 * Gives back the skill's id, the folder `skills` made of its name.
 */
async function install(source: string, name: string, chosen: Record<string, boolean>) {
  // `skills` would take anything else to mean more skills than one — a
  // bare word is a whole pack — and wipe any folder in their way.
  const repo = /^[\w.-]+\/[\w.-]+$/.test(source)
  const site = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(source)
  if (!name.trim() || name === "*" || name.startsWith("-") || !(repo || site)) {
    throw new Error("Install one skill, by its name, from owner/repo or a domain.")
  }
  const s = await setup()
  const targets = s.agents.filter((a) => a.shared || chosen[a.id])
  // With no `-a`, `skills` would install into every harness it finds.
  if (!targets.length) throw new Error("Pick at least one harness.")
  const id = folderName(name)
  await assertFree(s, id)
  const failed = await runAdd(site ? `https://${source}` : source, name, targets.map((a) => a.id))
  // Even when it failed for some, the harnesses it did reach get the choice.
  const skill = await applyChoice(s, id, chosen)
  if (failed) throw new Error(failed)
  const missed = targets.filter((a) => !skill || skill.agents[a.id] === "absent")
  if (missed.length) throw new Error(`Couldn't install for ${missed.map((a) => a.name).join(", ")}.`)
  return id
}

/**
 * Where the lock says the skill came from — at its pinned ref, if any. From
 * GitHub, the skill's own folder, as `skills update` does: a repo with a
 * SKILL.md at its root would otherwise only offer that one.
 */
function sourceOf(lock: LockEntry) {
  const github = lock.sourceType === "github"
  const base = github ? lock.source : lock.sourceBaseUrl || lock.sourceUrl || lock.source
  const folder = github && lock.skillPath ? skillFolder(lock.skillPath) : ""
  const source = folder ? `${base}/${folder}` : base
  return lock.ref ? `${source}#${lock.ref}` : source
}

/**
 * The latest version into each of the skill's folders, right where it is:
 * links, Codex's rules by path and Claude's by name all stay as they were.
 * `skills` fetches once — into the shared folder, as a copy — and moves the
 * lock on; each other folder is swapped for a copy of that. A shared folder
 * that was only a link, or not there, is put back as it was. A skill only
 * linked in, from a repo, is the repo's to update.
 */
async function refresh(skill: Skill, lock: LockEntry, store: string) {
  // `skills` finds it by name, and makes the folder from that.
  if (folderName(skill.name) !== skill.id) throw new Error("Renamed here, so skills.sh can't match it to update.")
  const stored = `${store}/${skill.id}`
  const entry = async () => (await host.list(store)).find((e) => e.name === skill.id)
  const at = skill.locations.find((l) => l.path === stored)
  const shared = at && !at.linked ? at.real : null
  const folders = new Map(
    skill.locations
      .filter((l) => !l.linked && l.kind !== "built-in" && l.real !== shared)
      .map((l) => [l.real, l.path]),
  )
  if (!shared && !folders.size) throw new Error(`Linked from ${skill.dir}. Update it there.`)
  const before = await entry()
  // `skills` would wipe it to fetch into.
  if (!at && before) throw new Error(`Something else is at ${stored}.`)

  try {
    const failed = await runAdd(sourceOf(lock), skill.name, ["universal"])
    if (failed) throw new Error(failed)
    for (const path of folders.values()) {
      await host.trash(path)
      await host.copy(stored, path)
    }
  } finally {
    // A link there, or nothing: put back what `skills` fetched over.
    if (!shared) {
      const now = await entry()
      const intact = before ? now?.link === before.link : !now
      if (!intact && now) await host.trash(stored)
      if (!intact && before?.link) await host.symlink(before.link, stored)
    }
  }
}

/**
 * Brings each skill up to date from where the lock says it came from — one
 * that fails does not stop the others, and all failures are reported after.
 * Not `skills update`: that would add them to every harness it finds.
 */
async function update(skills: Skill[]) {
  const { store } = await setup()
  const errors: string[] = []
  for (const skill of skills) {
    if (skill.origin.kind !== "skills.sh") continue
    try {
      await refresh(skill, skill.origin.lock, store)
    } catch (error) {
      errors.push(`${skill.name}: ${(error as Error).message}`)
    }
  }
  if (errors.length) throw new Error(errors.join("\n"))
}

function stripAnsi(text: string) {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").trim()
}

export { create, install, mergeCopies, remove, removeBroken, setEnabled, share, update, type Draft }
