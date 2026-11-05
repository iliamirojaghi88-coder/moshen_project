"""Cut + grade the raw take into assets/base.mp4 (and assets/voice.wav) from edit/edl.json.

  python3 videos/contrast-font/edit/build_base.py   (run from the repo root)
"""
import json, subprocess, sys
from pathlib import Path

P = Path(__file__).resolve().parents[1]
ROOT = P.parents[1]
edl = json.loads((P / "edit/edl.json").read_text())
fps, segs = edl["fps"], edl["segments"]
src = ROOT / edl["source"]
parts, labels = [], ""
spf = 48000 // fps  # audio samples per video frame: frame-exact trims, no drift
for i, s in enumerate(segs):
    n = s["out"] - s["in"]
    # 6 ms fades: every cut sits in a measured pause, this only removes clicks
    parts.append(f"[0:v]trim=start_frame={s['in']}:end_frame={s['out']},setpts=PTS-STARTPTS[v{i}];"
                 f"[0:a]aresample=48000,atrim=start_sample={s['in'] * spf}:end_sample={s['out'] * spf},"
                 f"asetpts=PTS-STARTPTS,afade=t=in:d=0.006,afade=t=out:st={n / fps - 0.006:.4f}:d=0.006[a{i}];")
    labels += f"[v{i}][a{i}]"
graph = "".join(parts) + f"{labels}concat=n={len(segs)}:v=1:a=1[vc][ac];" \
    f"[vc]colorspace=all=bt709:iall=bt601-6-625:fast=1,{edl['grade']},format=yuv420p[vo]"
out = P / "assets/base.mp4"
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-filter_complex", graph,
                "-map", "[vo]", "-map", "[ac]", "-c:v", "libx264", "-preset", "medium", "-crf", "14",
                "-g", str(fps), "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
                "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-movflags", "+faststart", str(out)], check=True)
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(out), "-vn", "-ac", "1", "-ar", "48000",
                str(P / "assets/voice.wav")], check=True)
frames = sum(s["out"] - s["in"] for s in segs)
print(f"base.mp4: {frames} frames = {frames / fps:.3f} s")
