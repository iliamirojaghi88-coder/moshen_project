"""Cut the client's SimLand wire renders on a pure black background (0-2 levels) out of it, for the «سیم و کابل
ساختمانی» pages.

On pure black the render is exactly  pixel = alpha x colour, so:
  - alpha: the segmentation model (IS-Net general-use, as tools/cutout-model.py) makes the shape solid (also the
    black insulation, which is dark on black), and the luminance of the render (its brightest channel over LUM)
    gives the fine copper strands and every soft edge; the larger of the two, only near the model's shape (no
    stray specks);
  - colour = pixel / alpha (clipped): the true colour of each edge pixel, no black fringe, no glow.
Sides the render's frame cuts (the cable runs on past it) are recorded in the build (catalog.json `bleed`) so the
page puts the photo against the same edge of its frame; nothing is painted or continued.

    python3 -I tools/cutout-black.py      (then python3 -I tools/build-cutouts.py, node tools/build-pages.mjs)
"""
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
CAT = ROOT / 'source/catalog'
_src = (ROOT / 'tools/cutout-model.py').read_text().split('\nwhite = ')[0]
_ns = {'__file__': str(ROOT / 'tools/cutout-model.py')}
exec(compile(_src, 'cutout-model.py', 'exec'), _ns)
model_alpha = _ns['model_alpha']
LUM = 46.0     # brightest channel at which a pixel counts as fully covered
NEAR = 9       # px around the model's shape where the luminance may add coverage
# (source name, output name, open_end): open_end — an upright cable shown running on past the bottom of its frame
# (the client's addendum): the rows of its bottom end cap are left out, the cut is a straight row of the body
JOBS = [
    ('building-flexible-wire', None, False),        # six flexible wires, SIMLAND on each
    ('building-flexible-wire-pair', None, False),   # the twisted red / black pair (gallery), runs off the left edge
    ('building-solid-wire', None, False),           # coloured wires out of a bundle, runs off the left and bottom edges
    ('building-lszh-wire', None, True),             # red LSZH wire, no mica
    ('building-lszh-mica-wire', None, True),        # red LSZH wire with mica tape
    ('building-flexible-wire-meter', None, True),   # (see below)
    ('building-shielded-lszh-cable', None, True),       # three cores under a braid, red LSZH sheath, no mica
    ('building-shielded-lszh-mica-cable', None, True),  # the same with a white mica tape under the braid
    ('building-twin-flat-wire', None, False),       # «سیم نایلونی»: two flat twin wires, run off the left and right edges
    ('building-twin-round-wire', None, False),      # «سیم کیسه‌ای»: two-core round flex, runs off the right / bottom
    ('building-solid-wire-ring', None, False),      # yellow solid wire NYA, lying, runs off the right edge   # blue flexible wire NYAF, upright («سیم افشان (متراژ)»)
    ('building-flexible-wire-blue', None, False),   # one blue flexible wire, runs off the left edge (the «آبی» photo)
    ('building-flexible-cable', None, False),       # two-core flexible cable (blue, brown), runs off the right / bottom
    ('building-power-flexible-cable', None, True),  # five-core flexible power cable, black sheath
    ('building-coaxial-cable', None, True),         # white coaxial cable: copper core, PE, foil, braid
    ('telecom-indoor-cable-simland', 'telecom-indoor-cable', True),    # white sheath, SimLand (replaces the older render)
    ('telecom-outdoor-cable-simland', 'telecom-outdoor-cable', True),  # black sheath, SimLand
]


def open_end(alpha):
    """Last row of the straight body: below it the end cap narrows (width under 97 % of the body's)."""
    a = alpha > 0.5
    rows = np.nonzero(a.any(1))[0]
    width = np.array([np.ptp(np.nonzero(a[y])[0]) + 1 if a[y].any() else 0 for y in range(a.shape[0])])
    low = rows[int(len(rows) * 0.7):]
    body = np.median(width[low])
    ok = np.nonzero(width[low] >= 0.97 * body)[0]
    return int(low[ok.max()]) - 2  # 2 px inside the straight part

for name, out, cut_end in JOBS:
    im = Image.open(CAT / f'{name}-original.jpg').convert('RGB')
    out = out or name
    rgb = np.asarray(im).astype(np.float32)
    lifted = Image.fromarray((np.power(rgb / 255, 0.5) * 255 + 0.5).astype(np.uint8))  # dark insulation shows
    m = np.maximum(model_alpha(im), model_alpha(lifted))
    # the model's shape, and every pixel clearly above the black (the model misses parts of a crowded bundle);
    # no hole filling: the black gaps inside a twist or a bundle are background and stay transparent
    lit = cv2.morphologyEx((rgb.max(2) > 10).astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    lit = cv2.morphologyEx(lit, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    shape = ((m > 0.5) | (lit > 0)).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(shape, 8)
    big = 1 + np.nonzero(st[1:, cv2.CC_STAT_AREA] > 0.01 * st[1:, cv2.CC_STAT_AREA].max())[0]
    shape = np.isin(lab, big).astype(np.uint8)
    core = cv2.erode(shape, np.ones((5, 5), np.uint8)).astype(np.float32)
    near = cv2.dilate(shape, np.ones((2 * NEAR + 1, 2 * NEAR + 1), np.uint8)).astype(np.float32)
    lum = np.clip(rgb.max(2) / LUM, 0, 1)
    alpha = np.maximum(core, lum * near)
    alpha[rgb.max(2) <= 3] = 0  # the black background itself
    colour = np.clip(rgb / np.maximum(alpha, 1e-3)[..., None], 0, 255)
    colour[alpha >= 1] = rgb[alpha >= 1]
    if cut_end:
        alpha[open_end(alpha) + 1:] = 0
    rgba = np.dstack([(colour + 0.5).astype(np.uint8), (alpha * 255 + 0.5).astype(np.uint8)])
    ys, xs = np.nonzero(rgba[..., 3] > 2)
    h, w = alpha.shape
    box = (max(0, ys.min() - 2), ys.max() + 1 if cut_end else min(h, ys.max() + 3), max(0, xs.min() - 2), min(w, xs.max() + 3))
    rgba = rgba[box[0]:box[1], box[2]:box[3]]
    a8 = alpha > 0.5  # sides the cable really runs into (not just the 2 px margin)
    cut = [s for s, hit in (('left', a8[:, :2].sum()), ('right', a8[:, -2:].sum()), ('top', a8[:2].sum()), ('bottom', a8[-2:].sum())) if hit > 20]
    Image.fromarray(rgba, 'RGBA').save(CAT / f'{out}.png', optimize=True)
    print(out, rgba.shape[1], 'x', rgba.shape[0], 'touches the frame:', ', '.join(cut) or 'no')


# «کابل کولری»: the client's PNG is already transparent; it only carries stray red / yellow specks around the cores
# (apart from the cable): every component of the alpha that is small and apart from the cable is removed
im = np.asarray(Image.open(CAT / 'building-cooler-cable-original.png').convert('RGBA')).copy()
n, lab, st, _ = cv2.connectedComponentsWithStats((im[..., 3] > 0).astype(np.uint8), 8)
keep = 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])
gone = (lab != keep) & (lab > 0)
im[gone, 3] = 0
Image.fromarray(im, 'RGBA').save(CAT / 'building-cooler-cable.png', optimize=True)
print('building-cooler-cable: specks removed', n - 2, f'({int(gone.sum())} px)')
