#!/usr/bin/env bash
# Technical QC of a rendered video against a render profile.
#   scripts/qc-video.sh <video.mp4> [profile=vertical-1080] [--audio-ref narration.wav]
# Checks: resolution, fps, codecs, pixel format, black frames, frozen frames,
# loudness / true peak, A/V duration drift, and (optionally) that the audio
# track still lines up with the original narration (cross-correlation offset).
# Exit code 1 when any hard check fails.
set -euo pipefail
export LC_ALL=C

IN="${1:?video}"
PROFILE="${2:-vertical-1080}"
REF=""
[[ "${3:-}" == "--audio-ref" ]] && REF="${4:?}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

read -r W H FPS VCODEC ACODEC LUFS TP < <(python3 - "$ROOT/render-profiles.json" "$PROFILE" <<'EOF'
import json, sys
p = json.load(open(sys.argv[1]))["profiles"][sys.argv[2]]
print(p["width"], p["height"], p["fps"], p["videoCodec"], p["audioCodec"], p["loudnessLUFS"], p["truePeakDBTP"])
EOF
)

fail=0
ok() { printf '  ✓ %s\n' "$*"; }
bad() { printf '  ✗ %s\n' "$*"; fail=1; }
warn() { printf '  ⚠ %s\n' "$*"; }

probe() { ffprobe -v error -select_streams "$1" -show_entries "stream=$2" -of csv=p=0 "$IN" | head -1; }
echo "QC $IN  (profile $PROFILE: ${W}x${H} @ ${FPS} fps, $VCODEC/$ACODEC)"

[[ "$(probe v:0 width),$(probe v:0 height)" == "$W,$H" ]] && ok "resolution ${W}x${H}" || bad "resolution $(probe v:0 width)x$(probe v:0 height) ≠ ${W}x${H}"
fr=$(probe v:0 r_frame_rate); fpsv=$(echo "scale=3; $fr" | bc -l)
[[ $(echo "$fpsv == $FPS" | bc -l) == 1 ]] && ok "fps $FPS" || bad "fps $fpsv ≠ $FPS"
[[ "$(probe v:0 codec_name)" == "$VCODEC" ]] && ok "video codec $VCODEC" || bad "video codec $(probe v:0 codec_name)"
[[ "$(probe v:0 pix_fmt)" == "yuv420p" ]] && ok "pix_fmt yuv420p" || warn "pix_fmt $(probe v:0 pix_fmt) (players expect yuv420p)"
if [[ -n "$(probe a:0 codec_name)" ]]; then
  [[ "$(probe a:0 codec_name)" == "$ACODEC" ]] && ok "audio codec $ACODEC" || bad "audio codec $(probe a:0 codec_name)"
  vd=$(probe v:0 duration); ad=$(probe a:0 duration)
  drift=$(echo "d=$vd - $ad; if (d<0) d=-d; d" | bc -l)
  [[ $(echo "$drift < 0.1" | bc -l) == 1 ]] && ok "A/V duration drift ${drift}s" || bad "A/V duration drift ${drift}s"
  read -r I P < <(ffmpeg -hide_banner -nostats -i "$IN" -map a:0 -af ebur128=peak=true -f null - 2>&1 | awk '/I:/{i=$2} /Peak:/{p=$2} END{print i, p}')
  [[ $(echo "($I - $LUFS) < 1.5 && ($LUFS - $I) < 1.5" | bc -l) == 1 ]] && ok "loudness $I LUFS" || warn "loudness $I LUFS (target $LUFS)"
  [[ $(echo "$P <= $TP + 0.2" | bc -l) == 1 ]] && ok "true peak $P dBTP" || bad "true peak $P dBTP > $TP"
else
  warn "no audio stream"
fi

blacks=$(ffmpeg -hide_banner -nostats -i "$IN" -vf blackdetect=d=0.08:pix_th=0.08 -an -f null - 2>&1 | grep -c black_start || true)
[[ "$blacks" == 0 ]] && ok "no black frames" || bad "$blacks black segment(s): $(ffmpeg -hide_banner -nostats -i "$IN" -vf blackdetect=d=0.08:pix_th=0.08 -an -f null - 2>&1 | grep -oE 'black_start:[0-9.]+' | tr '\n' ' ')"
freezes=$(ffmpeg -hide_banner -nostats -i "$IN" -vf freezedetect=n=0.001:d=1.5 -an -f null - 2>&1 | grep -oE 'freeze_start: [0-9.]+' | tr '\n' ' ' || true)
[[ -z "$freezes" ]] && ok "no frozen stretches > 1.5 s" || warn "frozen: $freezes(fine for holds, bad for stalled renders)"

if [[ -n "$REF" ]]; then
  off=$(python3 - "$IN" "$REF" <<'EOF'
import subprocess, sys
import numpy as np
def pcm(p):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", p, "-map", "a:0", "-ac", "1", "-ar", "8000", "-t", "20", "-f", "s16le", "-"], capture_output=True).stdout
    return np.frombuffer(raw, np.int16).astype(np.float32)
a, b = pcm(sys.argv[1]), pcm(sys.argv[2])
n = min(len(a), len(b))
a, b = a[:n] - a[:n].mean(), b[:n] - b[:n].mean()
c = np.fft.irfft(np.fft.rfft(a, 2 * n) * np.conj(np.fft.rfft(b, 2 * n)))
lag = int(np.argmax(c)); lag = lag - 2 * n if lag > n else lag
print(f"{lag / 8000:.3f}")
EOF
)
  [[ $(echo "$off < 0.045 && $off > -0.045" | bc -l) == 1 ]] && ok "audio sync vs narration ${off}s" || bad "audio offset vs narration ${off}s"
fi

[[ $fail == 0 ]] && echo "QC PASSED" || { echo "QC FAILED"; exit 1; }
