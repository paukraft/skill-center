import { host } from "./host"
import type { LockEntry, Skill } from "./skills"

/**
 * skills.sh, the directory the `skills` CLI installs from: its search API,
 * the leaderboard its home page carries, the per-skill file download, and
 * — through GitHub — whether an installed skill has changed upstream.
 */

const BASE = "https://skills.sh"

type Listing = {
  /** owner/repo */
  source: string
  skillId: string
  name: string
  installs: number
}

type RemoteFile = { path: string; contents: string }

async function getJson<T>(url: string, headers?: Record<string, string>) {
  const { status, body } = await host.http(url, headers)
  if (status < 200 || status >= 300) {
    throw Object.assign(new Error(`${new URL(url).host} answered ${status}`), { status })
  }
  return JSON.parse(body) as T
}

async function search(query: string): Promise<Listing[]> {
  const { skills } = await getJson<{ skills: Listing[] }>(
    `${BASE}/api/search?q=${encodeURIComponent(query)}&limit=40`,
  )
  return skills
}

/**
 * The all-time leaderboard, read out of the home page — there is no JSON
 * endpoint for it. The page streams its data as escaped JSON, so each entry
 * is matched on the fields it always starts with.
 */
async function popular(): Promise<Listing[]> {
  const { body } = await host.http(BASE, { "User-Agent": "Mozilla/5.0 SkillCenter" })
  const entry =
    /\\"source\\":\\"([^\\"]+)\\",\\"skillId\\":\\"([^\\"]+)\\",\\"name\\":\\"([^\\"]+)\\",\\"installs\\":(\d+)/g
  const seen = new Set<string>()
  const listings: Listing[] = []
  for (const [, source, skillId, name, installs] of body.matchAll(entry)) {
    const key = `${source}/${skillId}`
    if (seen.has(key)) continue
    seen.add(key)
    listings.push({ source: source!, skillId: skillId!, name: name!, installs: Number(installs) })
  }
  return listings.sort((a, b) => b.installs - a.installs).slice(0, 60)
}

async function download(source: string, skillId: string): Promise<RemoteFile[]> {
  const { files } = await getJson<{ files: RemoteFile[] }>(
    `${BASE}/api/download/${source}/${encodeURIComponent(skillId)}`,
  )
  return files.sort((a, b) => a.path.localeCompare(b.path))
}

function pageUrl(source: string, skillId: string) {
  return `${BASE}/${source}/${skillId}`
}

// ── Updates ──────────────────────────────────────────────────────────────

/** The folder a lock's `skillPath` names in its repository; "" for the root. */
function skillFolder(skillPath: string) {
  return skillPath.replace(/\/?SKILL\.md$/, "")
}

type Tree = { sha: string; tree: { path: string; type: string; sha: string }[] }

/**
 * A repository's whole file tree, with the root tree's own hash. Anonymous
 * GitHub calls run out at 60 an hour; past that the GitHub CLI, if it is
 * signed in, asks instead.
 */
async function repoTree(repo: string, ref: string): Promise<Tree | null> {
  const path = `repos/${repo}/git/trees/${ref}?recursive=1`
  const direct = await host
    .http(`https://api.github.com/${path}`, { Accept: "application/vnd.github+json" })
    .catch(() => null)
  if (direct?.status === 200) return JSON.parse(direct.body) as Tree
  const viaGh = await host.run(["gh", "api", path]).catch(() => null)
  if (viaGh?.code === 0) return JSON.parse(viaGh.stdout) as Tree
  return null
}

/**
 * Which skills from GitHub have a different folder upstream than the one
 * installed. The lock records the folder's git tree hash at install time
 * (skill-lock.ts `skillFolderHash`); one tree call per repository answers
 * for every skill that came from it. `complete` is false when a repository
 * could not be asked, so the answer is not worth keeping.
 */
async function outdated(skills: Skill[]) {
  const byRepo = new Map<string, { id: string; lock: LockEntry }[]>()
  for (const skill of skills) {
    if (skill.origin.kind !== "skills.sh") continue
    const { lock } = skill.origin
    if (lock.sourceType !== "github" || !lock.skillFolderHash || !lock.skillPath) continue
    const key = `${lock.source}@${lock.ref ?? "HEAD"}`
    byRepo.set(key, [...(byRepo.get(key) ?? []), { id: skill.id, lock }])
  }

  const stale = new Set<string>()
  let complete = true
  await Promise.all(
    [...byRepo].map(async ([key, entries]) => {
      const [repo, ref] = key.split("@") as [string, string]
      const tree = await repoTree(repo, ref)
      if (!tree) {
        complete = false
        return
      }
      for (const { id, lock } of entries) {
        const folder = skillFolder(lock.skillPath!)
        const upstream = folder
          ? tree.tree.find((item) => item.type === "tree" && item.path === folder)?.sha
          : tree.sha
        if (upstream && upstream !== lock.skillFolderHash) stale.add(id)
      }
    }),
  )
  return { stale, complete }
}

// ── Where a hand-installed skill came from ───────────────────────────────

/**
 * A skill with no lock entry may still be one from skills.sh, copied in by
 * hand or by an older installer. It is claimed only if a listing of the
 * same name has the very same SKILL.md — a name alone proves nothing.
 */
async function findOrigin(id: string, skillMd: string): Promise<Listing | null> {
  const results = await search(id)
  const candidates = results.filter((r) => r.skillId === id || r.name === id).slice(0, 4)
  const wanted = normalize(skillMd)
  let failed = false
  for (const candidate of candidates) {
    const files = await download(candidate.source, candidate.skillId).catch((error) => {
      // A listing skills.sh has no files for is just no match.
      const status = (error as { status?: number }).status
      if (!status || status === 429 || status >= 500) failed = true
      return []
    })
    const remote = files.find((file) => file.path === "SKILL.md")
    if (remote && normalize(remote.contents) === wanted) return candidate
  }
  // Not a "no match" to remember when a candidate could not be checked.
  if (failed) throw new Error(`Could not check every skills.sh listing for ${id}.`)
  return null
}

function normalize(text: string) {
  return text.replace(/\r\n/g, "\n").trim()
}

function formatInstalls(count: number) {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
  if (count >= 1_000) return `${(count / 1_000).toFixed(1).replace(/\.0$/, "")}K`
  return String(count)
}

export {
  download,
  findOrigin,
  formatInstalls,
  outdated,
  pageUrl,
  popular,
  search,
  skillFolder,
  type Listing,
  type RemoteFile,
}
