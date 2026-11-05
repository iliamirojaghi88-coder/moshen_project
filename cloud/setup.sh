#!/usr/bin/env bash
# MP Video Skillset - cloud installer (Ubuntu 22.04/24.04, CPU only). Safe to re-run.
#
#   bash cloud/setup.sh              lite path: Python venv, FFmpeg+libass, Persian fonts, Whisper (small), yt-dlp
#   bash cloud/setup.sh --with-pro   also the pro extras (rembg, mediapipe, audio cleanup, kinocut)
#   bash cloud/setup.sh --with-motion  also Node 22 + HyperFrames + headless Chrome (motion graphics, ~1 GB)
#   bash cloud/setup.sh doctor       only run the health check (cloud/doctor.py)
#
# Env: MP_WHISPER_MODEL (default small; medium needs ~1.5 GB RAM more; none = skip the prefetch), MP_VENV (default .venv-cloud)
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"
VENV="${MP_VENV:-$REPO/.venv-cloud}"
WHISPER="${MP_WHISPER_MODEL:-small}"
PRO=0; MOTION=0; DOCTOR_ONLY=0
for a in "$@"; do
  case "$a" in
    --with-pro) PRO=1 ;;
    --with-motion) MOTION=1 ;;
    doctor) DOCTOR_ONLY=1 ;;
    -h|--help) sed -n 2,10p "$0"; exit 0 ;;
    *) echo "unknown option: $a" >&2; exit 2 ;;
  esac
done

say() { printf '\n== %s\n' "$*"; }
SUDO=""; [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null && SUDO="sudo"
sha() { sha256sum "$1" | cut -c1-16; }

if [ "$DOCTOR_ONLY" -eq 1 ]; then
  exec "$VENV/bin/python" cloud/doctor.py
fi

# moshen_project: one installer at a time (the SessionStart hook may be running it in the background).
exec 9>"${TMPDIR:-/tmp}/mp-video-setup.lock"; command -v flock >/dev/null && flock 9
export PATH="$HOME/.local/bin:$PATH"
UV=""; command -v uv >/dev/null && UV=uv

say "System packages (ffmpeg with libass, fontconfig, git, curl)"
if command -v ffmpeg >/dev/null && command -v fc-cache >/dev/null && command -v git >/dev/null && command -v curl >/dev/null; then
  echo "already present (apt skipped)"
elif command -v apt-get >/dev/null; then
  $SUDO apt-get update -qq || echo "apt update failed (continuing with what is installed)"
  $SUDO env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends \
    ffmpeg fontconfig git curl ca-certificates unzip python3-venv python3-pip libsndfile1 libgl1 libglib2.0-0 \
    || echo "apt install had errors; doctor will say what is missing"
else
  echo "no apt-get: install ffmpeg (with libass), fontconfig, git, curl yourself"
fi

say "FFmpeg must have the subtitles filter (libass) for Persian captions"
if ! ffmpeg -hide_banner -filters 2>/dev/null | grep -w subtitles >/dev/null; then  # no -q: early exit + pipefail = false miss
  echo "system ffmpeg lacks libass; fetching a static build"
  arch="$(uname -m)"; case "$arch" in x86_64) a=amd64 ;; aarch64) a=arm64 ;; *) a="" ;; esac
  if [ -n "$a" ]; then
    d="$REPO/mp-studio/bin/ffmpeg-static-linux/bin"; mkdir -p "$d"
    curl -fsSL "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-${a}-static.tar.xz" -o /tmp/ffmpeg-static.tar.xz \
      && tar -xJf /tmp/ffmpeg-static.tar.xz -C /tmp \
      && cp /tmp/ffmpeg-*-static/ffmpeg /tmp/ffmpeg-*-static/ffprobe "$d/" \
      && echo "static ffmpeg in $d (export MP_FFMPEG=$d/ffmpeg to use it)" \
      || echo "static ffmpeg download failed"
  fi
fi

say "Python venv ($VENV)"
PYBIN=""
for c in python3.12 python3.11 python3.10; do command -v "$c" >/dev/null && { PYBIN="$c"; break; }; done
if [ -z "$PYBIN" ]; then  # faster-whisper wheels are reliable on 3.10-3.12 only
  command -v uv >/dev/null || curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
  uv python install 3.12
  PYBIN="$(uv python find 3.12)"
fi
PY="$VENV/bin/python"
# moshen_project: uv when present (much faster, cached wheels); pip otherwise.
if [ ! -x "$PY" ]; then
  if [ -n "$UV" ]; then uv venv -q --seed --python "$PYBIN" "$VENV"
  else "$PYBIN" -m venv "$VENV" && "$PY" -m pip install -q --upgrade pip wheel; fi
fi
pipi() { if [ -n "$UV" ]; then uv pip install -q --python "$PY" "$@"; else "$PY" -m pip install -q "$@"; fi; }

REQ=mp-studio/requirements-cloud.txt
if [ ! -f "$VENV/.installed" ] || [ "$(cat "$VENV/.installed")" != "$(sha $REQ)" ]; then
  pipi -r $REQ && sha $REQ > "$VENV/.installed"
else
  echo "core requirements already installed"
fi
PROREQ=mp-studio/requirements-cloud-pro.txt
if [ "$PRO" -eq 1 ] && [ "$(cat "$VENV/.installed-pro" 2>/dev/null)" != "$(sha $PROREQ)" ]; then
  say "Pro extras (best effort, one by one)"
  okall=1
  while read -r pkg; do
    case "$pkg" in ''|\#*) continue ;; esac
    pipi "$pkg" || { okall=0; echo "  could not install $pkg -> that feature will be reported UNAVAILABLE"; }
  done < $PROREQ
  [ "$okall" -eq 1 ] && sha $PROREQ > "$VENV/.installed-pro"
fi

say "Folders"
mkdir -p mp-studio/{input,work,output,fonts,models} mp-studio/assets/{logo,fonts,music} mp-studio/work/_cache

say "Persian fonts (Vazirmatn, Lalezar - OFL)"
F="$REPO/mp-studio/fonts"
for w in Regular Bold; do
  [ -s "$F/Vazirmatn-$w.ttf" ] || curl -fsSL "https://github.com/rastikerdar/vazirmatn/raw/master/fonts/ttf/Vazirmatn-$w.ttf" -o "$F/Vazirmatn-$w.ttf" \
    || echo "could not download Vazirmatn-$w"
done
[ -s "$F/Lalezar-Regular.ttf" ] || curl -fsSL "https://github.com/google/fonts/raw/main/ofl/lalezar/Lalezar-Regular.ttf" -o "$F/Lalezar-Regular.ttf" \
  || echo "could not download Lalezar"
mkdir -p "$HOME/.fonts" && cp -u "$F"/*.ttf "$HOME/.fonts/" 2>/dev/null || true
fc-cache >/dev/null 2>&1 || true

say "Skills fetched at setup (same as the Windows installer)"
S=".claude/skills"
if command -v git >/dev/null; then
  if [ ! -d "$S/gsap-core" ]; then
    t="$(mktemp -d)"; git clone --depth 1 -q https://github.com/greensock/gsap-skills "$t" 2>/dev/null \
      && for s in gsap-core gsap-timeline gsap-plugins gsap-utils gsap-performance; do [ -d "$t/skills/$s" ] && cp -r "$t/skills/$s" "$S/"; done
    rm -rf "$t"
  fi
  if [ ! -d "$S/hyperframes" ]; then
    t="$(mktemp -d)"; git clone --depth 1 --filter=blob:none --sparse -q https://github.com/heygen-com/hyperframes "$t" 2>/dev/null \
      && git -C "$t" sparse-checkout set skills 2>/dev/null \
      && for s in hyperframes hyperframes-cli hyperframes-registry media-use; do [ -d "$t/skills/$s" ] && cp -r "$t/skills/$s" "$S/"; done
    rm -rf "$t"
  fi
  # moshen_project: Remotion skills normally come from the account's Remotion plugin (remotion:*).
  # Only when no copy exists anywhere, fetch remotion-best-practices (no licence file -> gitignored, never committed).
  have=0
  for p in "$S/remotion-best-practices" "$HOME"/.claude/skills/remotion-best-practices \
           "$HOME"/.claude/plugins/*/*/*/skills/remotion-best-practices "$HOME"/.claude/plugins/*/*/*/*/skills/remotion-best-practices; do
    if [ -d "$p" ]; then have=1; fi
  done
  if [ "$have" -eq 0 ]; then
    t="$(mktemp -d)"; git clone --depth 1 --filter=blob:none --sparse -q https://github.com/remotion-dev/skills "$t" 2>/dev/null \
      && git -C "$t" sparse-checkout set skills/remotion-best-practices 2>/dev/null \
      && cp -r "$t/skills/remotion-best-practices" "$S/"
    rm -rf "$t"
  fi
fi

say "Whisper model '$WHISPER' (CPU, int8)"
if [ "$WHISPER" = none ]; then
  echo "skipped (MP_WHISPER_MODEL=none); faster-whisper downloads it on first transcription"
elif [ ! -f "$VENV/.model-$WHISPER" ]; then
  "$PY" - <<PYEOF && touch "$VENV/.model-$WHISPER" || echo "model download failed; it will download on first use"
from faster_whisper.utils import download_model
download_model("$WHISPER")
PYEOF
fi

if [ "$MOTION" -eq 1 ]; then
  say "Motion graphics runtime (Node 22 + HyperFrames + headless Chrome)"
  if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | $SUDO -E bash - && $SUDO apt-get install -y -qq nodejs \
      || echo "could not install Node 22 -> motion UNAVAILABLE"
  fi
  command -v npx >/dev/null && { npx --yes hyperframes browser ensure || echo "headless Chrome failed -> motion UNAVAILABLE"; }
fi

# Marks this checkout as a cloud/headless one: no windows, approvals happen in chat.
cat > "$REPO/.mp-cloud-ready" <<MARK
python=$PY
installed=$(date -u +%FT%TZ)
MARK

say "Health check"
export MP_HEADLESS=1 MP_NO_GPU=1 PYTHONUTF8=1
"$PY" cloud/doctor.py || true
echo
echo "Use this interpreter for everything: $PY"
