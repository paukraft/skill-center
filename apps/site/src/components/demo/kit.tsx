import { ArrowLeft, Check, Compass, Folder, LoaderCircle, Plus, RefreshCw, Search, Settings as Gear, Trash2 } from "lucide-react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"

/**
 * Motion-graphic stand-ins for screen recordings: a drawing of the app on a
 * fixed 8:5 canvas, scaled to its frame, driven by one clock. Every scene is
 * a pure function of the time into its loop.
 */

/** Milliseconds into a loop of `length`; runs only while on screen. */
function useClock(length: number, still: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [t, setT] = useState(0)

  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setT(still)
      return
    }
    let frame = 0
    let origin = 0
    let at = 0
    const tick = (now: number) => {
      origin ||= now - at
      at = (now - origin) % length
      setT(at)
      frame = requestAnimationFrame(tick)
    }
    const observer = new IntersectionObserver(([entry]) => {
      cancelAnimationFrame(frame)
      origin = 0
      if (entry!.isIntersecting) frame = requestAnimationFrame(tick)
    })
    observer.observe(ref.current!)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [length, still])

  return [ref, t] as const
}

const clamp = (value: number) => Math.min(1, Math.max(0, value))
const easeInOut = (p: number) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2)

/** The part of `text` typed by `t`, starting at `from`, `cps` characters a second. */
function typed(text: string, t: number, from: number, cps = 28) {
  return text.slice(0, Math.max(0, Math.floor(((t - from) / 1000) * cps)))
}

function typingEnds(text: string, from: number, cps = 28) {
  return from + (text.length / cps) * 1000
}

/** The canvas, scaled to the frame's width without measuring it. */
function Stage({
  clock,
  t,
  length,
  cursor,
  width = 800,
  seamless,
  children,
}: {
  clock: React.RefObject<HTMLDivElement | null>
  t: number
  length: number
  cursor: CursorScript
  /** The canvas's own width in px; wider draws the app smaller. */
  width?: number
  /** The loop ends where it starts, so it runs on without a cut. */
  seamless?: boolean
  children: React.ReactNode
}) {
  // Otherwise each loop fades in from, and out to, the empty frame.
  const opacity = seamless ? 1 : Math.min(clamp(t / 300), clamp((length - t) / 400))
  return (
    <div ref={clock} aria-hidden className="relative aspect-[8/5] overflow-hidden bg-background [container-type:inline-size]">
      <div
        className="absolute top-0 left-0 origin-top-left select-none"
        style={{ width, height: (width * 5) / 8, scale: `tan(atan2(100cqw, ${width}px))`, opacity }}
      >
        {children}
        <Cursor script={cursor} t={t} />
      </div>
    </div>
  )
}

/**
 * Where the pointer goes: it rests at `start`, then glides to each target —
 * an element marked `data-at`, or a point — arriving at `at`. It presses at
 * `clicks`.
 */
type Point = [number, number]
type CursorScript = {
  start: Point
  moves: { at: number; to: string | Point }[]
  clicks: number[]
}

const TRAVEL = 700
const PRESS = 180

function Cursor({ script, t }: { script: CursorScript; t: number }) {
  const ref = useRef<HTMLDivElement>(null)
  // Where each target was last seen, for once it is gone from the canvas.
  const seen = useRef(new Map<string, Point>())

  useLayoutEffect(() => {
    const cursor = ref.current!
    const stage = cursor.parentElement!
    const box = stage.getBoundingClientRect()
    const scale = box.width / stage.offsetWidth
    const point = (to: string | Point): Point => {
      if (typeof to !== "string") return to
      const rect = stage.querySelector(`[data-at="${to}"]`)?.getBoundingClientRect()
      if (!rect) return seen.current.get(to) ?? script.start
      const found: Point = [(rect.left + rect.width / 2 - box.left) / scale, (rect.top + rect.height / 2 - box.top) / scale]
      seen.current.set(to, found)
      return found
    }

    let from: string | Point = script.start
    let [x, y] = point(from)
    for (const move of script.moves) {
      const p = clamp((t - (move.at - TRAVEL)) / TRAVEL)
      if (p === 0) break
      const [x0, y0] = point(from)
      const [x1, y1] = point(move.to)
      const e = easeInOut(p)
      x = x0 + (x1 - x0) * e
      y = y0 + (y1 - y0) * e
      from = move.to
    }
    const pressed = script.clicks.some((click) => t >= click && t < click + PRESS)
    cursor.style.translate = `${x}px ${y}px`
    cursor.style.scale = pressed ? "0.85" : "1"
  })

  const ripple = script.clicks.find((click) => t >= click && t < click + 500)
  return (
    <div ref={ref} className="pointer-events-none absolute top-0 left-0 z-10 transition-[scale] duration-100">
      {ripple !== undefined && (
        <span
          className="absolute -top-4 -left-4 size-8 rounded-full bg-white/25"
          style={{ scale: 0.3 + clamp((t - ripple) / 500) * 0.9, opacity: 1 - clamp((t - ripple) / 500) }}
        />
      )}
      <svg viewBox="0 0 16 24" className="relative -top-px -left-px h-[22px] drop-shadow-[0_2px_4px_rgb(0_0_0/0.5)]">
        <path d="M1 1v19l5-5 3.5 7.5 3-1.4L9 13.8h7z" fill="#fff" stroke="#000" strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

/** Blinks at the end of whatever is being typed. */
function Caret() {
  return <span className="ml-px inline-block h-[1.1em] w-px translate-y-[0.2em] animate-pulse bg-foreground" />
}

// The app's window, drawn.

type Agent = { name: string; logo: string }
type State = "on" | "off"

const AGENTS = {
  claude: { name: "Claude Code", logo: "/logos/claude-code.svg" },
  codex: { name: "Codex", logo: "/logos/codex-dark.svg" },
} satisfies Record<string, Agent>

type AgentId = keyof typeof AGENTS
const AGENT_IDS = Object.keys(AGENTS) as AgentId[]
const SHARED = ["/logos/cursor-dark.svg", "/logos/gemini-cli.svg", "/logos/opencode-dark.svg"]

type Skill = { name: string; description: string; agents: Record<AgentId, State>; outdated?: boolean }

/** Fades out whatever runs past the bottom, so a clipped list or file reads as scrolling on. */
const FADE = "[mask-image:linear-gradient(to_bottom,black_calc(100%-2.5rem),transparent)]"

/** skills.sh's sage, for what has an update waiting. */
const ACCENT = "bg-[oklch(0.766_0.068_114)]"

function Mark({ logo, className }: { logo: string; className?: string }) {
  return <img src={logo} alt="" draggable={false} className={cn("size-4 shrink-0 rounded-[3px]", className)} />
}

type Tab = "settings" | "discover" | "create" | null

function AppWindow({
  tab,
  yours,
  fromSkillsSh,
  selected,
  updates,
  filter = "",
  children,
}: {
  tab: Tab
  yours: Skill[]
  fromSkillsSh: Skill[]
  selected: string | null
  updates?: { count: number; busy: boolean }
  /** What is typed into the filter, and so all the list shows. */
  filter?: string
  children: React.ReactNode
}) {
  const matching = (skills: Skill[]) => skills.filter((skill) => `${skill.name} ${skill.description}`.includes(filter))
  const tabs = [
    { key: "settings", icon: <Gear />, label: "Settings" },
    { key: "discover", icon: <Compass />, label: "Discover" },
    { key: "create", icon: <Plus />, label: "New skill" },
  ] as const
  return (
    <div className="flex size-full flex-col text-[13px]">
      <header className="flex h-12 shrink-0 items-center gap-2 pr-3 pl-4">
        <span className="mr-3 flex gap-2">
          {["#ff5f57", "#febc2e", "#28c840"].map((color) => (
            <span key={color} className="size-3 rounded-full" style={{ background: color }} />
          ))}
        </span>
        <img src="/favicon.svg" alt="" className="size-5 rounded-[5px] ring-1 ring-white/10" />
        <span className="font-medium">Skill Center</span>
        <span className="flex-1" />
        {tabs.map(({ key, icon, label }) => (
          <span
            key={key}
            data-at={key}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-full px-3.5 transition-colors duration-200 [&_svg]:size-3.5",
              tab === key ? "bg-foreground text-background" : "bg-foreground/[0.06]",
            )}
          >
            {icon}
            {label}
          </span>
        ))}
      </header>
      <div className="min-h-0 flex-1 px-2 pb-2">
        <div className="grid h-full grid-cols-[220px_1fr] rounded-[12px] bg-card p-2">
          <nav className={cn("flex min-h-0 flex-col gap-3 overflow-hidden pr-2", FADE)}>
            <span data-at="filter" className="flex h-8 shrink-0 items-center gap-2 rounded-full bg-foreground/[0.06] px-3">
              <Search className="size-3.5 text-muted-foreground" />
              {filter ? (
                <span>
                  {filter}
                  <Caret />
                </span>
              ) : (
                <span className="text-muted-foreground">Filter skills</span>
              )}
            </span>
            {updates && updates.count > 0 && <UpdatesBar {...updates} />}
            <SkillGroup title="Yours" skills={matching(yours)} selected={selected} />
            <SkillGroup title="From skills.sh" skills={matching(fromSkillsSh)} selected={selected} />
          </nav>
          <section className="relative min-w-0 overflow-hidden rounded-lg">
            <Backdrop />
            <div className="relative h-full">{children}</div>
          </section>
        </div>
      </div>
    </div>
  )
}

/** Above the list when skills.sh has newer versions: all of them, in one go. */
function UpdatesBar({ count, busy }: { count: number; busy: boolean }) {
  return (
    <div className="flex shrink-0 items-center gap-2.5 rounded-lg bg-[oklch(0.766_0.068_114/0.25)] py-1.5 pr-1.5 pl-3">
      <span className={cn("size-1.5 shrink-0 rounded-full", ACCENT)} />
      <span className="flex-1">
        {count} {count === 1 ? "update" : "updates"}
      </span>
      <span data-at="update-all" className="flex h-6 items-center gap-1.5 rounded-full bg-foreground px-2.5 text-xs text-background [&_svg]:size-3">
        {busy ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
        {busy ? "Updating…" : "Update all"}
      </span>
    </div>
  )
}

function SkillGroup({ title, skills, selected }: { title: string; skills: Skill[]; selected: string | null }) {
  if (!skills.length) return null
  return (
    <section>
      <p className="flex h-6 items-center gap-1.5 px-3 text-xs text-muted-foreground">
        {title}
        <span className="text-foreground/30 tabular-nums">{skills.length}</span>
      </p>
      <ul className="flex flex-col gap-px">
        {skills.map((skill) => (
          <li
            key={skill.name}
            data-at={`row-${skill.name}`}
            className={cn(
              "flex animate-in items-center gap-2 rounded-lg px-3 py-1.5 duration-300 fade-in slide-in-from-top-1",
              skill.name === selected && "bg-foreground/[0.07]",
            )}
          >
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate font-medium">{skill.name}</span>
                {skill.outdated && <span className={cn("size-1.5 shrink-0 rounded-full", ACCENT)} />}
              </span>
              <span className="block truncate text-xs text-muted-foreground">{skill.description}</span>
            </span>
            {AGENT_IDS.map((id) => (
              <Mark
                key={id}
                logo={AGENTS[id].logo}
                className={cn(
                  "size-3.5 animate-in transition-[opacity,filter] duration-300 zoom-in-50",
                  skill.agents[id] === "off" && "opacity-25 grayscale",
                )}
              />
            ))}
          </li>
        ))}
      </ul>
    </section>
  )
}

/** The out-of-focus wash behind the open pane. */
function Backdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -top-1/3 -left-[10%] size-[70%] rounded-full bg-[oklch(0.298_0.035_150)] blur-[80px]" />
      <div className="absolute top-[10%] left-[38%] size-[65%] rounded-full bg-[oklch(0.238_0.024_60)] blur-[90px]" />
      <div className="absolute -right-[8%] -bottom-1/4 size-[70%] rounded-full bg-[oklch(0.288_0.042_240)] blur-[90px]" />
    </div>
  )
}

/** Where an own skill's SKILL.md is at: read, being edited, or being saved. */
type Edit = "reading" | "editing" | "saving"

/**
 * One skill, open: what it is, a tile per agent, and its SKILL.md — or, with
 * `diff`, what an update would change in it. `deleting` swaps the trash for
 * its confirm button, busy once clicked. `edit`, for the user's own skills,
 * puts the file's Edit button up; `scroll` is how many lines of it are
 * scrolled past.
 */
function Detail({
  skill,
  origin,
  actions,
  deleting,
  body,
  diff,
  edit,
  scroll,
}: {
  skill: Skill
  origin: string
  actions?: React.ReactNode
  deleting?: "confirm" | "busy"
  body: string
  diff?: string
  edit?: Edit
  scroll?: number
}) {
  return (
    <div className="flex h-full animate-in flex-col gap-3 p-5 duration-300 fade-in">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-[20px] font-medium tracking-[-0.01em]">{skill.name}</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">{origin}</p>
          <p className="mt-2 line-clamp-2 max-w-[460px] text-muted-foreground">{skill.description}</p>
        </div>
        <div className="flex items-center gap-1 text-xs [&_svg]:size-3.5">
          {actions}
          <span className="grid size-7 place-items-center">
            <Folder />
          </span>
          {deleting ? (
            <span
              data-at="move-to-trash"
              className="flex h-7 items-center gap-1.5 rounded-full bg-[oklch(0.302_0.052_25)] px-3 whitespace-nowrap text-[oklch(0.748_0.135_27)]"
            >
              {deleting === "busy" && <LoaderCircle className="animate-spin" />}
              Move to Trash
            </span>
          ) : (
            <span data-at="trash" className="grid size-7 place-items-center">
              <Trash2 />
            </span>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {AGENT_IDS.map((id) => (
          <AgentTile key={id} id={id} state={skill.agents[id]} />
        ))}
        <Tile
          mark={
            <span className="grid grid-cols-2 gap-0.5">
              {SHARED.map((logo) => (
                <Mark key={logo} logo={logo} className="size-2.5 rounded-[2px]" />
              ))}
            </span>
          }
          title="Shared folder"
          status="Cursor, Gemini CLI and OpenCode"
        />
      </div>
      <div className="min-h-0 flex-1 rounded-lg bg-card py-4 font-mono text-[11.5px] leading-[1.8]">
        <div className={cn("h-full overflow-hidden px-4", FADE)}>
          {diff ? <Diff diff={diff} /> : <SkillMd body={body} edit={edit} scroll={scroll} />}
        </div>
      </div>
    </div>
  )
}

function SkillMd({ body, edit, scroll = 0 }: { body: string; edit?: Edit; scroll?: number }) {
  const lines = body.split("\n")
  return (
    <div key="file" className="flex h-full animate-in flex-col duration-300 fade-in">
      <p className="flex h-7 shrink-0 items-center gap-1 text-muted-foreground">
        <span className="flex-1">SKILL.md</span>
        {edit === "editing" ? (
          <span className="flex gap-1 font-sans text-xs text-foreground">
            <Action at="cancel-file">Cancel</Action>
            <Action at="save-file" primary>
              Save
            </Action>
          </span>
        ) : (
          edit && (
            <span className="font-sans text-xs text-foreground">
              <Action at="edit-file" busy={edit === "saving"}>
                Edit
              </Action>
            </span>
          )
        )}
      </p>
      <div
        className={cn(
          "min-h-0 flex-1 overflow-hidden",
          scroll > 0 && "[mask-image:linear-gradient(to_bottom,transparent,black_2rem)]",
        )}
      >
        <div className="transition-[translate] duration-500 ease-in-out" style={{ translate: `0 -${scroll * 1.8}em` }}>
          {lines.map((line, index) => (
            <p key={index} className={cn("flex gap-4", line.startsWith("#") && "text-[oklch(0.75_0.12_45)]")}>
              <span className="w-3 text-right text-foreground/30">{index + 1}</span>
              <span className="min-w-0 flex-1 truncate">
                {line}
                {edit === "editing" && index === lines.length - 1 && <Caret />}
              </span>
            </p>
          ))}
        </div>
      </div>
    </div>
  )
}

/** A unified diff: lines prefixed "+", "-" or " ". */
function Diff({ diff }: { diff: string }) {
  const lines = diff.split("\n")
  const count = (sign: string) => lines.filter((line) => line.startsWith(sign)).length
  return (
    <div key="diff" className="-mx-4 animate-in duration-300 fade-in">
      <p className="mb-2 flex gap-3 px-4 text-muted-foreground">
        SKILL.md
        <span className="text-[oklch(0.778_0.108_152)]">+{count("+")}</span>
        <span className="text-[oklch(0.748_0.135_27)]">−{count("-")}</span>
      </p>
      {lines.map((line, index) => (
        <p
          key={index}
          className={cn(
            "flex animate-in gap-3 px-4 fill-mode-both fade-in slide-in-from-left-1",
            line.startsWith("+") && "bg-[oklch(0.778_0.108_152/0.12)] text-[oklch(0.86_0.08_152)]",
            line.startsWith("-") && "bg-[oklch(0.748_0.135_27/0.12)] text-[oklch(0.82_0.09_27)]",
          )}
          style={{ animationDelay: `${index * 40}ms` }}
        >
          <span className="w-2 text-foreground/40">{line[0]}</span>
          <span className="min-w-0 flex-1 truncate">{line.slice(1)}</span>
        </p>
      ))}
    </div>
  )
}

function AgentTile({ id, state }: { id: AgentId; state: State }) {
  const agent = AGENTS[id]
  return (
    <Tile mark={<Mark logo={agent.logo} className="size-5" />} title={agent.name} status={state === "on" ? "On" : "Switched off"}>
      <Switch at={`switch-${id}`} on={state === "on"} />
    </Tile>
  )
}

function Tile({
  mark,
  title,
  status,
  children,
}: {
  mark: React.ReactNode
  title: string
  status: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex h-12 items-center gap-3 rounded-lg bg-card px-3.5">
      {mark}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{status}</span>
      </span>
      {children}
    </div>
  )
}

function Switch({ at, on }: { at: string; on: boolean }) {
  return (
    <span
      data-at={at}
      className={cn(
        "flex h-[18px] w-[30px] shrink-0 items-center rounded-full p-[2px] transition-colors duration-200",
        on ? "bg-foreground" : "bg-foreground/[0.14]",
      )}
    >
      <span
        className={cn(
          "size-[14px] rounded-full bg-card transition-transform duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
          on && "translate-x-[12px]",
        )}
      />
    </span>
  )
}

/** The agents a new skill goes to, as chips. */
function AgentChips({ chosen }: { chosen: Record<AgentId, boolean> }) {
  return (
    <div className="flex gap-1.5">
      {AGENT_IDS.map((id) => (
        <span
          key={id}
          data-at={`chip-${id}`}
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-full pr-2.5 pl-2 text-xs whitespace-nowrap transition-colors duration-200",
            chosen[id] ? "bg-card" : "bg-foreground/[0.04] text-muted-foreground",
          )}
        >
          <Mark logo={AGENTS[id].logo} className={cn("size-3.5 transition-opacity", !chosen[id] && "opacity-40 grayscale")} />
          {AGENTS[id].name}
          <Check className={cn("size-3 transition-opacity", chosen[id] ? "opacity-100" : "opacity-0")} />
        </span>
      ))}
    </div>
  )
}

type Listing = { name: string; source: string; installs: string; installed?: boolean }

/** skills.sh, searched: the most installed until something is typed. */
function Discover({ query, results }: { query: string; results: Listing[] }) {
  return (
    <div className="flex h-full animate-in flex-col p-5 duration-300 fade-in">
      <h1 className="text-[20px] font-medium tracking-[-0.01em]">Discover</h1>
      <p className="mt-0.5 text-xs text-muted-foreground">Skills from skills.sh — installed for every agent at once.</p>
      <span className="mt-4 flex h-9 shrink-0 items-center gap-2 rounded-full bg-card px-4">
        <Search className="size-3.5 text-muted-foreground" />
        {query ? (
          <span>
            {query}
            <Caret />
          </span>
        ) : (
          <span className="text-muted-foreground">Search skills.sh</span>
        )}
      </span>
      <p className="mt-4 mb-2 px-1 text-xs text-muted-foreground">{query.length >= 2 ? "Results" : "Most installed"}</p>
      <ul key={query.length >= 2 ? "results" : "top"} className="flex min-h-0 flex-col gap-px overflow-hidden rounded-lg bg-card p-1">
        {results.map((listing, index) => (
          <li
            key={listing.name}
            data-at={`listing-${listing.name}`}
            className="flex animate-in items-center gap-3 rounded-lg px-3 py-1.5 fill-mode-both duration-300 fade-in slide-in-from-top-1"
            style={{ animationDelay: `${index * 30}ms` }}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{listing.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{listing.source}</span>
            </span>
            {listing.installed && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Check className="size-3" /> Installed
              </span>
            )}
            <span className="w-12 text-right text-xs text-muted-foreground tabular-nums">{listing.installs}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** One skill on skills.sh, before it is installed. */
function Preview({
  listing,
  description,
  installing,
  body,
}: {
  listing: Listing
  description: string
  installing: boolean
  body: string
}) {
  return (
    <div className="flex h-full animate-in flex-col gap-4 p-5 duration-300 fade-in">
      <div>
        <p className="mb-1.5 flex items-center gap-1 text-xs text-muted-foreground">
          <ArrowLeft className="size-3" /> Discover
        </p>
        <h1 className="text-[20px] font-medium tracking-[-0.01em]">{listing.name}</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          <span className="text-foreground">{listing.source}</span> · {listing.installs} installs
        </p>
        <p className="mt-2 max-w-[520px] text-muted-foreground">{description}</p>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <AgentChips chosen={{ claude: true, codex: true }} />
        </div>
        <span data-at="install" className="flex h-8 items-center gap-1.5 rounded-full bg-foreground px-5 text-background [&_svg]:size-3.5">
          {installing && <LoaderCircle className="animate-spin" />}
          {installing ? "Installing…" : "Install"}
        </span>
      </div>
      <div className="min-h-0 flex-1 rounded-lg bg-card py-4 font-mono text-[11.5px] leading-[1.8]">
        <div className={cn("h-full overflow-hidden px-4", FADE)}>
          <SkillMd body={body} />
        </div>
      </div>
    </div>
  )
}

const HARNESSES = [
  { name: "Claude Code", logo: AGENTS.claude.logo, dir: "~/.claude/skills", mcp: "~/.claude.json" },
  { name: "Codex", logo: AGENTS.codex.logo, dir: "~/.codex/skills", mcp: "~/.codex/config.toml" },
  { name: "Cursor", logo: "/logos/cursor-dark.svg", dir: "~/.cursor/skills", mcp: "~/.cursor/mcp.json" },
  { name: "Gemini CLI", logo: "/logos/gemini-cli.svg", dir: "~/.gemini/skills", mcp: "~/.gemini/settings.json" },
  { name: "OpenCode", logo: "/logos/opencode-dark.svg", dir: "~/.config/opencode/skills", mcp: "~/.config/opencode/opencode.json" },
  { name: "GitHub Copilot", logo: "/logos/copilot-dark.svg", dir: "~/.copilot/skills", mcp: "~/.copilot/mcp-config.json" },
]
const HARNESS_NAMES = HARNESSES.map((harness) => harness.name)

const SETTINGS_TABS = { general: "General", harnesses: "Harnesses", mcp: "MCP" }
type SettingsTab = keyof typeof SETTINGS_TABS

/**
 * The app's settings, open at `tab`: the harnesses in `hidden` switched off,
 * the MCP server added to those in `mcp`.
 */
function Settings({ tab, hidden = [], mcp = [] }: { tab: SettingsTab; hidden?: string[]; mcp?: string[] }) {
  return (
    <div className="h-full animate-in p-5 duration-300 fade-in">
      <h1 className="text-[20px] font-medium tracking-[-0.01em]">Settings</h1>
      <div className="mt-3 inline-flex rounded-full bg-foreground/[0.05] p-[3px]">
        {(Object.keys(SETTINGS_TABS) as SettingsTab[]).map((id) => (
          <span
            key={id}
            data-at={`settings-${id}`}
            className={cn(
              "flex h-6 items-center rounded-full px-3.5 text-xs transition-colors duration-200",
              tab === id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
            )}
          >
            {SETTINGS_TABS[id]}
          </span>
        ))}
      </div>
      <div key={tab} className="animate-in duration-300 fade-in">
        {tab === "general" ? (
          <>
            <SettingsNote>How Skill Center sits on this Mac.</SettingsNote>
            <SettingsList>
              <SettingsRow
                title="Show in menu bar"
                caption="Without it, Skill Center is in the Dock while open and quits when you close it."
                at="setting-menu-bar"
                on
              />
              <SettingsRow title="Open at login" caption="Starts Skill Center when you log in to this Mac." at="setting-login" on />
            </SettingsList>
          </>
        ) : tab === "harnesses" ? (
          <>
            <SettingsNote>
              Found on this Mac by their folders, which stay behind after an uninstall. Switch off the ones you don't use —
              their folders are left as they are.
            </SettingsNote>
            <SettingsList>
              {HARNESSES.map((harness) => (
                <SettingsRow
                  key={harness.name}
                  logo={harness.logo}
                  title={harness.name}
                  caption={harness.dir}
                  at={`harness-${harness.name}`}
                  on={!hidden.includes(harness.name)}
                />
              ))}
            </SettingsList>
          </>
        ) : (
          <>
            <SettingsNote>
              Lets agents do what this app does — list, install, switch and edit skills — through Skill Center's MCP server,
              added to each harness's MCP config.
            </SettingsNote>
            <SettingsList>
              <SettingsRow
                title="MCP server"
                caption="~/Applications/Skill Center.app/Contents/MacOS/skill-center-mcp"
                at="mcp-all"
                on={mcp.length > 0}
              />
            </SettingsList>
            <SettingsList className="mt-2">
              {HARNESSES.map((harness) => (
                <SettingsRow
                  key={harness.name}
                  logo={harness.logo}
                  title={harness.name}
                  caption={harness.mcp}
                  at={`mcp-${harness.name}`}
                  on={mcp.includes(harness.name)}
                />
              ))}
            </SettingsList>
          </>
        )}
      </div>
    </div>
  )
}

function SettingsNote({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 max-w-[520px] text-xs text-muted-foreground">{children}</p>
}

function SettingsList({ className, children }: { className?: string; children: React.ReactNode }) {
  return <ul className={cn("mt-4 flex flex-col rounded-lg bg-card p-1.5", className)}>{children}</ul>
}

function SettingsRow({
  logo,
  title,
  caption,
  at,
  on,
}: {
  logo?: string
  title: string
  caption: string
  at: string
  on: boolean
}) {
  return (
    <li className="flex items-center gap-3 rounded-md px-3 py-1.5">
      {logo && <Mark logo={logo} className="size-5" />}
      <span className="min-w-0 flex-1">
        <span className="block">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{caption}</span>
      </span>
      <Switch at={at} on={on} />
    </li>
  )
}

/** A small pill button in a pane's header. */
function Action({ at, primary, busy, children }: { at: string; primary?: boolean; busy?: boolean; children: React.ReactNode }) {
  return (
    <span
      data-at={at}
      className={cn(
        "flex h-7 items-center gap-1.5 rounded-full px-3 whitespace-nowrap [&_svg]:size-3.5",
        primary ? "bg-foreground text-background" : "hover:bg-foreground/[0.06]",
      )}
    >
      {busy && <LoaderCircle className="animate-spin" />}
      {children}
    </span>
  )
}

function Toast({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-x-0 bottom-4 flex justify-center">
      <span className="animate-in rounded-full bg-foreground px-4 py-2 text-background shadow-lg duration-300 fade-in slide-in-from-bottom-2">
        {children}
      </span>
    </div>
  )
}

export {
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
}
