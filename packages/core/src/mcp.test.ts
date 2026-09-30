import { describe, expect, test } from "bun:test"

import { setCodex, setJson, type McpConfig } from "./mcp"

const cursor: Extract<McpConfig, { kind: "json" }> = {
  kind: "json",
  file: "mcp.json",
  section: "mcpServers",
  entry: (command) => ({ command, args: [] }),
}

describe("JSON configs", () => {
  const original = '{\n    "mcpServers": {\n        "x": {\n            "url": "y"\n        }\n    }\n}\n'

  test("adding keeps the other servers and the file's indent", () => {
    expect(setJson(cursor, original, "/bin/mcp")).toBe(
      '{\n    "mcpServers": {\n        "x": {\n            "url": "y"\n        },\n        "skill-center": {\n            "command": "/bin/mcp",\n            "args": []\n        }\n    }\n}\n',
    )
  })

  test("removing gives the file back", () => {
    expect(setJson(cursor, setJson(cursor, original, "/bin/mcp"), null)).toBe(original)
  })

  test("removing what isn't there leaves the text alone", () => {
    expect(setJson(cursor, "{}", null)).toBe("{}")
  })

  test("a missing file gets just the server", () => {
    expect(JSON.parse(setJson(cursor, null, "/bin/mcp"))).toEqual({
      mcpServers: { "skill-center": { command: "/bin/mcp", args: [] } },
    })
  })

  test("a file with comments is refused", () => {
    expect(() => setJson(cursor, "// hi\n{}", "/bin/mcp")).toThrow()
  })
})

describe("Codex config", () => {
  const original = 'model = "x"\n\n[mcp_servers.other]\ncommand = "o"\n'

  test("adding appends the server's table", () => {
    expect(setCodex(original, "/bin/mcp")).toBe(
      `${original}\n[mcp_servers.skill-center]\ncommand = "/bin/mcp"\n`,
    )
  })

  test("removing takes the table and its subtables, and nothing else", () => {
    const text = `${original}\n[mcp_servers."skill-center"]\ncommand = "a"\n\n[mcp_servers.skill-center.env]\nA = "1"\n\n[profiles.p]\nmodel = "z"\n`
    expect(setCodex(text, null)).toBe(`${original}\n[profiles.p]\nmodel = "z"\n`)
  })

  test("adding again replaces the old table", () => {
    expect(setCodex(setCodex(original, "/old"), "/new")).toBe(setCodex(original, "/new"))
  })
})
