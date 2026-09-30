#!/bin/zsh
# A throwaway home with public skills only, for recording the site's media
# without anyone's own skills in frame. /Users/<x> so the UI shows "~/…".
#   scripts/demo-home.sh              seed it
#   scripts/demo-home.sh --clean      remove it
# Then run the dev host against it:
#   env -i HOME=/Users/Shared PATH="$PATH" SHELL=/bin/zsh bun apps/web/dev-host.ts
set -e
D=/Users/Shared
DIRS=(.agents .claude .codex .cursor .gemini .config/opencode .npm .Trash)
cd $D && rm -rf $DIRS
[[ $1 == --clean ]] && { rmdir .config 2>/dev/null || true; exit; }

mkdir -p .claude .codex .cursor .gemini .config/opencode .Trash
add() { env -i HOME=$D PATH="$PATH" SHELL=/bin/zsh npx -y skills add "$@" -g -y >/dev/null; }
add vercel-labs/agent-skills -a claude-code -a codex -a cursor
add anthropics/skills --skill pdf --skill frontend-design --skill mcp-builder \
  -a claude-code -a codex -a cursor

mkdir -p .claude/skills/commit-style
cat > .claude/skills/commit-style/SKILL.md <<'MD'
---
name: commit-style
description: Write commit messages in Conventional Commits style. Use when committing or asked to write a commit message.
---

# Commit style

- Format: `type(scope): summary` — feat, fix, docs, refactor, test, chore.
- Summary in imperative mood, under 72 characters, no trailing period.
- Body explains *why*, not *what*.
MD
