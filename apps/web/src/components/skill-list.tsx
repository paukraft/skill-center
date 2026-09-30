import { CaretRight } from "@phosphor-icons/react"
import { useState } from "react"

import { AgentMark } from "@/components/marks"
import { switchable, type Agent } from "@skill-center/core/agents"
import type { Skill } from "@skill-center/core/skills"
import { cn } from "@/lib/cn"

/**
 * Every skill, once. The ones that matter come first — the user's own, then
 * what came from skills.sh — and the agents' built-ins wait, folded, at the
 * bottom. Each row carries its agents' marks: full where it is on, ghosted
 * where it is switched off, missing where it is not there at all.
 */

type Group = { key: string; title: string; skills: Skill[]; folded?: boolean }

function groupsOf(skills: Skill[]): Group[] {
  const by = (kind: Skill["origin"]["kind"]) => skills.filter((s) => s.origin.kind === kind)
  return [
    { key: "local", title: "Yours", skills: by("local") },
    { key: "skills.sh", title: "From skills.sh", skills: by("skills.sh") },
    { key: "built-in", title: "Built in", skills: by("built-in"), folded: true },
  ].filter((group) => group.skills.length)
}

function SkillList({
  skills,
  agents,
  selected,
  outdated,
  searching,
  onSelect,
}: {
  skills: Skill[]
  agents: Agent[]
  selected: string | null
  outdated: Set<string>
  searching: boolean
  onSelect: (id: string) => void
}) {
  const [unfolded, setUnfolded] = useState<Set<string>>(() => new Set())
  const groups = groupsOf(skills)

  if (!skills.length) {
    return (
      <p className="px-3 py-6 text-center text-note text-muted-foreground">
        {searching ? "Nothing matches." : "No skills yet."}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4 pb-2">
      {groups.map((group) => {
        // A search opens everything: what it found should not hide.
        const open = searching || !group.folded || unfolded.has(group.key)
        return (
          <section key={group.key}>
            <button
              type="button"
              disabled={!group.folded || searching}
              onClick={() =>
                setUnfolded((current) => {
                  const next = new Set(current)
                  if (next.has(group.key)) next.delete(group.key)
                  else next.add(group.key)
                  return next
                })
              }
              className="flex h-7 w-full items-center gap-1.5 px-3 text-caption text-muted-foreground"
            >
              {group.title}
              <span className="tabular-nums text-faint">{group.skills.length}</span>
              {group.folded && !searching && (
                <CaretRight
                  className={cn(
                    "ml-auto size-3 transition-transform duration-200",
                    open && "rotate-90",
                  )}
                />
              )}
            </button>
            {open && (
              <ul className="flex flex-col gap-px">
                {group.skills.map((skill, index) => (
                  <li
                    key={skill.id}
                    className="t-rise"
                    style={{ animationDelay: `${Math.min(index, 12) * 18}ms` }}
                  >
                    <Row
                      skill={skill}
                      agents={switchable(agents)}
                      active={skill.id === selected}
                      outdated={outdated.has(skill.id)}
                      onSelect={() => onSelect(skill.id)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}

/** Marks shown on a row before the rest fold into a count. */
const ROW_MARKS = 4

function Row({
  skill,
  agents,
  active,
  outdated,
  onSelect,
}: {
  skill: Skill
  /** The harnesses a skill can be switched in; the shared-folder ones go unsaid. */
  agents: Agent[]
  active: boolean
  outdated: boolean
  onSelect: () => void
}) {
  const off = Object.values(skill.agents).every((state) => state !== "on")
  const present = agents.filter((agent) => skill.agents[agent.id] !== "absent")
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors duration-150",
        active ? "bg-foreground/[0.06]" : "hover:bg-foreground/[0.03]",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className={cn("truncate text-note font-medium", off && "text-muted-foreground")}>
            {skill.name}
          </span>
          {outdated && (
            <span className="size-1.5 shrink-0 rounded-full bg-accent" title="Update available" />
          )}
        </span>
        <span className="block truncate text-caption text-muted-foreground">
          {skill.description || "No description"}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        {present.slice(0, ROW_MARKS).map((agent) => (
          <span
            key={agent.id}
            title={`${agent.name}: ${skill.agents[agent.id]}`}
            className={cn(
              "transition-opacity duration-150",
              skill.agents[agent.id] === "off" && "opacity-25 grayscale",
            )}
          >
            <AgentMark agent={agent} className="size-3.5" />
          </span>
        ))}
        {present.length > ROW_MARKS && (
          <span className="text-caption text-muted-foreground tabular-nums">
            +{present.length - ROW_MARKS}
          </span>
        )}
      </span>
    </button>
  )
}

export { groupsOf, SkillList }
