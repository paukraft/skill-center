import { ArrowsClockwise } from "@phosphor-icons/react"
import { Button } from "@/components/ui"
import { words } from "@/lib/bridge"
import { useAction } from "@/lib/use-action"
import * as ops from "@skill-center/core/ops"
import type { Skill } from "@skill-center/core/skills"

/** Above the list when skills.sh has newer versions: all of them, in one go. */
function UpdatesBar({ skills }: { skills: Skill[] }) {
  const [busy, run] = useAction()
  if (!skills.length) return null

  const updateAll = () =>
    run(
      () => ops.update(skills),
      `${skills.length} ${skills.length === 1 ? "skill" : "skills"} updated`,
    )

  return (
    <div className="t-fade mb-3 flex items-center gap-3 rounded-lg bg-accent/25 py-2 pr-2 pl-3">
      <span className="size-1.5 shrink-0 rounded-full bg-accent" />
      <span className="flex-1 text-note">
        {skills.length} {skills.length === 1 ? "update" : "updates"}
      </span>
      <Button size="sm" variant="primary" busy={busy} onClick={() => void updateAll()}>
        {!busy && <ArrowsClockwise />}
        {busy ? "Updating…" : "Update all"}
      </Button>
    </div>
  )
}

/**
 * Links left in a harness's folder after their skill went — by hand, or
 * by another tool. They do nothing but can confuse the harness.
 */
function BrokenLinksBar({ paths }: { paths: string[] }) {
  const [busy, run] = useAction()
  if (!paths.length) return null

  const clean = () =>
    run(
      () => ops.removeBroken(paths),
      `${paths.length} broken ${paths.length === 1 ? "link" : "links"} moved to the ${words.trash}`,
    )

  return (
    <div
      className="t-fade mb-3 flex items-center gap-3 rounded-lg bg-warn-soft py-2 pr-2 pl-3"
      title={paths.join("\n")}
    >
      <span className="size-1.5 shrink-0 rounded-full bg-warn" />
      <span className="flex-1 text-note">
        {paths.length} broken {paths.length === 1 ? "link" : "links"}
      </span>
      <Button size="sm" busy={busy} onClick={() => void clean()}>
        Clean up
      </Button>
    </div>
  )
}

export { BrokenLinksBar, UpdatesBar }
