import { useEffect, useState } from "react"
import { CheckIcon, CopyIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

import { cn } from "@/lib/utils"

export const REPO_URL = "https://github.com/paukraft/skill-center"

const PROMPT = `Install Skill Center on this computer: ${REPO_URL}

Clone the repo and follow its README: install whatever is missing (Git, Bun), then run \`bun install\` and \`bun run install-app\`, which builds the app for this OS and installs it (on Linux it prints the \`apt\` command to run). Once it is installed, add its MCP server to the agent harnesses I use, as the README shows.`

/** Both icons stay mounted and cross-fade, so the swap animates both ways. */
const ICON = "absolute inset-0 transition-[opacity,scale,filter] duration-300 ease-[cubic-bezier(0.2,0,0,1)]"
const ICON_HIDDEN = "scale-25 opacity-0 blur-[4px]"

/** The install: a prompt for the user's own agent, which builds the app on their computer. */
export function InstallPrompt() {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  async function copy() {
    await navigator.clipboard.writeText(PROMPT)
    setCopied(true)
  }

  return (
    <Button
      size="lg"
      onClick={() => void copy()}
      className="relative h-10 gap-2 rounded-full px-5 shadow-[0_1px_0_rgb(255_255_255/0.5)_inset,0_1px_2px_rgb(0_0_0/0.4)] has-data-[icon=inline-start]:pl-4 after:absolute after:-inset-1"
    >
      <span data-icon="inline-start" className="relative size-4">
        <CopyIcon className={cn(ICON, copied && ICON_HIDDEN)} />
        <CheckIcon className={cn(ICON, !copied && ICON_HIDDEN)} />
      </span>
      {/* Both labels share one cell, so the button keeps the longer one's width. */}
      <span className="grid text-left">
        <span className={cn("col-start-1 row-start-1", copied && "invisible")}>Copy install prompt</span>
        <span className={cn("col-start-1 row-start-1", !copied && "invisible")}>Copied</span>
      </span>
    </Button>
  )
}
