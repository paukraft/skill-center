import type { Reply } from "@skill-center/core/bridge"
import type { Host } from "@skill-center/core/host"

import { bridge } from "@/lib/bridge"

/**
 * The host as the UI reaches it: the app's main process over its bridge, or
 * — in a plain browser — the Bun dev host (dev-host.ts) over HTTP, so the UI
 * runs against real data either way.
 */

const DEV_HOST = "http://localhost:5198"

function createWebHost(): Host {
  const call = bridge
    ? bridge.call
    : async (method: string, args: unknown[]) => {
        const response = await fetch(`${DEV_HOST}/rpc`, {
          method: "POST",
          body: JSON.stringify({ method, args }),
        })
        const payload = (await response.json()) as Reply<unknown>
        if (!payload.ok) throw new Error(payload.error)
        return payload.value
      }

  const listeners = new Set<() => void>()
  const emit = () => listeners.forEach((listener) => listener())
  if (bridge) bridge.onChange(emit)
  else new EventSource(`${DEV_HOST}/events`).onmessage = emit

  return new Proxy({} as Host, {
    get(_, method: string) {
      // Not a thenable: `await host` must not look like a call.
      if (method === "then") return undefined
      if (method === "onChange") {
        return (listener: () => void) => {
          listeners.add(listener)
          return () => listeners.delete(listener)
        }
      }
      return (...args: unknown[]) => call(method, args)
    },
  })
}

export { createWebHost }
