import { createFileRoute } from "@tanstack/react-router"
import { ArrowRightIcon } from "lucide-react"

import { CreateSkillDemo, McpDemo, SwitchHarnessesDemo, TourDemo, UpdateDemo } from "@/components/demo/scenes"
import { InstallPrompt, REPO_URL } from "@/components/install-prompt"
import { Logo3D, useLogoHover } from "@/components/logo-3d"
import { Button } from "@/components/ui/button"
import { type Logo, paukraftLogo, skillsShLogo } from "@/lib/logos"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/")({ component: Home })

const HARNESSES = [
  { name: "Claude Code", logo: "/logos/claude-code.svg" },
  { name: "Codex", logo: "/logos/codex-dark.svg" },
  { name: "Cursor", logo: "/logos/cursor-dark.svg" },
  { name: "Gemini CLI", logo: "/logos/gemini-cli.svg" },
  { name: "OpenCode", logo: "/logos/opencode-dark.svg" },
  { name: "Windsurf", logo: "/logos/windsurf-dark.svg" },
  { name: "Copilot", logo: "/logos/copilot-dark.svg" },
  { name: "Zed", logo: "/logos/zed-dark.svg" },
]

const MORE = [
  {
    title: "Copies, found and merged",
    body: "The same skill in two folders is one skill with a diff. Merge them into one shared folder, and clear links to deleted skills in one go.",
  },
  {
    title: "Updates from skills.sh",
    body: "Installs go through the skills CLI, so its lock keeps working. See what changed before updating.",
  },
  {
    title: "Every harness, found for you",
    body: "Knows every harness the skills CLI does and shows the ones on your computer. Hide the ones you've uninstalled.",
  },
  {
    title: "In the tray, or not",
    body: "Lives in the menu bar or system tray and opens at login — or switch both off and it's a plain app.",
  },
]

function Home() {
  return (
    <div className="mx-auto flex min-h-svh max-w-6xl flex-col px-6">
      <header className="flex h-16 items-center justify-between">
        <a href="/" className="flex h-11 items-center gap-2.5 text-sm font-medium">
          <img src="/favicon.svg" alt="" className="size-7" />
          Skill Center
        </a>
        <Button
          variant="ghost"
          nativeButton={false}
          render={<a href={REPO_URL} />}
          className="relative after:absolute after:-inset-1.5"
        >
          <GitHubMark data-icon="inline-start" />
          GitHub
        </Button>
      </header>

      <main className="flex flex-col items-center">
        <section className="relative flex flex-col items-center pt-14 pb-16 text-center sm:pt-20 sm:pb-20">
          {/* Soft spotlight behind the headline. */}
          <div
            aria-hidden
            className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-[36rem] w-[64rem] max-w-[100vw] -translate-x-1/2 bg-[radial-gradient(closest-side,rgb(255_255_255/0.06),transparent)]"
          />
          <img
            src="/app-icon.png"
            alt=""
            style={stagger(0)}
            className="mb-5 size-24 animate-rise drop-shadow-[0_12px_32px_rgb(255_255_255/0.1)]"
          />
          <div style={stagger(1)} className="mb-7 flex animate-rise flex-wrap justify-center gap-2">
            <CreditPill href={PAUKRAFT_URL} logo={paukraftLogo} label="Made by" name="Pau Kraft" />
            <CreditPill href={SKILLS_SH_URL} logo={skillsShLogo} label="Powered by" name="skills.sh" />
          </div>
          <h1
            style={stagger(2)}
            className="max-w-3xl animate-rise text-hero font-book text-balance"
          >
            All your agent skills, in one app.
          </h1>
          <p style={stagger(3)} className="mt-6 max-w-xl animate-rise text-lead text-balance text-muted-foreground">
            A minimal desktop app on top of skills.sh. See every skill across Claude Code, Codex, Cursor and the rest.
            Switch them per agent, write your own, install new ones.
          </p>
          <div style={stagger(4)} className="mt-10 flex animate-rise flex-col items-center">
            <InstallPrompt />
            <p className="mt-4 text-xs text-muted-foreground/80">
              Paste it into Claude Code, Codex or any agent · Free and open source · macOS, Windows, Linux
            </p>
          </div>
        </section>

        <div style={stagger(6)} className="relative w-full animate-rise">
          {/* Glow picking up the app's own green and amber. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-[10%] -top-10 -z-10 h-2/3 bg-[radial-gradient(closest-side,oklch(0.55_0.08_160/0.4),transparent),radial-gradient(closest-side_at_80%_60%,oklch(0.6_0.1_60/0.25),transparent)] blur-2xl"
          />
          <Frame>
            <TourDemo />
          </Frame>
        </div>

        <div className="mt-14 flex flex-col items-center gap-5">
          <p className="text-xs font-medium tracking-wide text-muted-foreground/70 uppercase">Works with</p>
          <ul className="flex flex-wrap justify-center gap-x-6 gap-y-3 text-sm text-muted-foreground">
            {HARNESSES.map((h) => (
              <li key={h.name} className="flex items-center gap-2">
                <img src={h.logo} alt="" className="size-4 rounded-[3px] object-contain" />
                {h.name}
              </li>
            ))}
            <li>and more</li>
          </ul>
        </div>

        <div className="mt-32 flex w-full flex-col gap-28 lg:gap-36">
          <Feature
            name="Create"
            title="Write a skill in a minute"
            body="Name it, say when to use it, write the steps. It lands in the shared folder and is linked into every agent you pick. Edit it in place whenever."
          >
            <CreateSkillDemo />
          </Feature>
          <Feature
            name="Per-agent switches"
            title="Switch it per agent"
            body="On in Claude Code, off in Codex, without deleting a file. Switch back and the config is restored byte for byte. Browse skills.sh when you need something new."
            flip
          >
            <SwitchHarnessesDemo />
          </Feature>
          <Feature
            name="Updates"
            title="See what changed, then update"
            body="A dot marks every skill with a newer version on skills.sh. Read the diff before you take it — or update them all in one go."
          >
            <UpdateDemo />
          </Feature>
          <Feature
            name="MCP server"
            title="Hand it to your agents"
            body="One switch adds Skill Center's MCP server to Claude Code, Codex, Cursor and the rest. Then your agent can list, write, switch and install skills too."
            flip
          >
            <McpDemo />
          </Feature>
        </div>

        <section className="mt-32 grid w-full gap-px overflow-hidden rounded-2xl bg-border ring-1 ring-border sm:grid-cols-2">
          {MORE.map((item) => (
            <div key={item.title} className="bg-background p-8">
              <h3 className="font-medium text-balance">{item.title}</h3>
              <p className="mt-2 text-sm text-pretty text-muted-foreground">{item.body}</p>
            </div>
          ))}
        </section>

        <section className="flex flex-col items-center py-32 text-center">
          <h2 className="text-title text-balance">Let your agent install it.</h2>
          <p className="mt-3 max-w-md text-balance text-muted-foreground">
            Copy one prompt, paste it into your agent. It builds Skill Center, installs it and connects the MCP server.
          </p>
          <div className="mt-8">
            <InstallPrompt />
          </div>
        </section>
      </main>

      <footer className="flex h-16 items-center justify-between border-t text-xs text-muted-foreground">
        <FooterCredit />
        <a
          href={REPO_URL}
          className="relative transition-colors after:absolute after:-inset-x-2 after:-inset-y-3.5 hover:text-foreground"
        >
          Source on GitHub
        </a>
      </footer>
    </div>
  )
}

const PAUKRAFT_URL = "https://paukraft.com"
const SKILLS_SH_URL = "https://skills.sh"

/** Delay slot for `animate-rise`. */
function stagger(i: number) {
  return { "--i": i } as React.CSSProperties
}

function CreditPill({ href, logo, label, name }: { href: string; logo: Logo; label: string; name: string }) {
  const [active, hoverProps] = useLogoHover()
  return (
    <a
      href={href}
      {...hoverProps}
      className="group/pill inline-flex items-center gap-2 rounded-full bg-card/60 py-1 pr-2.5 pl-1 text-sm text-muted-foreground ring-1 ring-border backdrop-blur transition-[color,scale,background-color] active:scale-[0.98] hover:bg-card hover:text-foreground"
    >
      <span className="flex size-5.5 shrink-0 items-center justify-center rounded-full bg-foreground">
        <Logo3D logo={logo} active={active} inverted className="size-3" />
      </span>
      {label} <span className="font-medium text-foreground">{name}</span>
      <ArrowRightIcon aria-hidden className="size-3.5 transition-transform group-hover/pill:translate-x-0.5" />
    </a>
  )
}

function FooterCredit() {
  const [active, hoverProps] = useLogoHover()
  return (
    <a
      href={PAUKRAFT_URL}
      {...hoverProps}
      className="relative flex items-center gap-2 transition-colors after:absolute after:-inset-x-2 after:-inset-y-3.5 hover:text-foreground"
    >
      <Logo3D logo={paukraftLogo} active={active} className="size-3.5" />
      paukraft.com
    </a>
  )
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full overflow-hidden rounded-xl bg-card ring-1 ring-border shadow-2xl shadow-black/50 [&>*]:block [&>*]:w-full">
      {children}
    </div>
  )
}

/**
 * One feature: words on one side, the app doing it on the other, swapping
 * sides from feature to feature. The demo gets the wider share, 7 to 5.
 */
function Feature({
  name,
  title,
  body,
  flip,
  children,
}: {
  /** Short label above the title. */
  name: string
  title: string
  body: string
  flip?: boolean
  children: React.ReactNode
}) {
  return (
    <section
      className={cn(
        "grid grid-cols-[minmax(0,1fr)] gap-10 lg:items-center lg:gap-x-20",
        flip ? "lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]" : "lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]"
      )}
    >
      <div className={cn(flip && "lg:order-last")}>
        <p className="text-muted-foreground">{name}</p>
        <h2 className="mt-3 max-w-[30ch] text-title text-balance">
          {title}
        </h2>
        <p className="mt-4 max-w-[40ch] text-pretty text-muted-foreground">{body}</p>
      </div>
      <Frame>{children}</Frame>
    </section>
  )
}

function GitHubMark(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.4-4-1.4-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 0-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.2.5-2.3 1.3-3.1-.2-.4-.6-1.6 0-3.2 0 0 1-.3 3.4 1.2a11.5 11.5 0 0 1 6 0C17.3 4.7 18.3 5 18.3 5c.6 1.6.2 2.8.1 3.2.8.8 1.3 1.9 1.3 3.1 0 4.6-2.8 5.6-5.5 6 .5.4.9 1.1.9 2.3v3.3c0 .3.1.7.8.6A12 12 0 0 0 12 .3" />
    </svg>
  )
}
