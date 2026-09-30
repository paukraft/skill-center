import { useSyncExternalStore } from "react"

/** The system appearance, followed live — the app has no setting of its own. */

const query = window.matchMedia("(prefers-color-scheme: dark)")

function apply() {
  document.documentElement.classList.toggle("dark", query.matches)
}
apply()
query.addEventListener("change", apply)

function useDark() {
  return useSyncExternalStore(
    (listener) => {
      query.addEventListener("change", listener)
      return () => query.removeEventListener("change", listener)
    },
    () => query.matches,
  )
}

/** diffs.com's own themes, in whichever appearance the app is in. */
function codeTheme(dark: boolean) {
  return {
    theme: { light: "pierre-light", dark: "pierre-dark" },
    themeType: dark ? ("dark" as const) : ("light" as const),
  }
}

export { codeTheme, useDark }
