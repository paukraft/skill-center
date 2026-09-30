import { Compass, GearSix, MagnifyingGlass, Plus, Warning } from "@phosphor-icons/react"
import { useMemo, useState } from "react"

import { CreateSkill } from "@/components/create-skill"
import { Discover } from "@/components/discover"
import { AppMark } from "@/components/marks"
import { Settings } from "@/components/settings"
import { SkillDetail } from "@/components/skill-detail"
import { groupsOf, SkillList } from "@/components/skill-list"
import { BrokenLinksBar, UpdatesBar } from "@/components/updates-bar"
import { Backdrop, Button, Empty, Spinner } from "@/components/ui"
import { platform } from "@/lib/bridge"
import { cn } from "@/lib/cn"
import { useMatchedOrigins, useOutdated, useSkills } from "@/state"

/**
 * The window: a header that doubles as the title bar, and under it the one
 * card — every skill down the left, and on the wash to the right whatever is
 * open: a skill, skills.sh, a new skill being written, or the settings.
 */

type View =
  { kind: "skill"; id: string } | { kind: "discover" } | { kind: "create" } | { kind: "settings" }

function App() {
  const { scan, error, setHidden } = useSkills()
  const skills = scan?.skills ?? null
  const agents = scan?.agents ?? []
  const outdated = useOutdated(skills)
  const matches = useMatchedOrigins(skills)
  const [view, setView] = useState<View | null>(null)
  const [query, setQuery] = useState("")

  const shown = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!skills || !term) return skills ?? []
    return skills.filter((skill) =>
      `${skill.name} ${skill.description}`.toLowerCase().includes(term),
    )
  }, [skills, query])

  // Until something is picked — or once what was picked is gone — the first
  // of the user's own skills is open.
  const picked = view?.kind === "skill" && !skills?.some((s) => s.id === view.id) ? null : view
  const first = groupsOf(shown)[0]?.skills[0]?.id
  const current: View | null = picked ?? (first ? { kind: "skill", id: first } : null)
  const skill = current?.kind === "skill" ? skills?.find((s) => s.id === current.id) : undefined

  return (
    <main className="flex h-full flex-col">
      {/* The title bar: room for the Mac's traffic lights on the left, for
          the window controls of Windows and Linux on the right. */}
      <header
        data-titlebar
        className={cn(
          "flex h-[56px] shrink-0 items-center gap-2",
          platform === "mac" ? "pr-3 pl-[96px]" : "pr-[150px] pl-4",
        )}
      >
        <AppMark />
        <span className="text-note font-medium">Skill Center</span>
        <span className="flex-1" />
        <Button
          variant={current?.kind === "settings" ? "primary" : "secondary"}
          onClick={() => setView({ kind: "settings" })}
        >
          <GearSix />
          Settings
        </Button>
        <Button
          variant={current?.kind === "discover" ? "primary" : "secondary"}
          onClick={() => setView({ kind: "discover" })}
        >
          <Compass />
          Discover
        </Button>
        <Button
          variant={current?.kind === "create" ? "primary" : "secondary"}
          onClick={() => setView({ kind: "create" })}
        >
          <Plus />
          New skill
        </Button>
      </header>

      <div className="min-h-0 flex-1 px-2 pb-2">
        <div className="grid h-full grid-cols-[300px_1fr] rounded-[12px] bg-card p-2">
          <nav className="flex min-h-0 flex-col pr-2">
            <label className="mb-3 flex h-8 shrink-0 items-center gap-2 rounded-full bg-muted px-3 dark:bg-foreground/[0.06]">
              <MagnifyingGlass className="size-3.5 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter skills"
                className="min-w-0 flex-1 bg-transparent text-note outline-none placeholder:text-muted-foreground"
              />
            </label>
            <div className="scroll-quiet min-h-0 flex-1">
              {scan && !query.trim() && (
                <>
                  <UpdatesBar skills={scan.skills.filter((skill) => outdated.has(skill.id))} />
                  <BrokenLinksBar paths={scan.broken} />
                </>
              )}
              {skills ? (
                <SkillList
                  skills={shown}
                  agents={agents}
                  selected={current?.kind === "skill" ? current.id : null}
                  outdated={outdated}
                  searching={!!query.trim()}
                  onSelect={(id) => setView({ kind: "skill", id })}
                />
              ) : (
                <div className="grid h-40 place-items-center">
                  <Spinner />
                </div>
              )}
            </div>
          </nav>

          <section className="relative min-w-0 overflow-hidden rounded-lg">
            <Backdrop />
            <div className="relative h-full">
              {error ? (
                <Empty icon={<Warning />} title="Couldn't read your skills">
                  {error}
                </Empty>
              ) : current?.kind === "discover" ? (
                <Discover
                  installed={skills ?? []}
                  agents={agents}
                  onInstalled={(id) => setView({ kind: "skill", id })}
                />
              ) : current?.kind === "settings" ? (
                <Settings
                  found={scan?.found ?? []}
                  agents={agents}
                  onHarnessHidden={setHidden}
                />
              ) : current?.kind === "create" ? (
                <CreateSkill agents={agents} onCreated={(id) => setView({ kind: "skill", id })} />
              ) : skill ? (
                <SkillDetail
                  key={skill.id}
                  skill={skill}
                  agents={agents}
                  outdated={outdated.has(skill.id)}
                  match={matches[skill.id]}
                />
              ) : skills ? (
                <Empty icon={<Compass />} title={skills.length ? "Pick a skill" : "No skills yet"}>
                  Find one on skills.sh with Discover, or write your own.
                </Empty>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}

export { App }
