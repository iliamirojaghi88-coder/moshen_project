"""Cut the client's upright SimLand renders (black background, white / coloured glow behind the conductors) out of
their background, for the catalogue pages:
  - «کابل کنترل افشان» (control-flexible-cable: no shield) and «کابل کنترل افشان شیلددار» (braid + foil);
  - «کابل آلومینیومی چند رشته» and «کابل آلومینیومی تک رشته» (the client's upright renders, *-upright-original.png;
    they replace the earlier diagonal renders, kept as *-original.png with tools/cutout-aluminum.py).
Every render already stands upright and every sheath ends inside the frame with its own elliptical outline, so
nothing is rotated, painted or continued: only the outline is drawn. Colours are the render's own pixels.

1. Cores, conductor ends, filler / foil / braid: IS-Net general-use (as tools/cutout-model.py; ONNX in
   ~/.cache/simland-models/). The model reads white cores in front of the white glow as half transparent; they
   are solid, so its alpha is stretched (STRETCH). Only the main shape is kept (no glow specks). In the control
   cables every gap inside the bundle shows the cores behind (as in the render): enclosed gaps below the copper
   ends are filled, and from bundle_from down each row is solid between its outermost cores.
2. A single sheath (control, multi-core) is black on a dark background, where the model's outline is soft: two
   straight sides fitted to the model's 50 % edge, and the render's own elliptical end (the lowest strong
   luminance step per column, fitted with an ellipse).
3. The three single-core cables are black on black, invisible to the model: each sheath is a cylinder measured
   on a gamma-0.35 copy of the render (sides, the top rim's ellipse, the end's), back to front; the conductors
   from the model, kept inside the sheaths' width and above the last rim.
4. Edge pixels (alpha < 1) take the colour of the nearest solid pixel, so no glow colour stays as a fringe.

    python3 -I tools/cutout-upright.py      (then python3 -I tools/build-cutouts.py, node tools/build-pages.mjs)
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
STRETCH = (0.3, 0.6)
SS = 4
# rows (render px): gaps filled below holes_from, the bundle solid from bundle_from, only the sheath left from
# sheath_from (below its top rim); fit: the rows used to fit the sheath's two sides
JOBS = {
    'control-flexible-cable': dict(holes_from=260, bundle_from=320, sheath_from=740, fit=(800, 1420)),
    'control-flexible-shielded-cable': dict(holes_from=260, bundle_from=320, sheath_from=880, fit=(900, 1420)),
    'aluminum-multi-core-cable': dict(src='upright-original', holes_from=200, bundle_from=0, sheath_from=760, fit=(800, 1400)),
    # three single-core cables, black on black (the model cannot see them, not even on a lifted copy): each sheath
    # is a cylinder measured on the render (luminance steps of a gamma-0.35 copy): sides L/R, the top rim's
    # ellipse (centre row, half height) and the end's; back to front. The conductors come from the model.
    'aluminum-single-core-cable': dict(src='upright-original', cylinders=[
        dict(L=275, R=515, top=479.5, top_hb=35.5, end=1432, end_hb=58),
        dict(L=550, R=744, top=557, top_hb=47, end=1443, end_hb=47),
        dict(L=321, R=582, top=899, top_hb=54, end=1461, end_hb=63),
    ]),
}


def cylinders(cyls, shape):
    """Coverage of upright cylinders: straight sides, the top rim's full ellipse, the end's lower half."""
    h, w = shape
    ys = np.arange(h, dtype=np.float64)[:, None]
    xx = np.arange(w, dtype=np.float64)[None, :]
    out = np.zeros(shape, np.float32)
    for c in cyls:
        xc, ha = (c['L'] + c['R']) / 2, (c['R'] - c['L']) / 2
        s = np.sqrt(np.clip(1 - ((xx - xc) / ha) ** 2, 0, 1))
        side = np.minimum(xx - c['L'], c['R'] - xx)
        side = np.broadcast_to(side, shape)
        d = np.minimum.reduce([side, ys - (c['top'] - c['top_hb'] * s), (c['end'] + c['end_hb'] * s) - ys])
        out = np.maximum(out, np.clip(d + 0.5, 0, 1))
    return out


def side_lines(a, y0, y1):
    """Left and right sides x(y) of the sheath: lines through the model's 50 % crossing in each row."""
    ys, ls, rs = [], [], []
    for y in range(y0, y1, 4):
        row = a[y]
        xs = np.nonzero(row > 0.5)[0]
        if len(xs) < 50:
            continue
        xl, xr = xs.min(), xs.max()
        # sub-pixel crossings
        fl = xl - (row[xl] - 0.5) / max(row[xl] - row[xl - 1], 1e-3)
        fr = xr + (row[xr] - 0.5) / max(row[xr] - row[xr + 1], 1e-3)
        ys.append(y), ls.append(fl), rs.append(fr)
    ys = np.array(ys, float)
    pl, pr = np.polyfit(ys, ls, 1), np.polyfit(ys, rs, 1)
    return (lambda y: np.polyval(pl, y)), (lambda y: np.polyval(pr, y))


def end_ellipse(lum, L, R, y_end_search):
    """The render's own end of the sheath: per column, the lowest strong vertical luminance step; fitted with
    y = yc + hb * sqrt(1 - ((x - xc) / ha)^2)."""
    sm = cv2.GaussianBlur(lum, (0, 0), 1.5)
    gy = np.abs(np.diff(sm, axis=0))
    y0 = y_end_search
    xc, ha = (L + R) / 2, (R - L) / 2
    xs, yb = [], []
    for x in range(int(L + 0.15 * (R - L)), int(R - 0.15 * (R - L))):
        g = gy[y0:, x]
        y = y0 + int(np.argmax(g))
        xs.append(x), yb.append(y + 0.5)
    xs, yb = np.array(xs, float), np.array(yb, float)
    s = np.sqrt(np.clip(1 - ((xs - xc) / ha) ** 2, 0, 1))
    A = np.stack([np.ones_like(s), s], 1)
    (yc, hb), *_ = np.linalg.lstsq(A, yb, rcond=None)
    res = yb - A @ np.array([yc, hb])
    keep = np.abs(res) < 3 * np.median(np.abs(res)) + 1  # leave out the odd column the step search misread
    (yc, hb), *_ = np.linalg.lstsq(A[keep], yb[keep], rcond=None)
    return xc, ha, yc, hb


def model_shape(im, job):
    """The model's outline, stretched (solid cores), main shape only."""
    rgb = np.asarray(im).astype(np.float32)
    a = model_alpha(im)
    if 'cylinders' in job:
        lifted = Image.fromarray((np.power(rgb / 255, 0.45) * 255 + 0.5).astype(np.uint8))
        a = np.maximum(a, model_alpha(lifted))  # the model sees the dark conductor ends better
    lo, hi = STRETCH
    au = np.clip((a - lo) / (hi - lo), 0, 1)
    n, lab, st, _ = cv2.connectedComponentsWithStats((au > 0.5).astype(np.uint8), 8)
    main = lab == 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])
    au[cv2.dilate(main.astype(np.uint8), np.ones((5, 5), np.uint8)) == 0] = 0
    return a, au


def sheath_job(job, a, au, lum):
    """One cable: the model's cores (gaps in the bundle filled) over a geometric sheath."""
    h, w = a.shape
    # inside the bundle every gap shows the cores behind (the render: no glow between the insulated cores), but
    # the model cuts some out: enclosed gaps below the conductor ends are filled, and from bundle_from down each
    # row is solid between its outermost cores (the model's own soft edge kept outside them)
    bg = (au <= 0.5).astype(np.uint8)
    n, lab, st, cen = cv2.connectedComponentsWithStats(bg, 4)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])))
    for i in range(1, n):
        if i not in border and cen[i, 1] > job['holes_from']:
            au[lab == i] = 1.0
    for y in range(job['bundle_from'] or job['sheath_from'], job['sheath_from']):
        xs = np.nonzero(au[y] > 0.5)[0]
        if len(xs):
            au[y, xs.min():xs.max() + 1] = 1.0
    # the sheath: straight sides + its own elliptical end
    Lf, Rf = side_lines(a, *job['fit'])
    ys = np.arange(h, dtype=np.float64)[:, None]
    xx = np.arange(w, dtype=np.float64)[None, :]
    Lr, Rr = Lf(ys), Rf(ys)
    yb = h - 1 - 140
    xc, ha, yc, hb = end_ellipse(lum, float(Lf(yb)), float(Rf(yb)), h - 140)
    print(f'  sides {Lf(1000):.1f}..{Rf(1000):.1f}, end yc {yc:.1f} hb {hb:.1f} (ratio {hb / ha:.2f})')
    endy = yc + hb * np.sqrt(np.clip(1 - ((xx - xc) / ha) ** 2, 0, 1))
    side = np.minimum(xx - Lr, Rr - xx)
    sheath = np.clip(np.minimum(side, endy - ys) + 0.5, 0, 1)
    sf = job['sheath_from']
    alpha = au.copy()
    alpha[sf:] = sheath[sf:]
    # just above sheath_from (the rim), never wider than the sheath
    alpha[sf - 60:sf] = np.minimum(alpha[sf - 60:sf], np.clip(side[sf - 60:sf] + 1.5, 0, 1))
    return alpha


def cylinders_job(job, au):
    """Several single-core cables: the model's conductors over the measured sheaths."""
    body = cylinders(job['cylinders'], au.shape)
    au = au.copy()
    au[:, body.max(0) <= 0] = 0  # the conductors stand inside their sheaths' width: glow outside goes
    au[int(max(c['top'] for c in job['cylinders'])):] = 0  # below the last rim only the sheaths
    return np.maximum(au, body)


def edge_colours(rgb, alpha):
    """Edge pixels (alpha < 1) take the colour of the nearest solid pixel: no glow fringe."""
    solid = (alpha > 0.995).astype(np.uint8)
    _, labels = cv2.distanceTransformWithLabels(1 - solid, cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
    sy, sx = np.nonzero(solid)
    idx = np.zeros(labels.max() + 1, np.int64)
    idx[labels[sy, sx]] = np.arange(len(sy))
    near = idx[labels]
    edge = (alpha > 0) & (alpha < 0.995)
    out = rgb.copy()
    out[edge] = rgb[sy[near[edge]], sx[near[edge]]]
    return out


for name, job in JOBS.items():
    im = Image.open(CAT / f"{name}-{job.get('src', 'original')}.png").convert('RGB')
    rgb = np.asarray(im).astype(np.float32)
    a, au = model_shape(im, job)
    alpha = cylinders_job(job, au) if 'cylinders' in job else sheath_job(job, a, au, rgb.mean(2))
    out = edge_colours(rgb, alpha)
    rgba = np.dstack([np.clip(out + 0.5, 0, 255).astype(np.uint8), (alpha * 255 + 0.5).astype(np.uint8)])
    yy, xs = np.nonzero(rgba[..., 3] > 2)
    rgba = rgba[max(0, yy.min() - 2):yy.max() + 3, max(0, xs.min() - 2):xs.max() + 3]
    Image.fromarray(rgba, 'RGBA').save(CAT / f'{name}.png', optimize=True)
    print(name, rgba.shape[1], 'x', rgba.shape[0])
