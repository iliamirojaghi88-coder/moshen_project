#!/usr/bin/env bash
# Delivery encode: lossless master -> HEVC (x265, two-pass) + AAC, under a size cap.
#
#   tools/encode_final.sh <master.mov> <out.mp4> [target_MB=215]
#
# The video bitrate is computed from the target size minus the audio, so the
# file lands near the target (two-pass is accurate to ~1-2 %). Audio is mastered
# again from the stems (voice + score), not re-encoded from an earlier AAC.
# x265 tuning for graded footage + motion graphics: aq-mode 3 (dark scenes),
# psy-rd/rdoq to keep texture, mild negative deblock and no SAO so edges and
# Persian type stay crisp. 8-bit Main, tagged hvc1 + BT.709 for phones and Apple.
set -euo pipefail
cd "$(dirname "$0")/.."
IN="$1" OUT="$2" TARGET_MB="${3:-215}"
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$IN")
AUDIO_K=256
VIDEO_K=$(python3 -c "print(int(($TARGET_MB*1e6*8/$DUR - $AUDIO_K*1000)/1000 * 0.985))")
echo "duration ${DUR}s  target ${TARGET_MB} MB  video ${VIDEO_K} kb/s  audio ${AUDIO_K} kb/s"

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

# --- audio: same mix and loudness pass as tools/master.sh, AAC 256k ---
VOICE=assets/audio/voice.mp3
SCORE=assets/audio/score.wav
MIX="[0:a]aresample=48000,aformat=channel_layouts=stereo,adelay=300|300[v];[1:a]aresample=48000,aformat=channel_layouts=stereo[s];[v][s]amix=inputs=2:normalize=0:duration=longest,atrim=0:81"
stats=$(ffmpeg -hide_banner -nostats -i "$VOICE" -i "$SCORE" -filter_complex "$MIX,loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json" -f null - 2>&1 | sed -n '/^{/,/^}/p')
get() { python3 -c "import json,sys; print(json.loads(sys.argv[1])['$1'])" "$stats"; }
NORM="loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=$(get input_i):measured_TP=$(get input_tp):measured_LRA=$(get input_lra):measured_thresh=$(get input_thresh):offset=$(get target_offset):linear=true"
ffmpeg -v error -y -i "$VOICE" -i "$SCORE" -filter_complex "$MIX,$NORM,aresample=48000" -c:a aac -b:a ${AUDIO_K}k -ar 48000 "$WORK/audio.m4a"

# --- video: two-pass x265 ---
VF="scale=out_color_matrix=bt709:out_range=tv:flags=lanczos+accurate_rnd+full_chroma_int,format=yuv420p"
X265="aq-mode=3:aq-strength=0.9:psy-rd=2.0:psy-rdoq=1.0:deblock=-1,-1:no-sao=1:keyint=60:min-keyint=15:bframes=5:rc-lookahead=40:vbv-maxrate=34000:vbv-bufsize=50000:colorprim=bt709:transfer=bt709:colormatrix=bt709:range=limited"
COMMON=(-vf "$VF" -c:v libx265 -preset slow -profile:v main -b:v ${VIDEO_K}k -tag:v hvc1 -color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv)
ffmpeg -v error -y -i "$IN" -an "${COMMON[@]}" -x265-params "$X265:pass=1:stats=$WORK/x265.log" -f null /dev/null
ffmpeg -v error -y -i "$IN" -i "$WORK/audio.m4a" -map 0:v -map 1:a "${COMMON[@]}" -x265-params "$X265:pass=2:stats=$WORK/x265.log" -c:a copy -movflags +faststart "$OUT"
ls -l "$OUT"
