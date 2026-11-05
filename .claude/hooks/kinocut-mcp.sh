#!/usr/bin/env bash
# Kinocut MCP server (KyaniteLabs/kinocut, Apache-2.0) for the MP video skillset: trim, merge, resize,
# convert, text, audio... over ffmpeg. Uses .venv-cloud when `cloud/setup.sh --with-pro` installed it,
# otherwise a pinned uvx copy (cached in ~/.cache/uv after the first start, ~2 s).
# Telemetry and its optional vision provider stay off (no API key is configured).
export PATH="$HOME/.local/bin:$PATH" KINOCUT_HYPERFRAMES_TELEMETRY=false
cd "$(dirname "${BASH_SOURCE[0]}")/../.." || exit 1
if .venv-cloud/bin/python -c "import kinocut" 2>/dev/null; then
  exec .venv-cloud/bin/python -m kinocut --mcp
fi
exec uvx --quiet --from "kinocut==1.16.5" kino --mcp
