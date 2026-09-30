import { expect, test } from "bun:test"

import { folderName, slugify } from "./skill-md"

test("folderName follows the skills CLI's sanitizeName", () => {
  expect(folderName("Frontend Design")).toBe("frontend-design")
  expect(folderName("..My_Skill v2.0!")).toBe("my_skill-v2.0")
  expect(folderName("!!!")).toBe("unnamed-skill")
})

test("slugify keeps a new name to 64 characters", () => {
  expect(slugify(`${"a".repeat(63)}.b`)).toBe("a".repeat(63))
  expect(slugify("!!!")).toBe("")
})
