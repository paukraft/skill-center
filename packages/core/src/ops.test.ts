import { expect, test } from "bun:test"

import { allAgents } from "./agents"
import { setHost, type Host } from "./host"
import { setEnabled } from "./ops"
import type { Skill } from "./skills"

test("harnesses sharing a folder can't be switched off one at a time", async () => {
  const trashed: string[] = []
  // Every harness found, nothing hidden, no shared folder.
  setHost({
    info: async () => ({ home: "/u", dataDir: "/data", mcpServer: null }),
    env: async () => ({}),
    realpath: async (path: string) => (path.startsWith("/u/.zencoder") ? path : null),
    read: async () => null,
    trash: async (path: string) => void trashed.push(path),
  } as unknown as Host)

  const zencoder = allAgents({ home: "/u", vars: {} }).find((a) => a.id === "zencoder")!
  const path = "/u/.zencoder/skills/x"
  const skill = {
    id: "x",
    locations: [{ path, real: path, linked: false, kind: "own", readers: ["zencoder", "zenflow"] }],
    agents: { zencoder: "on", zenflow: "on" },
    copies: [path, "/elsewhere/x"],
  } as unknown as Skill

  await expect(setEnabled(skill, zencoder, false)).rejects.toThrow(
    "Zencoder and Zenflow share one skills folder, so they can't be switched separately.",
  )
  expect(trashed).toEqual([])
})
