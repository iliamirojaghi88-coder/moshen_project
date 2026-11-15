#!/usr/bin/env python3
"""METRICA home page images: source-assets/*.png (originals, kept unchanged) → public_html/assets/img/<hash>.webp.

Each image is cleaned of the stray specks left by background removal (only the large opaque parts are kept),
cropped to its content, resized with Lanczos for ~3-4× its largest CSS size, and saved as WebP with full-quality
alpha. File names are the first 12 hex digits of the output's SHA-256, like the rest of assets/img.
Prints a JSON map name → {file, w, h} used by index.html. Run: python3 -I tools/build_assets.py
"""
import hashlib
import io
import json
import pathlib
import sys

import cv2
import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC, OUT = ROOT / "source-assets", ROOT / "public_html/assets/img"


def clean(im, keep=0.01, floor=10):
    """drop pixels fainter than `floor` and every blob smaller than `keep` × the largest blob (dilated so soft
    edges and glows that touch a kept blob stay)"""
    a = np.array(im.getchannel("A"))
    a[a < floor] = 0
    n, lab, stats, _ = cv2.connectedComponentsWithStats((a > 60).astype(np.uint8), 8)
    if n <= 1:
        return im
    areas = stats[1:, cv2.CC_STAT_AREA]
    big = [i + 1 for i, s in enumerate(areas) if s >= areas.max() * keep]
    mask = np.isin(lab, big).astype(np.uint8)
    mask = cv2.dilate(mask, np.ones((25, 25), np.uint8))
    a = (a * mask).astype(np.uint8)
    out = im.copy()
    out.putalpha(Image.fromarray(a))
    return out


def crop(im, pad=4):
    box = im.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    l, t, r, b = box
    return im.crop((max(0, l - pad), max(0, t - pad), min(im.width, r + pad), min(im.height, b + pad)))


def save(name, im, width, q=92):
    if im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=q, alpha_quality=100, method=6, exact=False)
    data = buf.getvalue()
    h = hashlib.sha256(data).hexdigest()[:12]
    (OUT / f"{h}.webp").write_bytes(data)
    return name, {"file": f"assets/img/{h}.webp", "w": im.width, "h": im.height, "kb": round(len(data) / 1024, 1)}


def rgba(p):
    return Image.open(SRC / p).convert("RGBA")


def main():
    out = []
    # logo: the mark only (rows 210–867 of the full logo hold the bars and the R; the words sit below them)
    logo = rgba("logo-full.webp")
    out.append(save("logo", crop(clean(logo.crop((0, 190, logo.width, 890)))), 240, q=94))
    out.append(save("hero", crop(clean(rgba("hero-building.png"), keep=0.002)), 1000))
    out.append(save("banner", crop(clean(rgba("banner-blueprint.png"), keep=0.002)), 900))
    out.append(save("chart", crop(clean(rgba("finance-chart.png"), keep=0.002, floor=6)), 820))
    for n, p in [("income", "fin-income-wallet.png"), ("cost", "fin-cost-red.png"), ("profit", "fin-profit-gold.png")]:
        out.append(save(n, crop(clean(rgba(p))), 224))
    # 2 × 2 sheet: blue, green / orange, red (reading order of the sheet = the reminder colour cycle)
    sheet = rgba("calendars-sheet.png")
    w, h = sheet.size
    quads = [(0, 0, w // 2, h // 2), (w // 2, 0, w, h // 2), (0, h // 2, w // 2, h), (w // 2, h // 2, w, h)]
    for n, q in zip(["cal-blue", "cal-green", "cal-orange", "cal-red"], quads):
        out.append(save(n, crop(clean(sheet.crop(q), keep=0.2)), 200))
    json.dump(dict(out), sys.stdout, indent=1)


if __name__ == "__main__":
    main()
