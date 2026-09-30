import { createFileRoute } from "@tanstack/react-router"

const OPENPANEL_API = "https://api.openpanel.dev"

/**
 * First-party relay for the browser's OpenPanel events (components/
 * analytics.tsx). Only the tracking endpoints are passed on, with the
 * visitor's address and agent, since OpenPanel would otherwise see ours.
 */
export const Route = createFileRoute("/api/op/$")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const path = `/${params._splat ?? ""}`
        if (!path.startsWith("/track")) {
          return new Response("Not found", { status: 404 })
        }

        const headers = new Headers({
          "content-type": "application/json",
          "openpanel-client-id":
            request.headers.get("openpanel-client-id") ?? "",
          origin: request.headers.get("origin") ?? new URL(request.url).origin,
          "user-agent": request.headers.get("user-agent") ?? "",
        })
        const ip =
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          request.headers.get("x-real-ip")
        if (ip) headers.set("openpanel-client-ip", ip)

        const upstream = await fetch(`${OPENPANEL_API}${path}`, {
          method: "POST",
          headers,
          body: await request.text(),
        })
        return new Response(upstream.body, {
          status: upstream.status,
          headers: {
            "content-type":
              upstream.headers.get("content-type") ?? "application/json",
          },
        })
      },
    },
  },
})
