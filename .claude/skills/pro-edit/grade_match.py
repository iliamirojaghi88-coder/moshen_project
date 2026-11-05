"""Cinematic grade for compare tools: colour-match the cut to the reference video's look, bake it as a .cube.

  .venv/Scripts/python.exe grade_match.py <reference.mp4> <cut.mp4> <out.cube> [--strength 0.75] [--split 1.0]

Lab mean/std transfer (Reinhard) measured on frames of both videos, blended by --strength, then a filmic
S-curve on L and a split-tone (teal shadows, warm highlights, skin kept) scaled by --split.
"""
import argparse, subprocess
import cv2
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument("ref"); ap.add_argument("cut"); ap.add_argument("out")
ap.add_argument("--strength", type=float, default=0.75)
ap.add_argument("--split", type=float, default=1.0)
ap.add_argument("--size", type=int, default=33)
a = ap.parse_args()


def frames(path, times, crop_top=0.0):
    out = []
    for t in times:
        raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", str(t), "-i", path, "-frames:v", "1", "-vf", "scale=360:-2",
                              "-f", "rawvideo", "-pix_fmt", "bgr24", "-"], capture_output=True).stdout
        h = len(raw) // (360 * 3)
        if h:
            img = np.frombuffer(raw, np.uint8)[: h * 360 * 3].reshape(h, 360, 3)
            out.append(img[int(h * crop_top):])
    return out


def lab(img):  # float Lab: L 0..100, a/b ~ -128..127
    return cv2.cvtColor(img.astype(np.float32) / 255.0, cv2.COLOR_BGR2Lab).reshape(-1, 3)


if a.ref.lower().endswith((".jpg", ".jpeg", ".png")):  # a still photo as the look reference
    ref = lab(cv2.resize(cv2.imread(a.ref), (360, 360 * cv2.imread(a.ref).shape[0] // cv2.imread(a.ref).shape[1])))
else:
    ref = np.concatenate([lab(f) for f in frames(a.ref, range(2, 31, 3), crop_top=0.22)])  # skip the graphics row
src = np.concatenate([lab(f) for f in frames(a.cut, [1, 6, 12, 18, 24, 30, 36])])
mr, sr, ms, ss = ref.mean(0), ref.std(0), src.mean(0), src.std(0)
print("ref  L/a/b mean", mr.round(1), "std", sr.round(1))
print("cut  L/a/b mean", ms.round(1), "std", ss.round(1))

n = a.size
g = np.linspace(0, 1, n, dtype=np.float32)
b_, g_, r_ = np.meshgrid(g, g, g, indexing="ij")          # .cube order: red changes fastest
rgb = np.stack([r_, g_, b_], -1).reshape(-1, 3)
L = cv2.cvtColor(rgb[None, :, ::-1].copy(), cv2.COLOR_BGR2Lab)[0]

k = a.strength
matched = (L - ms) * (sr / ss) + mr
out = L * (1 - k) + matched * k

# filmic S-curve on L (toe + shoulder), anchored at mid grey
x = np.clip(out[:, 0] / 100.0, 0, 1)
s = x + 0.18 * (x - 0.5) * (1 - np.abs(2 * x - 1))           # gentle contrast
s = 0.03 + 0.95 * s                                          # lifted blacks, rolled-off whites
out[:, 0] = s * 100

# split-tone: shadows toward teal, highlights warm; skin-ish hues (a>0, b>0) keep their warmth
w_sh = np.clip(1 - x / 0.45, 0, 1) ** 1.5
w_hi = np.clip((x - 0.55) / 0.45, 0, 1)
skin = np.clip((out[:, 1] - 4) / 12, 0, 1) * np.clip((out[:, 2] - 6) / 14, 0, 1)
out[:, 1] += a.split * (-5.0 * w_sh * (1 - skin) + 2.0 * w_hi)
out[:, 2] += a.split * (-7.0 * w_sh * (1 - skin) + 6.0 * w_hi)

res = cv2.cvtColor(out[None].astype(np.float32), cv2.COLOR_Lab2BGR)[0][:, ::-1]
res = np.clip(res, 0, 1)
with open(a.out, "w") as f:
    f.write(f'TITLE "compare tools cinematic"\nLUT_3D_SIZE {n}\n')
    f.writelines(f"{r:.5f} {gg:.5f} {b:.5f}\n" for r, gg, b in res)
print("wrote", a.out)
