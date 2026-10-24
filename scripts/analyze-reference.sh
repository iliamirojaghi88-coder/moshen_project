#!/usr/bin/env bash
# Technical breakdown of a reference video for style analysis.
# Usage: scripts/analyze-reference.sh <video> <out_dir> [scene_threshold=0.30]
# Produces: specs.json, scenes.csv (cut timecodes), frames/ (one frame per shot
# + one every 2 s), contact-sheet.jpg, audio.txt (loudness, silences), black.txt
set -euo pipefail
export LC_ALL=C

IN="${1:?video}"
OUT="${2:?out dir}"
TH="${3:-0.30}"
mkdir -p "$OUT/frames/shots" "$OUT/frames/every2s"

ffprobe -v error -print_format json -show_format -show_streams "$IN" > "$OUT/specs.json"
dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$IN")

# Scene cuts: pts_time of frames whose scene score exceeds the threshold.
ffmpeg -hide_banner -nostats -i "$IN" -vf "select='gt(scene,$TH)',showinfo" -an -f null - 2>&1 \
  | grep -oE 'pts_time:[0-9.]+' | cut -d: -f2 > "$OUT/.cuts"
{
  echo "shot,start,end,length"
  prev=0; n=1
  while read -r t; do
    printf '%d,%.3f,%.3f,%.3f\n' "$n" "$prev" "$t" "$(echo "$t - $prev" | bc -l)"
    prev=$t; n=$((n + 1))
  done < "$OUT/.cuts"
  printf '%d,%.3f,%.3f,%.3f\n' "$n" "$prev" "$dur" "$(echo "$dur - $prev" | bc -l)"
} > "$OUT/scenes.csv"
rm -f "$OUT/.cuts"

# One frame from the middle of every shot.
tail -n +2 "$OUT/scenes.csv" | while IFS=, read -r n s e _; do
  mid=$(printf "%.3f" "$(echo "($s + $e) / 2" | bc -l)")
  ffmpeg -nostdin -hide_banner -loglevel error -y -ss "$mid" -i "$IN" -frames:v 1 -q:v 3 \
    "$OUT/frames/shots/shot-$(printf '%03d' "$n")-${mid}s.jpg"
done

# Regular sampling + contact sheet with burnt-in timecode.
ffmpeg -hide_banner -loglevel error -y -i "$IN" -vf "fps=1/2,scale=360:-2" -q:v 4 \
  "$OUT/frames/every2s/f-%03d.jpg"
ffmpeg -hide_banner -loglevel error -y -i "$IN" \
  -vf "fps=1/2,scale=240:-2,drawtext=text='%{pts\:hms}':x=6:y=6:fontsize=18:fontcolor=yellow:box=1:boxcolor=black@0.6,tile=6x5:padding=4" \
  -frames:v 1 -q:v 3 "$OUT/contact-sheet.jpg"

# Audio: integrated loudness, true peak, silences.
{
  ffmpeg -hide_banner -nostats -i "$IN" -af ebur128=peak=true -f null - 2>&1 | sed -n '/Summary:/,$p'
  echo "--- silences (< -40 dB, >= 0.3 s)"
  ffmpeg -hide_banner -nostats -i "$IN" -af silencedetect=n=-40dB:d=0.3 -f null - 2>&1 | grep -E 'silence_(start|end)' || true
} > "$OUT/audio.txt" 2>/dev/null || true

ffmpeg -hide_banner -nostats -i "$IN" -vf blackdetect=d=0.1:pix_th=0.10 -an -f null - 2>&1 \
  | grep blackdetect > "$OUT/black.txt" || true

echo "shots: $(($(wc -l < "$OUT/scenes.csv") - 1)) · duration: ${dur}s → $OUT"
