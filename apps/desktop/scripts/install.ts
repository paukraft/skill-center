/**
 * Installs what `bun run build` made on this platform and opens it: on a Mac
 * the app into ~/Applications, on Windows through its installer. On Linux,
 * installing the .deb needs root, so it says how.
 */
import { $ } from "bun"
import { readdir, readFile, rm, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"

const build = join(import.meta.dir, "../build")
const outputs = await readdir(build)

if (process.platform === "darwin") {
  const folder = outputs.find((name) => name.startsWith("mac"))
  if (!folder) throw new Error("No Mac build — run `bun run build` first.")
  const target = join(homedir(), "Applications/Skill Center.app")
  await $`pkill -x "Skill Center"`.nothrow().quiet()
  await rm(target, { recursive: true, force: true })
  await $`mkdir -p ${join(homedir(), "Applications")}`
  await $`cp -R ${join(build, folder, "Skill Center.app")} ${target}`
  // Let the installed copy register itself as the login item, not a build.
  const prefs = join(homedir(), "Library/Application Support/Skill Center/app.json")
  const text = await readFile(prefs, "utf8").catch(() => null)
  if (text) {
    const { registeredLoginItem: _, ...rest } = JSON.parse(text) as Record<string, unknown>
    await writeFile(prefs, `${JSON.stringify(rest, null, 2)}\n`)
  }
  await $`open ${target}`
  console.log(`✓ installed to ${target}`)
} else if (process.platform === "win32") {
  const installer = outputs.find((name) => name.endsWith(".exe"))
  if (!installer) throw new Error("No installer — run `bun run build` first.")
  await $`${join(build, installer)}`
  console.log("✓ installed")
} else {
  const deb = outputs.find((name) => name.endsWith(".deb"))
  if (!deb) throw new Error("No .deb — run `bun run build` first.")
  console.log(`Install it with:\n  sudo apt install ${join(build, deb)}`)
}
