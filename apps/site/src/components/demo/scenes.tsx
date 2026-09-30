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
const ADDED = "\n4. Thank first-time contributors."

const CREATE = (() => {
  const name = 1700
  const description = typingEnds(NAME, name) + 300
  const instructions = typingEnds(DESCRIPTION, description, 60) + 300
  const written = typingEnds(INSTRUCTIONS, instructions, 70)
  const clickCreate = written + 2000
  const clickEdit = clickCreate + 2200
  const addition = clickEdit + 1100
  const clickSave = typingEnds(ADDED, addition) + 800
  return { clickNew: 1100, name, description, instructions, clickCodex: written + 900, clickCreate, clickEdit, addition, clickSave, saved: clickSave + 600 }
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
          <CreateForm t={t} codex={codex} />
        ) : (
          <Detail skill={COMMIT_STYLE} origin="Yours" body={COMMIT_STYLE_MD} edit="reading" />
        )}
      </AppWindow>
    </Stage>
  )
}

function CreateForm({ t, codex }: { t: number; codex: boolean }) {
  const name = typed(NAME, t, CREATE.name)
  const description = typed(DESCRIPTION, t, CREATE.description, 60)
  const instructions = typed(INSTRUCTIONS, t, CREATE.instructions, 70)
  const active = t >= CREATE.instructions ? "instructions" : t >= CREATE.description ? "description" : "name"
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
        <Detail
          skill={skill}
          origin={`From skills.sh · updated ${skill.outdated ? "12 Aug" : "30 Sept"} 2026`}
          actions={
            skill.outdated && (
              <>
                <Action at="what-changed">{reviewing ? "Hide changes" : "What changed"}</Action>
                <Action at="update" primary busy={t >= UPDATE.update}>
                  {t < UPDATE.update && <RefreshCw />}
                  Update
                </Action>
              </>
            )
          }
          body={FRONTEND_DESIGN_MD}
          diff={reviewing ? FRONTEND_DESIGN_DIFF : undefined}
        />
        {t >= UPDATE.updated && t < UPDATE.updated + 1300 && <Toast>frontend-design is up to date</Toast>}
        {t >= UPDATE.allUpdated && t < UPDATE.allUpdated + 2000 && <Toast>2 skills updated</Toast>}
      </AppWindow>
    </Stage>
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

// The tour: a bit of everything, for the top of the page.

const REMOTION: Skill = {
  name: "remotion-best-practices",
  description: "Best practices for Remotion — making videos in React.",
  agents: { claude: "on", codex: "on" },
}

const REMOTION_MD = `---
name: remotion-best-practices
description: Best practices for Remotion — making videos in React.
---

# Remotion

Use this whenever writing or changing Remotion compositions.`

const REMOTION_LISTING: Listing = { name: REMOTION.name, source: "remotion-dev/skills", installs: "96K" }

const MOST_INSTALLED: Listing[] = [
  { name: "find-skills", source: "vercel-labs/skills", installs: "418K" },
  { name: "vercel-react-best-practices", source: "vercel-labs/agent-skills", installs: "212K", installed: true },
  { name: "frontend-design", source: "anthropics/skills", installs: "164K", installed: true },
  REMOTION_LISTING,
  { name: "web-design-guidelines", source: "vercel-labs/agent-skills", installs: "88K" },
]

const REACT_RESULTS: Listing[] = [
  { name: "vercel-react-best-practices", source: "vercel-labs/agent-skills", installs: "212K", installed: true },
  REMOTION_LISTING,
  { name: "vercel-react-native-skills", source: "vercel-labs/agent-skills", installs: "41K", installed: true },
  { name: "vercel-composition-patterns", source: "vercel-labs/agent-skills", installs: "38K", installed: true },
]

// Every step is undone by the end — the skill it installs goes back to the
// Trash — so the loop runs on without a cut.
const TOUR = {
  discover: 1300,
  query: 2000,
  open: 3600,
  install: 4800,
  installed: 5600,
  codexOff: 7000,
  settings: 8600,
  harnesses: 9800,
  hide: 11000,
  filter: 12400,
  unfilter: 14200,
  reopen: 15400,
  trash: 16800,
  confirm: 17800,
  deleted: 18400,
}
const TOUR_LENGTH = 21500

const TOUR_CURSOR: CursorScript = {
  start: [640, 520],
  moves: [
    { at: TOUR.discover - 100, to: "discover" },
    { at: TOUR.open - 100, to: `listing-${REMOTION.name}` },
    { at: TOUR.install - 100, to: "install" },
    { at: TOUR.codexOff - 100, to: "switch-codex" },
    { at: TOUR.settings - 100, to: "settings" },
    { at: TOUR.harnesses - 100, to: "settings-harnesses" },
    { at: TOUR.hide - 100, to: "harness-OpenCode" },
    { at: TOUR.filter - 100, to: "filter" },
    { at: TOUR.reopen - 100, to: `row-${REMOTION.name}` },
    { at: TOUR.trash - 100, to: "trash" },
    { at: TOUR.confirm - 100, to: "move-to-trash" },
    { at: TOUR_LENGTH - 300, to: [640, 520] },
  ],
  clicks: [
    TOUR.discover,
    TOUR.open,
    TOUR.install,
    TOUR.codexOff,
    TOUR.settings,
    TOUR.harnesses,
    TOUR.hide,
    TOUR.filter,
    TOUR.reopen,
    TOUR.trash,
    TOUR.confirm,
  ],
}

function TourDemo() {
  const [clock, t] = useClock(TOUR_LENGTH, TOUR.codexOff + 1000)
  const remotion: Skill = t >= TOUR.codexOff ? { ...REMOTION, agents: { ...REMOTION.agents, codex: "off" } } : REMOTION
  const installed = t >= TOUR.installed && t < TOUR.deleted
  // Typed into the filter, then erased again.
  const filter = typed("vercel", t, TOUR.filter + 300, 10)
  const erased = typed(filter, t, TOUR.unfilter, 12).length
  const view = tourView(t, remotion)

  return (
    <Stage clock={clock} t={t} length={TOUR_LENGTH} cursor={TOUR_CURSOR} width={1000} seamless>
      <AppWindow
        tab={view.tab ?? null}
        yours={[COMMIT_STYLE]}
        fromSkillsSh={
          installed ? [...FROM_SKILLS_SH, remotion].sort((a, b) => a.name.localeCompare(b.name)) : FROM_SKILLS_SH
        }
        selected={view.selected ?? null}
        filter={filter.slice(0, filter.length - erased)}
      >
        {view.pane}
        {t >= TOUR.installed && t < TOUR.installed + 1800 && <Toast>{REMOTION.name} installed</Toast>}
        {t >= TOUR.deleted && t < TOUR.deleted + 1800 && <Toast>{REMOTION.name} moved to the Trash</Toast>}
      </AppWindow>
    </Stage>
  )
}

/** What the tour has open at `t`: the header tab, the row, the pane. */
function tourView(
  t: number,
  remotion: Skill,
): { tab?: "discover" | "settings"; selected?: string; pane: React.ReactNode } {
  const detail = (deleting?: "confirm" | "busy") => ({
    selected: REMOTION.name,
    pane: (
      <Detail
        key={REMOTION.name}
        skill={remotion}
        origin="From skills.sh · remotion-dev/skills"
        deleting={deleting}
        body={REMOTION_MD}
      />
    ),
  })
  if (t >= TOUR.deleted || t < TOUR.discover) {
    return {
      selected: COMMIT_STYLE.name,
      pane: <Detail key={COMMIT_STYLE.name} skill={COMMIT_STYLE} origin="Yours" body={COMMIT_STYLE_MD} edit="reading" />,
    }
  }
  if (t >= TOUR.reopen) {
    return detail(t >= TOUR.confirm ? "busy" : t >= TOUR.trash ? "confirm" : undefined)
  }
  if (t >= TOUR.settings) {
    return {
      tab: "settings",
      pane: <Settings tab={t >= TOUR.harnesses ? "harnesses" : "general"} hidden={t >= TOUR.hide ? ["OpenCode"] : []} />,
    }
  }
  if (t >= TOUR.installed) return detail()
  if (t >= TOUR.open) {
    return {
      tab: "discover",
      pane: (
        <Preview listing={REMOTION_LISTING} description={REMOTION.description} installing={t >= TOUR.install} body={REMOTION_MD} />
      ),
    }
  }
  const query = typed("react", t, TOUR.query, 10)
  return { tab: "discover", pane: <Discover query={query} results={query.length >= 2 ? REACT_RESULTS : MOST_INSTALLED} /> }
}

export { CreateSkillDemo, McpDemo, SwitchHarnessesDemo, TourDemo, UpdateDemo }
