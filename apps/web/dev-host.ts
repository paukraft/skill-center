/**
 * The native bridge, answered by Bun instead, so the UI can be worked on in a
 * browser against the real skills on this Mac.
 */
import type { HostCalls } from "@skill-center/core/host"
import { nodeHost } from "@skill-center/core/node/host"

const subscribers = new Set<ReadableStreamDefaultController>()
nodeHost.onChange(() => {
  for (const controller of subscribers) controller.enqueue("data: change\n\n")
})

// Only the dev UI may call in: /rpc runs anything the host can.
const UI_ORIGIN = "http://localhost:5199"
const cors = { "Access-Control-Allow-Origin": UI_ORIGIN }

Bun.serve({
  hostname: "127.0.0.1",
  port: 5198,
  idleTimeout: 0,
  async fetch(request) {
    const url = new URL(request.url)
    if (request.headers.get("Origin") !== UI_ORIGIN) return new Response(null, { status: 403 })
    if (url.pathname === "/events") {
      let self: ReadableStreamDefaultController
      return new Response(
        new ReadableStream({
          start(controller) {
            self = controller
            subscribers.add(controller)
          },
          cancel() {
            subscribers.delete(self)
          },
        }),
        { headers: { ...cors, "Content-Type": "text/event-stream" } }
      )
    }
    if (url.pathname === "/rpc" && request.method === "POST") {
      const { method, args } = (await request.json()) as { method: keyof HostCalls; args: unknown[] }
      try {
        const value = await (nodeHost[method] as (...a: unknown[]) => Promise<unknown>)(...args)
        return Response.json({ ok: true, value: value ?? null }, { headers: cors })
      } catch (error) {
        return Response.json({ ok: false, error: String((error as Error).message ?? error) }, { headers: cors })
      }
    }
    return new Response(null, { status: request.method === "OPTIONS" ? 204 : 404, headers: { ...cors, "Access-Control-Allow-Headers": "*" } })
  },
})

console.log("dev host on http://localhost:5198")
