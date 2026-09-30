import { RefreshCw } from "lucide-react"

import {
  Action,
  AgentChips,
  AppWindow,
  Caret,
  Detail,
  Discover,
  HARNESS_NAMES,
  Preview,
  Settings,
  Stage,
  Toast,
  typed,
  typingEnds,
  useClock,
  type CursorScript,
  type Listing,
  type Skill,
} from "@/components/demo/kit"

const COMMIT_STYLE: Skill = {
  name: "commit-style",
  description: "Write commit messages in Conventional Commits style. Use when committing or asked to write a commit message.",
  agents: { claude: "on", codex: "on" },
}

const COMMIT_STYLE_MD = `---
name: commit-style
description: Write commit messages in Conventional Commits style.
---

# Commit style

- Format: \`type(scope): summary\` — feat, fix, docs, refactor.
- Summary in imperative mood, under 72 characters.
- Body explains *why*, not *what*.`

const FROM_SKILLS_SH: Skill[] = (
  [
    ["deploy-to-vercel", "Deploy applications and websites to Vercel."],
    ["frontend-design", "Guidance for distinctive, intentional visual design."],
    ["mcp-builder", "Guide for creating high-quality MCP servers."],
    ["pdf", "Use this skill whenever the user wants to work with PDFs."],
    ["vercel-cli-with-tokens", "Deploy and manage projects on Vercel with tokens."],
    ["vercel-composition-patterns", "React composition patterns that scale."],
    ["vercel-optimize", "Use for Vercel cost and performance work."],
    ["vercel-react-best-practices", "React and Next.js performance optimization."],
    ["vercel-react-native-skills", "React Native and Expo best practices."],
  ] as const
).map(([name, description]) => ({ name, description, agents: { claude: "on", codex: "on" } }))

// Write a skill: New skill, type it out, pick agents, create — then edit it.

const NAME = "release-notes"
const DESCRIPTION = "Write release notes from the PRs merged since the last tag. Use when asked for a changelog."
const INSTRUCTIONS = `# Release notes

1. List PRs merged since the last tag.
2. Group them: features, fixes, other.
3. One line each, linking the PR.`
const CREATED_MD = `---\nname: ${NAME}\ndescription: ${DESCRIPTION}\n---\n\n${INSTRUCTIONS}`
const RELEASE_NOTES: Skill = { name: NAME, description: DESCRIPTION, agents: { claude: "on", codex: "on" } }
const ADDED = "\n4. Thank first-time contributors."

/** The form typing itself out, in ms from when it opens. */
const FORM = (() => {
  const name = 600
  const description = typingEnds(NAME, name) + 300
  const instructions = typingEnds(DESCRIPTION, description, 60) + 300
  return { name, description, instructions, written: typingEnds(INSTRUCTIONS, instructions, 70) }
})()

const CREATE = (() => {
  const clickNew = 1100
  const written = clickNew + FORM.written
  const clickCreate = written + 2000
  const clickEdit = clickCreate + 2200
  const addition = clickEdit + 1100
  const clickSave = typingEnds(ADDED, addition) + 800
  return { clickNew, name: clickNew + FORM.name, clickCodex: written + 900, clickCreate, clickEdit, addition, clickSave, saved: clickSave + 600 }
})()
const CREATE_LENGTH = CREATE.saved + 2200

const CREATE_CURSOR: CursorScript = {
  start: [560, 400],
  moves: [
    { at: CREATE.clickNew - 100, to: "create" },
    { at: CREATE.name - 100, to: "field-name" },
    { at: CREATE.clickCodex - 100, to: "chip-codex" },
    { at: CREATE.clickCreate - 100, to: "create-button" },
    { at: CREATE.clickEdit - 100, to: "edit-file" },
    { at: CREATE.clickSave - 100, to: "save-file" },
  ],
  clicks: [CREATE.clickNew, CREATE.clickCodex, CREATE.clickCreate, CREATE.clickEdit, CREATE.clickSave],
}

function CreateSkillDemo() {
  const [clock, t] = useClock(CREATE_LENGTH, CREATE_LENGTH - 1000)
  const created = t >= CREATE.clickCreate
  const writing = t >= CREATE.clickNew && !created
  const codex = t < CREATE.clickCodex

  const skill: Skill = {
    name: NAME,
    description: DESCRIPTION,
    agents: { claude: "on", codex: codex ? "on" : "off" },
  }

  return (
    <Stage clock={clock} t={t} length={CREATE_LENGTH} cursor={CREATE_CURSOR}>
      <AppWindow
        tab={writing ? "create" : null}
        yours={created ? [COMMIT_STYLE, skill] : [COMMIT_STYLE]}
        fromSkillsSh={FROM_SKILLS_SH}
        selected={created ? NAME : writing ? null : COMMIT_STYLE.name}
      >
        {created ? (
          <>
            <Detail
              skill={skill}
              origin="Yours"
              body={CREATED_MD + typed(ADDED, t, CREATE.addition)}
              edit={t >= CREATE.saved ? "reading" : t >= CREATE.clickSave ? "saving" : t >= CREATE.clickEdit ? "editing" : "reading"}
              // Down to the end of the file, to add a step.
              scroll={t >= CREATE.clickEdit + 400 ? 7 : 0}
            />
            {t < CREATE.clickCreate + 2000 && <Toast>{NAME} created</Toast>}
          </>
        ) : writing ? (
          <CreateForm t={t - CREATE.clickNew} codex={codex} />
        ) : (
          <Detail skill={COMMIT_STYLE} origin="Yours" body={COMMIT_STYLE_MD} edit="reading" />
        )}
      </AppWindow>
    </Stage>
  )
}

/** The New skill form, `t` ms after it opened. */
function CreateForm({ t, codex }: { t: number; codex: boolean }) {
  const name = typed(NAME, t, FORM.name)
  const description = typed(DESCRIPTION, t, FORM.description, 60)
  const instructions = typed(INSTRUCTIONS, t, FORM.instructions, 70)
  const active = t >= FORM.instructions ? "instructions" : t >= FORM.description ? "description" : "name"
  const problem = !name
    ? "Name it"
    : description.length < DESCRIPTION.length
      ? "Say when to use it"
      : instructions.length < INSTRUCTIONS.length
        ? "Write the instructions"
        : null

  return (
    <div className="flex h-full animate-in flex-col gap-3 p-5 duration-300 fade-in">
      <div>
        <h1 className="text-[20px] font-medium tracking-[-0.01em]">New skill</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Saved to ~/.agents/skills{name && `/${name}`} and shared with the agents you pick.
        </p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 rounded-lg bg-card p-1.5">
        <Field at="field-name" label="Name">
          {name || <span className="text-foreground/30">release-notes</span>}
          {active === "name" && <Caret />}
        </Field>
        <Field label="When to use it" hint="The agent reads only this to decide.">
          <span className="block min-h-[2.75em] leading-snug">
            {description}
            {active === "description" && <Caret />}
          </span>
        </Field>
        <Field label="Instructions" grow>
          <span className="block font-mono text-[11.5px] leading-[1.55] whitespace-pre-wrap">
            {instructions}
            {active === "instructions" && <Caret />}
          </span>
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <AgentChips chosen={{ claude: true, codex }} />
        </div>
        <span
          data-at="create-button"
          className="flex h-7 min-w-[150px] items-center justify-center rounded-full bg-foreground px-4 text-xs whitespace-nowrap text-background transition-opacity duration-200"
          style={{ opacity: problem ? 0.5 : 1 }}
        >
          {problem ?? "Create skill"}
        </span>
      </div>
    </div>
  )
}

function Field({
  at,
  label,
  hint,
  grow,
  children,
}: {
  at?: string
  label: string
  hint?: string
  grow?: boolean
  children: React.ReactNode
}) {
  return (
    <div data-at={at} className={grow ? "min-h-0 flex-1 rounded-lg bg-foreground/[0.03] px-4 py-2" : "rounded-lg bg-foreground/[0.03] px-4 py-2"}>
      <p className="mb-1 flex gap-2 text-xs">
        <span className="font-medium">{label}</span>
        {hint && <span className="text-muted-foreground">{hint}</span>}
      </p>
      {children}
    </div>
  )
}

// Switch per agent: Codex off, Claude Code off, both back on.

const SWITCH = {
  codexOff: 1500,
  claudeOff: 2700,
  claudeOn: 4200,
  codexOn: 5400,
}
const SWITCH_LENGTH = 7500

const SWITCH_CURSOR: CursorScript = {
  start: [500, 420],
  moves: [
    { at: SWITCH.codexOff - 100, to: "switch-codex" },
    { at: SWITCH.claudeOff - 100, to: "switch-claude" },
    { at: SWITCH.claudeOn - 100, to: "switch-claude" },
    { at: SWITCH.codexOn - 100, to: "switch-codex" },
  ],
  clicks: [SWITCH.codexOff, SWITCH.claudeOff, SWITCH.claudeOn, SWITCH.codexOn],
}

function SwitchHarnessesDemo() {
  const [clock, t] = useClock(SWITCH_LENGTH, SWITCH_LENGTH - 1000)
  const skill: Skill = {
    ...COMMIT_STYLE,
    agents: {
      claude: t >= SWITCH.claudeOff && t < SWITCH.claudeOn ? "off" : "on",
      codex: t >= SWITCH.codexOff && t < SWITCH.codexOn ? "off" : "on",
    },
  }

  return (
    <Stage clock={clock} t={t} length={SWITCH_LENGTH} cursor={SWITCH_CURSOR}>
      <AppWindow tab={null} yours={[skill]} fromSkillsSh={FROM_SKILLS_SH} selected={skill.name}>
        <Detail skill={skill} origin="Yours" body={COMMIT_STYLE_MD} edit="reading" />
      </AppWindow>
    </Stage>
  )
}

// Update: see what changed, update one, then the rest in one go.

const OUTDATED = ["frontend-design", "mcp-builder", "pdf"]

const FRONTEND_DESIGN_MD = `---
name: frontend-design
description: Guidance for distinctive, intentional visual design.
---

# Frontend Design

Approach this as the design lead at a studio known for a distinct point of view.
Commit to one typeface pairing and one accent colour.`

const FRONTEND_DESIGN_DIFF = `-description: Guidance for distinctive visual design.
+description: Guidance for distinctive, intentional visual design.
 # Frontend Design
-Pick a bold direction and commit to it.
+Approach this as the design lead at a studio known for a distinct point of view.
+Commit to one typeface pairing and one accent colour.`

const UPDATE = {
  review: 1400,
  update: 4600,
  updated: 5300,
  updateAll: 6800,
  allUpdated: 7700,
}
const UPDATE_LENGTH = 10500

const UPDATE_CURSOR: CursorScript = {
  start: [560, 440],
  moves: [
    { at: UPDATE.review - 100, to: "what-changed" },
    { at: UPDATE.update - 100, to: "update" },
    { at: UPDATE.updateAll - 100, to: "update-all" },
    { at: UPDATE.allUpdated + 900, to: [540, 250] },
  ],
  clicks: [UPDATE.review, UPDATE.update, UPDATE.updateAll],
}

function UpdateDemo() {
  const [clock, t] = useClock(UPDATE_LENGTH, UPDATE_LENGTH - 1000)
  const updated = (name: string) => t >= (name === "frontend-design" ? UPDATE.updated : UPDATE.allUpdated)
  const skills = FROM_SKILLS_SH.map((skill) => ({
    ...skill,
    outdated: OUTDATED.includes(skill.name) && !updated(skill.name),
  }))
  const skill = skills.find((skill) => skill.name === "frontend-design")!
  const reviewing = t >= UPDATE.review && skill.outdated

  return (
    <Stage clock={clock} t={t} length={UPDATE_LENGTH} cursor={UPDATE_CURSOR}>
      <AppWindow
        tab={null}
        yours={[COMMIT_STYLE]}
        fromSkillsSh={skills}
        selected={skill.name}
        updates={{
          count: skills.filter((skill) => skill.outdated).length,
          busy: t >= UPDATE.updateAll,
        }}
      >
        <FrontendDesign skill={skill} reviewing={reviewing} updating={t >= UPDATE.update} />
        {t >= UPDATE.updated && t < UPDATE.updated + 1300 && <Toast>frontend-design is up to date</Toast>}
        {t >= UPDATE.allUpdated && t < UPDATE.allUpdated + 2000 && <Toast>2 skills updated</Toast>}
      </AppWindow>
    </Stage>
  )
}

/** frontend-design, open: with an update waiting, what changed in it and the button to take it. */
function FrontendDesign({ skill, reviewing, updating }: { skill: Skill; reviewing: boolean; updating: boolean }) {
  return (
    <Detail
      skill={skill}
      origin={`From skills.sh · updated ${skill.outdated ? "12 Aug" : "30 Sept"} 2026`}
      actions={
        skill.outdated && (
          <>
            <Action at="what-changed">{reviewing ? "Hide changes" : "What changed"}</Action>
            <Action at="update" primary busy={updating}>
              {!updating && <RefreshCw />}
              Update
            </Action>
          </>
        )
      }
      body={FRONTEND_DESIGN_MD}
      diff={reviewing ? FRONTEND_DESIGN_DIFF : undefined}
    />
  )
}

// MCP: the server added to every harness in one go, then taken out of one.

const MCP = {
  all: 1500,
  opencodeOff: 3600,
}
const MCP_LENGTH = 6000

const MCP_CURSOR: CursorScript = {
  start: [620, 560],
  moves: [
    { at: MCP.all - 100, to: "mcp-all" },
    { at: MCP.opencodeOff - 100, to: "mcp-OpenCode" },
  ],
  clicks: [MCP.all, MCP.opencodeOff],
}

function McpDemo() {
  const [clock, t] = useClock(MCP_LENGTH, MCP.opencodeOff + 1000)
  const added = t < MCP.all ? [] : HARNESS_NAMES.filter((name) => name !== "OpenCode" || t < MCP.opencodeOff)

  return (
    <Stage clock={clock} t={t} length={MCP_LENGTH} cursor={MCP_CURSOR} width={1000}>
      <AppWindow tab="settings" yours={[COMMIT_STYLE]} fromSkillsSh={FROM_SKILLS_SH} selected={null}>
        <Settings tab="mcp" mcp={added} />
      </AppWindow>
    </Stage>
  )
}

// The tour, for the top of the page: install a skill, update one, write one, delete one.

// skills.sh as it was in September 2026: what it has on Remotion, and the
// top of its search results as "remotion" is typed.

const REMOTION: Skill = {
  name: "remotion-best-practices",
  description: "Router for all Remotion skills",
  agents: { claude: "on", codex: "on" },
}

const REMOTION_MD = `---
name: remotion-best-practices
description: Router for all Remotion skills
version: 4.0.530
---

## Preserve user changes

Users may make edits in the code outside of the conversation.

## Creating a video

If the user asks to make, create, or build a new video or composition, load
[Create a new Remotion video](./remotion-create/REFERENCE.md).`

const REMOTION_LISTING: Listing = { name: REMOTION.name, source: "remotion-dev/skills", installs: "556K" }

const SEARCH = "remotion"

const RESULTS: Record<string, Listing[]> = {
  rem: [
    REMOTION_LISTING,
    { name: "remotion-to-hyperframes", source: "heygen-com/hyperframes", installs: "352K" },
    { name: "remotion-render", source: "remotion-dev/skills", installs: "110K" },
    { name: "remult", source: "remult.dev", installs: "21" },
  ],
  [SEARCH]: [
    REMOTION_LISTING,
    { name: "remotion-render", source: "remotion-dev/skills", installs: "110K" },
    { name: "remotion-create", source: "remotion-dev/skills", installs: "109K" },
    { name: "remotion-markup", source: "remotion-dev/skills", installs: "104K" },
    { name: "remotion-upgrade", source: "remotion-dev/skills", installs: "90K" },
  ],
}

const PDF = FROM_SKILLS_SH.find((skill) => skill.name === "pdf")!

const PDF_MD = `---
name: pdf
description: Use this skill whenever the user wants to work with PDFs.
---

# PDF

Read, fill, merge and split PDFs with pypdf.`

const TOUR = (() => {
  const create = 13000
  const written = create + FORM.written
  const clickCreate = written + 900
  const reopen = clickCreate + 2200
  return {
    discover: 1300,
    query: 2000,
    open: 4000,
    install: 5200,
    installed: 6000,
    select: 7600,
    review: 8800,
    update: 11000,
    updated: 11700,
    create,
    name: create + FORM.name,
    clickCreate,
    reopen,
    trash: reopen + 1300,
    confirm: reopen + 2300,
    deleted: reopen + 2900,
  }
})()
const TOUR_LENGTH = TOUR.deleted + 2500

const TOUR_CURSOR: CursorScript = {
  start: [640, 520],
  moves: [
    { at: TOUR.discover - 100, to: "discover" },
    { at: TOUR.open - 100, to: `listing-${REMOTION.name}` },
    { at: TOUR.install - 100, to: "install" },
    { at: TOUR.select - 100, to: "row-frontend-design" },
    { at: TOUR.review - 100, to: "what-changed" },
    { at: TOUR.update - 100, to: "update" },
    { at: TOUR.create - 100, to: "create" },
    { at: TOUR.name - 100, to: "field-name" },
    { at: TOUR.clickCreate - 100, to: "create-button" },
    { at: TOUR.reopen - 100, to: `row-${PDF.name}` },
    { at: TOUR.trash - 100, to: "trash" },
    { at: TOUR.confirm - 100, to: "move-to-trash" },
    { at: TOUR.deleted + 1500, to: [640, 520] },
  ],
  clicks: [
    TOUR.discover,
    TOUR.open,
    TOUR.install,
    TOUR.select,
    TOUR.review,
    TOUR.update,
    TOUR.create,
    TOUR.clickCreate,
    TOUR.reopen,
    TOUR.trash,
    TOUR.confirm,
  ],
}

function TourDemo() {
  const [clock, t] = useClock(TOUR_LENGTH, TOUR.clickCreate + 1000)
  const created = t >= TOUR.clickCreate
  const fromSkillsSh = FROM_SKILLS_SH.filter((skill) => skill !== PDF || t < TOUR.deleted).map((skill) => ({
    ...skill,
    outdated: skill.name === "frontend-design" && t < TOUR.updated,
  }))
  const view = tourView(t)

  return (
    <Stage clock={clock} t={t} length={TOUR_LENGTH} cursor={TOUR_CURSOR} width={1000}>
      <AppWindow
        tab={view.tab ?? null}
        yours={created ? [COMMIT_STYLE, RELEASE_NOTES] : [COMMIT_STYLE]}
        fromSkillsSh={
          t >= TOUR.installed ? [...fromSkillsSh, REMOTION].sort((a, b) => a.name.localeCompare(b.name)) : fromSkillsSh
        }
        selected={view.selected ?? null}
        updates={{ count: t < TOUR.updated ? 1 : 0, busy: false }}
      >
        {view.pane}
        {t >= TOUR.installed && t < TOUR.installed + 1500 && <Toast>{REMOTION.name} installed</Toast>}
        {t >= TOUR.updated && t < TOUR.updated + 1300 && <Toast>frontend-design is up to date</Toast>}
        {created && t < TOUR.clickCreate + 2000 && <Toast>{NAME} created</Toast>}
        {t >= TOUR.deleted && t < TOUR.deleted + 1800 && <Toast>{PDF.name} moved to the Trash</Toast>}
      </AppWindow>
    </Stage>
  )
}

const commitStyle = <Detail key={COMMIT_STYLE.name} skill={COMMIT_STYLE} origin="Yours" body={COMMIT_STYLE_MD} edit="reading" />

/** What the tour has open at `t`: the header tab, the row, the pane. */
function tourView(t: number): { tab?: "discover" | "create"; selected?: string; pane: React.ReactNode } {
  if (t >= TOUR.deleted) return { selected: COMMIT_STYLE.name, pane: commitStyle }
  if (t >= TOUR.reopen) {
    return {
      selected: PDF.name,
      pane: (
        <Detail
          key={PDF.name}
          skill={PDF}
          origin="From skills.sh · anthropics/skills"
          deleting={t >= TOUR.confirm ? "busy" : t >= TOUR.trash ? "confirm" : undefined}
          body={PDF_MD}
        />
      ),
    }
  }
  if (t >= TOUR.clickCreate) {
    return {
      selected: NAME,
      pane: <Detail key={NAME} skill={RELEASE_NOTES} origin="Yours" body={CREATED_MD} edit="reading" />,
    }
  }
  if (t >= TOUR.create) return { tab: "create", pane: <CreateForm t={t - TOUR.create} codex /> }
  if (t >= TOUR.select) {
    const skill = { ...FROM_SKILLS_SH.find((skill) => skill.name === "frontend-design")!, outdated: t < TOUR.updated }
    return {
      selected: skill.name,
      pane: (
        <FrontendDesign
          key={skill.name}
          skill={skill}
          reviewing={t >= TOUR.review && skill.outdated}
          updating={t >= TOUR.update}
        />
      ),
    }
  }
  if (t >= TOUR.installed) {
    return {
      selected: REMOTION.name,
      pane: <Detail key={REMOTION.name} skill={REMOTION} origin="From skills.sh · remotion-dev/skills" body={REMOTION_MD} />,
    }
  }
  if (t >= TOUR.open) {
    return {
      tab: "discover",
      pane: (
        <Preview listing={REMOTION_LISTING} description={REMOTION.description} installing={t >= TOUR.install} body={REMOTION_MD} />
      ),
    }
  }
  if (t >= TOUR.discover) {
    const query = typed(SEARCH, t, TOUR.query, 8)
    // Searched from three letters on, and again once the word is complete.
    const searched = query === SEARCH ? SEARCH : query.slice(0, 3)
    return { tab: "discover", pane: <Discover query={query} results={RESULTS[searched]} /> }
  }
  return { selected: COMMIT_STYLE.name, pane: commitStyle }
}

export { CreateSkillDemo, McpDemo, SwitchHarnessesDemo, TourDemo, UpdateDemo }
