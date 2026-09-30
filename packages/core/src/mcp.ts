import type { Agent } from "./agents"
import { editFile, formatJson, parseJson, TABLE_HEADER } from "./config-file"
import { host } from "./host"
import { setup } from "./skills"

/**
 * Skill Center's MCP server, added to or removed from each harness's own MCP
 * config — what `claude mcp add` and friends write, written the same way.
 * Only the harnesses whose config format is known are offered. The server
 * counts as added wherever an entry by its name is there.
 */

const NAME = "skill-center"

type JsonConfig = {
  kind: "json"
  file: string
  /** The object the servers sit in, by name. */
  section: string
  entry: (command: string) => Record<string, unknown>
}
type McpConfig = JsonConfig | { kind: "codex"; file: string }

/** Where a harness keeps its MCP servers, from its home folder. */
const CONFIGS: Record<string, (home: string, harnessHome: string) => McpConfig> = {
  "claude-code": (home, dir) => ({
    kind: "json",
    // ~/.claude.json sits next to ~/.claude — inside it once CLAUDE_CONFIG_DIR moves it.
    file: dir === `${home}/.claude` ? `${home}/.claude.json` : `${dir}/.claude.json`,
    section: "mcpServers",
    entry: (command) => ({ type: "stdio", command, args: [], env: {} }),
  }),
  codex: (_, dir) => ({ kind: "codex", file: `${dir}/config.toml` }),
  cursor: (_, dir) => ({
    kind: "json",
    file: `${dir}/mcp.json`,
    section: "mcpServers",
    entry: (command) => ({ command, args: [] }),
  }),
  "gemini-cli": (_, dir) => ({
    kind: "json",
    file: `${dir}/settings.json`,
    section: "mcpServers",
    entry: (command) => ({ command, args: [] }),
  }),
  "github-copilot": (_, dir) => ({
    kind: "json",
    file: `${dir}/mcp-config.json`,
    section: "mcpServers",
    entry: (command) => ({ type: "local", command, args: [], tools: ["*"] }),
  }),
  "kiro-cli": (_, dir) => ({
    kind: "json",
    file: `${dir}/settings/mcp.json`,
    section: "mcpServers",
    entry: (command) => ({ command, args: [] }),
  }),
  opencode: (_, dir) => ({
    kind: "json",
    file: `${dir}/opencode.json`,
    section: "mcp",
    entry: (command) => ({ type: "local", command: [command], enabled: true }),
  }),
  windsurf: (_, dir) => ({
    kind: "json",
    file: `${dir}/mcp_config.json`,
    section: "mcpServers",
    entry: (command) => ({ command, args: [] }),
  }),
}

type McpHarness = { agent: Agent; config: McpConfig; added: boolean }

function configOf(agent: Agent, home: string) {
  return CONFIGS[agent.id]?.(home, agent.home)
}

// ── JSON ─────────────────────────────────────────────────────────────────

function sectionOf(json: Record<string, unknown>, section: string) {
  const value = json[section]
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {}
}

/** The file's own indent and trailing newline survive, and so does key order. */
function setJson(config: JsonConfig, text: string | null, command: string | null) {
  const json = parseJson(config.file, text)
  const servers = { ...sectionOf(json, config.section) }
  if (!command && !(NAME in servers)) return text ?? ""
  if (command) servers[NAME] = config.entry(command)
  else delete servers[NAME]
  json[config.section] = servers
  return formatJson(text, json)
}

// ── Codex ────────────────────────────────────────────────────────────────

/** `[mcp_servers.skill-center]` and its subtables, quoted or not. */
const CODEX_TABLE = new RegExp(`^\\s*\\[\\s*mcp_servers\\.(?:${NAME}|"${NAME}")(?:\\.|\\s*\\])`)

/** The config without the server's tables — and the server's table added again when on. */
function setCodex(text: string | null, command: string | null) {
  const kept: string[] = []
  let ours = false
  for (const line of (text ?? "").split("\n")) {
    if (TABLE_HEADER.test(line)) ours = CODEX_TABLE.test(line)
    if (!ours) kept.push(line)
  }
  let next = kept.join("\n").replace(/\s*$/, "")
  if (command) next += `${next ? "\n\n" : ""}[mcp_servers.${NAME}]\ncommand = ${JSON.stringify(command)}`
  return next ? `${next}\n` : ""
}

// ── Both ─────────────────────────────────────────────────────────────────

function isAdded(config: McpConfig, text: string | null) {
  if (config.kind === "codex") return (text ?? "").split("\n").some((line) => CODEX_TABLE.test(line))
  return NAME in sectionOf(parseJson(config.file, text), config.section)
}

/** The harnesses the app works with whose MCP config it knows, and where the server is added. */
async function mcpHarnesses(): Promise<McpHarness[]> {
  const [{ agents }, { home }] = await Promise.all([setup(), host.info()])
  const known = agents.flatMap((agent) => {
    const config = configOf(agent, home)
    return config ? [{ agent, config }] : []
  })
  return Promise.all(
    known.map(async ({ agent, config }) => {
      const text = await host.read(config.file)
      let added = false
      try {
        added = isAdded(config, text)
      } catch {
        // A config it can't read is one it won't write to either: shown as not added.
      }
      return { agent, config, added }
    }),
  )
}

/** Adds the server to a harness's config, pointing at `command`, or removes it (`null`). */
async function setMcp(id: string, command: string | null) {
  const { home } = await host.info()
  const agent = (await setup()).agents.find((candidate) => candidate.id === id)
  const config = agent && configOf(agent, home)
  if (!config) throw new Error(`Skill Center can't add its MCP server to ${agent?.name ?? id}.`)
  await editFile(config.file, (text) =>
    config.kind === "codex" ? setCodex(text, command) : setJson(config, text, command),
  )
}

export { mcpHarnesses, setCodex, setJson, setMcp, type McpConfig, type McpHarness }
