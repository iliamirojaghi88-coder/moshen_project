#!/usr/bin/env python3
"""Measure where each text line, button and arrow circle sits in the references (native px).
Writes tools/ref_layout.json, consumed by tools/fit_layout.js."""
import json
import pathlib

import cv2
import numpy as np

HERE = pathlib.Path(__file__).resolve().parent.parent
REF = {"tools": cv2.imread(str(HERE / "reference/tools-subscription.png")),
       "why": cv2.imread(str(HERE / "reference/why-metrica.png"))}
C = json.loads((HERE / "tools/components.json").read_text())


def ink(ref, region, kind):
    x0, y0, x1, y1 = region
    a = REF[ref][y0:y1, x0:x1].astype(np.int32)
    b, g, r = a[..., 0], a[..., 1], a[..., 2]
    lum = a.mean(2)
    m = {"light": lum > 175, "dark": lum < 105, "gold": (r > 190) & (g > 130) & (b < 150),
         "lightgold": (lum > 175) | ((r > 190) & (g > 130) & (b < 150)),
         "navybtn": (b > 110) & (r < 50), "goldbtn": (r > 200) & (g > 140) & (b < 130)}[kind]
    m = cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    return m


def lines(ref, region, kind, min_gap=3):
    """Split ink into text lines by horizontal projection; return [x0, y0, x1, y1] per line."""
    m = ink(ref, region, kind)
    rows = m.sum(1) > 1
    out, start = [], None
    for y, v in enumerate(list(rows) + [False]):
        if v and start is None:
            start = y
        if not v and start is not None:
            if y - start >= 6:
                cols = np.where(m[start:y].sum(0) > 0)[0]
                out.append([int(region[0] + cols.min()), int(region[1] + start), int(region[0] + cols.max() + 1), int(region[1] + y)])
            start = None
    # merge lines separated by tiny gaps (dots/diacritics)
    merged = []
    for l in out:
        if merged and l[1] - merged[-1][3] < min_gap * 3 and (l[3] - l[1]) < 12:
            merged[-1] = [min(merged[-1][0], l[0]), merged[-1][1], max(merged[-1][2], l[2]), l[3]]
        elif merged and (merged[-1][3] - merged[-1][1]) < 12 and l[1] - merged[-1][3] < min_gap * 3:
            merged[-1] = [min(merged[-1][0], l[0]), merged[-1][1], max(merged[-1][2], l[2]), l[3]]
        else:
            merged.append(l)
    return merged


def blob(ref, region, kind):
    m = ink(ref, region, kind)
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, 8)
    i = 1 + int(np.argmax(st[1:, 4]))
    x, y, w, h = st[i, :4]
    return [int(region[0] + x), int(region[1] + y), int(region[0] + x + w), int(region[1] + y + h)]


def circle(ref, region):
    x0, y0, x1, y1 = region
    g = cv2.cvtColor(REF[ref][y0:y1, x0:x1], cv2.COLOR_BGR2GRAY)
    cs = cv2.HoughCircles(cv2.GaussianBlur(g, (5, 5), 1.2), cv2.HOUGH_GRADIENT, 1.2, 40, param1=60, param2=18,
                          minRadius=18, maxRadius=36)
    if cs is None:
        return None
    cx, cy, r = cs[0][0]
    return [round(float(x0 + cx), 1), round(float(y0 + cy), 1), round(float(r), 1)]


def art(ref, region, dark_panel):
    """Bounding box of the 3D illustration: saturated or (on light glass) darker-than-glass pixels."""
    x0, y0, x1, y1 = region
    a = REF[ref][y0:y1, x0:x1]
    hsv = cv2.cvtColor(a, cv2.COLOR_BGR2HSV).astype(np.float32)
    lum = a.astype(np.float32).mean(2)
    if dark_panel:
        m = (lum > 120) | ((hsv[..., 1] > 120) & (hsv[..., 2] > 150) & (np.abs(hsv[..., 0] - 105) > 18))
    else:
        glass = cv2.GaussianBlur(cv2.dilate(lum, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (31, 31))), (0, 0), 12)
        m = ((glass - lum) > 22) | (hsv[..., 1] > 120)
    m = cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, 8)
    keep = [i for i in range(1, n) if st[i, 4] > 150]
    xs = [st[i, 0] for i in keep] + [st[i, 0] + st[i, 2] for i in keep]
    ys = [st[i, 1] for i in keep] + [st[i, 1] + st[i, 3] for i in keep]
    return [int(x0 + min(xs)), int(y0 + min(ys)), int(x0 + max(xs)), int(y0 + max(ys))]


L = {}
# ---- tools reference
L["sub.pill"] = lines("tools", [420, 146, 712, 186], "light")
L["sub.title"] = lines("tools", [392, 200, 760, 290], "gold")
L["sub.desc"] = lines("tools", [396, 298, 758, 388], "light")
L["sub.btn"] = blob("tools", [395, 395, 752, 495], "goldbtn")
for k in ("tool-project", "tool-analysis", "tool-marketing", "tool-cashflow", "tool-contractors"):
    x0, y0, x1, y1 = C[k]["box"]
    ty = y0 + int((y1 - y0) * (0.52 if k != "tool-contractors" else 0.55))
    L[k + ".text"] = lines("tools", [x0 + 80, ty, x1 - 10, y1 - 8], "dark")
    L[k + ".arrow"] = circle("tools", [x0 + 4, ty, x0 + 110, y1 - 4])
x0, y0, x1, y1 = C["tool-free"]["box"]
L["tool-free.text"] = lines("tools", [x0 + 30, 1395, x1 - 8, 1540], "dark")
L["tool-free.btn"] = blob("tools", [x0 + 10, 1545, x1 - 10, 1640], "navybtn")
# ---- why reference
L["intro.title"] = lines("why", [120, 40, 680, 180], "lightgold")
L["intro.sub"] = lines("why", [110, 178, 690, 282], "light")
for k, kind in (("feat-econ", "light"), ("feat-estimate", "dark"), ("feat-project", "light"), ("feat-tools", "dark")):
    x0, y0, x1, y1 = C[k]["box"]
    L[k + ".text"] = lines("why", [x0 + 300, y0 + 10, x0 + 570, y1 - 10], kind)
    L[k + ".arrow"] = circle("why", [x0 + 520, y0 + 30, x1 - 20, y1 - 30])
L["cta.title"] = lines("why", [140, 1570, 650, 1720], "lightgold")
L["cta.btn"] = blob("why", [140, 1735, 650, 1860], "goldbtn")
L["sub.art"] = art("tools", [84, 170, 385, 470], True)
for k in ("tool-project", "tool-analysis", "tool-marketing", "tool-cashflow", "tool-contractors"):
    x0, y0, x1, y1 = C[k]["box"]
    L[k + ".art"] = art("tools", [x0 + 14, y0 + 10, x1 - 14, L[k + ".text"][-2][1] - 4], False)
L["tool-free.art"] = art("tools", [440, 1228, 690, 1396], False)
for k, dark in (("feat-econ", True), ("feat-estimate", False), ("feat-project", True), ("feat-tools", False)):
    x0, y0, x1, y1 = C[k]["box"]
    L[k + ".art"] = art("why", [x0 + 40, y0 + 4, x0 + 255, y1 - 4], dark)
(HERE / "tools/ref_layout.json").write_text(json.dumps(L, indent=1))
for k, v in L.items():
    print(k, v)
