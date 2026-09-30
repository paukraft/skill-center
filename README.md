# Skill Center

A tray app (menu bar on a Mac) for the agent skills on your computer — every harness, one list. macOS, Windows and Linux.

- **Every harness `skills` knows, from `skills` itself.** `packages/core/scripts/sync-harnesses.ts` (run by every build) pulls the latest `skills` npm package, runs the harness table out of its bundle with stand-in paths, and writes `packages/core/src/harnesses.json`: each harness's global skills folder, whether it reads the shared folder, and the paths that detect it. The app resolves those against the login shell's `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `XDG_CONFIG_HOME`, … and shows only harnesses found on the computer.
- **Shared vs own folders, like `skills`.** "Shared" harnesses (Codex, Cursor, Copilot, OpenCode, Zed, …) read `~/.agents/skills` directly; the rest (Claude Code, Windsurf, OpenClaw, Goose, …) get a relative symlink into their own folder.
- **One identity per skill.** Folders of the same name across all those folders are one skill. Separate copies are flagged, with a diff when they differ, and can be merged into one shared folder.
- **Where it came from.** skills.sh installs are read from the `skills` lock (`~/.agents/.skill-lock.json`); hand-copied skills are matched against skills.sh by content. Built-ins (claude.ai synced, Codex system) are folded away.
- **Switch per harness.** Claude Code: `skillOverrides` in `settings.json`. Codex: `[[skills.config]]` in `config.toml` — both restore the file byte for byte when switched back. Harnesses with their own folder: the link is added or removed. Harnesses that only read the shared folder take it as a whole.
- **Broken links** (a harness's folder pointing at a deleted skill) are found and can be cleaned up.
- **Install / update from skills.sh** through the `skills` CLI itself (`npx skills add … -g -a <each chosen harness>`), so its lock and `skills update` keep working. Updating uses it only to fetch, once (`-a universal`, a copy in `~/.agents/skills`), and move the lock on; the app then replaces each of the skill's other folders with a copy of it in place, and puts back a shared-folder link it fetched over, so links and per-harness rules stay as they were. A skill only linked in from elsewhere (a repo) is updated there. Updates are detected by comparing the lock's folder hash with GitHub (falls back to `gh api` past the anonymous rate limit), with a diff of what changed.
- **Read and write skills.** Files via trees.software, code via diffs.com (including its editor). New skills go to `~/.agents/skills/<name>` and are linked into Claude.
- **Deleting:** every folder and link goes to the Trash — hidden harnesses' too; `skills remove` then only drops the lock entry, since it would wipe rather than trash.
- **What stays the app's own**, because the CLI can't do it: switching a skill off without removing it, built-in skills, hand-made skills, separate copies and merging, broken links, previews, diffs and editing. Adding a skill to one more harness is a link, not `skills add` (which would download it again and quietly update it).

- **Hidden harnesses.** A harness's folder outlives its uninstall, so found ones can be switched off; that lives in `settings.json` in the app's data folder (`~/Library/Application Support/Skill Center`, `%APPDATA%\Skill Center`, `~/.config/Skill Center`), shared with the MCP server.

## For agents (MCP)

The app ships an MCP server that does everything the app does — list, read, edit, switch per harness, share, merge, delete, create, search/preview/install/update from skills.sh, hide harnesses — on the same core and files, so the open app shows an agent's changes live.

Settings → MCP adds it to (or removes it from) the MCP config of Claude Code, Codex, Cursor, Gemini CLI, GitHub Copilot, Kiro, OpenCode and Windsurf, per harness or all at once. By hand:

```sh
claude mcp add -s user skill-center -- ~/Applications/Skill\ Center.app/Contents/MacOS/skill-center-mcp
codex mcp add skill-center -- ~/Applications/Skill\ Center.app/Contents/MacOS/skill-center-mcp
```

Any other MCP client: a stdio server with that command, no arguments. On Windows the binary is `skill-center-mcp.exe` next to `Skill Center.exe`; on Linux, `/opt/Skill Center/skill-center-mcp`.

## Layout

Turborepo, Bun workspaces.

- `apps/desktop` — Electron shell: tray icon, window (closing hides it), a `skillcenter://` scheme serving the UI, and a preload bridge to the core's Node host with the desktop's own Trash and file manager on top. Its build (electron-builder) bundles the other two apps, the MCP server next to the app's binary. Icons are drawn by `scripts/make-icons.swift` into `assets/`.
- `apps/web` — React + Tailwind UI, on the app's bridge (`src/web-host.ts`) or, in a browser, the Bun dev host (`dev-host.ts`).
- `apps/mcp` — the MCP server, compiled to one binary in the app bundle.
- `apps/site` — the marketing page (TanStack Start + shadcn). Its media is recorded against a throwaway home of public skills (`apps/site/scripts/demo-home.sh`).
- `packages/core` — all skill rules, on a small host (`src/host.ts`) answered from Node (`src/node/host.ts`): in the app's main process, the MCP server and the dev host. Paths use `/` on every OS; on Windows links are junctions, as `skills` makes them.

## Build

```sh
bun run build        # → apps/desktop/build: a .dmg, an NSIS installer, or a .deb and .tar.gz — built on that OS
bun run install-app  # Mac: into ~/Applications and opens it; Windows: runs the installer
```

## Develop

```sh
bun run dev        # UI on :5199 + bridge on :5198 (real ~/ data) + marketing page on skill-center.localhost
bun run mcp        # the MCP server from source, over stdio
bun run test       # config editing, harness registry, link paths
bun run typecheck
bun run sync       # refresh harnesses.json from the `skills` CLI
```

Open the app against the dev server with `bun --filter @skill-center/desktop start` (unpackaged, it loads `http://localhost:5199`).
