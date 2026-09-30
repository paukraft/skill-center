import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  net,
  protocol,
  screen,
  shell,
  Tray,
  type IpcMainInvokeEvent,
  type MenuItemConstructorOptions,
} from "electron"
import { existsSync } from "node:fs"
import { dirname, join, resolve, sep } from "node:path"
import { pathToFileURL } from "node:url"

import { CHANNELS, type AppSettings, type Reply } from "@skill-center/core/bridge"
import type { Host, HostCalls } from "@skill-center/core/host"
import { nodeHost } from "@skill-center/core/node/host"

import { appSettings, getPrefs, setOpensAtLogin, setPrefs } from "./prefs"

/**
 * The app lives in the tray (the menu bar on a Mac). Clicking the icon brings
 * the window to the front, or hides it when it already is; closing the window
 * only hides it. Quitting is in the icon's menu. With the icon switched off in
 * the settings, it is a plain app that quits when its window closes.
 *
 * Deliberately dumb: every rule about skills lives in the UI's core; this side
 * answers its host calls (packages/core/src/host.ts) from Node.
 */

const mac = process.platform === "darwin"
const SCHEME = "skillcenter"
/** Unpackaged, the window shows the Vite dev server (`bun run dev`). */
const DEV_URL = "http://localhost:5199"
/** The page's header (apps/web App.tsx) is the title bar. */
const HEADER_HEIGHT = 56

/** Where the app's own files are: the packaged archive, or this folder. */
const appDir = app.getAppPath()
const assets = join(appDir, "assets")
/** The MCP server shipped next to the app's own binary. */
const mcpServer = join(
  dirname(process.execPath),
  process.platform === "win32" ? "skill-center-mcp.exe" : "skill-center-mcp",
)

let window: BrowserWindow | undefined
let tray: Tray | undefined
let quitting = false

// ── Host ─────────────────────────────────────────────────────────────────

/** Node's host, with the desktop's own Trash, file manager and browser. */
const host: Host = {
  ...nodeHost,
  async info() {
    return { ...(await nodeHost.info()), mcpServer: existsSync(mcpServer) ? mcpServer : null }
  },
  trash: (path) => shell.trashItem(resolve(path)),
  reveal: async (path) => shell.showItemInFolder(resolve(path)),
  open: (url) => shell.openExternal(url),
}

/** Only the app's own page may call in: the host runs anything. */
function fromPage(event: IpcMainInvokeEvent) {
  const url = event.senderFrame?.url ?? ""
  return url.startsWith(app.isPackaged ? `${SCHEME}://` : DEV_URL)
}

async function reply<T>(event: IpcMainInvokeEvent, answer: () => Promise<T> | T): Promise<Reply<T>> {
  if (!fromPage(event)) return { ok: false, error: "Not the app's page" }
  try {
    return { ok: true, value: await answer() }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

ipcMain.handle(CHANNELS.host, (event, method: string, args: unknown[]) =>
  reply(event, async () => {
    if (method === "onChange" || !Object.hasOwn(host, method)) throw new Error(`Unknown call ${method}`)
    const call = host[method as keyof HostCalls] as (...args: unknown[]) => Promise<unknown>
    return (await call(...args)) ?? null
  }),
)

ipcMain.handle(CHANNELS.settings, (event, change?: { key: keyof AppSettings; value: boolean }) =>
  reply(event, () => {
    if (change?.key === "menuBarItem") {
      setPrefs({ menuBarItem: change.value })
      placeTray()
    } else if (change?.key === "openAtLogin") {
      setOpensAtLogin(change.value)
    } else if (change) {
      throw new Error(`Unknown setting ${change.key}`)
    }
    return appSettings()
  }),
)

/** Tells the page something on disk moved, so it reads the skills again. */
function notifyChange() {
  window?.webContents.send(CHANNELS.change)
}

host.onChange(notifyChange)

// ── The page ─────────────────────────────────────────────────────────────

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

/**
 * Serves the built UI out of the app. A scheme of its own rather than
 * file:// so module scripts and their chunks load like from a server.
 */
function serveWeb() {
  const root = join(process.resourcesPath, "web")
  protocol.handle(SCHEME, (request) => {
    const path = decodeURIComponent(new URL(request.url).pathname)
    const file = resolve(root, `.${path === "/" ? "/index.html" : path}`)
    if (!file.startsWith(root + sep)) return new Response(null, { status: 404 })
    return net.fetch(pathToFileURL(file).toString())
  })
}

// ── Window ───────────────────────────────────────────────────────────────

/** The header's own color behind Windows' and Linux's window controls. */
function titleBarOverlay() {
  const dark = nativeTheme.shouldUseDarkColors
  return {
    color: dark ? "#100f0d" : "#f6f6f6",
    symbolColor: dark ? "#ffffff" : "#000000",
    height: HEADER_HEIGHT,
  }
}

/** Where the window was, unless that screen is gone. */
function savedBounds() {
  const bounds = getPrefs().bounds
  if (!bounds) return {}
  const area = screen.getDisplayMatching(bounds).workArea
  const visible =
    bounds.x < area.x + area.width &&
    bounds.x + bounds.width > area.x &&
    bounds.y < area.y + area.height &&
    bounds.y + bounds.height > area.y
  return visible ? bounds : {}
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1120,
    height: 740,
    ...savedBounds(),
    minWidth: 860,
    minHeight: 560,
    show: false,
    title: "Skill Center",
    backgroundColor: titleBarOverlay().color,
    titleBarStyle: "hidden",
    // The traffic lights, centered in the header and in from the edge.
    ...(mac
      ? { trafficLightPosition: { x: 16, y: (HEADER_HEIGHT - 14) / 2 } }
      : { titleBarOverlay: titleBarOverlay() }),
    webPreferences: { preload: join(appDir, "dist/preload.cjs"), sandbox: true },
  })
  if (!mac) nativeTheme.on("updated", () => win.setTitleBarOverlay(titleBarOverlay()))

  // Links open in the browser, never in the app's window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url)
    return { action: "deny" }
  })
  win.webContents.on("will-navigate", (event) => event.preventDefault())

  win.on("close", (event) => {
    setPrefs({ bounds: win.getNormalBounds() })
    if (quitting) return
    if (!getPrefs().menuBarItem) return app.quit()
    event.preventDefault()
    hideWindow()
  })

  void win.loadURL(app.isPackaged ? `${SCHEME}://app/index.html` : DEV_URL)
  win.once("ready-to-show", showWindow)
  return win
}

function showWindow() {
  if (!window) return
  if (mac) void app.dock?.show()
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
  // A tray click doesn't activate the app on its own.
  if (mac) app.focus({ steal: true })
  notifyChange()
}

/** Out of sight — and on a Mac out of the Dock, focus back to the app before. */
function hideWindow() {
  window?.hide()
  if (mac) {
    app.dock?.hide()
    app.hide()
  }
}

function toggleWindow() {
  if (window?.isVisible() && window.isFocused() && !window.isMinimized()) hideWindow()
  else showWindow()
}

// ── Tray ─────────────────────────────────────────────────────────────────

/** macOS tints a template itself; elsewhere the icon follows the theme. */
function trayIcon() {
  const name = mac ? "trayTemplate" : nativeTheme.shouldUseDarkColors ? "tray-dark" : "tray-light"
  return nativeImage.createFromPath(join(assets, `${name}.png`))
}

function trayMenu() {
  return Menu.buildFromTemplate([
    { label: "Open Skill Center", click: showWindow },
    { type: "separator" },
    {
      label: "Open at Login",
      type: "checkbox",
      checked: appSettings().openAtLogin,
      click: (item) => setOpensAtLogin(item.checked),
    },
    { type: "separator" },
    { label: "Quit Skill Center", role: "quit" },
  ])
}

/** Puts the icon up or takes it down, as the settings say. */
function placeTray() {
  if (getPrefs().menuBarItem && !tray) {
    tray = new Tray(trayIcon())
    tray.setToolTip("Skill Center")
    if (process.platform === "linux") {
      // Most Linux trays only open a menu; the menu is the way in.
      tray.setContextMenu(trayMenu())
      tray.on("click", toggleWindow)
    } else {
      tray.on("click", (event) => (event.ctrlKey ? tray?.popUpContextMenu(trayMenu()) : toggleWindow()))
      tray.on("right-click", () => tray?.popUpContextMenu(trayMenu()))
    }
  } else if (!getPrefs().menuBarItem && tray) {
    tray.destroy()
    tray = undefined
  }
}

nativeTheme.on("updated", () => tray?.setImage(trayIcon()))

// ── Menu ─────────────────────────────────────────────────────────────────

/** A Mac's menus: copy, paste, undo and the window's shortcuts go through them. */
function macMenu() {
  const template: MenuItemConstructorOptions[] = [
    {
      label: "Skill Center",
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "hide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    { role: "editMenu" },
    { role: "windowMenu" },
  ]
  return Menu.buildFromTemplate(template)
}

// ── Start ────────────────────────────────────────────────────────────────

async function start() {
  app.setName("Skill Center")
  // One folder for the app's files, the same one the MCP server reads.
  app.setPath("userData", (await nodeHost.info()).dataDir)
  if (!app.requestSingleInstanceLock()) return app.exit()

  app.on("second-instance", showWindow)
  // The Dock icon, clicked while the window is hidden.
  app.on("activate", showWindow)
  app.on("before-quit", () => (quitting = true))
  app.on("window-all-closed", () => app.quit())

  await app.whenReady()
  if (app.isPackaged) serveWeb()
  Menu.setApplicationMenu(mac ? macMenu() : null)
  // Open at login by default — the tray is the way in — but only once, so
  // switching it off anywhere sticks.
  if (app.isPackaged && !getPrefs().registeredLoginItem) {
    setPrefs({ registeredLoginItem: true })
    setOpensAtLogin(true)
  }
  window = createWindow()
  placeTray()
}

void start()
