"""Cut the two aluminium cable renders (black sheath on a black background with a white/coloured rim glow)
out of their background, and continue the sheath where the render's frame cuts it off.

1. Outline
   - cores, tape and rims: IS-Net general-use (as tools/cutout-model.py; ONNX in ~/.cache/simland-models/),
     run on the render and on two gamma-lifted copies; the blue and red core insulation, which the model reads
     as glow, by colour (strongly saturated, bright).
   - the black sheath is black on black and the glow hugs it all round: its outline is geometric — its edges
     are straight lines, measured on the render where the glow peaks and drops into the sheath (column / row
     luminance profiles, listed in BODIES), 2 px inside.
2. Continuation (no fade, no blur): the render's frame cuts the sheath. Each sheath body is a cylinder along
   its own axis, so in a frame rotated onto that axis every row of the sheath is one line along the cable:
   each row is continued past the frame with the median colour of its own last 24 rendered pixels (bright
   lettering left out), between the body's two measured edges, which keep their own slopes (perspective).
   The end is the cylinder's elliptical outline, the ellipse as flat as the render's own front rim (ELL).
   Rendered pixels are never changed; the continuation only fills what lies outside the original frame.

    python3 -I tools/cutout-aluminum.py
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
model_alpha, solid = _ns['model_alpha'], _ns['solid']
GAMMA = 0.45
SS = 4    # supersampling for polygon edges
PAD = 900  # room for the continuation, right and below
WIN = 24   # rendered pixels per row that give the continued colour


def line(p, q):
    (x0, y0), (x1, y1) = p, q
    k = (y1 - y0) / (x1 - x0)
    return lambda x: y0 + k * (x - x0)


# Sheath outline in the render (1536x1024) and the bodies to continue. Measured edges:
#  multi : top edge (1100,498) (1300,686) (1500,894); bottom edge (648,850) (708,900) (756,950) (816,1000)
#  single: top edge (900,318) (1100,436) (1300,550) (1500,675); the crease between the two sheaths
#          (1100,768) (1200,816) (1300,864) (1400,912) (1500,976); bottom edge (616,900) (736,950)
M_TOP, M_BOT = line((1100, 498), (1500, 894)), line((708, 900), (816, 1000))
S_TOP, S_MID, S_BOT = line((900, 318), (1500, 675)), line((1100, 768), (1500, 976)), line((616, 900), (736, 950))
JOBS = {
    'aluminum-multi-core-cable': {
        'poly': [(1040, 440), (1100, 496), (1300, 684), (1536, 928), (1536, 1024), (840, 1024),
                 (756, 952), (708, 902), (648, 852), (600, 790), (900, 560)],
        'bodies': [dict(top=M_TOP, bot=M_BOT, x0=1000, ell=0.36)],
    },
    'aluminum-single-core-cable': {
        'poly': [(760, 238), (900, 320), (1100, 438), (1300, 552), (1536, 694), (1536, 1024),
                 (912, 1024), (736, 952), (616, 902), (540, 860), (560, 600), (700, 300)],
        # the lower sheath first (reaching 6 px under the crease), the upper one (in front, yellow stripe) over it
        'bodies': [dict(top=lambda x: S_MID(x) - 6, bot=S_BOT, x0=900, ell=0.5), dict(top=S_TOP, bot=S_MID, x0=900, ell=0.5)],
    },
}


def fill_poly(pts, shape):
    h, w = shape
    m = np.zeros((h * SS, w * SS), np.uint8)
    cv2.fillPoly(m, [np.round(np.array(pts, np.float64) * SS).astype(np.int32)], 255)
    return m


def poly_alpha(pts, shape, inset=2):
    m = fill_poly(pts, shape)
    if inset:
        m = cv2.erode(m, np.ones((2 * inset * SS + 1, 2 * inset * SS + 1), np.uint8))
    return cv2.resize(m, (shape[1], shape[0]), interpolation=cv2.INTER_AREA).astype(np.float32) / 255


def sleeves(im):
    """Blue and red core insulation, which the model reads as glow: strongly saturated, bright pixels of those
    hues (the glow around them is far less saturated), closed and cleaned."""
    hsv = cv2.cvtColor(np.asarray(im), cv2.COLOR_RGB2HSV).astype(int)
    hue, sat, val = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    m = ((sat > 190) & (val > 110) & (((hue > 95) & (hue < 135)) | (hue < 8) | (hue > 172))).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    return m.astype(np.float32)


def cutout(im, pts):
    h, w = im.height, im.width
    x = np.asarray(im).astype(np.float32) / 255
    lifted = Image.fromarray((np.power(x, GAMMA) * 255 + 0.5).astype(np.uint8))  # the model sees dark cores better
    deep = Image.fromarray((np.power(x, 2.0) * 255 + 0.5).astype(np.uint8))  # ...and bright conductors
    m = np.maximum.reduce([model_alpha(im), model_alpha(lifted), model_alpha(deep), sleeves(im)])
    body = poly_alpha(pts, (h, w))
    a = np.maximum(solid(np.maximum(m, body), thr=0.5), body)
    sil = (a > 0.5).astype(np.uint8)
    ff = sil.copy()
    cv2.floodFill(ff, np.zeros((h + 2, w + 2), np.uint8), (0, 0), 1)
    a[ff == 0] = 1.0  # closed gaps inside the outline
    return a


def continue_body(rgb, alpha, inframe, b, size):
    """The continuation of one sheath body past the render's frame, on the padded canvas: (rgb, alpha)."""
    H, W = size
    top, bot, x0 = b['top'], b['bot'], b['x0']
    far = W + 400
    region = [(x0, top(x0) + 3), (far, top(far) + 3), (far, bot(far) - 3), (x0 - 200, bot(x0 - 200) - 3)]
    body = poly_alpha([(x0, top(x0)), (far, top(far)), (far, bot(far)), (x0 - 200, bot(x0 - 200))], (H, W), inset=2)
    ang = np.degrees(np.arctan(((top(x0 + 400) - top(x0)) + (bot(x0 + 400) - bot(x0))) / 800))
    R = cv2.getRotationMatrix2D((W / 2, H / 2), ang, 1.0)  # the cable axis horizontal, running to +x
    rot = lambda img, interp=cv2.INTER_LINEAR: cv2.warpAffine(img, R, (W, H), flags=interp, borderValue=0)
    rr = rot(rgb)
    valid = rot(((alpha > 0.5) & inframe & (poly_alpha(region, (H, W), 0) > 0.5)).astype(np.uint8), cv2.INTER_NEAREST) > 0
    rbody = rot(body)
    rows = np.nonzero(valid.any(1))[0]
    last = np.full(H, -1)
    col = np.zeros((H, 3), np.float32)
    for y in rows:
        xs = np.nonzero(valid[y])[0]
        xl = xs.max()
        seg = rr[y, max(0, xl - WIN):xl - 1].astype(np.float32)
        seg = seg[valid[y, max(0, xl - WIN):xl - 1]]
        if len(seg) < 4:
            continue
        lum = seg.max(1)
        keep = lum <= np.median(lum) + 35  # leave out the white lettering
        col[y] = np.median(seg[keep], 0)
        last[y] = xl
    ok = last >= 0
    ys = np.arange(H)
    near = np.interp(ys, ys[ok], ys[ok]).round().astype(int)  # rows the body widens into: nearest rendered row
    idx = np.searchsorted(ys[ok], ys).clip(0, ok.sum() - 1)
    src = ys[ok][idx]
    src2 = ys[ok][(idx - 1).clip(0)]
    src = np.where(np.abs(src2 - ys) < np.abs(src - ys), src2, src)
    col = col[src]
    for c in range(3):
        col[:, c] = cv2.GaussianBlur(col[:, c].reshape(-1, 1), (1, 0), sigmaX=0.1, sigmaY=1.2).ravel()
    lastr = last[src]
    # the end: the cylinder's elliptical outline, just past the furthest rendered row
    on = np.nonzero(rbody.max(1) > 0.5)[0]
    yc, bh = (on.min() + on.max()) / 2, (on.max() - on.min()) / 2
    aa = b['ell'] * bh
    xe = last[ok].max() + aa + 8
    xend = xe + aa * np.sqrt(np.clip(1 - ((ys - yc) / bh) ** 2, 0, 1))
    xx = np.arange(W)[None, :]
    ext = (xx > lastr[:, None] - 2) & (rbody > 0)
    a_ext = rbody * np.clip(xend[:, None] - xx + 0.5, 0, 1) * ext
    c_ext = np.repeat(col[:, None, :], W, 1)
    Ri = cv2.invertAffineTransform(R)
    back = lambda img: cv2.warpAffine(img, Ri, (W, H), flags=cv2.INTER_LINEAR, borderValue=0)
    return back(c_ext.astype(np.float32)), back(a_ext.astype(np.float32))


for name, job in JOBS.items():
    im = Image.open(CAT / f'{name}-original.png').convert('RGB')
    h, w = im.height, im.width
    a = cutout(im, job['poly'])
    H, W = h + PAD, w + PAD
    rgb = np.zeros((H, W, 3), np.float32)
    rgb[:h, :w] = np.asarray(im)
    alpha = np.zeros((H, W), np.float32)
    alpha[:h, :w] = a
    inframe = np.zeros((H, W), bool)
    inframe[:h - 2, :w - 2] = True  # the render's own last 2 px rows/columns are resampled edge pixels
    out_rgb, out_a = rgb.copy(), alpha.copy()
    out_a[~inframe] = 0
    for b in job['bodies']:
        c, e = continue_body(rgb, alpha, inframe, b, (H, W))
        e[inframe] = 0  # rendered pixels stay as rendered
        # over what is already there (the upper sheath in front of the lower one)
        na = e + out_a * (1 - e)
        out_rgb = np.where(na[..., None] > 0, (c * e[..., None] + out_rgb * out_a[..., None] * (1 - e[..., None])) / np.maximum(na, 1e-6)[..., None], out_rgb)
        out_a = na
    # stray bits of the glow the outline took in apart from the cable: everything but the cable itself goes
    n, lab, st, _ = cv2.connectedComponentsWithStats((out_a > 0.03).astype(np.uint8), 8)
    if n > 2:
        out_a[lab != 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])] = 0
    rgba = np.dstack([np.clip(out_rgb + 0.5, 0, 255).astype(np.uint8), (np.clip(out_a, 0, 1) * 255 + 0.5).astype(np.uint8)])
    ys, xs = np.nonzero(rgba[..., 3] > 2)
    rgba = rgba[max(0, ys.min() - 2):ys.max() + 3, max(0, xs.min() - 2):xs.max() + 3]
    Image.fromarray(rgba, 'RGBA').save(CAT / f'{name}.png', optimize=True)
    print(name, rgba.shape[1], 'x', rgba.shape[0])
