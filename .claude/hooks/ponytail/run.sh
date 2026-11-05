#!/usr/bin/env bash
# Runs one ponytail hook (DietrichGebert/ponytail v5.3.3) from the project settings:
#   run.sh activate | subagent | mode-tracker
# Skipped when the ponytail plugin is enabled locally, since it runs the same hooks.
grep -q '"ponytail@ponytail": *true' "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/settings.json" 2>/dev/null && exit 0
exec node "$(dirname "$0")/ponytail-$1.js"
