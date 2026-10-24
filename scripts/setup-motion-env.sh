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

log "Python audio tools (Piper fa_IR TTS, Kokoro TTS)"
python3 -c "import piper, kokoro_onnx, soundfile" 2>/dev/null \
  || "${PIP[@]}" piper-tts==1.8.0 kokoro-onnx soundfile

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

log "Health check"
npx hyperframes doctor 2>&1 | grep -E "✓|✗" || true
