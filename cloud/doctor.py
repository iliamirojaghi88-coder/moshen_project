"""Health check for the cloud (and desktop) install.  python cloud/doctor.py [--json]

Prints one line per check, then a capability table (lite / pro / motion / delivery) with
OK / DEGRADED / UNAVAILABLE, the reason, and the fallback the skills will use. Writes
mp-studio/work/capabilities.json so skills can read it. Exit code 1 only if the LITE path is broken.
Secrets are only reported by NAME (set / missing), never printed.
"""
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "mp-studio" / "app"))
import platform_utils as PU  # noqa: E402

OK, DEG, NO = "OK", "DEGRADED", "UNAVAILABLE"
checks, caps = [], {}


def check(name, status, detail=""):
    checks.append((name, status, detail))
    print(f"[{status:11}] {name}" + (f" - {detail}" if detail else ""))
    return status == OK


def has(mod):
    return importlib.util.find_spec(mod) is not None


def run(cmd, timeout=60):
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, encoding="utf-8", errors="replace")
        return r.returncode, (r.stdout + r.stderr)
    except (OSError, subprocess.TimeoutExpired) as e:
        return 1, str(e)


def mem_gb():
    try:
        for line in Path("/proc/meminfo").read_text().splitlines():
            if line.startswith("MemAvailable"):
                return int(line.split()[1]) / 1048576
    except OSError:
        pass
    return None


def main():
    # ---- base
    v = sys.version_info
    check("python", OK if (3, 10) <= v[:2] <= (3, 12) else DEG,
          f"{v.major}.{v.minor}.{v.micro} at {sys.executable}" + ("" if (3, 10) <= v[:2] <= (3, 12) else " (faster-whisper wheels are tested on 3.10-3.12)"))
    check("headless mode", OK, "yes (no windows, approvals in chat)" if PU.is_headless() else "no (desktop: Studio window allowed)")

    ff, fp = PU.find_tool("ffmpeg"), PU.find_tool("ffprobe")
    code, _ = run([ff, "-version"])
    ffok = check("ffmpeg", OK if code == 0 else NO, ff)
    check("ffprobe", OK if run([fp, "-version"])[0] == 0 else NO, fp)
    libass = False
    if ffok:
        _, filters = run([ff, "-hide_banner", "-filters"])
        libass = " subtitles " in filters or "subtitles" in filters.split()
        check("ffmpeg libass (subtitles filter)", OK if libass else NO,
              "" if libass else "captions cannot be burned in; setup.sh fetches a static build with libass")
        _, enc = run([ff, "-hide_banner", "-encoders"])
        check("libx264 encoder", OK if "libx264" in enc else NO)

    fonts = REPO / "mp-studio" / "fonts"
    have_fonts = all((fonts / f).exists() for f in ("Vazirmatn-Regular.ttf", "Vazirmatn-Bold.ttf", "Lalezar-Regular.ttf"))
    check("Persian fonts", OK if have_fonts else DEG, str(fonts) if have_fonts else "Vazirmatn/Lalezar missing; run cloud/setup.sh")

    # real libass + Persian test
    if ffok and libass and have_fonts:
        with tempfile.TemporaryDirectory() as t:
            ass = Path(t) / "t.ass"
            ass.write_text("[Script Info]\nScriptType: v4.00+\nPlayResX: 360\nPlayResY: 640\n\n[V4+ Styles]\n"
                           "Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\n"
                           "Style: D,Vazirmatn,40,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,40,1\n\n"
                           "[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n"
                           "Dialogue: 0,0:00:00.00,0:00:01.00,D,,0,0,0,,سلام دنیا\n", encoding="utf-8")
            fd = fonts.as_posix().replace(":", r"\:")
            code = subprocess.run([ff, "-v", "error", "-f", "lavfi", "-i", "color=c=black:s=360x640:d=1", "-frames:v", "1",
                                   "-vf", f"subtitles={ass.name}:fontsdir='{fd}'", "-f", "null", "-"],
                                  cwd=t, capture_output=True, text=True).returncode
            check("Persian caption burn-in test", OK if code == 0 else NO, "" if code == 0 else "ffmpeg could not render the ASS test")

    # ---- python packages
    core = ["fastapi", "uvicorn", "faster_whisper", "av", "requests", "yt_dlp", "librosa", "PIL", "numpy", "google.auth"]
    miss = [m for m in core if not has(m.split(".")[0])]
    check("core python packages", OK if not miss else NO, "missing: " + ", ".join(miss) if miss else "")
    model = next(iter((REPO / ".venv-cloud").glob(".model-*")), None) if (REPO / ".venv-cloud").is_dir() else None
    hf = Path.home() / ".cache" / "huggingface" / "hub"
    have_model = bool(model) or (hf.is_dir() and any("faster-whisper" in p.name for p in hf.iterdir()))
    check("whisper model cached", OK if have_model else DEG, "" if have_model else "will download on first transcription (needs internet, ~500 MB for small)")

    # ---- resources
    du = shutil.disk_usage(REPO)
    free = du.free / 1e9
    check("disk free", OK if free >= 5 else DEG if free >= 2 else NO, f"{free:.1f} GB (a 1 GB input needs ~3-4 GB working space)")
    m = mem_gb()
    if m is not None:
        check("memory available", OK if m >= 3 else DEG, f"{m:.1f} GB (whisper small ~1 GB, 1080x1920 renders ~1.5 GB)")
    check("gpu", OK, "not used (CPU path: x264 + whisper int8)")

    # ---- pro
    pro = {}
    for label, mod in (("background removal (rembg)", "rembg"), ("face/hand tracking (mediapipe)", "mediapipe"),
                       ("voice cleanup (pedalboard)", "pedalboard"), ("noise reduction (noisereduce)", "noisereduce"),
                       ("opencv", "cv2"), ("onnxruntime", "onnxruntime")):
        pro[mod] = has(mod)
        check(label, OK if pro[mod] else DEG, "" if pro[mod] else "pro extra not installed (bash cloud/setup.sh --with-pro)")
    node = shutil.which("node")
    node_ok = False
    if node:
        _, nv = run([node, "--version"])
        try:
            node_ok = int(nv.strip().lstrip("v").split(".")[0]) >= 22
        except ValueError:
            pass
    check("node >= 22", OK if node_ok else DEG, "" if node_ok else "needed for HyperFrames motion (setup.sh --with-motion)")
    chrome = list((Path.home() / ".cache" / "hyperframes").glob("chrome/**/chrome-headless-shell*")) if (Path.home() / ".cache" / "hyperframes").is_dir() else []
    check("headless Chrome (hyperframes)", OK if chrome or os.environ.get("HYPERFRAMES_BROWSER_PATH") else DEG,
          "" if chrome else "npx hyperframes browser ensure")
    check("yt-dlp", OK if has("yt_dlp") else DEG)

    # ---- delivery (names only)
    sa = bool(os.environ.get("MP_GDRIVE_SERVICE_ACCOUNT_JSON"))
    oauth = all(os.environ.get(k) for k in ("MP_GDRIVE_CLIENT_ID", "MP_GDRIVE_CLIENT_SECRET", "MP_GDRIVE_REFRESH_TOKEN"))
    deliver_ok = sa or oauth
    check("Drive credentials", OK if deliver_ok else DEG,
          ("service account" if sa else "OAuth refresh token") if deliver_ok else
          "MP_GDRIVE_* secrets not set in the cloud environment (see cloud/README.md); deliver.py cannot upload")
    check("MP_DELIVER_EMAIL", OK if os.environ.get("MP_DELIVER_EMAIL") else DEG, "set" if os.environ.get("MP_DELIVER_EMAIL") else "missing")

    # ---- capability table
    lite_ok = ffok and libass and not miss and have_fonts
    caps["lite"] = {"status": OK if lite_ok else NO,
                    "fallback": None if lite_ok else "fix the failed checks above; nothing else can run without them"}
    pro_ok = pro["onnxruntime"] and pro["cv2"]
    caps["pro_cutout_matte"] = {"status": OK if (pro["rembg"] or pro["onnxruntime"]) and pro["cv2"] else NO,
                                "fallback": "boxed/glass layouts without a pop-out or text-behind-speaker; CPU matte is ~1-3 s/frame so only short clips"}
    caps["pro_audio_cleanup"] = {"status": OK if pro["pedalboard"] and pro["noisereduce"] else DEG,
                                 "fallback": "ffmpeg highpass + compressor (already in lite finish)"}
    caps["pro_face_tracking"] = {"status": OK if pro["mediapipe"] else DEG, "fallback": "static center crop / fixed zoom punch-ins"}
    caps["motion_hyperframes"] = {"status": OK if node_ok and chrome else NO,
                                  "fallback": "ASS motion captions/cards (pro-edit/templates/ass-motion), same look family but no HTML/GSAP panels"}
    caps["delivery_drive"] = {"status": OK if deliver_ok else NO,
                              "fallback": "send a small sample through the chat attachment if the client allows; otherwise set Drive secrets"}
    print("\nCapabilities")
    for k, v in caps.items():
        print(f"  {k:22} {v['status']:11}" + (f"  -> {v['fallback']}" if v["status"] != OK else ""))
    try:
        out = REPO / "mp-studio" / "work"
        out.mkdir(parents=True, exist_ok=True)
        (out / "capabilities.json").write_text(json.dumps(caps, indent=1), encoding="utf-8")
    except OSError:
        pass
    if "--json" in sys.argv:
        print(json.dumps({"checks": checks, "capabilities": caps}, indent=1))
    sys.exit(0 if lite_ok else 1)


if __name__ == "__main__":
    main()
