#!/usr/bin/env python3
"""Footage prep for the nocebo film.

Each shot: trim the clean range of a source clip, retime it with motion-
compensated interpolation to 30 fps, crop/upscale to 1080x1920, then grade,
add the shot's VFX (refraction waves, throb, bleach) and grain in numpy, and
encode H.264 for HyperFrames. Everything is seeded: re-running gives the same
frames.

Usage: prep_footage.py <sources-dir> <out-dir> [shot ...]
"""
import json
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np

W, H, FPS = 1080, 1920, 30

SRC = {
    "net": "121968f5-662923057_1793084511571063.mp4",  # 5157 neural network + brain, 1080p
    "axon": "9cea544f-327816860_1793084661154783.mp4",  # 5158 myelinated fibres + signals
    "lab": "313464d9-381552995_1793085651813556.mp4",  # 5161 brain in lab + neuron
    "man": "4076648b-271912639_1793086579198567.mp4",  # 5163 young man feeling unwell
}

# Grades: exposure in stops, contrast around 0.42 pivot, saturation,
# lift/gain per channel, vignette amount.
LOOKS = {
    "hook": dict(exp=-0.5, con=1.24, sat=0.7, lift=(0.0, 0.014, 0.05), gain=(0.84, 0.96, 1.16), vig=0.42),
    "natural": dict(exp=0.04, con=1.04, sat=0.96, lift=(0.0, 0.0, 0.0), gain=(1.03, 1.0, 0.96), vig=0.14),
    "cool": dict(exp=-0.18, con=1.1, sat=0.74, lift=(0.0, 0.006, 0.022), gain=(0.93, 0.98, 1.07), vig=0.26),
    "cold": dict(exp=-0.34, con=1.16, sat=0.62, lift=(0.0, 0.01, 0.032), gain=(0.87, 0.96, 1.12), vig=0.36),
    "lab": dict(exp=0.08, con=1.06, sat=0.9, lift=(0.0, 0.0, 0.006), gain=(0.98, 1.0, 1.03), vig=0.1),
    "dark": dict(exp=-0.12, con=1.16, sat=0.95, lift=(0.0, 0.004, 0.018), gain=(1.0, 0.98, 1.03), vig=0.32),
    "night": dict(exp=-0.3, con=1.18, sat=0.8, lift=(0.0, 0.01, 0.04), gain=(0.9, 0.97, 1.1), vig=0.4),
}

# film-time durations come from the voice map in SPEC.md
SHOTS = {
    # S1 hook
    "s1-net": dict(src="net", a=0.0, b=3.15, dur=3.55, look="hook"),
    "s1-man": dict(src="man", a=3.0, b=4.5, dur=2.40, look="hook", crop=(554, 985, 73, 0)),
    # S2 feeling unwell
    "s2-calm": dict(src="man", a=0.0, b=1.5, dur=2.90, look="natural", crop=(655, 1164, 30, 40)),
    "s2-uneasy": dict(src="man", a=1.5, b=3.45, dur=3.35, look=("natural", "cool"), crop=(610, 1084, 48, 40), vfx="sway"),
    "s2-pain": dict(src="man", a=5.95, b=8.0, dur=2.80, look=("cool", "cold"), crop=(640, 1138, 50, 20), vfx="throb", bleach=0.5),
    # S4 brain and expectation
    "s4-lab": dict(src="lab", a=0.0, b=4.85, dur=6.70, look="lab"),
    "s4-axon": dict(src="axon", a=0.0, b=3.98, dur=5.30, look=("lab", "dark"), mix_end=0.15),
    "s4-dark1": dict(src="lab", a=5.36, b=8.0, dur=3.30, look="dark"),
    "s4-dark2": dict(src="axon", a=4.46, b=6.0, dur=2.80, look="dark"),
    # S7 conclusion
    "s7-brain": dict(src="net", a=4.1, b=6.0, dur=3.50, look="night"),
    "s7-man": dict(src="man", a=0.6, b=4.4, dur=4.80, look=("cool", "natural"), crop=(620, 1102, 50, 30), reverse=True),
}


def lerp(a, b, k):
    return a + (b - a) * k


def look_at(spec, k):
    look = spec["look"]
    if isinstance(look, str):
        return LOOKS[look]
    A, B = LOOKS[look[0]], LOOKS[look[1]]
    s = k * k * (3 - 2 * k)
    return {key: (tuple(lerp(x, y, s) for x, y in zip(A[key], B[key])) if isinstance(A[key], tuple) else lerp(A[key], B[key], s)) for key in A}


def vignette_mask():
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    nx = (x - W / 2) / (W / 2)
    ny = (y - H * 0.45) / (H / 2)
    r = np.sqrt(nx * nx * 0.9 + ny * ny * 0.75)
    return np.clip((r - 0.55) / 0.75, 0, 1) ** 1.6


VIG = vignette_mask()
LUMA = np.array([0.2126, 0.7152, 0.0722], np.float32)


def grade(img, L, exp_extra=0.0):
    x = img.astype(np.float32) / 255.0
    x = x ** 2.2  # to linear-ish
    x *= 2.0 ** (L["exp"] + exp_extra)
    x = x ** (1 / 2.2)
    x = (x - 0.42) * L["con"] + 0.42
    lift = np.array(L["lift"], np.float32)
    gain = np.array(L["gain"], np.float32)
    x = x * gain + lift * (1 - x)
    lum = (x * LUMA).sum(-1, keepdims=True)
    x = lum + (x - lum) * L["sat"]
    x *= 1 - L["vig"] * VIG[..., None]
    return x


def grain(x, frame, amount=0.022):
    rs = np.random.default_rng(1000 + frame)
    g = rs.standard_normal((H // 2, W // 2)).astype(np.float32)
    g = cv2.resize(g, (W, H), interpolation=cv2.INTER_LINEAR)
    lum = (x * LUMA).sum(-1, keepdims=True)
    return x + g[..., None] * amount * (0.35 + 0.65 * np.sqrt(np.clip(lum, 0, 1)))


GY, GX = np.mgrid[0:H, 0:W].astype(np.float32)


def face_mask(cx, cy, rx, ry):
    d = ((GX - cx) / rx) ** 2 + ((GY - cy) / ry) ** 2
    return np.clip((d - 1.0) / 1.6, 0, 1)  # 0 on the face, 1 in the air around it


def vfx_sway(img, t, k):
    """Nausea: the air around him rolls in slow, long swells; the frame itself
    drifts and tilts by a fraction of a degree. Strength grows with k."""
    amp = 7.5 * k * k
    m = face_mask(W * 0.5, H * 0.33, 300, 420)
    dx = amp * m * np.sin(GY / 210.0 - t * 2.1) * np.cos(GX / 390.0 + t * 0.9)
    dy = amp * 0.45 * m * np.sin(GX / 260.0 + t * 1.7)
    ang = 0.55 * k * np.sin(t * 1.35)
    sh = 6.0 * k * np.sin(t * 0.95 + 0.6)
    Mrot = cv2.getRotationMatrix2D((W / 2, H * 0.4), ang, 1.0 + 0.012 * k)
    Mrot[1, 2] += sh
    img = cv2.warpAffine(img, Mrot, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    return cv2.remap(img, GX + dx, GY + dy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT), 0.0


def vfx_throb(img, t, k):
    """Pain: sharp refraction rings leave the forehead on a throb; each throb
    also dips exposure for a beat."""
    cx, cy = W * 0.6, H * 0.24
    r = np.sqrt((GX - cx) ** 2 + (GY - cy) ** 2)
    period = 0.82
    dx = np.zeros_like(GX)
    dy = np.zeros_like(GY)
    exp_dip = 0.0
    for n in range(6):
        t0 = 0.25 + n * period
        age = t - t0
        if age < 0 or age > 1.6:
            continue
        front = 80 + age * 820
        width = 34 + age * 30
        a = 9.0 * np.exp(-age * 1.9) * (0.6 + 0.4 * k)
        prof = np.exp(-((r - front) / width) ** 2) * np.sin((r - front) / width * 2.2)
        nx = (GX - cx) / (r + 1e-3)
        ny = (GY - cy) / (r + 1e-3)
        dx += a * prof * nx
        dy += a * prof * ny
        exp_dip -= 0.16 * np.exp(-((age - 0.06) / 0.09) ** 2)
    m = face_mask(W * 0.52, H * 0.3, 240, 330) * 0.85 + 0.15
    return cv2.remap(img, GX + dx * m, GY + dy * m, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT), exp_dip


def bleach(x, k):
    """Overexposure into white: highlights clip first, then everything."""
    e = 2.0 ** (k * k * 4.5)
    x = 1 - np.exp(-x * e * 1.15)
    bl = cv2.GaussianBlur(x, (0, 0), 6 + 40 * k)
    return x * (1 - 0.5 * k) + bl * 0.5 * k + k ** 3


def build(name, spec, src_dir, out_dir):
    src = Path(src_dir) / SRC[spec["src"]]
    span = spec["b"] - spec["a"]
    speed = span / spec["dur"]
    vf = []
    if spec.get("reverse"):
        vf.append("reverse")
    vf.append(f"setpts=PTS/{speed:.5f}")
    vf.append("minterpolate=fps=30:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1")
    if "crop" in spec:
        cw, ch, cx, cy = spec["crop"]
        vf.append(f"crop={cw}:{ch}:{cx}:{cy}")
    vf.append(f"scale={W}:{H}:flags=lanczos")
    vf.append("unsharp=5:5:0.35")
    n_frames = int(round(spec["dur"] * FPS)) + 3  # 0.1 s handle
    dec = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-ss", f"{spec['a']:.3f}", "-t", f"{span + 0.04:.3f}", "-i", str(src), "-vf", ",".join(vf), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        stdout=subprocess.PIPE,
    )
    out = Path(out_dir) / f"{name}.mp4"
    enc = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "slow", "-crf", "14", "-g", "15", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(out)],
        stdin=subprocess.PIPE,
    )
    frame_bytes = W * H * 3
    last = None
    for f in range(n_frames):
        buf = dec.stdout.read(frame_bytes)
        if len(buf) < frame_bytes:
            buf = last  # hold the final source frame for the handle
            if buf is None:
                break
        last = buf
        img = np.frombuffer(buf, np.uint8).reshape(H, W, 3)
        t = f / FPS
        k = min(1.0, t / spec["dur"])
        exp_extra = 0.0
        if spec.get("vfx") == "sway":
            img, exp_extra = vfx_sway(img, t, k)
        elif spec.get("vfx") == "throb":
            img, exp_extra = vfx_throb(img, t, k)
        x = grade(img, look_at(spec, k), exp_extra)
        bl = spec.get("bleach")
        if bl and t > spec["dur"] - bl:
            x = bleach(np.clip(x, 0, 1), min(1.0, (t - (spec["dur"] - bl)) / bl))
        x = grain(x, f + sum(map(ord, name)) * 31)
        enc.stdin.write((np.clip(x, 0, 1) * 255 + 0.5).astype(np.uint8).tobytes())
    enc.stdin.close()
    enc.wait()
    dec.kill()
    return {"file": out.name, "src": SRC[spec["src"]], "range": [spec["a"], spec["b"]], "dur": spec["dur"], "speed": round(speed, 4), "frames": n_frames}


def main():
    src_dir, out_dir = sys.argv[1], sys.argv[2]
    names = sys.argv[3:] or list(SHOTS)
    Path(out_dir).mkdir(parents=True, exist_ok=True)
    for n in names:
        info = build(n, SHOTS[n], src_dir, out_dir)
        (Path(out_dir) / f"{n}.json").write_text(json.dumps(info, indent=2))
        print(n, info, flush=True)


if __name__ == "__main__":
    main()
