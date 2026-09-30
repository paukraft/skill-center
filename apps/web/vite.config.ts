import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  // The native app serves the build from its own scheme, so every URL stays relative.
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": "/src" } },
  build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 4000 },
  server: { port: 5199, strictPort: true },
})
