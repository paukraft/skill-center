import { useCallback, useEffect, useRef, useState } from "react"

import { host } from "@skill-center/core/host"
import { scanSkills, setHarnessHidden, watchedPaths, type Scan, type Skill } from "@skill-center/core/skills"
import { mcpHarnesses, setMcp, type McpHarness } from "@skill-center/core/mcp"
import { findOrigin, outdated, type Listing } from "@skill-center/core/skills-sh"

/**
 * The skills as the app shows them, kept current: read on start, again on
 * every change the native side hears about, and once the window comes back.
 * Two slower answers ride along — which skills.sh installs have changed
 * upstream, and where hand-installed skills came from — both cached, since
 * GitHub allows few anonymous calls and neither changes often.
 */

const HOUR = 60 * 60 * 1000

function cached<T>(key: string, maxAge: number) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const { at, value } = JSON.parse(raw) as { at: number; value: T }
    return Date.now() - at < maxAge ? value : null
  } catch {
    return null
  }
}

function store(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify({ at: Date.now(), value }))
}

function useSkills() {
  const [scan, setScan] = useState<Scan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const running = useRef<Promise<void> | null>(null)
  const again = useRef(false)

  // One scan at a time; a change during one asks for exactly one more.
  const refresh = useCallback(async () => {
    if (running.current) {
      again.current = true
      return running.current
    }
    running.current = (async () => {
      do {
        again.current = false
        try {
          setScan(await scanSkills())
          setError(null)
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : String(caught))
        }
      } while (again.current)
      running.current = null
    })()
    return running.current
  }, [])

  /** Shows or hides a harness, and reads everything again without it. */
  const setHidden = useCallback(
    async (id: string, hidden: boolean) => {
      await setHarnessHidden(id, hidden)
      await refresh()
    },
    [refresh],
  )

  useEffect(() => {
    void refresh()
    void watchedPaths().then(host.watch)
    const off = host.onChange(() => void refresh())
    window.addEventListener("focus", refresh)
    return () => {
      off()
      window.removeEventListener("focus", refresh)
    }
  }, [refresh])

  return { scan, error, refresh, setHidden }
}

/** Ids of installed skills.sh skills whose folder changed upstream. */
function useOutdated(skills: Skill[] | null) {
  const [ids, setIds] = useState<Set<string>>(() => new Set())
  const key = skills
    ?.map((s) => (s.origin.kind === "skills.sh" ? `${s.id}:${s.origin.lock.skillFolderHash}` : ""))
    .join(",")

  useEffect(() => {
    if (!skills) return
    const previous = cached<{ key: string; ids: string[] }>("outdated-for", HOUR)
    if (previous && previous.key === key) {
      setIds(new Set(previous.ids))
      return
    }
    let live = true
    void outdated(skills).then(({ stale, complete }) => {
      if (!live) return
      if (complete) store("outdated-for", { key, ids: [...stale] })
      setIds(stale)
    })
    return () => {
      live = false
    }
    // `key` is what matters about `skills` here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return ids
}

/** FNV-1a: enough to tell one version of a SKILL.md from another. */
function hash(text: string) {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193)
  return (h >>> 0).toString(36)
}

async function origin(id: string, text: string) {
  const key = `origin:${id}:${hash(text)}`
  const hit = cached<Listing | false>(key, 24 * HOUR)
  if (hit !== null) return hit
  const match = (await findOrigin(id, text)) ?? false
  store(key, match)
  return match
}

/**
 * skills.sh listings matching skills that have no lock entry, by id. Checked
 * again on every scan — reading SKILL.md is cheap, and the cache is keyed by
 * its contents, so only an edit costs a lookup.
 */
function useMatchedOrigins(skills: Skill[] | null) {
  const [matches, setMatches] = useState<Record<string, Listing>>({})

  useEffect(() => {
    let live = true
    void (async () => {
      for (const skill of skills ?? []) {
        if (skill.origin.kind !== "local") continue
        const text = await host.read(`${skill.dir}/SKILL.md`)
        if (!live) return
        // Could not ask skills.sh: keep whatever match is shown.
        const match = text ? await origin(skill.id, text).catch(() => null) : false
        if (!live) return
        if (match === null) continue
        setMatches((current) => {
          const { [skill.id]: previous, ...rest } = current
          if (match) return { ...rest, [skill.id]: match }
          return previous ? rest : current
        })
      }
    })()
    return () => {
      live = false
    }
  }, [skills])

  return matches
}

/**
 * Where Skill Center's MCP server is added, read when shown and when the
 * window comes back — not watched, since ~/.claude.json changes all the time.
 * `server` is the binary to add; there is none outside the app.
 */
function useMcp() {
  const [harnesses, setHarnesses] = useState<McpHarness[] | null>(null)
  const [server, setServer] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setHarnesses(await mcpHarnesses())
  }, [])

  const set = useCallback(
    async (ids: string[], added: boolean) => {
      if (added && !server) throw new Error("Only the app can add its MCP server.")
      for (const id of ids) await setMcp(id, added ? server : null)
      await refresh()
    },
    [server, refresh],
  )

  useEffect(() => {
    void refresh()
    void host.info().then((info) => setServer(info.mcpServer))
    window.addEventListener("focus", refresh)
    return () => window.removeEventListener("focus", refresh)
  }, [refresh])

  return { harnesses, server, set }
}

export { useMatchedOrigins, useMcp, useOutdated, useSkills }
