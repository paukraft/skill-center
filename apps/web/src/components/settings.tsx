import { useState, type ReactNode } from "react"

import { AgentMark } from "@/components/marks"
import { Spinner, Switch } from "@/components/ui"
import { useAppSettings } from "@/lib/app-settings"
import { platform, words } from "@/lib/bridge"
import { cn } from "@/lib/cn"
import { useAction } from "@/lib/use-action"
import { useMcp } from "@/state"
import type { Agent } from "@skill-center/core/agents"

/**
 * The app's settings, in tabs: how the app itself behaves on this computer, which
 * of the harnesses found here it shows, and which of them get its MCP server.
 */

const TABS = { general: "General", harnesses: "Harnesses", mcp: "MCP" }
type Tab = keyof typeof TABS

function Settings({
  found,
  agents,
  onHarnessHidden,
}: {
  found: Agent[]
  agents: Agent[]
  onHarnessHidden: (id: string, hidden: boolean) => Promise<void>
}) {
  const [tab, setTab] = useState<Tab>("general")
  return (
    <div className="t-fade scroll-quiet h-full p-6">
      <h1 className="text-title font-medium tracking-[-0.01em]">Settings</h1>
      <div role="tablist" className="mt-4 inline-flex rounded-full bg-foreground/[0.05] p-[3px]">
        {(Object.keys(TABS) as Tab[]).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              "h-7 rounded-full px-4 text-note transition-colors duration-150",
              tab === id
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {TABS[id]}
          </button>
        ))}
      </div>
      {tab === "general" ? (
        <General />
      ) : tab === "harnesses" ? (
        <Harnesses found={found} agents={agents} onChange={onHarnessHidden} />
      ) : (
        <Mcp />
      )}
    </div>
  )
}

function General() {
  const [settings, change] = useAppSettings()
  const [, run] = useAction()
  return (
    <>
      <p className="mt-4 max-w-[560px] text-note text-pretty text-muted-foreground">
        {settings
          ? "How Skill Center sits on this computer."
          : "These are set in the app, not in a browser."}
      </p>
      <ul className="mt-5 flex flex-col gap-1 rounded-lg bg-card p-2">
        <Row
          title={`Show in ${words.tray}`}
          caption={
            platform === "mac"
              ? "Without it, Skill Center is in the Dock while open and quits when you close it."
              : "Without it, Skill Center quits when you close its window."
          }
        >
          <Switch
            label={`Show in ${words.tray}`}
            checked={settings?.menuBarItem ?? true}
            disabled={!settings}
            onChange={(next) => void run(() => change("menuBarItem", next))}
          />
        </Row>
        <Row title="Open at login" caption="Starts Skill Center when you log in to this computer.">
          <Switch
            label="Open at login"
            checked={settings?.openAtLogin ?? false}
            disabled={!settings}
            onChange={(next) => void run(() => change("openAtLogin", next))}
          />
        </Row>
      </ul>
    </>
  )
}

/**
 * The harnesses the app found, by their folders. A folder stays behind when
 * its harness is uninstalled, so the user hides the ones they no longer
 * have — the app leaves those folders as they are and stops showing them.
 */
function Harnesses({
  found,
  agents,
  onChange,
}: {
  found: Agent[]
  agents: Agent[]
  onChange: (id: string, hidden: boolean) => Promise<void>
}) {
  const [, run] = useAction()
  return (
    <>
      <p className="mt-4 max-w-[560px] text-note text-pretty text-muted-foreground">
        Found on this computer by their folders, which stay behind after an uninstall. Switch off the
        ones you don't use — their folders are left as they are.
      </p>
      <ul className="mt-5 flex flex-col gap-1 rounded-lg bg-card p-2">
        {found.map((agent) => (
          <Row
            key={agent.id}
            icon={<AgentMark agent={agent} className="size-5" />}
            title={agent.name}
            caption={tildify(agent.dir)}
          >
            <Switch
              label={`Show ${agent.name}`}
              checked={agents.some((a) => a.id === agent.id)}
              onChange={(next) => void run(() => onChange(agent.id, !next))}
            />
          </Row>
        ))}
      </ul>
    </>
  )
}

/**
 * Skill Center's MCP server in each harness whose MCP config the app knows.
 * The top switch adds it to all of them or takes it out of all of them.
 */
function Mcp() {
  const { harnesses, server, set } = useMcp()
  const [, run] = useAction()
  if (!harnesses) return <Spinner className="mt-6" />
  const ids = harnesses.map((h) => h.agent.id)
  const any = harnesses.some((h) => h.added)
  return (
    <>
      <p className="mt-4 max-w-[560px] text-note text-pretty text-muted-foreground">
        {server
          ? "Lets agents do what this app does — list, install, switch and edit skills — through Skill Center's MCP server, added to each harness's MCP config."
          : "The MCP server ships with the app, so it's added from there, not from a browser."}
      </p>
      {harnesses.length ? (
        <>
          <ul className="mt-5 flex flex-col gap-1 rounded-lg bg-card p-2">
            <Row title="MCP server" caption={server ?? "Only in the app"}>
              <Switch
                label="MCP server"
                checked={any}
                disabled={!server && !any}
                onChange={(next) => void run(() => set(ids, next))}
              />
            </Row>
          </ul>
          <ul className="mt-3 flex flex-col gap-1 rounded-lg bg-card p-2">
            {harnesses.map(({ agent, config, added }) => (
              <Row
                key={agent.id}
                icon={<AgentMark agent={agent} className="size-5" />}
                title={agent.name}
                caption={tildify(config.file)}
              >
                <Switch
                  label={`MCP server in ${agent.name}`}
                  checked={added}
                  disabled={!server && !added}
                  onChange={(next) => void run(() => set([agent.id], next))}
                />
              </Row>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-5 text-note text-muted-foreground">
          None of your harnesses has an MCP config Skill Center knows how to edit.
        </p>
      )}
    </>
  )
}

function Row({
  icon,
  title,
  caption,
  children,
}: {
  icon?: ReactNode
  title: string
  caption: string
  children: ReactNode
}) {
  return (
    <li className="flex items-center gap-3 rounded-md px-3 py-2.5">
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block text-note">{title}</span>
        <span className="block truncate text-caption text-muted-foreground">{caption}</span>
      </span>
      {children}
    </li>
  )
}

/** A path in the home folder as `~/…` — /Users, /home or C:/Users alike. */
function tildify(path: string) {
  return path.replace(/^(?:[A-Za-z]:)?\/(?:Users|home)\/[^/]+/, "~")
}

export { Settings }
