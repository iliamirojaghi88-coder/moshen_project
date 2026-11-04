"""The client's 3D cut-outs: the four images of «چرا سیم‌لند؟» (source/why/) and the
phone on its stand of «با ما در ارتباط باشید» (source/contact/) and the SIMLAND folder of the
resume section (source/resume/) and the product photos of the catalogue pages (source/catalog/).

The pictures themselves are used exactly as supplied: no redrawing, no resizing,
no lossy compression. Only two things are cleaned:
  · isolated specks left in the transparent background by the cut-out (each at
    most a few % opacity, not touching the object) become fully transparent;
  · the empty transparent margin is trimmed (a few px of air are kept); haze
    below 1% opacity (alpha 1–2) outside the object does not count.
Output: assets/images/<section>/<name>.webp, lossless (every visible pixel identical); the «سیم و کابل ساختمانی»
photos (building-*) are high-quality lossy (q 92, alpha lossless): the diff printed for them is the lossy error.

  python3 -I tools/build-cutouts.py
"""
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
JOBS = [('why', n) for n in ('shield', 'variety', 'headset', 'box')] + [('contact', 'phone'), ('resume', 'folder'), ('catalog', 'armored-copper-cable'), ('catalog', 'instrumentation-armored-cable'), ('catalog', 'solar-panel-cable'), ('catalog', 'telecom-indoor-cable'), ('catalog', 'telecom-outdoor-cable'), ('catalog', 'aluminum-multi-core-cable'), ('catalog', 'aluminum-single-core-cable'), ('catalog', 'control-flexible-cable'), ('catalog', 'control-flexible-shielded-cable')] + [('catalog', n) for n in ('building-flexible-wire', 'building-flexible-wire-pair', 'building-solid-wire', 'building-lszh-wire', 'building-lszh-mica-wire', 'building-coaxial-cable', 'building-flexible-wire-blue', 'building-flexible-cable', 'building-power-flexible-cable', 'building-solid-wire-yellow', 'building-flexible-wire-meter', 'building-solid-wire-ring', 'building-twin-flat-wire', 'building-twin-round-wire', 'building-cooler-cable', 'building-shielded-lszh-cable', 'building-shielded-lszh-mica-cable')] + [('catalog', 'solar-cable-simland')]
# sides where the cable runs on past the render's frame (catalog.json `bleed`): no air kept there, the page puts
# the photo against that edge of its frame
OPEN = {'building-flexible-wire-pair': 'left bottom', 'building-solid-wire': 'left bottom', 'building-lszh-wire': 'bottom',
        'building-lszh-mica-wire': 'bottom', 'building-coaxial-cable': 'bottom', 'building-flexible-wire-blue': 'left',
        'building-flexible-cable': 'right bottom', 'building-power-flexible-cable': 'bottom', 'building-solid-wire-yellow': 'bottom', 'building-flexible-wire-meter': 'bottom', 'building-solid-wire-ring': 'right', 'building-twin-flat-wire': 'left right',
        'building-twin-round-wire': 'right bottom', 'building-cooler-cable': 'left bottom', 'building-shielded-lszh-cable': 'bottom',
        'building-shielded-lszh-mica-cable': 'bottom', 'solar-cable-simland': 'bottom', 'telecom-indoor-cable': 'bottom', 'telecom-outdoor-cable': 'bottom'}
# the client's technical pictures (labels, leader lines, cross-sections on black): kept whole and opaque, nothing
# cut or moved; high-quality WebP
TECH = ['building-lszh-wire-section', 'building-lszh-mica-cable-section', 'building-lszh-mica-cable-diagram',
        'building-shielded-lszh-cable-diagram', 'building-shielded-lszh-mica-cable-diagram', 'building-shielded-lszh-mica-cable-section',
        'control-flexible-cable-diagram', 'control-flexible-shielded-cable-section']
SPECK_ALPHA = 12  # a stray component this faint (and small, and apart) is background residue
PAD = 6

for section, name in JOBS:
    out_dir = ROOT / 'assets/images' / section
    out_dir.mkdir(parents=True, exist_ok=True)
    im = np.array(Image.open(ROOT / 'source' / section / f'{name}.png').convert('RGBA'))
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
    op = OPEN.get(name, '').split()
    pad = lambda side: 0 if side in op else PAD
    y0, y1 = max(0, ys.min() - pad('top')), min(a.shape[0], ys.max() + 1 + pad('bottom'))
    x0, x1 = max(0, xs.min() - pad('left')), min(a.shape[1], xs.max() + 1 + pad('right'))
    crop = im[y0:y1, x0:x1].copy()
    # fully transparent pixels hold no colour (RGB 0, as in a premultiplied image): the render's own glow /
    # background colours stay nowhere under alpha 0, so a renderer that filters or composites the photo
    # unpremultiplied (some mobile GPU paths on first display, with the cards' drop-shadow filter) cannot show them
    # as a light box behind the cable — the files that already held 0 there (telecom, solar) never showed it
    crop[crop[..., 3] == 0, :3] = 0
    im[y0:y1, x0:x1] = crop
    out = Image.fromarray(crop)
    path = out_dir / f'{name}.webp'
    if name.startswith('building-'):
        # the «سیم و کابل ساختمانی» photos (renders up to 2160 px wide, 19 of them): high-quality lossy colour with an
        # untouched alpha channel, so the one-file page stays light; every earlier photo stays lossless as approved
        out.save(path, 'WEBP', quality=92, alpha_quality=100, method=6, exact=False)
    else:
        out.save(path, 'WEBP', lossless=True, method=6, exact=True)  # exact: the bled colours are kept as written
    # check: every visible pixel survived unchanged
    back = np.array(Image.open(path).convert('RGBA')).astype(int)
    orig = im[y0:y1, x0:x1].astype(int)
    vis = orig[..., 3] > 0
    diff = int(np.abs(back - orig)[vis].max()) if vis.any() else 0
    print(f'{name:8s} {im.shape[1]}x{im.shape[0]} -> {out.width}x{out.height}  specks {len(specks)} ({removed} px)  '
          f'{path.stat().st_size / 1024:.0f} KB  max diff on visible px {diff}')

for name in TECH:
    im = Image.open(ROOT / 'source/catalog' / f'{name}.jpg').convert('RGB')
    path = ROOT / 'assets/images/catalog' / f'{name}.webp'
    im.save(path, 'WEBP', quality=90, method=6)
    print(f'{name} {im.width}x{im.height} (technical, opaque)  {path.stat().st_size / 1024:.0f} KB')
