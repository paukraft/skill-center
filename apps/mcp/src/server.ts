import { lstat } from "node:fs/promises"
import { dirname, resolve } from "node:path"

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"

import { switchable, type Agent } from "@skill-center/core/agents"
import { host, setHost } from "@skill-center/core/host"
import * as ops from "@skill-center/core/ops"
import { isManaged, scanSkills, setHarnessHidden, setup, type Skill } from "@skill-center/core/skills"
import { download, outdated, popular, search } from "@skill-center/core/skills-sh"
import { nodeHost } from "@skill-center/core/node/host"

/**
 * Skill Center for agents: everything the app does, as MCP tools over stdio,
 * on the same core and the same files — the app sees an agent's changes as
 * it would its own.
 */

setHost(nodeHost)

const server = new McpServer(
  { name: "skill-center", version: "1.0.0" },
  {
    instructions: `Manages the agent skills on this computer across every harness (Claude Code, Codex, Cursor, …), as the Skill Center app does.
A skill is a folder with a SKILL.md; its id is the folder name. The \`skills\` CLI keeps skills in ~/.agents/skills, which some harnesses read directly, and links them into the folders of the others.
Per harness a skill is "on", "off" (switched off in that harness's config, files untouched) or "absent" (not in any folder that harness reads).
Built-in skills ship with their harness: they can be switched off, not edited or deleted. Anything removed goes to the Trash.`,
  },
)

const json = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
})

const read = { readOnlyHint: true, openWorldHint: false }
const change = { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
const destroy = { readOnlyHint: false, destructiveHint: true, openWorldHint: false }
const online = { readOnlyHint: true, openWorldHint: true }

function describeOrigin(skill: Skill) {
  const { origin } = skill
  if (origin.kind === "skills.sh") return { from: "skills.sh", source: origin.lock.source }
  if (origin.kind === "built-in") return { from: "built-in", by: origin.by }
  return { from: "local" }
}

function summary(skill: Skill) {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    ...describeOrigin(skill),
    harnesses: skill.agents,
    ...(skill.copies.length > 1 && { separateCopies: skill.copies }),
  }
}

async function findSkill(id: string) {
  const { skills } = await scanSkills()
  const skill = skills.find((s) => s.id === id) ?? skills.find((s) => s.name === id)
  if (!skill) throw new Error(`No skill "${id}". list_skills shows them all.`)
  return skill
}

function findHarness(agents: Agent[], id: string): Agent {
  const agent = agents.find((a) => a.id === id)
  if (!agent) throw new Error(`No harness "${id}". Ones in use: ${agents.map((a) => a.id).join(", ")}.`)
  return agent
}

/** Which switchable harnesses get a new skill: the ones named, or all of them. */
async function choose(harnesses: string[] | undefined) {
  const { agents } = await setup()
  for (const id of harnesses ?? []) findHarness(agents, id)
  return Object.fromEntries(
    switchable(agents).map((a) => [a.id, harnesses ? harnesses.includes(a.id) : true]),
  )
}

/**
 * A file inside the skill's folder, never outside it — also not through a
 * symlink: the nearest part of the path that exists must resolve inside.
 */
async function fileIn(skill: Skill, path: string) {
  const full = resolve(skill.dir, path)
  let existing = full
  while (!(await lstat(existing).catch(() => null))) existing = dirname(existing)
  const [real, root] = await Promise.all([host.realpath(existing), host.realpath(skill.dir)])
  if (!real || !root || (real !== root && !real.startsWith(root + "/"))) {
    throw new Error("The path must stay inside the skill.")
  }
  return full
}

async function fresh(id: string) {
  const { skills } = await scanSkills()
  const skill = skills.find((s) => s.id === id)
  return skill ? summary(skill) : { id, gone: true }
}

const skillId = z.string().describe("The skill's id (its folder name) or name")
const harnessIds = z
  .array(z.string())
  .optional()
  .describe("Harness ids to give it to (list_harnesses); all of them when left out")

// ── Harnesses ────────────────────────────────────────────────────────────

server.registerTool(
  "list_harnesses",
  {
    description:
      "The harnesses found on this computer, by their folders — which outlive an uninstall, so the user can hide ones they no longer use. `control` says how a skill is switched: claude/codex in their config, link by linking it into the harness's folder, none when the harness reads ~/.agents/skills as a whole.",
    annotations: read,
  },
  async () => {
    const { found, agents } = await setup()
    return json(
      found.map((a) => ({
        id: a.id,
        name: a.name,
        dir: a.dir,
        control: a.control,
        hidden: !agents.includes(a),
      })),
    )
  },
)

server.registerTool(
  "set_harness_hidden",
  {
    description: "Hides a harness from Skill Center, or shows it again. Its folders stay as they are.",
    inputSchema: { harness: z.string(), hidden: z.boolean() },
    annotations: change,
  },
  async ({ harness, hidden }) => {
    await setHarnessHidden(harness, hidden)
    return json({ harness, hidden })
  },
)

// ── Skills ───────────────────────────────────────────────────────────────

server.registerTool(
  "list_skills",
  {
    description:
      "Every skill on this computer, deduplicated across harnesses, with its state in each harness. Also lists broken links (a harness folder linking to a skill that is gone).",
    inputSchema: {
      query: z.string().optional().describe("Only skills whose id, name or description contain this"),
    },
    annotations: read,
  },
  async ({ query }) => {
    const { skills, broken } = await scanSkills()
    const q = query?.toLowerCase()
    const matching = q
      ? skills.filter((s) => `${s.id} ${s.name} ${s.description}`.toLowerCase().includes(q))
      : skills
    return json({ skills: matching.map(summary), brokenLinks: broken })
  },
)

server.registerTool(
  "get_skill",
  {
    description:
      "One skill in full: where it sits and who reads it there, where it came from, and its files.",
    inputSchema: { skill: skillId },
    annotations: read,
  },
  async ({ skill: id }) => {
    const skill = await findSkill(id)
    return json({
      ...summary(skill),
      dir: skill.dir,
      editable: !isManaged(skill),
      locations: skill.locations,
      ...(skill.origin.kind === "skills.sh" && { lock: skill.origin.lock }),
      files: await host.files(skill.dir),
    })
  },
)

server.registerTool(
  "read_skill_file",
  {
    description: "A file of a skill, SKILL.md by default.",
    inputSchema: {
      skill: skillId,
      path: z.string().default("SKILL.md").describe("Relative to the skill's folder"),
    },
    annotations: read,
  },
  async ({ skill: id, path }) => {
    const text = await host.read(await fileIn(await findSkill(id), path))
    if (text === null) throw new Error(`No file ${path} in ${id}.`)
    return { content: [{ type: "text" as const, text }] }
  },
)

server.registerTool(
  "write_skill_file",
  {
    description:
      "Writes a file of a skill, creating it if needed. Every harness reading the skill sees the change. Not for built-in skills.",
    inputSchema: {
      skill: skillId,
      path: z.string().describe("Relative to the skill's folder"),
      content: z.string(),
    },
    annotations: change,
  },
  async ({ skill: id, path, content }) => {
    const skill = await findSkill(id)
    if (isManaged(skill)) throw new Error("Built-in skills stay as their harness ships them.")
    await host.write(await fileIn(skill, path), content)
    return json({ written: `${skill.dir}/${path}` })
  },
)

server.registerTool(
  "set_skill_enabled",
  {
    description:
      "Switches a skill on or off for one harness. Claude Code and Codex are switched in their configs; other harnesses by linking the skill into their folder or taking the link out. Switching on where it is absent adds it.",
    inputSchema: { skill: skillId, harness: z.string(), enabled: z.boolean() },
    annotations: change,
  },
  async ({ skill: id, harness, enabled }) => {
    const skill = await findSkill(id)
    await ops.setEnabled(skill, findHarness((await setup()).agents, harness), enabled)
    return json(await fresh(skill.id))
  },
)

server.registerTool(
  "share_skill",
  {
    description:
      "Moves a skill that sits in one harness's own folder into the shared ~/.agents/skills, linking it back, so every harness that reads the shared folder gets it.",
    inputSchema: { skill: skillId },
    annotations: change,
  },
  async ({ skill: id }) => {
    const skill = await findSkill(id)
    await ops.share(skill)
    return json(await fresh(skill.id))
  },
)

server.registerTool(
  "merge_skill_copies",
  {
    description:
      "For a skill held in several separate folders (separateCopies): keeps one as the shared folder, trashes the others and links every harness to what is left. Compare the copies with read_skill_file first.",
    inputSchema: {
      skill: skillId,
      keep: z.string().describe("The folder to keep, one of the skill's separateCopies"),
    },
    annotations: destroy,
  },
  async ({ skill: id, keep }) => {
    const skill = await findSkill(id)
    await ops.mergeCopies(skill, keep)
    return json(await fresh(skill.id))
  },
)

server.registerTool(
  "delete_skill",
  {
    description:
      "Deletes a skill from every harness, to the Trash; one from skills.sh also leaves the `skills` lock. Not for built-in skills — switch those off.",
    inputSchema: { skill: skillId },
    annotations: destroy,
  },
  async ({ skill: id }) => {
    const skill = await findSkill(id)
    await ops.remove(skill)
    return json({ deleted: skill.id })
  },
)

server.registerTool(
  "remove_broken_links",
  {
    description: "Moves every broken link (list_skills' brokenLinks) to the Trash.",
    annotations: destroy,
  },
  async () => {
    const { broken } = await scanSkills()
    await ops.removeBroken(broken)
    return json({ removed: broken })
  },
)

server.registerTool(
  "create_skill",
  {
    description: "Creates a skill of the user's own in ~/.agents/skills and gives it to the harnesses chosen.",
    inputSchema: {
      name: z.string().describe("Becomes the id: lower-case, hyphenated"),
      description: z
        .string()
        .describe("What it does and when to use it — how agents decide to load it"),
      body: z.string().describe("The instructions, in Markdown, without frontmatter"),
      harnesses: harnessIds,
    },
    annotations: change,
  },
  async ({ name, description, body, harnesses }) => {
    const id = await ops.create({ name, description, body }, await choose(harnesses))
    return json(await fresh(id))
  },
)

// ── skills.sh ────────────────────────────────────────────────────────────

server.registerTool(
  "search_skills_sh",
  {
    description: "Searches skills.sh, the skills directory; without a query, its most installed skills.",
    inputSchema: { query: z.string().optional() },
    annotations: online,
  },
  async ({ query }) => json(query?.trim() ? await search(query) : await popular()),
)

server.registerTool(
  "preview_skills_sh",
  {
    description: "The files of a skill on skills.sh, to read before installing it.",
    inputSchema: {
      source: z.string().describe("owner/repo, as search_skills_sh gives it"),
      skillId: z.string().describe("The skill's skillId, as search_skills_sh gives it"),
    },
    annotations: online,
  },
  async ({ source, skillId }) => json(await download(source, skillId)),
)

server.registerTool(
  "install_skill",
  {
    description:
      "Installs a skill from skills.sh through the `skills` CLI (so its updates keep working) for the harnesses chosen.",
    inputSchema: {
      source: z.string().describe("owner/repo or a domain, as search_skills_sh gives it"),
      name: z.string().describe("The skill's name, as search_skills_sh gives it — not its skillId"),
      harnesses: harnessIds,
    },
    annotations: { ...change, openWorldHint: true },
  },
  async ({ source, name, harnesses }) => {
    return json(await fresh(await ops.install(source, name, await choose(harnesses))))
  },
)

server.registerTool(
  "check_updates",
  {
    description: "Which skills installed from skills.sh have changed upstream.",
    annotations: online,
  },
  async () => {
    const { skills } = await scanSkills()
    const { stale, complete } = await outdated(skills)
    return json({
      outdated: [...stale],
      ...(!complete && { note: "Some repositories could not be asked (GitHub rate limit)." }),
    })
  },
)

server.registerTool(
  "update_skills",
  {
    description:
      "Updates skills installed from skills.sh to their latest version, each in the folders it is in now. One that fails does not stop the others: the error names every skill that failed, one per line.",
    inputSchema: {
      skills: z.array(z.string()).optional().describe("Skill ids; every outdated one when left out"),
    },
    annotations: { ...change, openWorldHint: true },
  },
  async ({ skills: ids }) => {
    let targets: Skill[]
    if (ids) {
      targets = await Promise.all(ids.map(findSkill))
      const other = targets.find((s) => s.origin.kind !== "skills.sh")
      if (other) throw new Error(`${other.id} was not installed from skills.sh.`)
    } else {
      const { skills } = await scanSkills()
      const { stale } = await outdated(skills)
      targets = skills.filter((s) => stale.has(s.id))
    }
    if (targets.length) await ops.update(targets)
    return json({ updated: targets.map((s) => s.id) })
  },
)

await server.connect(new StdioServerTransport())
