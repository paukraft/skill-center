import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react"

import { cn } from "@/lib/cn"

/** One line at the bottom that says what just happened, then goes. */

type Tone = "info" | "error"
type Toast = (message: string, tone?: Tone) => void

const ToastContext = createContext<Toast>(() => {})

function ToastProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<{ id: number; message: string; tone: Tone } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const show = useCallback<Toast>((message, tone = "info") => {
    clearTimeout(timer.current)
    setCurrent({ id: Date.now(), message, tone })
    timer.current = setTimeout(() => setCurrent(null), tone === "error" ? 6000 : 2600)
  }, [])

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-6 flex justify-center">
        {current && (
          <p
            key={current.id}
            role="status"
            className={cn(
              "t-rise max-w-[520px] rounded-full px-4 py-2 text-note",
              current.tone === "error"
                ? "bg-danger text-white"
                : "bg-primary text-primary-foreground",
            )}
          >
            {current.message}
          </p>
        )}
      </div>
    </ToastContext.Provider>
  )
}

function useToast() {
  return useContext(ToastContext)
}

export { ToastProvider, useToast }
