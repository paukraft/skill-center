import { app, type Rectangle } from "electron"
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

import type { AppSettings } from "@skill-center/core/bridge"

/**
 * The app's own preferences — the ones about the desktop, not about skills —
 * in app.json beside the settings it shares with the MCP server.
 */

type Prefs = {
  /** On by default: the tray is the way in. Without it, closing the window quits. */
  menuBarItem: boolean
  bounds?: Rectangle
  /** Open at login is switched on once, on the first start, and then left to the user. */
  registeredLoginItem?: boolean
}

const file = () => join(app.getPath("userData"), "app.json")

function read(): Prefs {
  try {
    return { menuBarItem: true, ...(JSON.parse(readFileSync(file(), "utf8")) as Partial<Prefs>) }
  } catch {
    return { menuBarItem: true }
  }
}

let prefs: Prefs | undefined

function getPrefs() {
  return (prefs ??= read())
}

function setPrefs(change: Partial<Prefs>) {
  prefs = { ...getPrefs(), ...change }
  mkdirSync(dirname(file()), { recursive: true })
  writeFileSync(file(), `${JSON.stringify(prefs, null, 2)}\n`)
}

// ── Open at login ────────────────────────────────────────────────────────

/** Linux has no API for it, only the XDG autostart folder. */
const autostart = join(
  process.env.XDG_CONFIG_HOME?.trim() || join(homedir(), ".config"),
  "autostart",
  "skill-center.desktop",
)

function opensAtLogin() {
  if (process.platform !== "linux") return app.getLoginItemSettings().openAtLogin
  try {
    readFileSync(autostart)
    return true
  } catch {
    return false
  }
}

function setOpensAtLogin(on: boolean) {
  if (process.platform !== "linux") return app.setLoginItemSettings({ openAtLogin: on })
  if (!on) return rmSync(autostart, { force: true })
  mkdirSync(dirname(autostart), { recursive: true })
  writeFileSync(
    autostart,
    `[Desktop Entry]\nType=Application\nName=Skill Center\nExec="${process.execPath}"\nX-GNOME-Autostart-enabled=true\n`,
  )
}

/** What the settings page shows and changes. */
function appSettings(): AppSettings {
  return { menuBarItem: getPrefs().menuBarItem, openAtLogin: opensAtLogin() }
}

export { appSettings, getPrefs, setOpensAtLogin, setPrefs }
