#!/usr/bin/env bash
# Persian (fa_IR) narration with Piper — local, free, no API key.
# Usage: scripts/tts-fa.sh "متن فارسی" out.wav [voice]
#        scripts/tts-fa.sh script.txt out.wav [voice]
# Voices: fa_IR-amir-medium (default), fa_IR-gyro-medium, fa_IR-ganji-medium,
#         fa_IR-ganji_adabi-medium, fa_IR-reza_ibrahim-medium
set -euo pipefail

TEXT="${1:?text or .txt file required}"
OUT="${2:-speech-fa.wav}"
VOICE="${3:-fa_IR-amir-medium}"
VOICE_DIR="${PIPER_VOICE_DIR:-$HOME/.cache/piper}"
BASE="https://huggingface.co/rhasspy/piper-voices/resolve/main"

speaker="${VOICE#fa_IR-}"
speaker="${speaker%-*}"
quality="${VOICE##*-}"
model="$VOICE_DIR/$VOICE.onnx"

mkdir -p "$VOICE_DIR"
if [[ ! -f "$model" || ! -f "$model.json" ]]; then
  echo "Downloading Piper voice $VOICE ..." >&2
  curl -fsSL -o "$model" "$BASE/fa/fa_IR/$speaker/$quality/$VOICE.onnx"
  curl -fsSL -o "$model.json" "$BASE/fa/fa_IR/$speaker/$quality/$VOICE.onnx.json"
fi

if [[ -f "$TEXT" ]]; then
  python3 -m piper -m "$model" -f "$OUT" < "$TEXT"
else
  printf '%s' "$TEXT" | python3 -m piper -m "$model" -f "$OUT"
fi
echo "$OUT"
