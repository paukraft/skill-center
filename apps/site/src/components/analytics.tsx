import { OpenPanel } from "@openpanel/web"
import { useEffect } from "react"

/**
 * OpenPanel page views and outgoing links, sent through our own `/api/op` so
 * blockers that know the vendor's host leave them alone. Nothing is tracked
 * under `vite dev`.
 */
const CLIENT_ID = "96bbc7d6-8a08-4f12-92b5-2e4ea5444620"

/** Mounted once at the root. */
function Analytics() {
  useEffect(() => {
    if (import.meta.env.DEV) return
    new OpenPanel({
      apiUrl: "/api/op",
      clientId: CLIENT_ID,
      trackScreenViews: true,
      trackOutgoingLinks: true,
    })
  }, [])

  return null
}

export { Analytics }
