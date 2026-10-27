#!/usr/bin/env python3
"""Before/after quality report for a delivery encode.

- encode loss: SSIM / PSNR of the delivery file against the lossless master,
  over every frame;
- sharpness: 98th-percentile edge gradient (edge acuity) of the same regions in the
  previous delivery and the new one, at moments from start, middle and end;
- side-by-side crops of those regions (faces, 3D, Persian type) for the eye.

Usage: qc_compare.py <before.mp4> <after.mp4> <master.mov> <out-dir>
"""
import json
import re
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np

# (time s, label, crop y, x, h, w) — start, middle and end of the film
PROBES = [
    (1.9, "hook type + network", 1000, 120, 300, 840),
    (4.6, "face, hook", 560, 200, 400, 680),
    (10.6, "liquid + «حالت تهوع»", 640, 100, 360, 880),
    (21.4, "3D «تلقین»", 820, 60, 420, 960),
    (27.5, "lab brain", 500, 140, 520, 800),
    (36.0, "neurons + «انتظار ذهنی»", 420, 120, 420, 840),
    (45.8, "3D network + «توجه بیشتر»", 300, 120, 520, 840),
    (59.6, "3D «اثر نوسیبو»", 820, 100, 520, 880),
    (63.8, "brain + «یک فکر»", 500, 120, 520, 840),
    (66.8, "face + «یک احساس واقعی»", 900, 60, 420, 960),
    (78.5, "final question", 600, 40, 420, 1000),
]


def frame(path, t):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{t:.3f}", "-i", str(path), "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "bgr24", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(1920, 1080, 3)


def acuity(img):
    """Strength of the strongest real edges: 98th percentile of the Sobel
    gradient. Codec blocking makes many weak steps, which this ignores (a
    Laplacian variance would reward them)."""
    g = cv2.GaussianBlur(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32), (0, 0), 0.6)
    mag = np.hypot(cv2.Sobel(g, cv2.CV_32F, 1, 0), cv2.Sobel(g, cv2.CV_32F, 0, 1))
    return float(np.percentile(mag, 98))


def encode_loss(after, master):
    log = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", str(after), "-i", str(master), "-lavfi",
         "[0:v]format=yuv420p,split[d1][d2];[1:v]scale=out_color_matrix=bt709:out_range=tv:flags=lanczos+accurate_rnd+full_chroma_int,format=yuv420p,split[r1][r2];[d1][r1]ssim;[d2][r2]psnr", "-f", "null", "-"],
        capture_output=True, text=True).stderr
    ssim = re.search(r"SSIM .*All:([0-9.]+) \(([0-9.]+)\)", log)
    psnr = re.search(r"PSNR .*average:([0-9.inf]+)", log)
    return {"ssim_all": float(ssim.group(1)) if ssim else None, "ssim_db": float(ssim.group(2)) if ssim else None, "psnr_avg_db": psnr.group(1) if psnr else None}


def main():
    before, after, master, out = map(Path, sys.argv[1:5])
    out.mkdir(parents=True, exist_ok=True)
    rows, report = [], {"probes": []}
    for t, label, y, x, h, w in PROBES:
        b = frame(before, t)[y : y + h, x : x + w]
        a = frame(after, t)[y : y + h, x : x + w]
        ab, aa = acuity(b), acuity(a)
        report["probes"].append({"t": t, "what": label, "acuity_before": round(ab, 1), "acuity_after": round(aa, 1), "gain_pct": round(100 * (aa / ab - 1), 1)})
        pad = np.full((h, 8, 3), 255, np.uint8)
        row = np.hstack([b, pad, a])
        rows.append(cv2.resize(row, (1100, int(1100 * h / row.shape[1]))))
    cv2.imwrite(str(out / "before_after.jpg"), np.vstack(rows), [cv2.IMWRITE_JPEG_QUALITY, 92])
    report["encode_vs_master"] = encode_loss(after, master)
    (out / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
