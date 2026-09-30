import { ArrowSquareOut, ArrowsClockwise, FolderSimple, Trash } from "@phosphor-icons/react"
import { MultiFileDiff } from "@pierre/diffs/react"
import { useEffect, useMemo, useState } from "react"

import { FilesView, type FilesSource } from "@/components/files-view"
import { listNames } from "@/components/agent-picker"
import { AgentMark } from "@/components/marks"
import { Button, Spinner, Switch } from "@/components/ui"
import { host } from "@skill-center/core/host"
import * as ops from "@skill-center/core/ops"
import { sharedOnly, switchable, type Agent } from "@skill-center/core/agents"
import { isManaged, type Skill } from "@skill-center/core/skills"
import { download, formatInstalls, pageUrl, type Listing } from "@skill-center/core/skills-sh"
import { words } from "@/lib/bridge"
import { codeTheme, useDark } from "@/lib/theme"
import { useAction } from "@/lib/use-action"
import { useToast } from "@/components/toast"

/**
 * One skill: what it is, where it came from, which agent has it — switched
 * right here — and the files themselves. Built-ins can only be switched;
 * everything else can also be updated, merged, edited or thrown away.
 */

function SkillDetail({
  skill,
  agents,
  outdated,
  match,
}: {
  skill: Skill
  agents: Agent[]
  outdated: boolean
  match: Listing | undefined
}) {
  const [reviewing, setReviewing] = useState(false)
  return (
    <div className="t-fade flex h-full flex-col gap-5 p-6">
      <header className="flex items-start gap-6">
        <div className="min-w-0 flex-1">
          <h1 className="text-title font-medium tracking-[-0.01em] break-words">{skill.name}</h1>
          <OriginLine skill={skill} match={match} />
          {skill.description && (
            <p
              className="mt-2 line-clamp-3 max-w-[640px] text-note text-pretty text-muted-foreground"
              data-selectable
            >
              {skill.description}
            </p>
          )}
        </div>
        <Actions
          skill={skill}
          outdated={outdated}
          onReview={() => setReviewing((r) => !r)}
          reviewing={reviewing}
        />
      </header>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-2">
        {switchable(agents).map((agent) => (
          <AgentTile key={agent.id} skill={skill} agent={agent} />
        ))}
        {sharedOnly(agents).length > 0 && <SharedTile skill={skill} agents={sharedOnly(agents)} />}
      </div>

      {skill.copies.length > 1 && <Copies skill={skill} agents={agents} />}

      <div className="min-h-0 flex-1 overflow-hidden rounded-lg bg-card">
        {reviewing && outdated ? (
          <UpdateReview skill={skill} onDone={() => setReviewing(false)} />
        ) : (
          <LocalFiles skill={skill} />
        )}
      </div>
    </div>
  )
}

function OriginLine({ skill, match }: { skill: Skill; match: Listing | undefined }) {
  const { origin } = skill
  const link = (source: string, skillId: string) => (
    <button
      type="button"
      onClick={() => void host.open(pageUrl(source, skillId))}
      className="inline-flex items-center gap-1 text-foreground hover:underline"
    >
      {source}
      <ArrowSquareOut className="size-3" />
    </button>
  )
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-caption text-muted-foreground">
      {origin.kind === "skills.sh" ? (
        <>
          From skills.sh · {link(origin.lock.source, skill.id)}
          {origin.lock.updatedAt && <> · updated {formatDate(origin.lock.updatedAt)}</>}
        </>
      ) : origin.kind === "built-in" ? (
        <>Comes with {origin.by.join(" and ")}</>
      ) : match ? (
        <>
          Yours · same as {link(match.source, match.skillId)} ({formatInstalls(match.installs)}{" "}
          installs)
        </>
      ) : (
        <>Yours</>
      )}
    </p>
  )
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

function Actions({
  skill,
  outdated,
  reviewing,
  onReview,
}: {
  skill: Skill
  outdated: boolean
  reviewing: boolean
  onReview: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const [updating, runUpdate] = useAction()
  const [deleting, runDelete] = useAction()

  return (
    <div className="flex shrink-0 items-center gap-1">
      {outdated && (
        <>
          <Button size="sm" variant="ghost" onClick={onReview}>
            {reviewing ? "Hide changes" : "What changed"}
          </Button>
          <Button
            size="sm"
            variant="primary"
            busy={updating}
            onClick={() => void runUpdate(() => ops.update([skill]), `${skill.name} is up to date`)}
          >
            {!updating && <ArrowsClockwise />}
            Update
          </Button>
        </>
      )}
      <Button
        size="sm"
        variant="ghost"
        title={`Show in ${words.files}`}
        aria-label={`Show in ${words.files}`}
        onClick={() => void host.reveal(skill.dir)}
      >
        <FolderSimple />
      </Button>
      {!isManaged(skill) &&
        (confirming ? (
          <Button
            size="sm"
            variant="danger"
            busy={deleting}
            onBlur={() => setConfirming(false)}
            autoFocus
            onClick={() =>
              void runDelete(() => ops.remove(skill), `${skill.name} moved to the ${words.trash}`).then(() =>
                setConfirming(false),
              )
            }
          >
            Move to {words.trash}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            title="Delete"
            aria-label="Delete"
            onClick={() => setConfirming(true)}
          >
            <Trash />
          </Button>
        ))}
    </div>
  )
}

/** One harness's hold on the skill: switched on or off, or added from here. */
function AgentTile({ skill, agent }: { skill: Skill; agent: Agent }) {
  const toast = useToast()
  const state = skill.agents[agent.id]!
  const [pending, setPending] = useState<boolean | null>(null)
  // Show the switch where it is going until the files say it got there.
  useEffect(() => setPending(null), [state])

  async function change(enabled: boolean) {
    setPending(enabled)
    try {
      await ops.setEnabled(skill, agent, enabled)
    } catch (caught) {
      setPending(null)
      toast((caught as Error).message, "error")
    }
  }

  const on = pending ?? state === "on"
  const managed = isManaged(skill)
  return (
    <Tile
      mark={<AgentMark agent={agent} className="size-5" />}
      title={agent.name}
      status={
        state === "absent"
          ? managed
            ? "Not available here"
            : "Not added"
          : on
            ? "On"
            : "Switched off"
      }
    >
      {state === "absent" ? (
        !managed && (
          <Button size="sm" busy={pending !== null} onClick={() => void change(true)}>
            Add
          </Button>
        )
      ) : (
        <Switch
          label={`${agent.name} uses ${skill.name}`}
          checked={on}
          onChange={(next) => void change(next)}
        />
      )}
    </Tile>
  )
}

/**
 * The harnesses that read the shared folder as a whole: in there, the skill
 * is theirs; not in there, one click puts it there.
 */
function SharedTile({ skill, agents }: { skill: Skill; agents: Agent[] }) {
  const [busy, run] = useAction()
  const inside = skill.locations.some((l) => l.kind === "shared")

  return (
    <Tile
      mark={
        agents.length === 1 ? (
          <AgentMark agent={agents[0]!} className="size-5" />
        ) : (
          <span className="grid grid-cols-2 gap-0.5">
            {agents.slice(0, 4).map((agent) => (
              <AgentMark key={agent.id} agent={agent} className="size-2.5 rounded-[2px]" />
            ))}
          </span>
        )
      }
      title="Shared folder"
      status={inside ? listNames(agents.map((agent) => agent.name)) : "Not added"}
      hint={`~/.agents/skills — read by ${listNames(agents.map((agent) => agent.name))}`}
    >
      {!inside && !isManaged(skill) && (
        <Button size="sm" busy={busy} onClick={() => void run(() => ops.share(skill))}>
          Add
        </Button>
      )}
    </Tile>
  )
}

function Tile({
  mark,
  title,
  status,
  hint,
  children,
}: {
  mark: React.ReactNode
  title: string
  status: string
  hint?: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex h-14 min-w-0 items-center gap-3 rounded-lg bg-card px-4" title={hint}>
      {mark}
      <div className="min-w-0 flex-1">
        <p className="truncate text-note font-medium">{title}</p>
        <p className="truncate text-caption text-muted-foreground">{status}</p>
      </div>
      {children}
    </div>
  )
}

/**
 * Separate folders for one skill — usually a hand copy into each agent's
 * directory. Same contents: one click makes them one. Different: the diff
 * says how, and the user picks which to keep.
 */
function Copies({ skill, agents }: { skill: Skill; agents: Agent[] }) {
  const dark = useDark()
  const [compared, setCompared] = useState<{ same: boolean; texts: (string | null)[] } | null>(
    null,
  )
  const [busy, run] = useAction()
  const [first, second] = skill.copies as [string, string]

  // Again on every scan: an edit to any copy can change the answer.
  useEffect(() => {
    let live = true
    void (async () => {
      const [head, ...rest] = await Promise.all(skill.copies.map(contents))
      const same = head !== null && rest.every((other) => other === head)
      const texts = await Promise.all(
        skill.copies.slice(0, 2).map((dir) => host.read(`${dir}/SKILL.md`)),
      )
      if (live) setCompared({ same, texts })
    })()
    return () => {
      live = false
    }
  }, [skill])

  if (!compared) return null
  const { same, texts } = compared
  /** A copy by who reads it: "Claude Code", "the shared folder", … */
  const owner = (dir: string) => {
    const here = skill.locations.filter((l) => l.real === dir)
    if (here.some((l) => l.kind === "shared")) return "the shared folder"
    const names = here.flatMap((l) =>
      l.readers.map((id) => agents.find((a) => a.id === id)?.name ?? id),
    )
    return listNames([...new Set(names)])
  }

  const keep = (dir: string) =>
    run(() => ops.mergeCopies(skill, dir), `${skill.name} is one folder now`)

  return (
    <div className="rounded-lg bg-warn-soft px-4 py-3 text-note">
      <div className="flex items-center gap-3">
        <p className="min-w-0 flex-1 text-pretty">
          {capitalize(listNames(skill.copies.map(owner)))} each have their own copy.{" "}
          <span className="text-muted-foreground">
            {same
              ? "They are identical — one shared folder is easier to keep."
              : "They differ; keep one and every agent gets it."}
          </span>
        </p>
        {same ? (
          <Button size="sm" variant="primary" busy={busy} onClick={() => void keep(first)}>
            Merge into one
          </Button>
        ) : (
          skill.copies.map((dir) => (
            <Button key={dir} size="sm" busy={busy} onClick={() => void keep(dir)}>
              Keep {owner(dir)}’s
            </Button>
          ))
        )}
      </div>
      {!same && texts[0] !== texts[1] && (
        <div className="mt-3 max-h-56 overflow-auto rounded-lg bg-card" data-selectable>
          <MultiFileDiff
            oldFile={{ name: `${owner(first)} · SKILL.md`, contents: texts[0] ?? "" }}
            newFile={{ name: `${owner(second)} · SKILL.md`, contents: texts[1] ?? "" }}
            options={{ ...codeTheme(dark), diffStyle: "unified", overflow: "wrap" }}
          />
        </div>
      )}
    </div>
  )
}

/** A copy's every file, paths and text; null when one is not text and so cannot be compared. */
async function contents(dir: string) {
  const files = await host.files(dir)
  const texts = await Promise.all(files.map((path) => host.read(`${dir}/${path}`)))
  return texts.includes(null) ? null : JSON.stringify([files, texts])
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function LocalFiles({ skill }: { skill: Skill }) {
  const [listing, setListing] = useState<{ dir: string; files: string[] } | null>(null)
  // Listed again on every scan (the skill object is new each time), so edits
  // from elsewhere — an update, an agent — show up; the new source re-reads the open file.
  useEffect(() => {
    let live = true
    const { dir } = skill
    void host.files(dir).then((files) => live && setListing({ dir, files }))
    return () => {
      live = false
    }
  }, [skill])

  const { dir } = skill
  const managed = isManaged(skill)
  const source = useMemo<FilesSource | null>(
    () =>
      listing?.dir === dir
        ? {
            files: listing.files,
            read: (path) => host.read(`${dir}/${path}`),
            write: managed ? undefined : (path, text) => host.write(`${dir}/${path}`, text),
          }
        : null,
    [listing, dir, managed],
  )

  if (!source) {
    return (
      <div className="grid h-full place-items-center">
        <Spinner />
      </div>
    )
  }
  return <FilesView key={skill.dir} source={source} />
}

/** What an update would change: the installed files against skills.sh's. */
function UpdateReview({ skill, onDone }: { skill: Skill; onDone: () => void }) {
  const dark = useDark()
  const [pairs, setPairs] = useState<{ path: string; before: string; after: string }[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { id, dir } = skill
  const source = skill.origin.kind === "skills.sh" ? skill.origin.lock.source : null

  useEffect(() => {
    if (!source) return
    let live = true
    void (async () => {
      try {
        const remote = await download(source, id)
        const local = await host.files(dir)
        const paths = [...new Set([...local, ...remote.map((f) => f.path)])].sort()
        const result = await Promise.all(
          paths.map(async (path) => ({
            path,
            before: local.includes(path) ? ((await host.read(`${dir}/${path}`)) ?? "") : "",
            after: remote.find((f) => f.path === path)?.contents ?? "",
          })),
        )
        if (live) setPairs(result.filter((pair) => pair.before !== pair.after))
      } catch (caught) {
        if (live) setError((caught as Error).message)
      }
    })()
    return () => {
      live = false
    }
  }, [id, dir, source])

  if (error || (pairs && !pairs.length)) {
    return (
      <div className="grid h-full place-items-center p-8 text-center text-note text-muted-foreground">
        <div>
          {error ??
            "skills.sh has not caught up with this change yet — the files it serves match yours."}
          <div className="mt-3">
            <Button size="sm" onClick={onDone}>
              Back to files
            </Button>
          </div>
        </div>
      </div>
    )
  }
  if (!pairs) {
    return (
      <div className="grid h-full place-items-center">
        <Spinner />
      </div>
    )
  }
  return (
    <div className="scroll-quiet flex h-full flex-col gap-2 p-2" data-selectable>
      {pairs.map((pair) => (
        <MultiFileDiff
          key={pair.path}
          oldFile={{ name: pair.path, contents: pair.before }}
          newFile={{ name: pair.path, contents: pair.after }}
          options={{ ...codeTheme(dark), diffStyle: "unified", overflow: "wrap" }}
        />
      ))}
    </div>
  )
}

export { SkillDetail }
