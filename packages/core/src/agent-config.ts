import { formatJson, parseJson, TABLE_HEADER } from "./config-file"

/**
 * Where each agent is told to leave a skill alone, without the skill being
 * touched: Claude Code's `skillOverrides` in ~/.claude/settings.json, and
 * Codex's `[[skills.config]]` tables in ~/.codex/config.toml. Both are edited
 * as text so the rest of the user's file comes back exactly as it was.
 */

// ── Claude Code ──────────────────────────────────────────────────────────

type ClaudeSettings = { skillOverrides?: Record<string, string> } & Record<string, unknown>

function parseClaudeSettings(text: string | null): ClaudeSettings {
  return parseJson("Claude Code's settings.json", text) as ClaudeSettings
}

/** Claude hides a skill whose override is "off"; any other value still shows it. */
function claudeDisabled(settings: ClaudeSettings) {
  return new Set(
    Object.entries(settings.skillOverrides ?? {})
      .filter(([, value]) => value === "off")
      .map(([name]) => name),
  )
}

/**
 * The settings with the skill switched. On is the default, so switching on
 * drops the entry — and the whole map once it is empty — rather than writing
 * "on". Key order survives: JSON.parse keeps it, and so does stringify,
 * with the file's own indent. Nothing to change leaves the text as it is.
 */
function setClaudeEnabled(text: string | null, name: string, enabled: boolean) {
  const settings = parseClaudeSettings(text)
  const current = settings.skillOverrides?.[name]
  if (enabled ? current === undefined : current === "off") return text ?? ""
  const overrides = { ...settings.skillOverrides }
  if (enabled) delete overrides[name]
  else overrides[name] = "off"
  if (Object.keys(overrides).length) settings.skillOverrides = overrides
  else delete settings.skillOverrides
  return formatJson(text, settings)
}

// ── Codex ────────────────────────────────────────────────────────────────

type CodexRule = { path?: string; name?: string; enabled: boolean }

const SKILL_RULE_HEADER = /^\s*\[\[\s*skills\.config\s*\]\]\s*(#.*)?$/
/** `key = value`, a quoted value matched first so a # inside it is not taken for a comment. */
const RULE_LINE = /^\s*(path|name|enabled)\s*=\s*("(?:[^"\\]|\\.)*"|'[^']*'|[^\s#]+)\s*(#.*)?$/

/** The config's lines, cut into the stretch before any skill rule and one block per rule. */
function ruleBlocks(text: string) {
  const lines = text.split("\n")
  const blocks: { start: number; end: number; rule: CodexRule }[] = []
  for (let i = 0; i < lines.length; i++) {
    if (!SKILL_RULE_HEADER.test(lines[i]!)) continue
    let next = i + 1
    while (next < lines.length && !TABLE_HEADER.test(lines[next]!)) next++
    // Comments before the next header belong to it; blank lines after the rule go with it.
    let end = next
    while (end > i + 1 && /^\s*(#.*)?$/.test(lines[end - 1]!)) end--
    while (end < next && !lines[end]!.trim()) end++
    blocks.push({ start: i, end, rule: parseRule(lines.slice(i + 1, end)) })
  }
  return { lines, blocks }
}

function parseRule(lines: string[]): CodexRule {
  const rule: CodexRule = { enabled: true }
  for (const line of lines) {
    const match = RULE_LINE.exec(line)
    if (!match) continue
    const [, key, raw] = match
    if (key === "enabled") rule.enabled = raw !== "false"
    else rule[key as "path" | "name"] = parseTomlString(raw!)
  }
  return rule
}

function parseTomlString(raw: string) {
  if (raw.startsWith("'")) return raw.slice(1, -1)
  try {
    return JSON.parse(raw) as string
  } catch {
    return raw.replace(/^"|"$/g, "")
  }
}

function codexRules(text: string | null) {
  return text ? ruleBlocks(text).blocks.map((block) => block.rule) : []
}

/**
 * Codex matches a rule to a skill by the canonical path of its SKILL.md, or
 * by name. The last rule wins, as in Codex.
 */
function codexEnabled(rules: CodexRule[], skillMdPath: string, name: string) {
  let enabled = true
  for (const rule of rules) {
    if (rule.path === skillMdPath || rule.name === name) enabled = rule.enabled
  }
  return enabled
}

/**
 * The config with the skill switched: every rule about it goes, and a
 * disable adds one path rule at the end — what Codex's own writer does
 * (core/src/config/edit.rs), which also never writes `enabled = true`.
 * Switching on with no rule about it leaves the text as it is.
 */
function setCodexEnabled(text: string | null, skillMdPath: string, name: string, enabled: boolean) {
  const { lines, blocks } = ruleBlocks(text ?? "")
  // A block takes the blank lines after it, so the one before it is left to
  // separate what closes up.
  const ours = blocks.filter((block) => block.rule.path === skillMdPath || block.rule.name === name)
  if (enabled && !ours.length) return text ?? ""
  const kept = lines.filter((_, i) => !ours.some((block) => i >= block.start && i < block.end))
  let next = kept.join("\n").replace(/\s*$/, "")
  if (!enabled) {
    next += `${next ? "\n\n" : ""}[[skills.config]]\npath = ${JSON.stringify(skillMdPath)}\nenabled = false`
  }
  return next ? `${next}\n` : ""
}

export {
  claudeDisabled,
  codexEnabled,
  codexRules,
  parseClaudeSettings,
  setClaudeEnabled,
  setCodexEnabled,
  type CodexRule,
}
