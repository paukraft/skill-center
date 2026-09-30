import type { Agent } from "@skill-center/core/agents"
import appMark from "@/assets/app-mark.svg"
import { cn } from "@/lib/cn"
import { useDark } from "@/lib/theme"

/**
 * Harness marks: the official logo where svgl.app has one (assets/logos,
 * named by the `skills` CLI id, `-dark` for the dark-mode variant), and a
 * monogram for the rest.
 */

const LOGOS = import.meta.glob<string>("../assets/logos/*.svg", {
  eager: true,
  query: "?url",
  import: "default",
})

function logoFor(id: string, dark: boolean) {
  const file = (name: string) => LOGOS[`../assets/logos/${name}.svg`]
  return (dark && file(`${id}-dark`)) || file(id)
}

function AgentMark({
  agent,
  className,
}: {
  agent: Pick<Agent, "id" | "name">
  className?: string
}) {
  const dark = useDark()
  const logo = logoFor(agent.id, dark)
  if (logo) {
    return (
      <img
        src={logo}
        alt=""
        draggable={false}
        className={cn("size-4 shrink-0 rounded-[3px]", className)}
      />
    )
  }
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-4 shrink-0 place-items-center rounded-[4px] bg-foreground/[0.08] text-[9px] font-semibold text-muted-foreground uppercase",
        className,
      )}
    >
      {agent.name.slice(0, 1)}
    </span>
  )
}

/** Ours: the app icon, with a hairline so its black holds on a dark header. */
function AppMark({ className }: { className?: string }) {
  return (
    <img
      src={appMark}
      alt=""
      draggable={false}
      className={cn("size-6 shrink-0 rounded-[6px] ring-1 ring-foreground/10", className)}
    />
  )
}

export { AgentMark, AppMark }
