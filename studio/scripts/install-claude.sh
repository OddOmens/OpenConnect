#!/usr/bin/env bash
# Make the screenshot studio usable from Claude Code in any project:
#   1. puts the `appshot` CLI on PATH (npm link)
#   2. links the skill into ~/.claude/skills so Claude knows the workflow everywhere
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

(cd "$ROOT" && npm link >/dev/null)
echo "✓ appshot CLI linked: $(command -v appshot || echo 'open a new shell to pick it up')"

mkdir -p "$HOME/.claude/skills"
DEST="$HOME/.claude/skills/openappshot"
if [ -e "$DEST" ] && [ ! -L "$DEST" ]; then
  echo "! $DEST exists and is not a link; leaving it alone"
else
  ln -sfn "$ROOT/.claude/skills/openappshot" "$DEST"
  echo "✓ Skill linked: $DEST"
fi
if [ -z "${OPENCONNECT_URL:-}" ] || [ -z "${OPENCONNECT_TOKEN:-}" ]; then
  echo "! Set OPENCONNECT_URL and OPENCONNECT_TOKEN (Settings → Security → API tokens) in ~/.zshrc so Claude can reach the studio."
fi
