import { Check } from "@phosphor-icons/react"

import { AgentMark } from "@/components/marks"
import { sharedOnly, switchable, type Agent } from "@skill-center/core/agents"
import { cn } from "@/lib/cn"

/**
 * Which harnesses a new skill goes to. The ones that can be switched are
 * chips, all on to start with; the ones that read the shared folder as a
 * whole always get it, and are only named.
 */

function AgentPicker({
  agents,
  chosen,
  disabled,
  onChange,
}: {
  agents: Agent[]
  chosen: Record<string, boolean>
  disabled?: boolean
  onChange: (chosen: Record<string, boolean>) => void
}) {
  const others = sharedOnly(agents)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {switchable(agents).map((agent) => {
          const on = chosen[agent.id] ?? false
          return (
            <button
              key={agent.id}
              type="button"
              aria-pressed={on}
              disabled={disabled}
              onClick={() => onChange({ ...chosen, [agent.id]: !on })}
              className={cn(
                "flex h-9 items-center gap-2 rounded-full pr-3.5 pl-2.5 text-note transition-[background-color,color,opacity,scale] duration-150 active:scale-[0.96] disabled:opacity-50",
                on
                  ? "bg-card text-foreground"
                  : "bg-foreground/[0.04] text-muted-foreground hover:bg-foreground/[0.07]",
              )}
            >
              <AgentMark
                agent={agent}
                className={cn("transition-opacity", !on && "opacity-40 grayscale")}
              />
              {agent.name}
              <Check
                className={cn("size-3.5 transition-opacity", on ? "opacity-100" : "opacity-0")}
              />
            </button>
          )
        })}
      </div>
      {others.length > 0 && (
        <p className="px-1 text-caption text-muted-foreground">
          Also read by {listNames(others.map((agent) => agent.name))}, through the shared folder.
        </p>
      )}
    </div>
  )
}

/** "A", "A and B", "A, B and C". */
function listNames(names: string[]) {
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0]!
}

export { AgentPicker, listNames }
