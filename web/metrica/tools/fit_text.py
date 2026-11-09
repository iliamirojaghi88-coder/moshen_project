#!/usr/bin/env python3
"""One fitting pass: compare rendered text ink (tools/fit_shot.js) with the reference ink boxes in
layout_spec.json and update tools/text_fit.json (font size, line pitch, position, all native px)."""
import json
import pathlib
import sys

import cv2
import numpy as np

HERE = pathlib.Path(__file__).resolve().parent.parent
SPEC = json.loads((HERE / "tools/layout_spec.json").read_text())
USED = json.loads((HERE / "tools/text_vars.json").read_text())
png, info_p = sys.argv[1], sys.argv[2]
img = cv2.imread(png)
hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV).astype(np.int32)
info = {i["id"]: i for i in json.loads(open(info_p).read())}
D = 2.0  # device scale factor of the screenshot


DECOR = json.loads((HERE / "decor/meta.json").read_text())


def crop_origin(comp):
    return DECOR[comp]["crop"][:2]


fit, report = {}, []
for k, t in SPEC["texts"].items():
    it = info[k]
    s = it["comp"]["w"] / it["cw"]  # css px per native px
    pad = it["fspx"] * 0.9
    x0 = int(max(0, (it["el"]["x"] - pad) * D)); x1 = int(min(img.shape[1], (it["el"]["x"] + it["el"]["w"] + pad) * D))
    y0 = int(max(0, (it["el"]["y"] - pad) * D)); y1 = int(min(img.shape[0], (it["el"]["y"] + it["el"]["h"] + pad) * D))
    h = hsv[y0:y1, x0:x1]
    hue = it["hue"] / 2  # OpenCV hue is 0..180
    dh = np.abs(h[..., 0] - hue); dh = np.minimum(dh, 180 - dh)
    m = (h[..., 1] > 60) & (dh < 4) & (h[..., 2] > 40)
    rows = np.where(m.sum(1) > 0)[0]
    n = len(t["lines"])
    if not len(rows):
        print("no ink for", k); continue
    gaps = [(rows[i + 1] - rows[i], i) for i in range(len(rows) - 1) if rows[i + 1] - rows[i] > 1]
    cuts = sorted(i for _, i in sorted(gaps, reverse=True)[: n - 1])
    if len(cuts) < n - 1:  # lines touch: split the ink extent evenly
        span = np.linspace(rows[0], rows[-1], n + 1)
        bands = [(int(span[i]), int(span[i + 1])) for i in range(n)]
    else:
        bounds = [rows[0]] + [v for c in cuts for v in (rows[c], rows[c + 1])] + [rows[-1]]
        bands = [(bounds[2 * i], bounds[2 * i + 1]) for i in range(n)]
    cx0, cy0 = crop_origin(t["comp"])
    meas = []
    for a, b in bands:
        sub = m[a:b + 1]; cols = np.where(sub.sum(0) > 0)[0]; rr = np.where(sub.sum(1) > 0)[0]
        # page px -> component-native
        X0 = ((x0 + cols[0]) / D - it["comp"]["x"]) / s; X1 = ((x0 + cols[-1] + 1) / D - it["comp"]["x"]) / s
        Y0 = ((y0 + a + rr[0]) / D - it["comp"]["y"]) / s; Y1 = ((y0 + a + rr[-1] + 1) / D - it["comp"]["y"]) / s
        meas.append([X0, Y0, X1, Y1])
    ref = [[l[0] - cx0, l[1] - cy0, l[2] - cx0, l[3] - cy0] for l in t["lines"]]
    u = dict(USED[k])
    ratio = float(np.median([(r[2] - r[0]) / (q[2] - q[0]) for r, q in zip(ref, meas)]))
    u["fs"] *= ratio
    rc = np.mean([(r[1] + r[3]) / 2 for r in ref]); mc = np.mean([(q[1] + q[3]) / 2 for q in meas])
    u["t"] += rc - mc
    if n > 1:
        pr = ((ref[-1][1] + ref[-1][3]) - (ref[0][1] + ref[0][3])) / 2 / (n - 1)
        pm = ((meas[-1][1] + meas[-1][3]) - (meas[0][1] + meas[0][3])) / 2 / (n - 1)
        u["lh"] *= pr / pm
    if "cx" in u:
        u["cx"] += np.mean([(r[0] + r[2]) / 2 for r in ref]) - np.mean([(q[0] + q[2]) / 2 for q in meas])
        dx = abs(np.mean([(r[0] + r[2]) / 2 - (q[0] + q[2]) / 2 for r, q in zip(ref, meas)]))
    else:
        dx = max(r[2] for r in ref) - max(q[2] for q in meas)
        u["r"] -= dx
    fit[k] = {kk: round(float(v), 2) for kk, v in u.items()}
    report.append((k, round(ratio, 3), round(float(rc - mc), 1), round(float(abs(dx)), 1)))
(HERE / "tools/text_fit.json").write_text(json.dumps(fit, indent=1))
worst = max(report, key=lambda r: max(abs(r[1] - 1) * 100, abs(r[2]), r[3]))
print("pass: max |size err| %.1f%%, max |dy| %.1f, max |dx| %.1f native px; worst %s" % (
    max(abs(r[1] - 1) * 100 for r in report), max(abs(r[2]) for r in report), max(r[3] for r in report), worst))
