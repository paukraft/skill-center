import { describe, expect, test } from "bun:test"

import {
  claudeDisabled,
  codexEnabled,
  codexRules,
  parseClaudeSettings,
  setClaudeEnabled,
  setCodexEnabled,
} from "./agent-config"

describe("Claude settings", () => {
  const original = '{\n  "model": "x",\n  "effortLevel": "high"\n}\n'

  test("switching off adds an override and keeps the rest in order", () => {
    const next = setClaudeEnabled(original, "tdd", false)
    expect(next).toBe(
      '{\n  "model": "x",\n  "effortLevel": "high",\n  "skillOverrides": {\n    "tdd": "off"\n  }\n}\n',
    )
    expect(claudeDisabled(parseClaudeSettings(next))).toEqual(new Set(["tdd"]))
  })

  test("switching back on leaves the file as it was", () => {
    const off = setClaudeEnabled(original, "tdd", false)
    expect(setClaudeEnabled(off, "tdd", true)).toBe(original)
  })

  test("other overrides survive", () => {
    const both = setClaudeEnabled(setClaudeEnabled(original, "a", false), "b", false)
    expect(claudeDisabled(parseClaudeSettings(setClaudeEnabled(both, "a", true)))).toEqual(
      new Set(["b"]),
    )
  })

  test("keeps the file's indent", () => {
    const tabs = '{\n\t"model": "x"\n}\n'
    expect(setClaudeEnabled(tabs, "tdd", false)).toBe(
      '{\n\t"model": "x",\n\t"skillOverrides": {\n\t\t"tdd": "off"\n\t}\n}\n',
    )
  })

  test("nothing to change leaves the text alone", () => {
    const compact = '{"model":"x"}'
    expect(setClaudeEnabled(compact, "tdd", true)).toBe(compact)
    expect(setClaudeEnabled(null, "tdd", true)).toBe("")
  })

  test("no settings file yet", () => {
    expect(setClaudeEnabled(null, "tdd", false)).toBe(
      '{\n  "skillOverrides": {\n    "tdd": "off"\n  }\n}\n',
    )
  })
})

describe("Codex config", () => {
  const md = "/Users/me/.agents/skills/tdd/SKILL.md"
  const original = 'model = "gpt"\n\n[projects."/x"]\ntrust_level = "trusted"\n'

  test("disabling appends a path rule", () => {
    const next = setCodexEnabled(original, md, "tdd", false)
    expect(next).toBe(`${original}\n[[skills.config]]\npath = "${md}"\nenabled = false\n`)
    expect(codexEnabled(codexRules(next), md, "tdd")).toBe(false)
  })

  test("enabling again restores the file", () => {
    const off = setCodexEnabled(original, md, "tdd", false)
    expect(setCodexEnabled(off, md, "tdd", true)).toBe(original)
  })

  test("enabling with no rule leaves the text alone", () => {
    const loose = `${original}\n\n`
    expect(setCodexEnabled(loose, md, "tdd", true)).toBe(loose)
  })

  test("a rule in the middle comes out cleanly", () => {
    const text = `a = 1\n\n[[skills.config]]\nname = "tdd"\nenabled = false\n\n[mcp_servers.x]\nurl = "y"\n`
    expect(codexEnabled(codexRules(text), md, "tdd")).toBe(false)
    expect(setCodexEnabled(text, md, "tdd", true)).toBe(`a = 1\n\n[mcp_servers.x]\nurl = "y"\n`)
  })

  test("comments above the next table stay", () => {
    const text = `a = 1\n\n[[skills.config]]\nname = "tdd"\nenabled = false\n\n# servers\n[mcp_servers.x]\nurl = "y"\n`
    expect(setCodexEnabled(text, md, "tdd", true)).toBe(
      `a = 1\n\n# servers\n[mcp_servers.x]\nurl = "y"\n`,
    )
  })

  test("a # inside a quoted path is not a comment", () => {
    const hashed = "/Users/me/c#/tdd/SKILL.md"
    const text = `[[skills.config]]\npath = "${hashed}" # mine\nenabled = false\n`
    expect(codexRules(text)).toEqual([{ path: hashed, enabled: false }])
  })

  test("rules for other skills stay", () => {
    const text = setCodexEnabled(
      setCodexEnabled(original, md, "tdd", false),
      "/o/SKILL.md",
      "o",
      false,
    )
    const next = setCodexEnabled(text, md, "tdd", true)
    expect(codexEnabled(codexRules(next), md, "tdd")).toBe(true)
    expect(codexEnabled(codexRules(next), "/o/SKILL.md", "o")).toBe(false)
  })
})
