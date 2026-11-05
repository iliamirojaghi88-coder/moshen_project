#!/usr/bin/env bash
# MP video skillset runtime for cloud sessions (SessionStart hook, async). Fast path: exits at once when
# .venv-cloud matches mp-studio/requirements-cloud*.txt. Otherwise runs cloud/setup.sh --with-pro
# (uv venv, ~1 min cold) in the background; cloud/setup.sh holds a lock, so a manual run just waits.
# The Whisper model is not prefetched: faster-whisper downloads it on the first transcription.
cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1
sha() { sha256sum "$1" | cut -c1-16; }
V=.venv-cloud
[ -f .mp-cloud-ready ] && [ -x "$V/bin/python" ] \
  && [ "$(cat "$V/.installed" 2>/dev/null)" = "$(sha mp-studio/requirements-cloud.txt)" ] \
  && [ "$(cat "$V/.installed-pro" 2>/dev/null)" = "$(sha mp-studio/requirements-cloud-pro.txt)" ] \
  && exit 0
MP_WHISPER_MODEL="${MP_WHISPER_MODEL:-none}" bash cloud/setup.sh --with-pro >"${TMPDIR:-/tmp}/mp-video-setup.log" 2>&1 \
  || echo "MP video setup failed; see ${TMPDIR:-/tmp}/mp-video-setup.log"
