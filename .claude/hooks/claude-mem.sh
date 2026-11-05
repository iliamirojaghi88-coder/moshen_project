#!/usr/bin/env bash
# claude-mem (thedotmack/claude-mem) wired as project hooks, because cloud
# sessions don't install plugins. Mirrors plugin/hooks/hooks.json of v15.9.0.
#
#   claude-mem.sh ensure        install the runtime if missing (idempotent)
#   claude-mem.sh mcp           stdio MCP server (search, timeline, get_observations, ...)
#   claude-mem.sh <args...>     forwarded to the claude-mem hook launcher
#
# The runtime lives outside the repo (~/.claude/plugins/cache, ~/.local/bin,
# ~/.claude-mem). In a fresh cloud container the async SessionStart "start"
# hook installs it; every other hook stays silent until it is there.
set -u
VERSION=15.9.0
LAUNCHER="$HOME/.local/bin/claude-mem"
CONFIG_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
PLUGIN_ROOT="$CONFIG_DIR/plugins/cache/thedotmack/claude-mem/$VERSION"
export CLAUDE_MEM_TELEMETRY=0
# Division of labour with graphify (scripts/graph-sync.sh): the graph owns code
# structure, so file reads/searches and single read-only commands are not sent
# to the observer (each observation is one Haiku call). Edits, writes, real
# commands, prompts and session summaries are still remembered.
export CLAUDE_MEM_SKIP_TOOLS="ListMcpResourcesTool,SlashCommand,Skill,TodoWrite,AskUserQuestion,Read,Grep,Glob"
export CLAUDE_MEM_SKIP_BASH_PATTERNS='^\s*(cd\s+[^;&|]+&&\s*)?(graphify\s+(query|path|explain|god-nodes|affected|update)|git\s+(status|log|diff|show|rev-parse|ls-files)|ls|pwd|wc)\b[^;&|>]*$'

installed() { [[ -x "$LAUNCHER" && -f "$PLUGIN_ROOT/scripts/worker-service.cjs" ]]; }

# A locally installed claude-mem plugin already runs these hooks; don't run them twice.
plugin_enabled() { grep -q '"claude-mem@thedotmack": *true' "$CONFIG_DIR/settings.json" 2>/dev/null; }

ensure() {
  installed && return 0
  # Auto-install only in cloud sessions; on your own machine use the official installer.
  [[ "${CLAUDE_CODE_REMOTE:-}" == "true" ]] || return 1
  exec 9>"${TMPDIR:-/tmp}/claude-mem-install.lock"
  flock 9
  installed && return 0
  CLAUDE_MEM_ONLINE_OPTIN=false CI=1 npx -y "claude-mem@$VERSION" install \
    --ide claude-code --provider claude --no-auto-start >"${TMPDIR:-/tmp}/claude-mem-install.log" 2>&1 || return 1
  # The installer enables the user-scope plugin; the hooks come from this repo instead.
  # The key is removed, not set to false: the launcher reads false as "memory off".
  node -e '
    const fs = require("fs"), p = process.argv[1];
    const s = JSON.parse(fs.readFileSync(p, "utf8"));
    if (s.enabledPlugins) { delete s.enabledPlugins["claude-mem@thedotmack"];
      if (!Object.keys(s.enabledPlugins).length) delete s.enabledPlugins; }
    fs.writeFileSync(p, JSON.stringify(s, null, 2) + "\n");' "$CONFIG_DIR/settings.json" 2>/dev/null || true
  installed
}

plugin_enabled && exit 0
case "${1:-}" in
  ensure) ensure; exit $? ;;
  start) ensure || exit 0 ;;
  mcp) installed || exit 1; exec node "$PLUGIN_ROOT/scripts/mcp-server.cjs" ;;
  *) installed || exit 0 ;;
esac
exec "$LAUNCHER" "$@"
