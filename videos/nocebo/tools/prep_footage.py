#!/usr/bin/env python3
"""Footage prep for the nocebo film.

Each shot: trim the clean range of a source clip, retime it with motion-
compensated interpolation to 30 fps and a light temporal denoise, then build
every output frame with ONE Lanczos resample straight from the source pixels:
the crop, the camera push (baked here instead of CSS, same curves) and the
shot's refraction VFX are composed into a single coordinate map. Then grade,
halo-limited sharpening, bleach, a dithered 8-bit quantisation (no added grain)
and a near-lossless H.264 encode for HyperFrames. Re-running gives the same
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
# cam: camera push as segments (t0, t1, scale0, scale1, y0, y1, ease) in seconds
# from the clip's first visible frame, about the frame centre (what the scene
# wrappers used to tween in CSS). media: the scene's data-media-start.
SHOTS = {
    # S1 hook
    "s1-net": dict(src="net", a=0.0, b=3.15, dur=3.55, look="hook", cam=[(0, 3.47, 1.0, 1.045, 0, 0, "none")]),
    "s1-man": dict(src="man", a=3.0, b=4.5, dur=2.40, look="hook", crop=(554, 985, 73, 0), cam=[(0, 2.28, 1.06, 1.12, 0, 0, "power1.out")]),
    # S2 feeling unwell
    "s2-calm": dict(src="man", a=0.0, b=1.5, dur=2.90, look="natural", crop=(655, 1164, 30, 40), cam=[(0, 2.8, 1.0, 1.035, 0, 0, "none")]),
    "s2-uneasy": dict(src="man", a=1.5, b=3.45, dur=3.35, look=("natural", "cool"), crop=(610, 1084, 48, 40), vfx="sway", media=0.35, cam=[(0, 2.7, 1.02, 1.1, 0, 0, "power1.in")]),
    "s2-pain": dict(src="man", a=5.95, b=8.0, dur=2.80, look=("cool", "cold"), crop=(640, 1138, 50, 20), vfx="throb", bleach=0.5, media=0.8, cam=[(0, 2.0, 1.04, 1.1, 0, 0, "power1.out")]),
    # S4 brain and expectation
    "s4-lab": dict(src="lab", a=0.0, b=4.85, dur=6.70, look="lab", cam=[(0, 0.9, 1.1, 1.0, 0, 0, "expo.out"), (0.9, 6.5, 1.0, 1.05, 0, 0, "none")]),
    "s4-axon": dict(src="axon", a=0.0, b=3.98, dur=5.30, look=("lab", "dark"), cam=[(0, 5.2, 1.0, 1.06, 0, -30, "none")]),
    "s4-dark1": dict(src="lab", a=5.36, b=8.0, dur=3.30, look="dark", cam=[(0, 3.2, 1.02, 1.09, 0, 0, "none")]),
    "s4-dark2": dict(src="axon", a=4.46, b=6.0, dur=2.80, look="dark", cam=[(0, 2.6, 1.05, 1.12, 0, 0, "none")]),
    # S7 conclusion
    "s7-brain": dict(src="net", a=4.1, b=6.0, dur=3.50, look="night", cam=[(0, 3.4, 1.0, 1.32, 0, -170, "power1.in")]),
    "s7-man": dict(src="man", a=0.6, b=4.4, dur=4.80, look=("cool", "natural"), crop=(620, 1102, 50, 30), reverse=True, cam=[(0, 4.6, 1.2, 1.08, -170, -70, "power1.inOut")]),
}

EASES = {
    "none": lambda p: p,
    "power1.in": lambda p: p * p,
    "power1.out": lambda p: 1 - (1 - p) ** 2,
    "power1.inOut": lambda p: 2 * p * p if p < 0.5 else 1 - (-2 * p + 2) ** 2 / 2,
    "expo.out": lambda p: 1.0 if p >= 1 else 1 - 2 ** (-10 * p),
}


def camera(spec, ts):
    """scale and vertical offset (px) of the push at scene-relative time ts"""
    segs = spec.get("cam", [(0, 1, 1.0, 1.0, 0, 0, "none")])
    seg = segs[0]
    for sg in segs:
        if ts >= sg[0]:
            seg = sg
    t0, t1, s0, s1, y0, y1, e = seg
    p = EASES[e](min(1.0, max(0.0, (ts - t0) / (t1 - t0))))
    return s0 + (s1 - s0) * p, y0 + (y1 - y0) * p


def lerp(a, b, k):
    return a + (b - a) * k


def look_at(spec, k):
    look = spec["look"]
    if isinstance(look, str):
        return LOOKS[look]
    A, B = LOOKS[look[0]], LOOKS[look[1]]
    s = k * k * (3 - 2 * k)
    return {key: (tuple(lerp(x, y, s) for x, y in zip(A[key], B[key])) if isinstance(A[key], tuple) else lerp(A[key], B[key], s)) for key in A}


def vignette_mask(x=None, y=None):
    """Vignette in clip space; given pushed coordinates it follows the push."""
    if x is None:
        y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    nx = (x - W / 2) / (W / 2)
    ny = (y - H * 0.45) / (H / 2)
    r = np.sqrt(nx * nx * 0.9 + ny * ny * 0.75)
    return np.clip((r - 0.55) / 0.75, 0, 1) ** 1.6


VIG = vignette_mask()
LUMA = np.array([0.2126, 0.7152, 0.0722], np.float32)


def grade(img, L, exp_extra=0.0, vig=VIG):
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
    x *= 1 - L["vig"] * vig[..., None]
    return x


def sharpen(x, sigma, amount, overshoot=0.006):
    """Unsharp on luma only, clamped to each pixel's 3x3 neighbourhood range so
    edges get crisper without white or dark halos."""
    y = (x * LUMA).sum(-1)
    blur = cv2.GaussianBlur(y, (0, 0), sigma)
    ys = y + amount * (y - blur)
    k = np.ones((3, 3), np.uint8)
    lo = cv2.erode(y, k) - overshoot
    hi = cv2.dilate(y, k) + overshoot
    ys = np.clip(ys, lo, hi)
    return x + (ys - y)[..., None]


def quantise(x, frame):
    """8-bit with triangular dither: keeps dark gradients from banding,
    below the level where it reads as noise."""
    rs = np.random.default_rng(7000 + frame)
    d = rs.random((H, W, 1), dtype=np.float32) - rs.random((H, W, 1), dtype=np.float32)
    return np.clip(x * 255 + 0.5 + d * 0.75, 0, 255).astype(np.uint8)


GY, GX = np.mgrid[0:H, 0:W].astype(np.float32)


def face_mask(cx, cy, rx, ry, px=GX, py=GY):
    d = ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2
    return np.clip((d - 1.0) / 1.6, 0, 1)  # 0 on the face, 1 in the air around it


def vfx_sway(px, py, t, k):
    """Nausea: the air around him rolls in slow, long swells; the frame itself
    drifts and tilts by a fraction of a degree. Strength grows with k.
    Maps output clip coordinates to pre-VFX clip coordinates."""
    amp = 7.5 * k * k
    m = face_mask(W * 0.5, H * 0.33, 300, 420, px, py)
    qx = px + amp * m * np.sin(py / 210.0 - t * 2.1) * np.cos(px / 390.0 + t * 0.9)
    qy = py + amp * 0.45 * m * np.sin(px / 260.0 + t * 1.7)
    ang = 0.55 * k * np.sin(t * 1.35)
    sh = 6.0 * k * np.sin(t * 0.95 + 0.6)
    M = cv2.getRotationMatrix2D((W / 2, H * 0.4), ang, 1.0 + 0.012 * k)
    M[1, 2] += sh
    Mi = cv2.invertAffineTransform(M)
    rx = Mi[0, 0] * qx + Mi[0, 1] * qy + Mi[0, 2]
    ry = Mi[1, 0] * qx + Mi[1, 1] * qy + Mi[1, 2]
    return rx, ry, 0.0


def vfx_throb(px, py, t, k):
    """Pain: sharp refraction rings leave the forehead on a throb; each throb
    also dips exposure for a beat."""
    cx, cy = W * 0.6, H * 0.24
    r = np.sqrt((px - cx) ** 2 + (py - cy) ** 2)
    period = 0.82
    dx = np.zeros_like(px)
    dy = np.zeros_like(py)
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
        dx += a * prof * (px - cx) / (r + 1e-3)
        dy += a * prof * (py - cy) / (r + 1e-3)
        exp_dip -= 0.16 * np.exp(-((age - 0.06) / 0.09) ** 2)
    m = face_mask(W * 0.52, H * 0.3, 240, 330, px, py) * 0.85 + 0.15
    return px + dx * m, py + dy * m, exp_dip


def bleach(x, k):
    """Overexposure into white: highlights clip first, then everything."""
    e = 2.0 ** (k * k * 4.5)
    x = 1 - np.exp(-x * e * 1.15)
    bl = cv2.GaussianBlur(x, (0, 0), 6 + 40 * k)
    return x * (1 - 0.5 * k) + bl * 0.5 * k + k ** 3


def probe_size(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v", "-show_entries", "stream=width,height", "-of", "csv=p=0", str(path)], capture_output=True, text=True, check=True).stdout
    w, h = out.strip().split(",")
    return int(w), int(h)


def build(name, spec, src_dir, out_dir):
    src = Path(src_dir) / SRC[spec["src"]]
    sw, sh = probe_size(src)
    cw, ch, cx, cy = spec.get("crop", (sw, sh, 0, 0))
    sc = W / cw  # source px -> clip px
    span = spec["b"] - spec["a"]
    speed = span / spec["dur"]
    vf = []
    if spec.get("reverse"):
        vf.append("reverse")
    vf.append(f"setpts=PTS/{speed:.5f}")
    vf.append("minterpolate=fps=30:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1")
    vf.append("hqdn3d=1.2:1.0:2.5:2.0")  # light: lifts codec mosquito noise before sharpening
    n_frames = int(round(spec["dur"] * FPS)) + 3  # 0.1 s handle
    dec = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-ss", f"{spec['a']:.3f}", "-t", f"{span + 0.04:.3f}", "-i", str(src), "-vf", ",".join(vf), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        stdout=subprocess.PIPE,
    )
    out = Path(out_dir) / f"{name}.mp4"
    enc = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
         "-c:v", "libx264", "-preset", "medium", "-crf", "4", "-g", "15", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(out)],
        stdin=subprocess.PIPE,
    )
    frame_bytes = sw * sh * 3
    media = spec.get("media", 0.0)
    last = None
    for f in range(n_frames):
        buf = dec.stdout.read(frame_bytes)
        if len(buf) < frame_bytes:
            buf = last  # hold the final source frame for the handle
            if buf is None:
                break
        last = buf
        img = np.frombuffer(buf, np.uint8).reshape(sh, sw, 3)
        t = f / FPS
        k = min(1.0, t / spec["dur"])
        # output pixel -> undo the camera push -> undo the VFX -> source pixel
        s_cam, y_cam = camera(spec, t - media)
        px = W / 2 + (GX - W / 2) / s_cam
        py = H / 2 + (GY - H / 2 - y_cam) / s_cam
        vig = vignette_mask(px, py)  # the vignette rode with the clip under the push
        exp_extra = 0.0
        if spec.get("vfx") == "sway":
            px, py, exp_extra = vfx_sway(px, py, t, k)
        elif spec.get("vfx") == "throb":
            px, py, exp_extra = vfx_throb(px, py, t, k)
        mx = (px / sc + cx - 0.5 * (1 - 1 / sc)).astype(np.float32)
        my = (py / sc + cy - 0.5 * (1 - 1 / sc)).astype(np.float32)
        frame = cv2.remap(img, mx, my, cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REFLECT)
        x = grade(frame, look_at(spec, k), exp_extra, vig)
        mag = sc * s_cam
        # upscaled 720p shots get more, the native 1080p network less; a fine
        # second pass restores micro-contrast. Both are clamped (no halos).
        if mag > 1.35:
            x = sharpen(sharpen(x, 1.3, 1.05), 0.6, 0.4)
        else:
            x = sharpen(sharpen(x, 0.9, 0.6), 0.5, 0.25)
        bl = spec.get("bleach")
        if bl and t > spec["dur"] - bl:
            x = bleach(np.clip(x, 0, 1), min(1.0, (t - (spec["dur"] - bl)) / bl))
        enc.stdin.write(quantise(x, f + sum(map(ord, name)) * 31).tobytes())
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
