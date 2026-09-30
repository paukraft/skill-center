/**
 * What the desktop app's preload script puts on `window.skillCenter`: the host
 * calls answered in the main process, word of changes on disk, and the app's
 * own settings. Replies come as `{ ok, … }` so an error keeps its message.
 */

type AppSettings = { menuBarItem: boolean; openAtLogin: boolean }

type Reply<T> = { ok: true; value: T } | { ok: false; error: string }

type Bridge = {
  call(method: string, args: unknown[]): Promise<unknown>
  onChange(listener: () => void): () => void
  /** Reads the settings, after changing one when given. */
  settings(change?: { key: keyof AppSettings; value: boolean }): Promise<AppSettings>
}

const CHANNELS = { host: "host", change: "host:change", settings: "settings" } as const

export { CHANNELS, type AppSettings, type Bridge, type Reply }
