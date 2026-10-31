"""The four 3D images of «چرا سیم‌لند؟», from the client's PNGs in source/why/.

The pictures themselves are used exactly as supplied: no redrawing, no resizing,
no lossy compression. Only two things are cleaned:
  · isolated specks left in the transparent background by the cut-out (each at
    most a few % opacity, not touching the object) become fully transparent;
  · the empty transparent margin is trimmed (a few px of air are kept); haze
    below 1% opacity (alpha 1–2) outside the object does not count.
Output: assets/images/why/<name>.webp, lossless (every visible pixel identical).

  python3 -I tools/build-why-images.py
"""
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'source/why'
OUT = ROOT / 'assets/images/why'
NAMES = ['shield', 'reels', 'headset', 'box']
SPECK_ALPHA = 12  # a stray component this faint (and small, and apart) is background residue
PAD = 6

OUT.mkdir(parents=True, exist_ok=True)
for name in NAMES:
    im = np.array(Image.open(SRC / f'{name}.png').convert('RGBA'))
    a = im[..., 3]
    n, lab, st, _ = cv2.connectedComponentsWithStats((a > 0).astype(np.uint8), 8)
    areas = st[1:, cv2.CC_STAT_AREA]
    biggest = areas.max()
    peak = np.zeros(n, np.uint8)
    np.maximum.at(peak, lab.ravel(), a.ravel())
    specks = [i + 1 for i, area in enumerate(areas) if area < biggest * 0.002 and peak[i + 1] <= SPECK_ALPHA]
    removed = int(np.isin(lab, specks).sum())
    a[np.isin(lab, specks)] = 0
    ys, xs = np.nonzero(a > 2)
    y0, y1 = max(0, ys.min() - PAD), min(a.shape[0], ys.max() + 1 + PAD)
    x0, x1 = max(0, xs.min() - PAD), min(a.shape[1], xs.max() + 1 + PAD)
    out = Image.fromarray(im[y0:y1, x0:x1])
    path = OUT / f'{name}.webp'
    out.save(path, 'WEBP', lossless=True, method=6, exact=False)
    # check: every visible pixel survived unchanged
    back = np.array(Image.open(path).convert('RGBA')).astype(int)
    orig = im[y0:y1, x0:x1].astype(int)
    vis = orig[..., 3] > 0
    diff = int(np.abs(back - orig)[vis].max()) if vis.any() else 0
    print(f'{name:8s} {im.shape[1]}x{im.shape[0]} -> {out.width}x{out.height}  specks {len(specks)} ({removed} px)  '
          f'{path.stat().st_size / 1024:.0f} KB  max diff on visible px {diff}')
