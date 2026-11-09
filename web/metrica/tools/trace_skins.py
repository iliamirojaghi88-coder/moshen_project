#!/usr/bin/env python3
"""Trace every panel / card / section background of the two references into SVG skins.

For each component: crop the reference at native resolution, remove the parts the page
renders itself (editable text, buttons, arrow buttons, supplied 3D PNGs) by filling them
from the surrounding surface, then trace the remaining surfaces, ribbons, rims and neon
strokes into stacked Bezier paths (stacked colour levels, each traced to smoothed Bezier
contours). Output: skins/<name>.svg, local coordinates
= native reference pixels of the crop.

usage: python3 tools/trace_skins.py [name ...]
"""
import json
import pathlib
import sys

import cv2
import numpy as np

HERE = pathlib.Path(__file__).resolve().parent.parent
REF = {"tools": HERE / "reference/tools-subscription.png", "why": HERE / "reference/why-metrica.png"}
SPEC = json.loads((HERE / "tools/components.json").read_text())


def gblur(x, s):
    """Gaussian blur of any width: large sigmas run on a downsampled copy (no kernel truncation)."""
    if s <= 12:
        return cv2.GaussianBlur(x, (0, 0), s)
    f = s / 6.0
    h, w = x.shape[:2]
    small = cv2.resize(x, (max(1, round(w / f)), max(1, round(h / f))), interpolation=cv2.INTER_AREA)
    small = cv2.GaussianBlur(small, (0, 0), 6.0, borderType=cv2.BORDER_REPLICATE)
    return cv2.resize(small, (w, h), interpolation=cv2.INTER_CUBIC)


def fill(img, hole, open_k=51, light=False, scales=(8, 16, 32, 64, 128, 256)):
    """Rebuild the panel surface under removed content (text, buttons, 3D art).
    Source pixels are weighted towards the local surface floor so glows that belonged to the
    removed content do not leak in; the surface is spread into the holes by multi-scale
    normalized convolution and feathered into the untouched pixels."""
    f = img.astype(np.float32)
    lum = f.mean(2)
    se = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (open_k, open_k))
    if light:  # pale glass: trust the brightest local surface, not shadows of removed objects
        ceil = cv2.GaussianBlur(cv2.dilate(lum, se), (0, 0), open_k / 3)
        w = (~hole).astype(np.float32) * np.exp(-np.clip(ceil - lum, 0, None) / 10.0)
    else:      # dark panels: trust the local floor, not glows of removed text/objects
        floor = cv2.GaussianBlur(cv2.erode(lum, se), (0, 0), open_k / 3)
        w = (~hole).astype(np.float32) * np.exp(-np.clip(lum - floor, 0, None) / 14.0)
    w /= max(1e-6, float(w[~hole].mean()))
    out = f.copy()
    todo = hole.copy()
    for s in scales:
        num = gblur(f * w[..., None], s)
        den = gblur(w, s)
        ok = todo & (den > 0.15)
        out[ok] = num[ok] / den[ok][:, None]
        todo &= ~ok
    if todo.any():  # whatever is left takes the widest estimate
        out[todo] = num[todo] / np.maximum(den[todo], 1e-6)[:, None]
    out = cv2.GaussianBlur(out, (0, 0), 8)
    soft = cv2.GaussianBlur(hole.astype(np.float32), (0, 0), 5.0)[..., None]
    return (out * soft + f * (1 - soft)).clip(0, 255).astype(np.uint8)


def nums(vals):
    """Join numbers with the fewest separators SVG path syntax allows."""
    out = ""
    for v in vals:
        t = str(int(v)) if float(v).is_integer() else f"{v:.1f}".rstrip("0")
        t = t.replace("0.", ".", 1) if t.startswith("0.") else t.replace("-0.", "-.", 1)
        out += t if (not out or t[0] == "-" or (t[0] == "." and "." in out.split(" ")[-1].lstrip("-").split("-")[-1])) else " " + t
    return out


def bezier(pts, eps=0.6, nd=0):
    """Closed contour -> Douglas-Peucker simplified -> Catmull-Rom spline written as relative
    cubic Beziers ('c' then smooth 's'), rounded to 10^-nd without drift."""
    q = cv2.approxPolyDP(pts, eps, True).reshape(-1, 2).astype(np.float64)
    m = len(q)
    if m < 3:
        return ""
    r = lambda v: np.round(v, nd)
    cur = r(q[0])
    p0, p1, p2, p3 = q[-1], q[0], q[1], q[2 % m]
    c1, c2 = r(p1 + (p2 - p0) / 6), r(p2 - (p3 - p1) / 6)
    e = r(p2)
    d = "M" + nums(cur) + "c" + nums([*(c1 - cur), *(c2 - cur), *(e - cur)])
    cur = e
    for i in range(1, m):
        p1, p2, p3 = q[i], q[(i + 1) % m], q[(i + 2) % m]
        c2, e = r(p2 - (p3 - p1) / 6), r(p2)
        d += "s" + nums([*(c2 - cur), *(e - cur)])
        cur = e
    return d + "z"


def stack_trace(img, levels, min_area, eps=0.6, med=5, nd=1):
    """Quantise to `levels` colours ordered by lightness; level k is painted over every pixel
    whose level >= k, so the stack reproduces each pixel's colour with no seams."""
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).reshape(-1, 3).astype(np.float32)
    feat = lab * np.float32([1, 2.2, 2.2])  # chroma weighted up: saturated ribbons keep their own levels
    rng = np.random.default_rng(0)
    sample = feat[rng.choice(len(feat), min(len(feat), 80000), replace=False)]
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 40, 0.2)
    cv2.setRNGSeed(0)
    _, _, cf = cv2.kmeans(sample, levels, None, crit, 2, cv2.KMEANS_PP_CENTERS)
    lab_rank = np.concatenate([((ch[:, None, :] - cf[None]) ** 2).sum(-1).argmin(1)
                               for ch in np.array_split(feat, max(1, len(feat) // 40000))])
    centers = np.stack([lab[lab_rank == i].mean(0) if (lab_rank == i).any() else cf[i] / [1, 2.2, 2.2] for i in range(levels)])
    order = np.argsort(centers[:, 0])
    centers = centers[order]
    inv = np.empty(levels, int); inv[order] = np.arange(levels)
    rank = inv[lab_rank].reshape(img.shape[:2]).astype(np.uint8)
    rank = cv2.medianBlur(rank, med)
    rgb = cv2.cvtColor(centers.reshape(1, -1, 3).clip(0, 255).astype(np.uint8), cv2.COLOR_LAB2RGB)[0]
    hexes = ["#%02x%02x%02x" % tuple(int(v) for v in c) for c in rgb]
    h, w = rank.shape
    out = [f'<rect width="{w}" height="{h}" fill="{hexes[0]}"/>']
    for k in range(1, levels):
        mask = (rank >= k).astype(np.uint8)
        if not mask.any():
            continue
        cs, hier = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
        sub = [bezier(c, eps, nd) for c in cs if abs(cv2.contourArea(c)) >= min_area]
        if sub:
            out.append(f'<path fill="{hexes[k]}" fill-rule="evenodd" d="{"".join(sub)}"/>')
    return "\n".join(out), rank, cv2.cvtColor(rgb[None], cv2.COLOR_RGB2BGR)[0]


def detail_layer(img, lift, min_area):
    """Thin bright features (rims, neon strokes, ribbon crests): pixels clearly brighter than
    their local surroundings, traced crisp at native resolution and filled with their own colour."""
    f = img.astype(np.float32)
    lum = f.mean(2)
    local = cv2.GaussianBlur(lum, (0, 0), 3.5)
    out = []
    for t, op in ((lift, .55), (lift * 2.2, .9)):
        m = ((lum - local) > t).astype(np.uint8)
        m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
        n, lab, st, _ = cv2.connectedComponentsWithStats(m, 8)
        for i in range(1, n):
            if st[i, 4] < min_area:
                continue
            comp = (lab == i).astype(np.uint8)
            col = f[comp.astype(bool)].mean(0)[::-1]
            cs, _ = cv2.findContours(comp, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
            d = "".join(bezier(c, 0.5) for c in cs if len(c) > 3)
            if d:
                out.append(f'<path fill="#%02x%02x%02x" fill-opacity="{op}" fill-rule="evenodd" d="{d}"/>' % tuple(int(v) for v in col))
    return out


def layered(img, c):
    """Exact two-layer decomposition of the surface:
    1. lighting: the surface blurred (sigma S), traced at 1/4 resolution and re-blurred by S in
       the SVG - carries only smooth light, so no level steps are visible;
    2. detail: the difference between the reference and that rendered lighting layer, encoded
       for `mix-blend-mode: hard-light` (0.5 = no change) and traced at native resolution.
       Flat areas encode to neutral grey, so the levels concentrate on the real geometry:
       silhouettes, ribbons, folds, rims, neon strokes, highlights."""
    S = c.get("body_sigma", 3.5)
    q = c.get("body_scale", 0.5)
    small = cv2.resize(cv2.GaussianBlur(img, (0, 0), S / 2), None, fx=q, fy=q, interpolation=cv2.INTER_AREA)
    body, rank, pal = stack_trace(small, c.get("body_levels", 80), 3, eps=0.6, med=3, nd=0)
    h, w = img.shape[:2]
    lit = cv2.resize(pal[rank], (w, h), interpolation=cv2.INTER_LINEAR).astype(np.float32)
    lit = cv2.GaussianBlur(lit, (0, 0), S) / 255.0
    t = img.astype(np.float32) / 255.0
    up = (t - lit) / np.maximum(1 - lit, 1e-3)          # screen half of hard-light
    dn = t / np.maximum(lit, 1e-3) - 1                    # multiply half of hard-light
    r = np.clip(np.where(t >= lit, up, dn), -1, 1)
    dz = c.get("dead_zone", 0.04)  # differences below this are invisible; keep them exactly neutral
    r = np.sign(r) * np.maximum(np.abs(r) - dz, 0) / (1 - dz)
    r = cv2.GaussianBlur(r, (0, 0), 0.6)
    enc = ((0.5 + r / 2) * 255).round().clip(0, 255).astype(np.uint8)
    det, _, _ = stack_trace(enc, c.get("levels", 48), c.get("min_area", 8), eps=0.8, med=3, nd=0)
    parts = [f'<g transform="scale({1/q:g})" filter="url(#{{FID}})">{body}</g>',
             f'<g style="mix-blend-mode:hard-light">{det}</g>']
    return (f'<defs><filter id="{{FID}}" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB">'
            f'<feGaussianBlur stdDeviation="{S*q:g}" edgeMode="duplicate"/></filter></defs>\n' + "\n".join(parts))


def trace(name, c):
    img = cv2.imread(str(REF[c["ref"]]))
    H, W = img.shape[:2]
    x0, y0, x1, y1 = c["box"]
    m = c.get("margin", 24)
    cx0, cy0, cx1, cy1 = max(0, x0 - m), max(0, y0 - m), min(W, x1 + m), min(H, y1 + m)
    crop = img[cy0:cy1, cx0:cx1].copy()
    hole = np.zeros(crop.shape[:2], bool)
    for r in c.get("holes", []):  # [x0, y0, x1, y1, (radius), ("e")] or {"poly": [[x, y], ...], "r": radius}
        if isinstance(r, dict):
            sub = np.zeros_like(hole, np.uint8)
            cv2.fillPoly(sub, [np.int32(r["poly"]) - [cx0, cy0]], 1)
            sub = cv2.dilate(sub, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (r.get("r", 10),) * 2))
            hole |= sub.astype(bool)
            continue
        rx0, ry0, rx1, ry1 = r[:4]
        rad = r[4] if len(r) > 4 else 10
        sub = np.zeros_like(hole, np.uint8)
        if len(r) > 5 and r[5] == "e":  # elliptical hole (illustrations)
            cv2.ellipse(sub, ((rx0 + rx1) // 2 - cx0, (ry0 + ry1) // 2 - cy0), ((rx1 - rx0) // 2, (ry1 - ry0) // 2), 0, 0, 360, 1, -1)
        else:
            cv2.rectangle(sub, (rx0 - cx0, ry0 - cy0), (rx1 - cx0, ry1 - cy0), 1, -1)
        if rad:
            sub = cv2.dilate(sub, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (rad, rad)))
        hole |= sub.astype(bool)
    if "auto" in c:  # light cards: content = dark text or strongly coloured pixels inside the card
        a = c["auto"]
        hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV).astype(np.float32)
        lum = crop.astype(np.float32).mean(2)
        glass = cv2.GaussianBlur(cv2.dilate(lum, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (31, 31))), (0, 0), 12)
        cm = (((glass - lum) > a.get("drop", 12)) | (hsv[..., 1] > a.get("sat", 0.42) * 255)).astype(np.uint8)
        inner = np.zeros_like(cm)
        i = a.get("inset", 16)
        cv2.rectangle(inner, (x0 - cx0 + i, y0 - cy0 + i), (x1 - cx0 - i, y1 - cy0 - i), 1, -1)
        cm &= inner
        cm = cv2.morphologyEx(cm, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
        cm = cv2.dilate(cm, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (a.get("dilate", 13),) * 2))
        for kx0, ky0, kx1, ky1 in a.get("keep", []):  # decoration that belongs to the card itself
            cm[max(0, ky0 - cy0):max(0, ky1 - cy0), max(0, kx0 - cx0):max(0, kx1 - cx0)] = 0
        hole |= cm.astype(bool)
    filled = fill(crop, hole, c.get("open_k", 51), c.get("light", False), tuple(c.get("fill_scales", (8, 16, 32, 64, 128, 256)))) if hole.any() else crop
    if c.get("denoise", True):  # keep edges, drop JPEG-ish grain so the tracer emits fewer specks
        filled = cv2.bilateralFilter(filled, 7, 18, 7)
    body = layered(filled, c)
    cw, ch = cx1 - cx0, cy1 - cy0
    if c.get("feather", True):
        fm = m * 0.5
        body = (f'<mask id="sk-{name}-m" maskUnits="userSpaceOnUse" x="0" y="0" width="{cw}" height="{ch}">'
                f'<filter id="sk-{name}-mf"><feGaussianBlur stdDeviation="{m*0.28:g}"/></filter>'
                f'<rect x="{fm:g}" y="{fm:g}" width="{cw-2*fm:g}" height="{ch-2*fm:g}" rx="{m:g}" fill="#fff" filter="url(#sk-{name}-mf)"/></mask>'
                f'<g mask="url(#sk-{name}-m)" style="isolation:isolate">{body}</g>')
    else:
        body = f'<g style="isolation:isolate">{body}</g>' 
    cw, ch = cx1 - cx0, cy1 - cy0
    meta = {"crop": [cx0, cy0, cx1, cy1], "box": [x0, y0, x1, y1], "w": cw, "h": ch}
    out = HERE / "skins" / f"{name}.svg"
    body = body.replace("{FID}", f"sk-{name}-blur")
    out.write_text(f'<!-- {json.dumps(meta)} -->\n{body}\n', encoding="utf-8")
    cv2.imwrite(str(HERE / "skins" / f".{name}.filled.png"), filled)
    print(f"{name}: crop {cw}x{ch}, {body.count('<path')} paths, {len(body)/1024:.0f} KB")


if __name__ == "__main__":
    names = sys.argv[1:] or list(SPEC)
    for n in names:
        trace(n, SPEC[n])
