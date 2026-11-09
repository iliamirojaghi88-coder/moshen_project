#!/usr/bin/env python3
"""Decoration layers for every panel/card and both section backgrounds.

Per component (box + margin from components.json):
  decor/<name>.webp   clean crop of the reference (rim, glows, ribbons, folds, hatching, arrow discs,
                      icons ...) with the areas the page renders live cut out: text lines, buttons,
                      the pill and the 3D artwork (layout_spec.json). Edges of the cut-outs are soft.
  body (in meta.json) one planar gradient per cut-out, least-squares fitted to the pixels around it,
                      drawn underneath as an SVG <rect> + <linearGradient>; the live text/art sits on it.
Per section:
  decor/bg-<section>.webp   the reference background with every component box cut out (mobile)
  decor/band-<section>.webp the bottom transition band, free of components (all layouts)
  meta.json: crops, patches, background gradient stops.
"""
import io
import json
import pathlib

import cv2
import numpy as np
from PIL import Image

HERE = pathlib.Path(__file__).resolve().parent.parent
OUT = HERE / "decor"
OUT.mkdir(exist_ok=True)
REF = {"tools": HERE / "reference/tools-subscription.png", "why": HERE / "reference/why-metrica.png"}
C = json.loads((HERE / "tools/components.json").read_text())
L = json.loads((HERE / "tools/layout_spec.json").read_text())
FEATHER = 3.0  # px, softness of every cut-out edge


def save_webp(bgra, path, q=90):
    im = Image.fromarray(cv2.cvtColor(bgra, cv2.COLOR_BGRA2RGBA))
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=q, method=6, alpha_quality=90)
    path.write_bytes(buf.getvalue())
    return len(buf.getvalue())


def cutouts(name):
    """(rect, sample box) pairs, reference px: the parts the page renders live inside this component.
    Buttons, the pill, arrow discs and icons stay reference pixels; only their label lines are cut."""
    c = C[name]
    out = []
    for k, t in L["texts"].items():
        if t["comp"] != name:
            continue
        inside = L["boxes"][t["in"]]["box"] if t.get("in") else c["box"]
        ins = 3 if t.get("in") == "pill" else 9 if t.get("in") else 0
        sb = [inside[0] + ins, inside[1] + ins, inside[2] - ins, inside[3] - ins]
        px, py = (3, 2) if t.get("in") == "pill" else (4, 3) if t.get("in") else (7, 10)
        mode = "fp-label" if t.get("in") else "fp"   # only glyph footprints are cut, never whole lines
        grow = 6 if k in ("t-sub-title", "t-why-title", "t-cta-title") else 3
        for x0, y0, x1, y1 in t["lines"]:
            out.append(([x0 - px, y0 - py, x1 + px, y1 + py], sb, mode, grow))
    for k, a in L["art"].items():
        if a["comp"] == name:
            x0, y0, x1, y1 = a["box"]
            g = a.get("pad", 10)
            out.append(([x0 - g, y0 - g, x1 + g, y1 + g], c["box"], "fp-art" if c.get("dark") else "fp-art-light", 4))
    return out


def plane_patch(img, r, ring=10, box=None, ext=0, dark=False):
    """Fit colour = a + b*x + c*y on the ring around rect r; return it as a 2-stop linear gradient."""
    H, W = img.shape[:2]
    x0, y0, x1, y1 = [int(round(v)) for v in r]
    X0, Y0, X1, Y1 = max(0, x0 - ring), max(0, y0 - ring), min(W, x1 + ring), min(H, y1 + ring)
    if box:  # sample only inside the component
        X0, Y0, X1, Y1 = max(X0, box[0]), max(Y0, box[1]), min(X1, box[2]), min(Y1, box[3])
    yy, xx = np.mgrid[Y0:Y1, X0:X1]
    m = ~((xx >= x0) & (xx < x1) & (yy >= y0) & (yy < y1))
    if m.sum() < 30:  # rect fills its box: sample the whole box
        m = np.ones_like(m)
    if dark:  # dark panel: fit the navy floor, not the rim glow / gold hatching next to it
        lum = img[Y0:Y1, X0:X1].astype(np.float64).mean(2)
        m &= lum <= np.percentile(lum[m], 55)
    px = img[Y0:Y1, X0:X1][m].astype(np.float64)
    A = np.column_stack([np.ones(m.sum()), xx[m], yy[m]])
    # robust: two passes, drop the brightest/darkest outliers (glows, neighbouring glyph halos)
    coef, *_ = np.linalg.lstsq(A, px, rcond=None)
    res = np.abs(A @ coef - px).sum(1)
    keep = res < np.percentile(res, 80)
    coef, *_ = np.linalg.lstsq(A[keep], px[keep], rcond=None)
    gx, gy = coef[1].mean(), coef[2].mean()
    n = np.hypot(gx, gy)
    ux, uy = (gx / n, gy / n) if n > 1e-6 else (1.0, 0.0)
    x0, y0, x1, y1 = x0 - ext, y0 - ext, x1 + ext, y1 + ext
    if box:
        x0, y0, x1, y1 = max(x0, box[0]), max(y0, box[1]), min(x1, box[2]), min(y1, box[3])
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    half = abs(ux) * (x1 - x0) / 2 + abs(uy) * (y1 - y0) / 2
    p1, p2 = (cx - ux * half, cy - uy * half), (cx + ux * half, cy + uy * half)
    col = lambda p: np.clip(coef[0] + coef[1] * p[0] + coef[2] * p[1], 0, 255)[::-1]  # BGR -> RGB
    hexc = lambda c: "#%02x%02x%02x" % tuple(int(round(v)) for v in c)
    return {"rect": [x0, y0, x1, y1], "p1": [round(p1[0], 1), round(p1[1], 1)], "p2": [round(p2[0], 1), round(p2[1], 1)],
            "c1": hexc(col(p1)), "c2": hexc(col(p2))}


def plane_fit(img, pts_mask, X0, Y0):
    yy, xx = np.nonzero(pts_mask)
    px = img[Y0 + yy, X0 + xx].astype(np.float64)
    A = np.column_stack([np.ones(len(xx)), X0 + xx, Y0 + yy])
    coef, *_ = np.linalg.lstsq(A, px, rcond=None)
    return coef


def footprint(img, r, sb, grow, thrs=(60, 40, 32)):
    """Pixels inside rect r that clearly differ from the local background plane (glyphs, artwork)."""
    H, W = img.shape[:2]
    ring = 10
    X0, Y0 = max(0, r[0] - ring, sb[0]), max(0, r[1] - ring, sb[1])
    X1, Y1 = min(W, r[2] + ring, sb[2]), min(H, r[3] + ring, sb[3])
    sub = img[Y0:Y1, X0:X1].astype(np.float64)
    yy, xx = np.mgrid[Y0:Y1, X0:X1]
    inner = (xx >= r[0]) & (xx < r[2]) & (yy >= r[1]) & (yy < r[3])
    fp = np.zeros_like(inner)
    for thr in thrs:
        coef = plane_fit(img, ~fp & ~(inner & fp), X0, Y0) if fp.any() else plane_fit(img, ~inner, X0, Y0)
        plane = coef[0] + coef[1] * xx[..., None] + coef[2] * yy[..., None]
        diff = np.abs(sub - plane).sum(2)
        fp = inner & (diff > thr)
        fp = cv2.dilate(fp.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool) & inner
    fp = cv2.morphologyEx(fp.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    fp = cv2.dilate(fp, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * grow + 1,) * 2)).astype(bool) & inner
    out = np.zeros((H, W), bool)
    out[Y0:Y1, X0:X1] = fp
    return out


def bright_art(img, r):
    """Illustration on a dark panel: pixels clearly brighter than the navy surface, or warm/saturated;
    holes closed and grown a little so antialiased edges and contact shadows go too."""
    H, W = img.shape[:2]
    x0, y0, x1, y1 = max(0, r[0]), max(0, r[1]), min(W, r[2]), min(H, r[3])
    a = img[y0:y1, x0:x1]
    hsv = cv2.cvtColor(a, cv2.COLOR_BGR2HSV).astype(np.int32)
    lum = a.astype(np.int32).mean(2)
    m = ((lum > 96) | ((hsv[..., 1] > 110) & (hsv[..., 2] > 140) & ((hsv[..., 0] < 35) | (hsv[..., 0] > 140)))
         | ((hsv[..., 0] > 85) & (hsv[..., 0] < 112) & (hsv[..., 2] > 215)))
    m = cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, 8)
    m = np.isin(lab, [i for i in range(1, n) if st[i, 4] > 120]).astype(np.uint8)
    m = cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    out = np.zeros((H, W), bool)
    out[y0:y1, x0:x1] = m.astype(bool)
    return out


def rect_dist(H, W, box):
    x0, y0, x1, y1 = box
    xs, ys = np.arange(W, dtype=np.float32), np.arange(H, dtype=np.float32)
    dx = np.maximum(np.maximum(x0 - xs, xs - x1), 0)[None, :]
    dy = np.maximum(np.maximum(y0 - ys, ys - y1), 0)[:, None]
    return np.hypot(dx, dy)


meta = {}
for sec, rp in REF.items():
    img = cv2.imread(str(rp))
    H, W = img.shape[:2]
    comps = [n for n, c in C.items() if c["ref"] == sec and not n.startswith("bg-")]
    dists = {n: rect_dist(H, W, C[n]["box"]) for n in comps}
    stack = np.stack([dists[n] for n in comps])
    for i, n in enumerate(comps):
        c = C[n]
        m = c.get("margin", 24)
        x0, y0, x1, y1 = c["box"]
        cx0, cy0, cx1, cy1 = max(0, x0 - m), max(0, y0 - m), min(W, x1 + m), min(H, y1 + m)
        cuts = cutouts(n)
        alpha = np.ones((H, W), np.float32)
        for r, sb, mode, grow in cuts:
            if mode == "rect":
                alpha[max(0, r[1]):r[3], max(0, r[0]):r[2]] = 0
            elif mode == "fp-art":         # bright artwork + anything clearly off the navy surface
                alpha[bright_art(img, r) | footprint(img, r, sb, 4, (95, 75, 60))] = 0
            elif mode == "fp-art-light":   # artwork on glass: everything clearly off the glass surface
                alpha[footprint(img, r, sb, 5, (70, 50, 40))] = 0
            elif mode == "fp-label":   # dark/white label on a strongly lit button: high contrast only
                alpha[footprint(img, r, sb, grow, (120, 90, 70))] = 0
            else:
                alpha[footprint(img, r, sb, grow)] = 0
        alpha = cv2.GaussianBlur(alpha, (0, 0), FEATHER)
        # own region: the card, its rim and its outer glow; fades before neighbouring cards
        d = dists[n]
        other = np.min(np.delete(stack, i, axis=0), axis=0) if len(comps) > 1 else np.full_like(d, 1e9)
        alpha *= np.where(d <= 2, 1.0, np.clip(1 - (d - 2) / (m - 4), 0, 1) ** 1.5 * np.clip((other - d) / 8 + 0.5, 0, 1))
        a = (alpha[cy0:cy1, cx0:cx1] * 255).round().astype(np.uint8)
        kb = save_webp(np.dstack([img[cy0:cy1, cx0:cx1], a]), OUT / f"{n}.webp") // 1024
        box_in = [x0, y0, x1, y1]
        e = int(3 * FEATHER) + 2  # patches reach under the whole soft edge: no seams
        patches = [plane_patch(img, r, box=sb, ext=e, dark=mode == "fp-art") for r, sb, mode, grow in cuts]
        for p in patches:  # to crop-local coordinates
            p["rect"] = [p["rect"][0] - cx0, p["rect"][1] - cy0, p["rect"][2] - cx0, p["rect"][3] - cy0]
            p["p1"] = [p["p1"][0] - cx0, p["p1"][1] - cy0]
            p["p2"] = [p["p2"][0] - cx0, p["p2"][1] - cy0]
        meta[n] = {"crop": [cx0, cy0, cx1, cy1], "box": box_in, "w": cx1 - cx0, "h": cy1 - cy0, "kb": kb, "patches": patches}

    # mobile background: the reference with the component boxes cut out
    bg_alpha = np.ones((H, W), np.float32)
    for n in comps:
        x0, y0, x1, y1 = C[n]["box"]
        bg_alpha[y0 + 6:y1 - 6, x0 + 6:x1 - 6] = 0
    bg_alpha = cv2.GaussianBlur(bg_alpha, (0, 0), 3)
    kb = save_webp(np.dstack([img, (bg_alpha * 255).round().astype(np.uint8)]), OUT / f"bg-{sec}.webp", q=86) // 1024
    # wide layouts: vertical gradient stops of the plain background + the bottom transition band
    outside = np.ones((H, W), bool)
    for n in comps:
        x0, y0, x1, y1 = C[n]["box"]
        e = C[n].get("margin", 24) + 20
        outside[max(0, y0 - e):y1 + e, max(0, x0 - e):x1 + e] = False
    stops = []
    for y in np.linspace(0, H - 1, 13).astype(int):
        band = img[max(0, y - 20):y + 20][outside[max(0, y - 20):y + 20]]
        if len(band) > 50:
            b, g, r = np.median(band, 0)
            stops.append([round(float(y / (H - 1)) * 100, 1), "#%02x%02x%02x" % (int(r), int(g), int(b))])
    low = max(C[n]["box"][3] + C[n].get("margin", 24) for n in comps)
    by0 = min(H - 40, low)
    band = img[by0:H].copy()
    ba = np.ones(band.shape[:2], np.float32)
    ba[:24] = np.linspace(0, 1, 24)[:, None]
    kbb = save_webp(np.dstack([band, (ba * 255).astype(np.uint8)]), OUT / f"band-{sec}.webp", q=86) // 1024
    meta[f"bg-{sec}"] = {"w": W, "h": H, "kb": kb, "stops": stops, "band": [0, by0, W, H], "band_kb": kbb}

(OUT / "meta.json").write_text(json.dumps(meta, indent=1))
print("decor KB:", sum(v["kb"] + v.get("band_kb", 0) for v in meta.values()), {k: v["kb"] for k, v in meta.items()})
