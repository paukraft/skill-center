import { useState } from "react"

import { AgentPicker } from "@/components/agent-picker"
import { useToast } from "@/components/toast"
import { Button } from "@/components/ui"
import { allChosen, type Agent } from "@skill-center/core/agents"
import * as ops from "@skill-center/core/ops"
import { slugify } from "@skill-center/core/skill-md"

/**
 * A skill of the user's own: a name, the one sentence an agent reads to
 * decide when to use it, and the instructions it follows once it does.
 */

const BODY_PLACEHOLDER = `# What to do

1. First step.
2. Second step.

## Rules

- Anything the agent must always or never do.`

function CreateSkill({ agents, onCreated }: { agents: Agent[]; onCreated: (id: string) => void }) {
  const toast = useToast()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [body, setBody] = useState("")
  const [chosen, setChosen] = useState(() => allChosen(agents))
  const [busy, setBusy] = useState(false)

  const id = slugify(name)
  const problem = !id
    ? "Name it"
    : !description.trim()
      ? "Say when to use it"
      : !body.trim()
        ? "Write the instructions"
        : null

  async function create() {
    setBusy(true)
    try {
      const created = await ops.create({ name, description, body }, chosen)
      toast(`${created} created`)
      onCreated(created)
    } catch (caught) {
      toast((caught as Error).message, "error")
      setBusy(false)
    }
  }

  return (
    <div className="t-fade flex h-full flex-col gap-4 p-6">
      <div>
        <h1 className="text-title font-medium tracking-[-0.01em]">New skill</h1>
        <p className="mt-1 text-note text-muted-foreground">
          Saved to ~/.agents/skills{id && `/${id}`} and shared with the agents you pick.
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 rounded-lg bg-card p-2">
        <Field label="Name" hint={id && id !== name ? `Saved as ${id}` : undefined}>
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="release-notes"
            className="w-full bg-transparent text-note outline-none placeholder:text-faint"
          />
        </Field>
        <Field
          label="When to use it"
          hint="The agent reads only this to decide — say what it does and when."
        >
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={2}
            placeholder="Write release notes from the merged PRs since the last tag. Use when asked for a changelog or release notes."
            className="w-full resize-none bg-transparent text-note outline-none placeholder:text-faint"
          />
        </Field>
        <Field label="Instructions" grow>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder={BODY_PLACEHOLDER}
            spellCheck={false}
            className="h-full w-full resize-none bg-transparent font-mono text-[12.5px] leading-[1.7] outline-none placeholder:text-faint"
          />
        </Field>
      </div>

      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <AgentPicker agents={agents} chosen={chosen} onChange={setChosen} />
        </div>
        <Button
          variant="primary"
          className="h-9 min-w-[180px] px-6"
          busy={busy}
          disabled={!!problem}
          onClick={() => void create()}
        >
          {problem ?? "Create skill"}
        </Button>
      </div>
    </div>
  )
}

function Field({
  label,
  hint,
  grow,
  children,
}: {
  label: string
  hint?: string
  grow?: boolean
  children: React.ReactNode
}) {
  return (
    <label
      className={
        grow
          ? "flex min-h-0 flex-1 flex-col rounded-lg bg-muted/60 px-4 py-3 dark:bg-foreground/[0.03]"
          : "block rounded-lg bg-muted/60 px-4 py-3 dark:bg-foreground/[0.03]"
      }
    >
      <span className="mb-1 flex items-baseline gap-2 text-caption">
        <span className="font-medium">{label}</span>
        {hint && <span className="text-muted-foreground">{hint}</span>}
      </span>
      <span className={grow ? "min-h-0 flex-1" : undefined}>{children}</span>
    </label>
  )
}

export { CreateSkill }
