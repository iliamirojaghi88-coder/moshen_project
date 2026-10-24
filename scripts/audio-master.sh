#!/usr/bin/env bash
# Voice + music + SFX → broadcast-ready AAC master.
#
#   scripts/audio-master.sh -v voice.wav [-m music.mp3] [-s sfx.json] [-o master.m4a]
#                           [--denoise] [--target -14] [--duck 0.25]
#
#   -v  narration (the user's own file is used as-is apart from cleanup; never replaced)
#   -m  music bed, looped/trimmed to the voice length, ducked under speech
#   -s  JSON list of {"file": "...", "at": seconds, "gain_db": -6}
#   --denoise  FFT denoise + 80 Hz high-pass on the voice
#   --target   integrated loudness of the master in LUFS (default -14, true peak -1 dBTP)
#   --duck     music level while speech is present (sidechain), default 0.25
set -euo pipefail
export LC_ALL=C

VOICE="" MUSIC="" SFX="" OUT="master.m4a" DENOISE=0 TARGET=-14 DUCK=0.25
while [[ $# -gt 0 ]]; do
  case "$1" in
    -v) VOICE="$2"; shift 2 ;;
    -m) MUSIC="$2"; shift 2 ;;
    -s) SFX="$2"; shift 2 ;;
    -o) OUT="$2"; shift 2 ;;
    --denoise) DENOISE=1; shift ;;
    --target) TARGET="$2"; shift 2 ;;
    --duck) DUCK="$2"; shift 2 ;;
    *) echo "unknown arg $1" >&2; exit 2 ;;
  esac
done
[[ -n "$VOICE" ]] || { echo "need -v voice" >&2; exit 2; }

dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$VOICE")
inputs=(-i "$VOICE")
voice_chain="aresample=48000,aformat=channel_layouts=mono"
[[ $DENOISE == 1 ]] && voice_chain+=",highpass=f=80,afftdn=nr=12:nf=-40"
voice_chain+=",acompressor=threshold=-20dB:ratio=3:attack=5:release=120,loudnorm=I=-16:TP=-2:LRA=7"
graph="[0:a]${voice_chain},asplit=2[vo][vkey];"
mix_inputs="[vo]"
n=1

if [[ -n "$MUSIC" ]]; then
  inputs+=(-stream_loop -1 -i "$MUSIC")
  graph+="[${n}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:${dur},volume=-14dB,afade=t=in:d=0.8,afade=t=out:st=$(echo "$dur - 1.5" | bc -l):d=1.5[bed];"
  graph+="[bed][vkey]sidechaincompress=threshold=0.02:ratio=8:attack=20:release=400:makeup=1:level_sc=1:mix=$(echo "1 - $DUCK" | bc -l)[ducked];"
  mix_inputs+="[ducked]"
  n=$((n + 1))
else
  graph+="[vkey]anullsink;"
fi

if [[ -n "$SFX" ]]; then
  while IFS=$'\t' read -r file at gain; do
    inputs+=(-i "$file")
    ms=$(printf '%.0f' "$(echo "$at * 1000" | bc -l)")
    graph+="[${n}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${gain}dB,adelay=${ms}|${ms}[s${n}];"
    mix_inputs+="[s${n}]"
    n=$((n + 1))
  done < <(python3 - "$SFX" <<'PY'
import json, sys
for x in json.load(open(sys.argv[1])):
    print(f"{x['file']}\t{x['at']}\t{x.get('gain_db', -6)}")
PY
)
fi

count=$(grep -o '\[' <<< "$mix_inputs" | wc -l)
graph+="${mix_inputs}amix=inputs=${count}:duration=first:normalize=0,loudnorm=I=${TARGET}:TP=-1:LRA=9,aresample=48000[out]"

ffmpeg -hide_banner -loglevel error -y "${inputs[@]}" -filter_complex "$graph" -map "[out]" \
  -c:a aac -b:a 192k -ar 48000 -ac 2 -t "$dur" "$OUT"

ffmpeg -hide_banner -nostats -i "$OUT" -af ebur128=peak=true -f null - 2>&1 \
  | awk '/I:/{i=$2} /Peak:/{p=$2} END{printf "master → %s  (integrated %s LUFS, true peak %s dBTP)\n", "'"$OUT"'", i, p}'
