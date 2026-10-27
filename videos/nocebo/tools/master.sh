#!/usr/bin/env bash
# Master the soundtrack and mux it onto a rendered picture.
#
#   tools/master.sh <rendered.mp4> <out.mp4> [--preview]
#
# voice (as delivered, from 0.30 s) + score (music + effects, already ducked)
# -> two-pass loudnorm to -14 LUFS / -1 dBTP -> AAC 192k 48 kHz.
# --preview also scales the picture to 540x960 at CRF 26 for a light review file.
set -euo pipefail
cd "$(dirname "$0")/.."
IN="$1" OUT="$2" PREVIEW="${3:-}"
VOICE=assets/audio/voice.mp3
SCORE=assets/audio/score.wav
MIX="[0:a]aresample=48000,aformat=channel_layouts=stereo,adelay=300|300[v];[1:a]aresample=48000,aformat=channel_layouts=stereo[s];[v][s]amix=inputs=2:normalize=0:duration=longest,atrim=0:81"

stats=$(ffmpeg -hide_banner -nostats -i "$VOICE" -i "$SCORE" -filter_complex "$MIX,loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json" -f null - 2>&1 | sed -n '/^{/,/^}/p')
get() { python3 -c "import json,sys; print(json.loads(sys.argv[1])['$1'])" "$stats"; }
NORM="loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=$(get input_i):measured_TP=$(get input_tp):measured_LRA=$(get input_lra):measured_thresh=$(get input_thresh):offset=$(get target_offset):linear=true"

VCODEC=(-map 2:v -c:v copy)
if [[ "$PREVIEW" == "--preview" ]]; then
  VCODEC=(-map 2:v -vf "scale=540:960:flags=lanczos" -c:v libx264 -preset medium -crf 26 -pix_fmt yuv420p)
fi
ffmpeg -v error -y -i "$VOICE" -i "$SCORE" -i "$IN" \
  -filter_complex "$MIX,$NORM,aresample=48000[a]" \
  "${VCODEC[@]}" -map "[a]" -c:a aac -b:a 192k -ar 48000 -shortest -movflags +faststart "$OUT"
echo "$OUT"
