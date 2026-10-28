#!/usr/bin/env bash
# Idempotent setup for the HyperFrames motion-graphics environment.
# Safe to re-run; each step skips itself when already done.
#
#   bash scripts/setup-motion-env.sh                 # standard setup
#   WITH_MUSICGEN=1 bash scripts/setup-motion-env.sh # + local MusicGen (CPU torch, ~1 GB)
#   WITH_WHISPER_MODEL=medium bash scripts/...       # pre-download a whisper model
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
log() { printf '\n==> %s\n' "$*" >&2; }
PIP=(pip3 install -q --break-system-packages)

log "Node packages (hyperframes CLI, gsap, three, fonts, icons)"
if [[ -f package-lock.json ]]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi

log "Chrome Headless Shell for local rendering"
npx hyperframes browser ensure >/dev/null

log "Remotion workspace"
(cd remotion-studio && if [[ -d node_modules ]]; then :; else npm ci --no-audit --no-fund; fi)

log "Python tools (Piper fa_IR TTS, Kokoro TTS, OpenCV for photo rectification)"
python3 -c "import piper, kokoro_onnx, soundfile, cv2, numpy" 2>/dev/null \
  || "${PIP[@]}" piper-tts==1.8.0 kokoro-onnx soundfile opencv-python-headless numpy

if [[ "${WITH_BLENDER:-1}" == "1" ]] && ! command -v blender >/dev/null; then
  log "Blender ${BLENDER_VERSION:=5.2.3} LTS (official build, sha256-checked)"
  series="${BLENDER_VERSION%.*}"
  tmp="$(mktemp -d)"
  curl -fsSL -o "$tmp/blender.tar.xz" "https://download.blender.org/release/Blender$series/blender-$BLENDER_VERSION-linux-x64.tar.xz"
  curl -fsSL "https://download.blender.org/release/Blender$series/blender-$BLENDER_VERSION.sha256" \
    | grep linux-x64.tar.xz | sed "s#blender-$BLENDER_VERSION-linux-x64.tar.xz#$tmp/blender.tar.xz#" | sha256sum -c -
  tar xf "$tmp/blender.tar.xz" -C /opt
  ln -sfn "/opt/blender-$BLENDER_VERSION-linux-x64" /opt/blender
  ln -sf /opt/blender/blender /usr/local/bin/blender
  rm -rf "$tmp"
fi

if ! command -v toktx >/dev/null; then
  log "KTX-Software 4.4.2 (KTX2/Basis textures for gltf-transform)"
  tmp="$(mktemp -d)"
  curl -fsSL -o "$tmp/ktx.deb" https://github.com/KhronosGroup/KTX-Software/releases/download/v4.4.2/KTX-Software-4.4.2-Linux-x86_64.deb
  dpkg -i "$tmp/ktx.deb" >/dev/null
  rm -rf "$tmp"
fi

if [[ "${WITH_MUSICGEN:-0}" == "1" ]]; then
  log "MusicGen (local background music)"
  python3 -c "import torch, transformers" 2>/dev/null || {
    "${PIP[@]}" torch --index-url https://download.pytorch.org/whl/cpu
    "${PIP[@]}" transformers numpy
  }
fi

log "whisper.cpp (whisper-cli) for transcription / captions"
if ! command -v whisper-cli >/dev/null; then
  src="${WHISPER_SRC_DIR:-/opt/src/whisper.cpp}"
  mkdir -p "$(dirname "$src")"
  [[ -d "$src" ]] || git clone -q --depth 1 https://github.com/ggml-org/whisper.cpp.git "$src"
  cmake -S "$src" -B "$src/build" -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DWHISPER_BUILD_TESTS=OFF >/dev/null
  cmake --build "$src/build" -j"$(nproc)" --config Release --target whisper-cli >/dev/null
  install -m755 "$src/build/bin/whisper-cli" /usr/local/bin/whisper-cli
fi

log "Default Persian voice"
voice_dir="${PIPER_VOICE_DIR:-$HOME/.cache/piper}"
if [[ ! -f "$voice_dir/fa_IR-amir-medium.onnx" ]]; then
  tmp="$(mktemp -d)"
  "$ROOT/scripts/tts-fa.sh" "سلام" "$tmp/warmup.wav" >/dev/null
  rm -rf "$tmp"
fi

if [[ -n "${WITH_WHISPER_MODEL:-}" ]]; then
  log "Whisper model ${WITH_WHISPER_MODEL}"
  tmp="$(mktemp -d)"
  ffmpeg -loglevel error -f lavfi -i anullsrc=r=16000:cl=mono -t 1 "$tmp/silence.wav"
  (cd "$tmp" && npx --prefix "$ROOT" hyperframes transcribe silence.wav --engine whisper \
    --model "$WITH_WHISPER_MODEL" --optional >/dev/null 2>&1 || true)
  rm -rf "$tmp"
fi

log "Docker daemon (optional: hyperframes render --docker)"
if command -v dockerd >/dev/null && ! docker info >/dev/null 2>&1; then
  (dockerd >/tmp/dockerd.log 2>&1 &)
  for _ in $(seq 1 15); do docker info >/dev/null 2>&1 && break; sleep 1; done
fi

log "Global agent skills & tools (Playwright, unslop, strix, skillui, context7)"
# skillui — design-system extractor from live URLs / repos (npm global).
command -v skillui >/dev/null || npm install -g skillui --no-audit --no-fund >/dev/null 2>&1 || true
# strix — authorized security auditing CLI (needs Docker + a user-supplied LLM key at run time).
command -v strix >/dev/null || "${PIP[@]}" strix-agent || true
# Playwright CLI + library come from npm deps; Chromium ships with the image (no `playwright install`).

# Register MCP servers at user scope so the agent can use them in every chat (idempotent).
if command -v claude >/dev/null; then
  grep -q '"context7"' "$HOME/.claude.json" 2>/dev/null \
    || claude mcp add context7 --scope user -- npx -y @upstash/context7-mcp >/dev/null 2>&1 || true
  grep -q '"playwright"' "$HOME/.claude.json" 2>/dev/null \
    || claude mcp add playwright --scope user -- npx -y @playwright/mcp@latest >/dev/null 2>&1 || true
fi

# Mirror the committed skills into the user-global skills dir so they load in any
# project opened in this environment, not only this repo.
if [[ -d "$ROOT/.claude/skills" ]]; then
  mkdir -p "$HOME/.claude/skills"
  for s in playwright unslop strix-security skillui context7; do
    [[ -d "$ROOT/.claude/skills/$s" ]] && cp -a "$ROOT/.claude/skills/$s" "$HOME/.claude/skills/" 2>/dev/null || true
  done
fi

log "Health check"
npx hyperframes doctor 2>&1 | grep -E "✓|✗" || true
command -v skillui >/dev/null && echo "✓ skillui $(skillui --version 2>/dev/null)" || echo "✗ skillui"
command -v strix   >/dev/null && echo "✓ strix $(strix --version 2>/dev/null | head -1)" || echo "✗ strix"
command -v claude  >/dev/null && { echo "MCP servers:"; claude mcp list 2>/dev/null | grep -E 'context7|playwright' || true; }
