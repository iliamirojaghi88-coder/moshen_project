#!/usr/bin/env python3
"""Splits the locked hero image into the layers the live hero animates.

The source image (source/hero/infinity-hero.png, supplied by the client) is
never changed or moved: base + blades composited give back the source pixels
exactly (checked below). Only these parts move in the browser:

  blades-<id>.webp   the three blades of each turbine, cut from the source; the
                     page turns them inside the rotor's own plane
  caps-<id>.webp     the hub and nacelle of each turbine, drawn over the blades
  base.webp          the source without the blades; where a blade covered the
                     tower, the factory roof or a tree, that pixel is rebuilt
  masks.png          R  sway weight (tree crowns above their ground line)
                     G  flutter weight (leaves, bushes, grass)
                     B  objects in front of a rotor (they hide its blades)
  scene.json         image size, turbine geometry, chimney mouths

  python3 tools/build-hero-layers.py
"""
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'source/hero/infinity-hero.png'
OUT = ROOT / 'assets/hero'
QC = ROOT / 'source/hero/qc'

# ---------------------------------------------------------------- measured geometry (source pixels)

# hub centre, blade tips (up, left, right), hub cap outline, tower, tower reference rows
TURBINES = {
    'a': dict(
        hub=(296, 147),
        tips=[(304, 13), (174, 232), (418, 216)],
        cap=[(271, 138), (276, 129), (290, 125), (305, 124), (316, 129), (320, 140), (318, 150), (312, 156),
             (311, 168), (290, 168), (288, 158), (279, 153), (271, 147)],
        tower=(285.5, 304.5, 150, 330),
        ref=(186, 198),
        neck=(285, 150, 305, 177),  # yoke under the hub: static unless in a blade's core
        speed=0.86,
        phase=0.0,
    ),
    'b': dict(
        hub=(716, 233),
        tips=[(686, 125), (648, 288), (823, 285)],
        cap=[(693, 232), (696, 222), (707, 217), (722, 216), (731, 219), (734, 227), (732, 236), (728, 242),
             (725, 252), (709, 252), (706, 246), (698, 241)],
        tower=(707.5, 722.5, 238, 380),
        ref=(258, 268),
        neck=(707, 237, 723, 259),  # yoke under the hub: static unless in a blade's core
        speed=0.94,
        phase=1.7,
    ),
    'c': dict(
        hub=(876, 307),
        tips=[(901, 215), (796, 340), (940, 379)],
        cap=[(856, 302), (860, 294), (872, 291), (884, 292), (889, 299), (888, 306), (884, 311), (882, 321),
             (866, 321), (863, 316), (857, 310)],
        tower=(867.5, 879.5, 312, 440),
        ref=(328, 338),
        neck=(867, 311, 880, 327),  # yoke under the hub: static unless in a blade's core
        speed=1.0,
        phase=3.1,
    ),
}
# rotor in front of (True) or behind (False) the factory; trees always in front of a and b
BEHIND_FACTORY = {'a': True, 'b': False, 'c': False}

# blade tips that covered another object: rebuilt by copying the same object's
# edge from a clean spot next to it (box in source pixels, source offset)
REBUILD = [
    dict(box=(630, 276, 672, 300), shift=(16, 3), line=(632, 286, 0.19), turbine='b'),  # factory roof, b's left tip
    dict(box=(784, 330, 808, 352), shift=(-5, 1)),  # tree crown under c's left tip
]

# chimney mouths: centre of the opening and its half width
CHIMNEYS = [dict(x=498.0, y=103.0, r=24.0), dict(x=583.0, y=145.0, r=21.0)]

# ground lines the trees stand on: (x, y) polylines, left hill, right hill, flower bed
GROUND = {
    'left': [(110, 535), (180, 515), (225, 432), (300, 396), (450, 386), (600, 386), (700, 402), (765, 421),
             (850, 462), (930, 525), (1000, 560)],
    'right': [(990, 448), (1015, 441), (1100, 411), (1300, 405), (1450, 402), (1550, 416), (1620, 452),
              (1690, 525)],
    'bed': [(1000, 760), (1100, 790), (1300, 800), (1500, 790), (1620, 765)],
}


def hsv(rgb):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    d = mx - mn + 1e-6
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    return h, d / (mx + 1e-6), mx


def polygon_mask(shape, pts, ss=4):
    """Antialiased polygon coverage in [0, 1]."""
    h, w = shape
    img = Image.new('L', (w * ss, h * ss), 0)
    ImageDraw.Draw(img).polygon([(x * ss, y * ss) for x, y in pts], fill=255)
    return np.asarray(img.resize((w, h), Image.BOX), np.float32) / 255


def blur(a, r):
    return cv2.GaussianBlur(a, (0, 0), r) if r > 0 else a


def clean_matte(src):
    """Removes what is left of the picture's old background, nothing else.

    - faint veil: pixels with alpha <= 8 that have nothing solid within 2 px
    - specks: tiny islands of low alpha in the empty sky
    - see-through bodies: solid interiors stored at alpha ~240-252 become 255
    - light fringes: edge pixels of dark objects that still carry the old
      light-blue sky are given the colour of the object next to them (alpha kept)
    """
    out = src.copy()
    a = out[..., 3] / 255
    rgb = out[..., :3] / 255
    report = {}

    amax = cv2.dilate(a, np.ones((5, 5), np.uint8))
    veil = (a > 0) & (a <= 8 / 255) & (amax <= 24 / 255)
    a[veil] = 0
    report['veil'] = int(veil.sum())

    islands = ((a > 0) & (a < 0.35)).astype(np.uint8)
    n, lab, stats, _ = cv2.connectedComponentsWithStats((a > 0).astype(np.uint8), connectivity=8)
    small = np.zeros_like(islands, bool)
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] <= 12:
            comp = lab == i
            if a[comp].max() < 0.35:
                small |= comp
    a[small] = 0
    report['specks'] = int(small.sum())

    amin = cv2.erode(a, np.ones((3, 3), np.uint8))
    interior = (a >= 236 / 255) & (amin >= 228 / 255) & (a < 1)
    a[interior] = 1
    report['interior'] = int(interior.sum())

    solid = (a >= 0.97).astype(np.float32)
    num = cv2.GaussianBlur(rgb * solid[..., None], (0, 0), 1.6)
    den = cv2.GaussianBlur(solid, (0, 0), 1.6)
    fill = num / np.maximum(den, 1e-4)[..., None]
    lum = lambda c: c[..., 0] * 0.299 + c[..., 1] * 0.587 + c[..., 2] * 0.114
    edge = (a > 0.02) & (a < 0.97) & (den > 0.08)
    cool_p = rgb[..., 2] - rgb[..., 0]
    cool_f = fill[..., 2] - fill[..., 0]
    fringe = edge & (lum(rgb) > lum(fill) + 0.04) & (cool_p > cool_f + 0.04)
    rgb[fringe] = fill[fringe]
    report['fringe'] = int(fringe.sum())

    out[..., :3] = rgb * 255
    out[..., 3] = a * 255
    out[out[..., 3] == 0] = 0
    return out, report


def extend_roots(layer, blades, t, cap, xx, yy, opaque):
    """Continues each blade inward under the hub cap with its own cross-section.

    In the picture the cap hides where the blades meet the hub. Once a blade
    turns to where the cap is narrower, that hidden root would show as a gap,
    so each blade is extended to the hub centre by repeating the section just
    outside the cap. All of it lies under the cap in the first frame.
    """
    hub = np.array(t['hub'], np.float32)
    px, py = xx - hub[0], yy - hub[1]
    best = np.full(cap.shape, np.inf, np.float32)
    fill = np.zeros_like(layer)
    for tip in t['tips']:
        d = np.array(tip, np.float32) - hub
        length = float(np.hypot(*d))
        u = d / length
        v = np.array([-u[1], u[0]], np.float32)
        along = px * u[0] + py * u[1]
        across = px * v[0] + py * v[1]
        # first point along the axis that is blade and outside the cap
        start = None
        for r in np.arange(4, length * 0.5, 0.5):
            x, y = hub + u * r
            xi, yi = int(round(x)), int(round(y))
            if blades[yi, xi] and cap[yi, xi] < 0.5:
                start = r + 2.0
                break
        if start is None:
            continue
        # cross-section a little outside the cap: the median of ten sections, so dark
        # hardware or the cap's outline never gets repeated
        offsets = np.arange(-22, 22.5, 0.5)
        sections = []
        for r in np.arange(start + 3, start + 13, 1.0):
            pts = hub[None, :] + u[None, :] * r + v[None, :] * offsets[:, None]
            sections.append([bilinear(layer, x, y) for x, y in pts])
        sec = np.median(np.array(sections), axis=0)
        inside = sec[:, 3] > 8
        if not inside.any():
            continue
        half = float(np.abs(offsets[inside]).max())
        # under the cap, but never where the cap's soft edge showed sky behind it
        zone = (along > -2) & (along < start) & (np.abs(across) <= half + 0.5) & (cap > 0.02)
        zone &= opaque > 0.98
        score = np.abs(across) / max(half, 1)
        take = zone & (score < best)
        best = np.where(take, score, best)
        ys, xs = np.where(take)
        idx = np.clip(np.round((across[ys, xs] + 22) / 0.5).astype(int), 0, len(offsets) - 1)
        fill[ys, xs] = sec[idx]
    put = np.isfinite(best) & (layer[..., 3] < 1)  # only where the picture had no blade pixel
    layer[put] = fill[put]
    return put


def bilinear(img, x, y):
    x0, y0 = int(np.floor(x)), int(np.floor(y))
    fx, fy = x - x0, y - y0
    a = img[y0, x0] * (1 - fx) + img[y0, x0 + 1] * fx
    b = img[y0 + 1, x0] * (1 - fx) + img[y0 + 1, x0 + 1] * fx
    return a * (1 - fy) + b * fy


def fit_rotor(hub, tips):
    """Affine image of the rotor plane: tip_k = hub + M (cos a_k, sin a_k), a_k 120 degrees apart.

    y points down, so increasing angles turn clockwise on screen; the tips
    are given up, left, right, which in that order are -90, 150 and 30 degrees.
    """
    angles = np.radians([-90, 150, 30])
    u = np.stack([np.cos(angles), np.sin(angles)])  # 2x3
    v = (np.array(tips, np.float64) - np.array(hub, np.float64)).T  # 2x3
    m = v @ u.T @ np.linalg.inv(u @ u.T)
    res = np.linalg.norm(m @ u - v, axis=0)
    return m, res


def main():
    QC.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    original = np.asarray(Image.open(SRC).convert('RGBA')).astype(np.float32)
    src, report = clean_matte(original)
    print('matte cleanup (pixels):', report)
    H, W = src.shape[:2]
    rgb, alpha = src[..., :3] / 255, src[..., 3] / 255
    hue, sat, val = hsv(rgb)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)

    veg = (alpha > 0.3) & (hue > 55) & (hue < 170) & (sat > 0.22) & (val > 0.08)
    flowers = (alpha > 0.3) & (hue > 285) & (sat > 0.2) & (val > 0.35)
    near_veg = cv2.dilate(veg.astype(np.uint8), np.ones((9, 9), np.uint8)) > 0
    plants = veg | (flowers & near_veg)
    orange = (hue < 40) & (sat > 0.3) & (val > 0.35)  # blade tips, including their soft edge over a tree or roof
    plantish = (hue > 46) & (hue < 175) & (sat > 0.3)

    base = src.copy()
    stray_blades = {tid: np.zeros((H, W), bool) for tid in TURBINES}
    blade_masks = {}
    opaque_tip = np.zeros((H, W), bool)
    tip_override = np.zeros((H, W, 4), np.float32)
    root_fill = {}
    blade_all = np.zeros((H, W), bool)
    occluder = np.zeros((H, W), np.float32)
    scene = {'width': W, 'height': H, 'turbines': [], 'chimneys': CHIMNEYS}
    caps = {}

    for tid, t in TURBINES.items():
        hub = np.array(t['hub'], np.float32)
        m, res = fit_rotor(t['hub'], t['tips'])
        minv = np.linalg.inv(m)
        # rotor-plane radius of every pixel (1 = blade tip)
        px, py = xx - hub[0], yy - hub[1]
        rr = np.hypot(minv[0, 0] * px + minv[0, 1] * py, minv[1, 0] * px + minv[1, 1] * py)
        sweep = rr < 1.12

        cap = polygon_mask((H, W), t['cap'])
        x0, x1, ty0, ty1 = t['tower']
        tower = (xx >= x0) & (xx <= x1) & (yy >= ty0) & (yy <= ty1)
        ref = np.median(src[t['ref'][0]:t['ref'][1], :, :], axis=0)  # per column

        blades = np.zeros((H, W), bool)
        for tip in t['tips']:
            d = np.array(tip, np.float32) - hub
            length = float(np.hypot(*d))
            u = d / length
            s = (px * u[0] + py * u[1]) / length
            n = np.abs(-px * u[1] + py * u[0])
            wide = np.interp(s, [0, 0.3, 1.0], [20, 17, 10])
            narrow = np.interp(s, [0, 0.3, 1.0], [9, 8, 5])
            inside = (s > 0.04) & (s < 1.06) & (n < wide) & (alpha > 0) & (cap < 0.5)
            # over the tower: blade where the colour differs from the clean tower below
            diff = np.abs(src[..., :3] - ref[None, :, :3]).max(axis=2)
            on_tower = tower & inside
            blade_on_tower = on_tower & (diff > 22) & (n < narrow + 2) & (alpha > 0.9)
            # over plants or the factory roof: only the narrow core, and plant colours never
            sky_context = inside & ~tower
            blade = (sky_context & ~plants) | blade_on_tower
            # towards the tip a blade is white or orange; a yellow or green pixel there is a tree behind it
            blade &= ~(plantish & (s > 0.55))
            blade &= ~((s > 0.85) & (hue > 46) & (hue < 175) & (sat > 0.22))
            blade &= ~((s > 0.8) & (hue > 40) & (hue < 175) & (sat > 0.5))
            # under the hub only the blade's own core turns; the rest is the static yoke and tower top
            nx0, ny0, nx1, ny1 = t['neck']
            neck = (xx >= nx0) & (xx <= nx1) & (yy >= ny0) & (yy <= ny1)
            blade &= ~(neck & (n > narrow))
            # factory roof under b's left tip: below the roof line only the orange tip is blade
            roof_line = 286 + 0.19 * (xx - 632)
            in_roof = (xx > 630) & (xx < 672)
            tip_orange = (hue < 30) & (sat > 0.45)
            blade &= ~(in_roof & (yy > roof_line - 0.5) & ~tip_orange)
            # the roof's own soft top edge (faint, just above the line) is roof, not blade
            blade &= ~(in_roof & (yy > roof_line - 3) & ~orange & ((alpha < 0.85) | (n > narrow)))
            blades |= blade
            # tower pixels behind the blade (only those that stayed blade after the rules above)
            behind = blade & tower
            base[behind] = np.broadcast_to(ref[None, :, :], src.shape)[behind]
        blades_d = cv2.dilate(blades.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
        # the antialiased edge ring belongs to the blade as long as it is sky around
        nx0, ny0, nx1, ny1 = t['neck']
        neck = (xx >= nx0) & (xx <= nx1) & (yy >= ny0) & (yy <= ny1)
        roof_zone = (xx > 630) & (xx < 672) & (yy > 286 + 0.19 * (xx - 632) - 3)
        blades |= blades_d & (alpha < 0.98) & ~tower & ~plants & (cap < 0.5) & ~neck & ~roof_zone
        # small leftovers of the blade roots (isolated specks in the sweep) belong to the blades too
        left = ((base[..., 3] > 0) & sweep & ~blades & ~tower & (cap <= 0) & ~neck & ~roof_zone).astype(np.uint8)
        n, lab, stats, _ = cv2.connectedComponentsWithStats(left, connectivity=8)
        for i in range(1, n):
            if stats[i, cv2.CC_STAT_AREA] < 14:
                speck = lab == i
                blades |= speck
                base[speck] = 0
        blade_all |= blades

        # what was behind the blade: the tower (done above), sky, or (REBUILD) a roof or crown edge
        base[blades & ~tower] = 0

        # objects in front of this rotor (its own tower, cap and blades excluded)
        mine = tower | (cap > 0) | blades
        front = (alpha > 0) & ~mine & sweep
        if not BEHIND_FACTORY[tid]:
            front &= plants
        occluder = np.maximum(occluder, np.where(front, alpha, 0))

        # blade layer (saved after the rebuild below) and cap layer, cropped to the sweep
        ys, xs = np.where(sweep)
        bx0, by0, bx1, by1 = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
        blade_masks[tid] = (blades, (bx0, by0, bx1, by1))
        cys, cxs = np.where(cap > 0)
        cx0, cy0, cx1, cy1 = int(cxs.min()), int(cys.min()), int(cxs.max()) + 1, int(cys.max()) + 1
        caps[tid] = (cap, (cx0, cy0, cx1, cy1))
        scene['turbines'].append({
            'id': tid,
            'hub': [float(hub[0]), float(hub[1])],
            'm': [[float(m[0, 0]), float(m[0, 1])], [float(m[1, 0]), float(m[1, 1])]],
            'blades': [bx0, by0, bx1 - bx0, by1 - by0],
            'cap': [cx0, cy0, cx1 - cx0, cy1 - cy0],
            'speed': t['speed'],
            'phase': t['phase'],
            'occluded': tid != 'c',
        })
        print(f'turbine {tid}: blade px {int(blades.sum())}, fit residual {np.round(res, 1)} px, '
              f'det {np.linalg.det(m):.0f}')

    # rebuild objects behind blade pixels (factory roof edge, tree crown)
    rebuilt = 0
    for z in REBUILD:
        x0, y0, x1, y1 = z['box']
        sx, sy = z['shift']
        zone = np.zeros((H, W), bool)
        zone[y0:y1, x0:x1] = True
        # only blade pixels touching the object, and only copied where the source is that object
        obj = (alpha > 0.9) & ~blade_all
        near = cv2.dilate(obj.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)
        covered = zone & blade_all & near & (alpha > 0.6)
        if 'line' in z:
            lx, ly, k = z['line']
            covered &= yy > ly + k * (xx - lx) - 0.5  # on the roof, not the sky above it
        ys, xs = np.where(covered)
        ok = obj[ys + sy, xs + sx]
        ys, xs = ys[ok], xs[ok]
        behind = src[ys + sy, xs + sx]
        a_o = alpha[ys, xs]
        # where the picture's pixel is itself part-transparent (tip, crown edge and sky mixed),
        # split it: some crown stays behind, the rest is blade, and together they give the
        # source pixel back exactly
        a_t = np.where(a_o < 0.98, 0.6 * np.minimum(behind[:, 3] / 255, a_o), behind[:, 3] / 255)
        a_b = np.where(a_o < 0.98, (a_o - a_t) / np.maximum(1 - a_t, 1e-3), 1.0)
        p_o = src[ys, xs, :3] * a_o[:, None]
        p_t = behind[:, :3] * a_t[:, None]
        c_b = np.clip((p_o - p_t * (1 - a_b)[:, None]) / np.maximum(a_b, 1e-3)[:, None], 0, 255)
        base[ys, xs, :3] = behind[:, :3]
        base[ys, xs, 3] = a_t * 255
        tip_override[ys, xs, :3] = c_b
        tip_override[ys, xs, 3] = a_b * 255
        opaque_tip[ys, xs] = True
        rebuilt += len(ys)
        if 'line' in z:
            # faint blade edge left above the roof line goes with the blade
            lx, ly, k = z['line']
            stray = zone & (yy < ly + k * (xx - lx) - 0.7) & (base[..., 3] > 0) & ~blade_all
            stray_blades[z['turbine']] |= stray
            base[stray] = 0
    print('rebuilt pixels behind blade tips:', rebuilt)

    for tid, (blades, (bx0, by0, bx1, by1)) in blade_masks.items():
        blades = blades | stray_blades[tid]
        # a few detached pixels by the hub are hub or tower, not blade: they stay put
        hub = np.array(TURBINES[tid]['hub'], np.float32)
        n, lab, stats, cent = cv2.connectedComponentsWithStats(blades.astype(np.uint8), connectivity=8)
        biggest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA])) if n > 1 else 0
        for i in range(1, n):
            if i != biggest and stats[i, cv2.CC_STAT_AREA] < 40 and np.hypot(*(cent[i] - hub)) < 45:
                comp = lab == i
                blades &= ~comp
                base[comp] = src[comp]
        blade_masks[tid] = (blades, (bx0, by0, bx1, by1))
        layer = np.zeros_like(src)
        layer[blades] = src[blades]
        layer[blades & opaque_tip] = tip_override[blades & opaque_tip]
        root_fill[tid] = extend_roots(layer, blades, TURBINES[tid], caps[tid][0], xx, yy, base[..., 3] / 255)
        # nothing may float free of the rotor: drop small islands by the hub
        n, lab, stats, cent = cv2.connectedComponentsWithStats((layer[..., 3] > 0).astype(np.uint8), connectivity=8)
        biggest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA])) if n > 1 else 0
        for i in range(1, n):
            if i != biggest and stats[i, cv2.CC_STAT_AREA] < 40 and np.hypot(*(cent[i] - hub)) < 45:
                comp = lab == i
                layer[comp] = 0
                root_fill[tid] &= ~comp
                was_blade = comp & blades
                base[was_blade] = src[was_blade]
                blades &= ~comp
        blade_masks[tid] = (blades, (bx0, by0, bx1, by1))
        Image.fromarray(layer[by0:by1, bx0:bx1].astype(np.uint8)).save(OUT / f'blades-{tid}.webp', lossless=True,
                                                                       quality=100, method=6)

    for tid, (blades, (bx0, by0, bx1, by1)) in blade_masks.items():
        blades = blades | stray_blades[tid]
        layer = np.zeros_like(src)
        layer[blades] = src[blades]
        layer[blades & opaque_tip] = tip_override[blades & opaque_tip]
        root_fill[tid] = extend_roots(layer, blades, TURBINES[tid], caps[tid][0], xx, yy, alpha)
        Image.fromarray(layer[by0:by1, bx0:bx1].astype(np.uint8)).save(OUT / f'blades-{tid}.webp', lossless=True,
                                                                       quality=100, method=6)

    # cap layers come from the base (hub and nacelle are not blades)
    for tid, (cap, (cx0, cy0, cx1, cy1)) in caps.items():
        layer = base.copy()
        layer[..., 3] *= cap
        layer[..., :3] *= (cap > 0)[..., None]
        Image.fromarray(layer[cy0:cy1, cx0:cx1].astype(np.uint8)).save(OUT / f'caps-{tid}.webp', lossless=True,
                                                                     quality=100, method=6)

    # cap layers come from the base (hub and nacelle are not blades). Where a blade root
    # runs on under the cap, the cap's soft edge is made solid there, showing the picture's
    # own pixel, so the first frame is unchanged and no seam opens as the blade turns
    for tid, (cap, (cx0, cy0, cx1, cy1)) in caps.items():
        layer = base.copy()
        cover = np.where(root_fill[tid] & (cap > 0.02), 1.0, cap)
        # where the picture's pixel went to the blade layer whole, the cap adds nothing on top
        cover = np.where((blade_masks[tid][0] | stray_blades[tid]) & (cap < 0.5), 0.0, cover)
        layer[..., 3] *= cover
        layer[..., :3] *= (cover > 0)[..., None]
        Image.fromarray(layer[cy0:cy1, cx0:cx1].astype(np.uint8)).save(OUT / f'caps-{tid}.webp', lossless=True,
                                                                     quality=100, method=6)
        # the base keeps only what the cap does not already draw: cap over base = the picture
        a_o = base[..., 3] / 255
        keep = (cover > 0) & (a_o > 0)
        a_r = a_o * (1 - cover) / np.maximum(1 - a_o * cover, 1e-6)
        base[keep, 3] = (a_r * 255)[keep]

    # ---------------------------------------------------------------- plant motion weights
    # everything visible that is not a plant is locked, down to the thinnest wire
    protect = ((alpha > 0.02) & ~plants & ~blade_all).astype(np.float32)
    protect_near = cv2.dilate(protect, np.ones((5, 5), np.uint8))
    # a wide, soft hand-over next to locked pixels: no visible stretching where a crown meets a wall
    protect_soft = np.clip(blur(cv2.dilate(protect, np.ones((3, 3), np.uint8)), 2.2) * 1.5, 0, 1)
    plants_f = plants.astype(np.float32)
    # weights reach a few pixels into empty sky (never next to a locked pixel) so crowns can move into it
    reach = cv2.dilate(plants_f, np.ones((7, 7), np.uint8)) * (alpha < 0.02) * (1 - protect_near)
    area = np.clip(blur(np.maximum(plants_f, reach * 0.9), 1.0), 0, 1) * (1 - protect_soft)

    def ground_at(name):
        pts = np.array(GROUND[name], np.float32)
        return np.interp(xx[0], pts[:, 0], pts[:, 1], left=np.nan, right=np.nan)

    gl, gr, gb = ground_at('left'), ground_at('right'), ground_at('bed')
    ground = np.where(np.isnan(gl), np.inf, gl)[None, :].repeat(H, 0)
    upper = np.where(np.isnan(gr), np.inf, gr)[None, :].repeat(H, 0)
    lower = np.where(np.isnan(gb), np.inf, gb)[None, :].repeat(H, 0)
    ground = np.where(np.isfinite(upper) & (yy < upper + 40), upper, ground)
    ground = np.where(np.isfinite(lower) & (yy > 560), lower, ground)
    height = np.where(np.isfinite(ground), ground - yy, 0)
    sway = np.clip(height / 110.0, 0, 1) ** 1.25 * area
    flutter = area * np.where(height > 0, 1.0, 0.55)  # grass and slope bushes flutter less

    masks = np.stack([sway, flutter, occluder], axis=2)
    masks = np.clip(masks * 255 + 0.5, 0, 255).astype(np.uint8)
    Image.fromarray(masks).resize((W // 2, H // 2), Image.BOX).save(OUT / 'masks.png', optimize=True)

    # ---------------------------------------------------------------- base and checks
    Image.fromarray(base.astype(np.uint8)).save(OUT / 'base.webp', lossless=True, quality=100, method=6)

    # base + blades must give back the source exactly
    comp = base.copy()
    for t in scene['turbines']:
        bx, by, bw, bh = t['blades']
        layer = np.asarray(Image.open(OUT / f'blades-{t["id"]}.webp').convert('RGBA')).astype(np.float32)
        region = comp[by:by + bh, bx:bx + bw]
        a = layer[..., 3:4] / 255
        out_a = a + region[..., 3:4] / 255 * (1 - a)
        out_rgb = (layer[..., :3] * a + region[..., :3] * region[..., 3:4] / 255 * (1 - a)) / np.maximum(out_a, 1e-6)
        comp[by:by + bh, bx:bx + bw] = np.concatenate([out_rgb, out_a * 255], axis=2)
    for t in scene['turbines']:
        cx, cy, cw, ch = t['cap']
        layer = np.asarray(Image.open(OUT / f'caps-{t["id"]}.webp').convert('RGBA')).astype(np.float32)
        region = comp[cy:cy + ch, cx:cx + cw]
        a = layer[..., 3:4] / 255
        out_a = a + region[..., 3:4] / 255 * (1 - a)
        out_rgb = (layer[..., :3] * a + region[..., :3] * region[..., 3:4] / 255 * (1 - a)) / np.maximum(out_a, 1e-6)
        comp[cy:cy + ch, cx:cx + cw] = np.concatenate([out_rgb, out_a * 255], axis=2)
    vis = comp[..., 3] > 4
    err = np.abs(comp - src)  # src is the cleaned picture
    err[..., :3] *= (src[..., 3:4] / 255)  # colour of nearly transparent pixels does not show
    print(f'recomposition error: max {err[vis].max():.2f}, mean {err[vis].mean():.4f} (0-255)')

    (OUT / 'scene.json').write_text(json.dumps(scene, indent=1))

    # QC sheets
    sky = np.array([200, 222, 245, 255], np.float32)

    def over(img):
        a = img[..., 3:4] / 255
        return (img[..., :3] * a + sky[:3] * (1 - a)).astype(np.uint8)

    Image.fromarray(over(base)).save(QC / 'base-on-sky.png')
    for name, img in (('original', original), ('clean', src)):
        for bg_name, col in (('dark', (10, 20, 48)), ('light', (200, 222, 245))):
            a_ = img[..., 3:4] / 255
            Image.fromarray((img[..., :3] * a_ + np.array(col) * (1 - a_)).astype(np.uint8)).save(
                QC / f'{name}-{bg_name}.png')
    tint = over(src).astype(np.float32)
    tint[..., 0] = np.clip(tint[..., 0] + sway * 150, 0, 255)
    tint[..., 1] = np.clip(tint[..., 1] + flutter * 90, 0, 255)
    tint[..., 2] = np.clip(tint[..., 2] + occluder * 150, 0, 255)
    Image.fromarray(tint.astype(np.uint8)).save(QC / 'weights.png')
    print('wrote', ', '.join(sorted(p.name for p in OUT.iterdir())))


if __name__ == '__main__':
    main()
