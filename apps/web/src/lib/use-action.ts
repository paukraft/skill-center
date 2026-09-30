import { useState } from "react"

import { useToast } from "@/components/toast"

/** A button's async job: busy while it runs, a toast when it is done or fails. */
function useAction() {
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  async function run(action: () => Promise<unknown>, done?: string) {
    setBusy(true)
    try {
      await action()
      if (done) toast(done)
    } catch (caught) {
      toast((caught as Error).message, "error")
    } finally {
      setBusy(false)
    }
  }

  return [busy, run] as const
}

export { useAction }
