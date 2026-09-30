import { useEffect, useState } from "react"

import type { AppSettings } from "@skill-center/core/bridge"
import { bridge } from "@/lib/bridge"

/**
 * The app's own settings, kept by its main process. Outside the app — in a
 * browser — there are none, and the hook stays null.
 */

function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(null)

  useEffect(() => {
    void bridge?.settings().then(setSettings)
  }, [])

  async function change(key: keyof AppSettings, value: boolean) {
    if (bridge) setSettings(await bridge.settings({ key, value }))
  }

  return [settings, change] as const
}

export { useAppSettings }
