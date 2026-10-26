#!/usr/bin/env python3
"""Procedural PBR textures for the METRICA film (all generated here, no stock maps).

Writes tileable basecolor / roughness / normal maps into assets/tex/.
Usage: python3 tools/make_textures.py assets/tex
"""
import os
import sys

import numpy as np
from PIL import Image

OUT = sys.argv[1] if len(sys.argv) > 1 else "assets/tex"
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(7)


def perlin(n, period, seed):
    """Tileable gradient noise, n x n samples, `period` cells across."""
    r = np.random.default_rng(seed)
    ang = r.uniform(0, 2 * np.pi, (period + 1, period + 1))
    ang[-1, :] = ang[0, :]
    ang[:, -1] = ang[:, 0]
    gx, gy = np.cos(ang), np.sin(ang)
    lin = np.linspace(0, period, n, endpoint=False)
    x, y = np.meshgrid(lin, lin)
    xi, yi = x.astype(int), y.astype(int)
    xf, yf = x - xi, y - yi

    def dot(ix, iy, dx, dy):
        return gx[iy, ix] * dx + gy[iy, ix] * dy

    n00 = dot(xi, yi, xf, yf)
    n10 = dot(xi + 1, yi, xf - 1, yf)
    n01 = dot(xi, yi + 1, xf, yf - 1)
    n11 = dot(xi + 1, yi + 1, xf - 1, yf - 1)
    u = xf * xf * xf * (xf * (xf * 6 - 15) + 10)
    v = yf * yf * yf * (yf * (yf * 6 - 15) + 10)
    return (n00 * (1 - u) + n10 * u) * (1 - v) + (n01 * (1 - u) + n11 * u) * v


def fbm(n, base, octaves, seed, gain=0.5):
    acc, amp, tot = np.zeros((n, n)), 1.0, 0.0
    for o in range(octaves):
        acc += amp * perlin(n, base * 2 ** o, seed + o * 17)
        tot += amp
        amp *= gain
    return acc / tot


def norm01(a):
    return (a - a.min()) / (a.max() - a.min() + 1e-9)


def normal_from_height(h, strength):
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * strength
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * strength
    nz = np.ones_like(h)
    l = np.sqrt(dx * dx + dy * dy + nz * nz)
    nmap = np.stack([-dx / l, dy / l, nz / l], -1)
    return ((nmap * 0.5 + 0.5) * 255).astype(np.uint8)


def save(name, arr, q=92):
    if arr.dtype != np.uint8:
        arr = (np.clip(arr, 0, 1) * 255).astype(np.uint8)
    Image.fromarray(arr).save(os.path.join(OUT, name), quality=q)


def speckle(n, density, seed):
    r = np.random.default_rng(seed)
    m = (r.random((n, n)) < density).astype(float)
    # soften pores into small pits
    k = m + 0.5 * (np.roll(m, 1, 0) + np.roll(m, 1, 1) + np.roll(m, -1, 0) + np.roll(m, -1, 1))
    return np.clip(k, 0, 1)


# --- cast-in-place concrete with plywood formwork seams --------------------
N = 1024
h = 0.55 * fbm(N, 4, 6, 1) + 0.25 * fbm(N, 32, 3, 2)
pores = speckle(N, 0.0035, 3)
stain = norm01(fbm(N, 2, 4, 4))
seam = np.zeros((N, N))
for k in range(0, N, N // 2):  # 2 panels per tile each way
    seam[:, k:k + 2] = 1
    seam[k:k + 2, :] = 1
grain = norm01(fbm(N, 8, 4, 5)) * 0.15
lum = 0.62 + 0.10 * h - 0.06 * np.clip((stain - 0.5) / 0.3, 0, 1) - 0.18 * pores - 0.05 * seam + grain * 0.2
col = np.stack([lum * 0.98, lum * 0.97, lum * 0.94], -1)
save("concrete_basecolor.jpg", col)
save("concrete_roughness.jpg", np.repeat((0.78 + 0.15 * norm01(h) - 0.25 * seam)[..., None], 3, -1))
save("concrete_normal.jpg", normal_from_height(h * 1.0 - pores * 0.6 - seam * 0.5, 6.0))

# --- site soil: compacted earth with pebbles and tyre ruts ------------------
h = 0.6 * fbm(N, 6, 6, 11) + 0.4 * fbm(N, 48, 2, 12)
peb = np.zeros((N, N))
r = np.random.default_rng(13)
yy, xx = np.mgrid[0:N, 0:N]
for _ in range(900):
    cx, cy, rad = r.integers(0, N), r.integers(0, N), r.uniform(1.5, 6)
    x0, x1 = max(cx - 8, 0), min(cx + 8, N)
    y0, y1 = max(cy - 8, 0), min(cy + 8, N)
    d = np.sqrt((xx[y0:y1, x0:x1] - cx) ** 2 + (yy[y0:y1, x0:x1] - cy) ** 2)
    peb[y0:y1, x0:x1] = np.maximum(peb[y0:y1, x0:x1], np.clip(1 - d / rad, 0, 1) ** 0.6)
wet = norm01(fbm(N, 3, 4, 14))
base = np.stack([0.40, 0.31, 0.22]) * (0.75 + 0.35 * norm01(h))[..., None]
base = base * (1 - 0.25 * (wet > 0.6)[..., None] * (wet[..., None] - 0.6) / 0.4)
pebc = np.stack([0.55, 0.52, 0.48])
base = base * (1 - peb[..., None]) + pebc * (0.7 + 0.3 * norm01(fbm(N, 64, 2, 15)))[..., None] * peb[..., None]
save("soil_basecolor.jpg", base)
save("soil_roughness.jpg", np.repeat((0.92 - 0.25 * peb - 0.2 * (wet > 0.7))[..., None], 3, -1))
save("soil_normal.jpg", normal_from_height(h + peb * 1.4, 5.0))

# --- asphalt -----------------------------------------------------------------
h = 0.5 * fbm(N, 64, 3, 21) + 0.5 * fbm(N, 6, 4, 22)
agg = speckle(N, 0.03, 23)
lum = 0.16 + 0.05 * norm01(h) + 0.07 * agg
save("asphalt_basecolor.jpg", np.stack([lum, lum, lum * 1.03], -1))
save("asphalt_roughness.jpg", np.repeat((0.85 - 0.15 * agg)[..., None], 3, -1))
save("asphalt_normal.jpg", normal_from_height(h * 0.5 + agg * 0.8, 4.0))

# --- travertine cladding panels (1.2 m x 0.6 m, 4 x 8 per tile) --------------
h = fbm(N, 3, 6, 31)
veins = np.abs(np.sin((yy / N * 34 + 3.0 * fbm(N, 4, 5, 32)) * np.pi))
veins = (veins < 0.10).astype(float) * 0.5 + (veins < 0.04) * 0.5
pits = speckle(N, 0.0025, 33)
lum = 0.86 + 0.06 * h - 0.10 * veins - 0.25 * pits
col = np.stack([lum * 0.97, lum * 0.92, lum * 0.84], -1)
joint = np.zeros((N, N))
for k in range(0, N, N // 4):
    joint[:, k:k + 3] = 1
for k in range(0, N, N // 8):
    joint[k:k + 3, :] = 1
col = col * (1 - 0.55 * joint[..., None])
save("stone_basecolor.jpg", col)
save("stone_roughness.jpg", np.repeat((0.55 + 0.2 * norm01(h) + 0.3 * joint)[..., None], 3, -1))
save("stone_normal.jpg", normal_from_height(h * 0.4 - pits - joint * 1.5, 5.0))

# --- brushed aluminium (laptop, phone frame) --------------------------------
r = np.random.default_rng(41)
lines = r.normal(0, 1, (1, N)).repeat(N, 0)
lines = 0.6 * lines + 0.4 * np.roll(lines, 1, 1)
streak = norm01(lines + 0.6 * fbm(N, 64, 2, 42))
save("brushed_roughness.jpg", np.repeat((0.30 + 0.12 * streak)[..., None], 3, -1))
save("brushed_normal.jpg", normal_from_height(streak * 0.3, 2.0))

# --- city facades atlas: 4 styles side by side, base + emissive -------------
W, H = 2048, 2048
fac = np.zeros((H, W, 3))
emi = np.zeros((H, W, 3))
r = np.random.default_rng(51)
styles = [
    # (wall rgb, window rgb, cols, rows, win w frac, win h frac)
    ((0.42, 0.40, 0.38), (0.10, 0.13, 0.17), 10, 24, 0.62, 0.55),
    ((0.70, 0.66, 0.58), (0.12, 0.14, 0.18), 7, 22, 0.45, 0.60),
    ((0.24, 0.27, 0.31), (0.13, 0.18, 0.24), 14, 30, 0.86, 0.80),
    ((0.55, 0.49, 0.42), (0.10, 0.12, 0.15), 8, 20, 0.55, 0.48),
]
sw = W // 4
for s, (wall, win, cols, rows, fw, fh) in enumerate(styles):
    x0 = s * sw
    wallnoise = 0.85 + 0.15 * norm01(fbm(2048, 8, 4, 60 + s))[:, :sw]
    fac[:, x0:x0 + sw] = np.array(wall) * wallnoise[..., None]
    cw, ch = sw / cols, H / rows
    for j in range(rows):
        for i in range(cols):
            wx0 = int(x0 + i * cw + cw * (1 - fw) / 2)
            wx1 = int(x0 + i * cw + cw * (1 + fw) / 2)
            wy0 = int(j * ch + ch * (1 - fh) / 2)
            wy1 = int(j * ch + ch * (1 + fh) / 2)
            fac[wy0:wy1, wx0:wx1] = np.array(win) * r.uniform(0.8, 1.2)
            if r.random() < 0.34:
                warm = r.choice([np.array([1.0, 0.72, 0.42]), np.array([1.0, 0.85, 0.62]), np.array([0.75, 0.85, 1.0])], p=[0.55, 0.3, 0.15])
                emi[wy0:wy1, wx0:wx1] = warm * r.uniform(0.35, 1.0)
save("facade_basecolor.jpg", fac)
save("facade_emissive.jpg", emi)
print("ok", sorted(os.listdir(OUT)))
