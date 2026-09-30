import { host } from "./host"

/**
 * What the harness configs Skill Center writes to have in common: JSON that
 * keeps the file's own look, TOML cut at its table headers, and edits from
 * this process that run one at a time.
 */

const TABLE_HEADER = /^\s*\[/

function parseJson(file: string, text: string | null): Record<string, unknown> {
  if (!text?.trim()) return {}
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new Error(`${file} isn't plain JSON, so Skill Center leaves it alone.`)
  }
}

/** The file's own indent and trailing newline survive; a new file ends in one. */
function formatJson(text: string | null, json: unknown) {
  const indent = /^([ \t]+)"/m.exec(text ?? "")?.[1] ?? 2
  const trailing = !text || text.endsWith("\n") ? "\n" : ""
  return JSON.stringify(json, null, indent) + trailing
}

const edits = new Map<string, Promise<void>>()

/**
 * Rewrites a config file — only when the change leaves it different. Edits
 * to one file from this process run one after another, so none reads what
 * another is about to overwrite; other processes are not held back.
 */
async function editFile(path: string, change: (text: string | null) => string) {
  const edit = (edits.get(path) ?? Promise.resolve()).then(async () => {
    const text = await host.read(path)
    const next = change(text)
    if (next !== (text ?? "")) await host.write(path, next)
  })
  edits.set(path, edit.catch(() => {}))
  await edit
}

export { editFile, formatJson, parseJson, TABLE_HEADER }
