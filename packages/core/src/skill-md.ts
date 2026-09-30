import { parse, stringify } from "yaml"

/**
 * SKILL.md as both agents read it: YAML frontmatter with at least `name` and
 * `description`, then the instructions in Markdown.
 */

type SkillMd = {
  data: Record<string, unknown>
  body: string
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/

function parseSkillMd(text: string): SkillMd {
  const match = FRONTMATTER.exec(text)
  if (!match) return { data: {}, body: text }
  try {
    const data = parse(match[1]!) as unknown
    return {
      data: data && typeof data === "object" ? (data as Record<string, unknown>) : {},
      body: match[2]!,
    }
  } catch {
    return { data: {}, body: match[2]! }
  }
}

function writeSkillMd(data: Record<string, unknown>, body: string) {
  return `---\n${stringify(data, { lineWidth: 0 }).trimEnd()}\n---\n\n${body.trim()}\n`
}

function sanitize(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9._]+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
}

/**
 * The folder `skills` installs a skill of this name into, and the key it
 * keeps it under — its installer's `sanitizeName`, rule for rule.
 */
function folderName(name: string) {
  return sanitize(name).slice(0, 255) || "unnamed-skill"
}

/** A name for a new skill both agents accept: `folderName`, kept to 64 characters. */
function slugify(name: string) {
  return sanitize(name).slice(0, 64).replace(/[.-]+$/, "")
}

export { folderName, parseSkillMd, slugify, writeSkillMd, type SkillMd }
