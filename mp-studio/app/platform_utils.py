"""Platform helpers shared by the Windows (desktop) and cloud/headless (phone-only) paths. Stdlib only.

  is_windows()   True on win32
  is_headless()  True in a cloud session / server: no window may be opened, nobody presses Studio buttons.
                 Forced by MP_HEADLESS=1 (or off with MP_HEADLESS=0); automatic when the cloud installer
                 left `.mp-cloud-ready` in the repo root, or on Linux without DISPLAY/WAYLAND_DISPLAY.
  venv_python()  interpreter for child processes: the running one (sys.executable) unless a repo venv is
                 explicitly wanted for a server start on Windows.
  find_tool(n)   ffmpeg / ffprobe lookup: $MP_FFMPEG dir, PATH, then portable builds in mp-studio/bin.
"""
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
CLOUD_MARK = REPO / ".mp-cloud-ready"


def is_windows() -> bool:
    return sys.platform == "win32"


def is_headless() -> bool:
    v = os.environ.get("MP_HEADLESS", "").strip().lower()
    if v in ("1", "true", "yes"):
        return True
    if v in ("0", "false", "no"):
        return False
    if CLOUD_MARK.exists():
        return True
    return sys.platform.startswith("linux") and not (os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY"))


def venv_python() -> str:
    """Python for subprocesses. Always the interpreter that is running now (works in .venv, .venv-cloud
    and system Pythons alike); Windows desktop keeps preferring the repo venv when we run outside it."""
    if is_windows() and not is_headless():
        p = REPO / ".venv" / "Scripts" / "python.exe"
        if p.exists() and Path(sys.prefix).resolve() != (REPO / ".venv").resolve():
            return str(p)
    return sys.executable


def find_tool(name: str = "ffmpeg") -> str:
    """Path of ffmpeg/ffprobe, or the bare name (so failures read 'ffmpeg not found')."""
    exe = name + (".exe" if is_windows() else "")
    forced = os.environ.get("MP_FFMPEG")
    if forced:
        p = Path(forced)
        cand = p if (name == "ffmpeg" and p.is_file()) else p.parent / exe if p.is_file() else p / exe
        if cand.exists():
            return str(cand)
    found = shutil.which(name)
    if found:
        return found
    bundled = sorted((REPO / "mp-studio" / "bin").glob(f"*/bin/{exe}"), reverse=True)
    return str(bundled[0]) if bundled else name


def filter_script_flag(ffmpeg: str = "ffmpeg") -> str:
    """Flag that reads a -filter_complex graph from a file: `-/filter_complex` (FFmpeg 7+) or
    `-filter_complex_script` (FFmpeg 6.x, e.g. Ubuntu 24.04's apt build in cloud containers)."""
    try:
        v = subprocess.run([ffmpeg, "-version"], capture_output=True, text=True, timeout=30).stdout
    except (OSError, subprocess.SubprocessError):
        return "-/filter_complex"
    m = re.search(r"version n?(\d+)\.", v)
    return "-filter_complex_script" if m and int(m.group(1)) < 7 else "-/filter_complex"


def portable_ffmpegs() -> list:
    exe = "ffmpeg.exe" if is_windows() else "ffmpeg"
    return [str(p) for p in sorted((REPO / "mp-studio" / "bin").glob(f"*/bin/{exe}"), reverse=True)]


if __name__ == "__main__":
    print({"windows": is_windows(), "headless": is_headless(), "python": venv_python(),
           "ffmpeg": find_tool("ffmpeg"), "ffprobe": find_tool("ffprobe"),
           "filter_script_flag": filter_script_flag(find_tool("ffmpeg"))})
