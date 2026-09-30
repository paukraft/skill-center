import { CircleNotch } from "@phosphor-icons/react"
import type { ButtonHTMLAttributes, ReactNode } from "react"

import { cn } from "@/lib/cn"

/**
 * The console's building blocks: pill buttons that give a little under the
 * pointer, a switch, the wash, and the frame a pane stands in.
 */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger"

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90",
  secondary: "bg-foreground/[0.05] text-foreground hover:bg-foreground/[0.08]",
  ghost: "text-foreground hover:bg-foreground/[0.05]",
  danger: "bg-danger-soft text-danger hover:bg-danger/15",
}

function Button({
  variant = "secondary",
  size = "md",
  busy = false,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: "sm" | "md"
  busy?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled || busy}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center gap-2 rounded-full whitespace-nowrap transition-[background-color,color,opacity,scale] duration-150 ease-[cubic-bezier(0.2,0,0,1)] select-none active:scale-[0.96] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
        size === "md" ? "h-8 px-4 text-note" : "h-7 px-3 text-caption",
        VARIANTS[variant],
        className,
      )}
      {...props}
    >
      {busy && <CircleNotch className="animate-spin" />}
      {children}
    </button>
  )
}

function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-[18px] w-[30px] shrink-0 items-center rounded-full p-[2px] transition-colors duration-200 disabled:opacity-50",
        checked ? "bg-primary" : "bg-foreground/[0.12]",
      )}
    >
      <span
        className={cn(
          "size-[14px] rounded-full bg-background transition-transform duration-200 ease-[cubic-bezier(0.2,0,0,1)] dark:bg-card",
          checked && "translate-x-[12px]",
        )}
      />
    </button>
  )
}

/**
 * The soft, out-of-focus wash things are shown on: three blurred blooms
 * with film grain over them.
 */
function Backdrop({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
    >
      <div className="absolute -top-1/3 -left-[10%] size-[70%] rounded-full bg-bloom-sage blur-[90px]" />
      <div className="absolute top-[10%] left-[38%] size-[65%] rounded-full bg-bloom-sand blur-[100px]" />
      <div className="absolute -right-[8%] -bottom-1/4 size-[70%] rounded-full bg-bloom-sky blur-[100px]" />
      <div className="absolute inset-0 grain opacity-[0.22] mix-blend-overlay dark:opacity-[0.14] dark:mix-blend-soft-light" />
    </div>
  )
}

/** A quiet, centred statement for when a pane has nothing to show yet. */
function Empty({
  icon,
  title,
  children,
}: {
  icon: ReactNode
  title: string
  children?: ReactNode
}) {
  return (
    <div className="t-fade flex h-full flex-col items-center justify-center px-8 text-center">
      <span className="grid size-12 place-items-center rounded-xl bg-card text-muted-foreground [&_svg]:size-6">
        {icon}
      </span>
      <h2 className="mt-5 text-heading font-medium tracking-[-0.01em]">{title}</h2>
      {children && (
        <div className="mt-1.5 max-w-[340px] text-note text-pretty text-muted-foreground">
          {children}
        </div>
      )}
    </div>
  )
}

function Spinner({ className }: { className?: string }) {
  return <CircleNotch className={cn("size-4 animate-spin text-muted-foreground", className)} />
}

export { Backdrop, Button, Empty, Spinner, Switch }
