import { describe, expect, test } from "bun:test"

import { allAgents } from "./agents"
import { relativeTo } from "./paths"

const byId = (vars: Record<string, string> = {}) =>
  Object.fromEntries(allAgents({ home: "/u", vars }).map((a) => [a.id, a]))

describe("harness registry", () => {
  test("folders resolve from home, XDG config and the harnesses' own variables", () => {
    const agents = byId({ CODEX_HOME: "/x/codex", XDG_CONFIG_HOME: "/cfg" })
    expect(agents["claude-code"]!.dir).toBe("/u/.claude/skills")
    expect(agents.codex!.dir).toBe("/x/codex/skills")
    expect(agents.codex!.detect).toContain("/x/codex")
    expect(agents.opencode!.dir).toBe("/cfg/opencode/skills")
    expect(agents.windsurf!.dir).toBe("/u/.codeium/windsurf/skills")
  })

  test("how each is switched", () => {
    const agents = byId()
    expect(agents["claude-code"]!.control).toBe("claude")
    expect(agents.codex!.control).toBe("codex")
    expect(agents.cursor!.control).toBe("none")
    expect(agents.windsurf!.control).toBe("link")
  })

  test("project-only harnesses are left out", () => {
    const agents = byId()
    expect(agents.eve).toBeUndefined()
    expect(agents.universal).toBeUndefined()
  })
})

describe("links", () => {
  test("relative, the way `skills` writes them", () => {
    expect(relativeTo("/u/.claude/skills/x", "/u/.agents/skills/x")).toBe("../../.agents/skills/x")
    expect(relativeTo("/u/.codeium/windsurf/skills/x", "/u/.agents/skills/x")).toBe(
      "../../../.agents/skills/x",
    )
  })

  test("absolute across Windows drives", () => {
    const target = "C:/u/.agents/skills/x"
    expect(relativeTo("D:/u/.claude/skills/x", target)).toBe(target)
    expect(relativeTo("C:/u/.claude/skills/x", target)).toBe("../../.agents/skills/x")
  })
})
