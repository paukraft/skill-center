import type { Bridge } from "@skill-center/core/bridge"

/** The desktop app's bridge; absent in a plain browser. */

declare global {
  interface Window {
    skillCenter?: Bridge
  }
}

const bridge = window.skillCenter

/** The desktop it runs on, for its title bar and the words it uses. */
const platform: "mac" | "windows" | "linux" = /Mac/.test(navigator.userAgent)
  ? "mac"
  : /Windows/.test(navigator.userAgent)
    ? "windows"
    : "linux"

const WORDS = {
  mac: { trash: "Trash", files: "Finder", tray: "menu bar" },
  windows: { trash: "Recycle Bin", files: "File Explorer", tray: "system tray" },
  linux: { trash: "Trash", files: "Files", tray: "system tray" },
}

/** What this desktop calls its Trash, its file manager and its tray. */
const words = WORDS[platform]

export { bridge, platform, words }
