"""The power lines of the hero picture, measured from the picture itself.

For each wire of the pylon a quadratic y = a x² + b x + c is fitted to its own
pixels (the thin dark line, column by column, weighted by darkness): the curve
lies on the wire to a tenth of a pixel. Seeds (two points per wire) only tell
the fit where to look. A visibility mask then marks, along every wire, where it
is really seen against the sky (not behind the pine, the house or the pylon's
lattice, and fading where the picture fades the wire out); around those parts a
narrow band of sky is allowed to glow. The copper conductor faces of the cable
end are given as ellipses for the sparks.

Writes assets/hero/power.json (wires, flow direction, emitters) and
assets/hero/power.png (the mask, 8 bit). The picture is only read.

  python3 -I tools/build-power-lines.py
"""
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'source/hero/infinity-hero.png'
OUT = ROOT / 'assets/hero'

# name: seed (x0, y0, x1, y1) on the visible wire; flow from -> to (x); gain (earth wires carry less)
WIRES = {
    'R1': ((1592, 119.0, 1736, 181.0), (1774, 1512), 0.65),  # earth wire, pylon top to the right
    'R2': ((1592, 169.2, 1735, 223.2), (1774, 1570), 1.0),
    'R3': ((1592, 188.6, 1740, 237.2), (1774, 1570), 1.0),
    'R4': ((1592, 245.5, 1739, 291.4), (1774, 1579), 1.0),
    'R5': ((1592, 265.1, 1734, 302.2), (1774, 1579), 1.0),
    'L1': ((1309, 193.4, 1436, 122.5), (1510, 1262), 0.65),  # earth wire, pylon top to the house roof
    'L2': ((1383, 195.0, 1436, 168.2), (1462, 1365), 1.0),
    'L3': ((1393, 206.1, 1436, 186.6), (1462, 1375), 1.0),
}
LATTICE = (1437, 60, 1592, 360)  # the pylon's body: no fitting there
# copper conductor end faces (centre x, y, radii x, y), measured on the picture
EMITTERS = [(243.0, 682.0, 36.0, 50.0), (238.0, 792.0, 37.0, 52.0)]

im = np.asarray(Image.open(SRC).convert('RGBA')).astype(np.float64) / 255
alpha = im[..., 3]
rgb = im[..., :3]
lum = rgb.mean(axis=2)
sat = rgb.max(axis=2) - rgb.min(axis=2)
wirelike = (sat < 0.2) & (lum < 0.68)
dark = alpha * (1 - lum) * wirelike  # how much of a pixel is wire
H, W = alpha.shape

wires = []
mask = np.zeros((H, W), np.float64)
for name, (seed, (xf, xt), gain) in WIRES.items():
    x0, y0, x1, y1 = seed
    pts = []
    for x in range(int(x0), int(x1) + 1):
        if LATTICE[0] <= x <= LATTICE[2]:
            continue
        ys = y0 + (y1 - y0) * (x - x0) / (x1 - x0)
        lo, hi = int(ys) - 4, int(ys) + 6
        w = dark[lo:hi, x]
        if w.sum() < 0.3:
            continue
        pts.append((x, (w * np.arange(lo, hi)).sum() / w.sum()))
    p = np.array(pts)
    a, b, c = np.polyfit(p[:, 0], p[:, 1], 2)
    rms = float(np.sqrt(((p[:, 1] - np.polyval((a, b, c), p[:, 0])) ** 2).mean()))
    # visibility along the wire: how dark the wire is right on the curve
    xs = np.arange(min(xf, xt), max(xf, xt), 0.25)
    vis = np.zeros_like(xs)
    for i, x in enumerate(xs):
        xi = int(round(x))
        if xi >= W:
            continue
        y = np.polyval((a, b, c), x)
        lo, hi = int(np.floor(y - 1.5)), int(np.ceil(y + 1.5)) + 1
        vis[i] = dark[max(lo, 0):hi, xi].max() if 0 <= lo < H else 0
    vis = np.clip(vis / 0.42, 0, 1)
    vis = np.convolve(vis, np.ones(21) / 21, mode='same')  # ±2.5 px: smooth ends, no flicker at small gaps
    # a band of sky (or wire) around the visible parts may glow
    for x, v in zip(xs, vis, strict=True):
        if v < 0.03:
            continue
        xi = int(round(x))
        if xi >= W:
            continue
        y = np.polyval((a, b, c), x)
        lo, hi = max(int(y) - 12, 0), min(int(y) + 13, H)
        col = mask[lo:hi, xi]
        np.maximum(col, v, out=col)
    wires.append({'name': name, 'k': [a, b, c], 'from': xf, 'to': xt, 'gain': gain, 'rms': round(rms, 3)})
    print(f'{name}: y = {a:.6g} x² + {b:.6g} x + {c:.6g}   fit rms {rms:.2f} px over {len(p)} columns, visible over {(vis > 0.5).sum() * 0.25:.0f} px')

# soft edges all round (the glow fades out, it is never cut by the band) ...
mask = cv2.GaussianBlur(mask, (0, 0), 2.5)
# ... but never over another object: only sky or the wires themselves; the
# objects' own outlines are the only sharp edges, as if the glow were behind them
objects = (alpha > 0.35) & ~wirelike
mask[cv2.dilate(objects.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0] = 0
mask = cv2.GaussianBlur(mask, (0, 0), 0.6)
Image.fromarray((np.clip(mask, 0, 1) * 255).round().astype(np.uint8), 'L').save(OUT / 'power.png', optimize=True)
json.dump({'wires': wires, 'emitters': [list(e) for e in EMITTERS]}, open(OUT / 'power.json', 'w'), indent=1)
print('wrote', OUT / 'power.json', OUT / 'power.png', f'({(OUT / "power.png").stat().st_size // 1024} KB)')
