import { ArrowLeft, ArrowSquareOut, Check, MagnifyingGlass } from "@phosphor-icons/react"
import { useEffect, useMemo, useState } from "react"

import { FilesView, type FilesSource } from "@/components/files-view"
import { AgentPicker } from "@/components/agent-picker"
import { Button, Spinner } from "@/components/ui"
import { allChosen, type Agent } from "@skill-center/core/agents"
import { host } from "@skill-center/core/host"
import * as ops from "@skill-center/core/ops"
import { folderName, parseSkillMd } from "@skill-center/core/skill-md"
import type { Skill } from "@skill-center/core/skills"
import { useAction } from "@/lib/use-action"
import { download, formatInstalls, pageUrl, popular, search, type Listing } from "@skill-center/core/skills-sh"

/**
 * skills.sh, browsed from here: the most installed skills until something is
 * typed, then search. A listing opens into its files, read before installing,
 * and installs to the harnesses picked.
 */

function Discover({
  installed,
  agents,
  onInstalled,
}: {
  installed: Skill[]
  agents: Agent[]
  onInstalled: (id: string) => void
}) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<Listing[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<Listing | null>(null)
  const installedIds = useMemo(() => new Set(installed.map((skill) => skill.id)), [installed])

  useEffect(() => {
    let live = true
    const term = query.trim()
    setError(null)
    const timer = setTimeout(
      () => {
        void (term.length >= 2 ? search(term) : popular())
          .then((listings) => live && setResults(listings))
          .catch((caught: Error) => live && setError(caught.message))
      },
      term ? 250 : 0,
    )
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [query])

  if (open) {
    return (
      <Preview
        listing={open}
        agents={agents}
        installed={installedIds.has(folderName(open.name))}
        onBack={() => setOpen(null)}
        onInstalled={onInstalled}
      />
    )
  }

  return (
    <div className="t-fade flex h-full flex-col p-6">
      <h1 className="text-title font-medium tracking-[-0.01em]">Discover</h1>
      <p className="mt-1 text-note text-muted-foreground">
        Skills from skills.sh — installed for the harnesses you pick.
      </p>
      <label className="mt-5 flex h-10 items-center gap-2 rounded-full bg-card px-4">
        <MagnifyingGlass className="size-4 text-muted-foreground" />
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search skills.sh"
          className="min-w-0 flex-1 bg-transparent text-note outline-none placeholder:text-muted-foreground"
        />
      </label>
      <p className="mt-5 mb-2 px-1 text-caption text-muted-foreground">
        {query.trim().length >= 2 ? "Results" : "Most installed"}
      </p>
      <div className="scroll-quiet min-h-0 flex-1 rounded-lg bg-card p-1">
        {error ? (
          <p className="p-6 text-center text-note text-danger">{error}</p>
        ) : !results ? (
          <div className="grid h-full place-items-center">
            <Spinner />
          </div>
        ) : !results.length ? (
          <p className="p-6 text-center text-note text-muted-foreground">
            Nothing on skills.sh matches.
          </p>
        ) : (
          <ul className="flex flex-col gap-px">
            {results.map((listing, index) => (
              <li
                key={`${listing.source}/${listing.skillId}`}
                className="t-rise"
                style={{ animationDelay: `${Math.min(index, 12) * 16}ms` }}
              >
                <button
                  type="button"
                  onClick={() => setOpen(listing)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-foreground/[0.03]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-note font-medium">{listing.name}</span>
                    <span className="block truncate text-caption text-muted-foreground">
                      {listing.source}
                    </span>
                  </span>
                  {installedIds.has(folderName(listing.name)) && (
                    <span className="flex items-center gap-1 text-caption text-muted-foreground">
                      <Check className="size-3" /> Installed
                    </span>
                  )}
                  <span className="w-14 text-right text-caption tabular-nums text-muted-foreground">
                    {formatInstalls(listing.installs)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function Preview({
  listing,
  agents,
  installed,
  onBack,
  onInstalled,
}: {
  listing: Listing
  agents: Agent[]
  installed: boolean
  onBack: () => void
  onInstalled: (id: string) => void
}) {
  const [source, setSource] = useState<FilesSource | null>(null)
  const [description, setDescription] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [chosen, setChosen] = useState(() => allChosen(agents))
  const [installing, run] = useAction()

  useEffect(() => {
    let live = true
    void download(listing.source, listing.skillId)
      .then((files) => {
        if (!live) return
        const { data } = parseSkillMd(files.find((file) => file.path === "SKILL.md")?.contents ?? "")
        setDescription(typeof data.description === "string" ? data.description : null)
        setSource({
          files: files.map((file) => file.path),
          read: async (path) => files.find((file) => file.path === path)?.contents ?? "",
        })
      })
      .catch((caught: Error) => live && setError(caught.message))
    return () => {
      live = false
    }
  }, [listing])

  const install = () =>
    run(async () => {
      onInstalled(await ops.install(listing.source, listing.name, chosen))
    }, `${listing.name} installed`)

  return (
    <div className="t-fade flex h-full flex-col gap-5 p-6">
      <header className="flex items-start gap-6">
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onBack}
            className="mb-2 inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3" /> Discover
          </button>
          <h1 className="text-title font-medium tracking-[-0.01em] break-words">{listing.name}</h1>
          <p className="mt-1 flex items-center gap-1.5 text-caption text-muted-foreground">
            <button
              type="button"
              onClick={() => void host.open(pageUrl(listing.source, listing.skillId))}
              className="inline-flex items-center gap-1 text-foreground hover:underline"
            >
              {listing.source}
              <ArrowSquareOut className="size-3" />
            </button>
            · {formatInstalls(listing.installs)} installs
          </p>
          {description && (
            <p className="mt-2 line-clamp-3 max-w-[640px] text-note text-pretty text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      </header>

      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <AgentPicker
            agents={agents}
            chosen={chosen}
            disabled={installed || installing}
            onChange={setChosen}
          />
        </div>
        <Button
          variant="primary"
          className="h-9 px-6"
          busy={installing}
          disabled={installed}
          onClick={() => void install()}
        >
          {installed ? "Installed" : installing ? "Installing…" : "Install"}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-lg bg-card">
        {error ? (
          <p className="p-6 text-center text-note text-danger">{error}</p>
        ) : source ? (
          <FilesView source={source} />
        ) : (
          <div className="grid h-full place-items-center">
            <Spinner />
          </div>
        )}
      </div>
    </div>
  )
}

export { Discover }
