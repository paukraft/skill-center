import { contextBridge, ipcRenderer } from "electron"

import { CHANNELS, type AppSettings, type Bridge, type Reply } from "@skill-center/core/bridge"

/** `window.skillCenter`, the UI's one way into the main process. */

async function invoke<T>(channel: string, ...args: unknown[]) {
  const reply = (await ipcRenderer.invoke(channel, ...args)) as Reply<T>
  if (!reply.ok) throw new Error(reply.error)
  return reply.value
}

const bridge: Bridge = {
  call: (method, args) => invoke(CHANNELS.host, method, args),
  onChange(listener) {
    const handler = () => listener()
    ipcRenderer.on(CHANNELS.change, handler)
    return () => void ipcRenderer.off(CHANNELS.change, handler)
  },
  settings: (change) => invoke<AppSettings>(CHANNELS.settings, change),
}

contextBridge.exposeInMainWorld("skillCenter", bridge)
