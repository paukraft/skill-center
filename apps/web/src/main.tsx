import "@/styles.css"
import "@/lib/theme"

import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { App } from "@/App"
import { ToastProvider } from "@/components/toast"
import { setHost } from "@skill-center/core/host"
import { createWebHost } from "@/web-host"

setHost(createWebHost())

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
)
