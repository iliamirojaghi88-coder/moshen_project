"""Standardise the ten product photos into transparent PNG masters.

For every photo listed in source/mapping.json:
  1. If source/retouch.json lists it, rebuild the bottom end: the cable is
     closed with the same elliptical end (and the same soft bevel and thin rim
     light) that the photos with a natural end already show. Only pixels of the
     photo itself are used; nothing is painted in, the sheath is just ended
     earlier along a true ellipse.
  2. Separate the product from the pure-black studio background (known-
     background matting) and write a trimmed RGBA master to
     source/standardized/<slug>.png.
  3. Write QC sheets (before / after, on black, white and grey) to
     source/standardized/qc/.

The original photos in source/products are never modified.

    python3 tools/standardize-products.py
"""

import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "source" / "products"
OUT = ROOT / "source" / "standardized"
QC = OUT / "qc"

mapping = json.loads((ROOT / "source" / "mapping.json").read_text())["products"]
retouch = json.loads((ROOT / "source" / "retouch.json").read_text())
END_K = retouch["endEllipse"]


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def load(path):
    return np.asarray(Image.open(path).convert("RGB")).astype(np.float32) / 255.0


def sheath_edges(img, y0, y1, thr=6 / 255):
    """Left/right silhouette of the sheath over rows y0..y1 (median, sub-pixel)."""
    mx = img.max(axis=2)
    lefts, rights = [], []
    for y in range(int(y0), int(y1)):
        xs = np.where(mx[y] > thr)[0]
        if len(xs):
            lefts.append(xs[0])
            rights.append(xs[-1])
    return float(np.median(lefts)) - 0.5, float(np.median(rights)) + 0.5


def rebuild_end(img, rim_y, length):
    """Close the cable with an elliptical bottom end (see module docstring)."""
    h, w, _ = img.shape
    left, right = sheath_edges(img, rim_y + 40, min(h - 4, rim_y + 260))
    a = (right - left) / 2
    xc = (left + right) / 2
    b = END_K * a
    # The photo has to contain the whole end: stop above the frame edge, or
    # above a flat cut-off if the render already ends inside the frame.
    centre = img[:, int(xc - a / 2) : int(xc + a / 2)].max(axis=2).max(axis=1)
    lowest = np.where(centre > 6 / 255)[0].max()
    yc = min(rim_y + length * 2 * a, lowest - 3 - b)

    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    dx = (xs + 0.5 - xc) / a
    dy = (ys + 0.5 - yc) / b
    e = np.sqrt(dx * dx + dy * dy) + 1e-6
    grad = np.sqrt((dx / (a * e)) ** 2 + (dy / (b * e)) ** 2) + 1e-6
    d = (1 - e) / grad  # signed distance to the ellipse, px (positive inside)
    below = ys + 0.5 > yc

    # Edge finish copied from the natural ends: light falling off towards the
    # edge, a narrow bevel shadow, a thin line of rim light right on the edge,
    # all faded out where the arc meets the straight sides.
    along = smoothstep(0.0, 0.4, (ys + 0.5 - yc) / b)
    lit_side = 0.75 + 0.25 * np.clip(dx, -1, 1)
    bevel = (0.13 * smoothstep(8.0, 2.0, d) + 0.15 * smoothstep(0.15 * a, 0.0, d)) * along
    rim = 0.26 * np.exp(-(((d - 1.3) / 0.85) ** 2)) * along * lit_side
    coverage = np.clip((d + 0.75) / 1.5, 0.0, 1.0)

    out = img.copy()
    finish = img * (1 - bevel[..., None]) + rim[..., None] * 0.36
    out[below] = (finish * coverage[..., None])[below]
    return out, dict(xc=xc, a=a, b=b, yc=yc, bottom=yc + b, length=(yc - rim_y) / (2 * a))


def matte(img):
    """Alpha for a product shot on pure black: C = alpha * F + (1 - alpha) * 0."""
    mx = img.max(axis=2)
    dark = (mx <= 3 / 255).astype(np.uint8)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(dark, connectivity=4)
    # dark regions connected to the frame edge are background; dark regions
    # enclosed by the product (the inside of a sheath) stay part of it
    border = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    background = np.isin(labels, border[border != 0])
    obj = (~background).astype(np.uint8)
    # drop isolated specks of JPEG noise (dim and tiny), keep any real detail
    n, labels, stats, _ = cv2.connectedComponentsWithStats(obj, connectivity=8)
    peak = np.zeros(n, np.float32)
    np.maximum.at(peak, labels.ravel(), mx.ravel())
    keep = (stats[:, cv2.CC_STAT_AREA] >= 80) | (peak >= 12 / 255)
    keep[0] = False
    obj = keep[labels].astype(np.uint8)

    inner = cv2.erode(obj, np.ones((3, 3), np.uint8), iterations=2).astype(np.float32)
    band = (obj == 1) & (inner == 0)
    # colour of the product just inside the edge, pushed outwards
    num = cv2.GaussianBlur(img * inner[..., None], (0, 0), 2.2)
    den = cv2.GaussianBlur(inner, (0, 0), 2.2)[..., None]
    fg = num / np.maximum(den, 1e-4)
    a_band = np.clip(mx / np.maximum(fg.max(axis=2), 1e-3), 0, 1)
    alpha = np.where(inner > 0, 1.0, np.where(band, a_band, 0.0)).astype(np.float32)
    # Exact un-premultiply: alpha was taken from the brightest channel, so
    # img / alpha never exceeds 1 and the master composited on black gives the
    # original pixels back.
    colour = np.where(alpha[..., None] > 0, np.clip(img / np.maximum(alpha[..., None], 1e-4), 0, 1), fg)
    return colour, alpha


def trim(colour, alpha, pad=2):
    ys, xs = np.where(alpha > 0.04)
    y0, y1 = max(0, ys.min() - pad), min(alpha.shape[0], ys.max() + pad + 1)
    x0, x1 = max(0, xs.min() - pad), min(alpha.shape[1], xs.max() + pad + 1)
    return colour[y0:y1, x0:x1], alpha[y0:y1, x0:x1], (x0, y0, x1, y1)


def to_rgba(colour, alpha):
    rgba = np.dstack([colour, alpha])
    return Image.fromarray((np.clip(rgba, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA")


def over(rgba, bg):
    base = Image.new("RGBA", rgba.size, bg)
    base.alpha_composite(rgba)
    return base.convert("RGB")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    QC.mkdir(parents=True, exist_ok=True)
    report = []
    tiles = []
    for p in mapping:
        photo = p["photo"]
        img = load(SRC / photo)
        info = None
        if photo in retouch["ends"]:
            spec = retouch["ends"][photo]
            img, info = rebuild_end(img, spec["rimY"], spec["length"])
        colour, alpha = matte(img)
        colour, alpha, box = trim(colour, alpha)
        master = to_rgba(colour, alpha)
        master.save(OUT / f"{p['slug']}.png", optimize=True)
        report.append(
            {
                "slug": p["slug"],
                "photo": photo,
                "size": master.size,
                "end": "rebuilt" if info else "original",
                **({k: round(v, 2) for k, v in info.items()} if info else {}),
            }
        )
        tiles.append((p, Image.open(SRC / photo).convert("RGB"), master, info))
        print(f"{p['slug']:<17} {photo}  {master.size[0]}x{master.size[1]}  end: {'rebuilt' if info else 'original'}")

    (OUT / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
    qc_sheets(tiles)


def qc_sheets(tiles):
    """Before/after strip for rebuilt ends, plus the masters on three backgrounds."""
    try:
        font = ImageFont.truetype("DejaVuSans.ttf", 18)
    except OSError:
        font = ImageFont.load_default()
    cell = (300, 420)

    def fit(im):
        im = im.copy()
        im.thumbnail((cell[0] - 20, cell[1] - 50), Image.LANCZOS)
        return im

    rebuilt = [t for t in tiles if t[3]]
    sheet = Image.new("RGB", (cell[0] * 2 * len(rebuilt), cell[1]), (40, 44, 52))
    draw = ImageDraw.Draw(sheet)
    for i, (p, original, master, _) in enumerate(rebuilt):
        for j, (im, label) in enumerate([(original, "before"), (over(master, (0, 0, 0, 255)), "after")]):
            x = (2 * i + j) * cell[0]
            t = fit(im)
            sheet.paste(t, (x + (cell[0] - t.width) // 2, 40))
            draw.text((x + 12, 8), f"{p['slug']} · {label}", fill=(220, 226, 235), font=font)
    sheet.save(QC / "ends-before-after.png")

    for name, bg in [("black", (0, 0, 0, 255)), ("white", (255, 255, 255, 255)), ("grey", (128, 132, 140, 255))]:
        sheet = Image.new("RGB", (cell[0] * 5, cell[1] * 2), bg[:3])
        for i, (p, _, master, _) in enumerate(tiles):
            t = fit(over(master, bg))
            x, y = (i % 5) * cell[0], (i // 5) * cell[1]
            sheet.paste(t, (x + (cell[0] - t.width) // 2, y + (cell[1] - t.height) // 2))
        sheet.save(QC / f"masters-on-{name}.png")


if __name__ == "__main__":
    main()
