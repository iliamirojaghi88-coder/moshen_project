#!/usr/bin/env python3
"""Rectify a product photo shot on a plain backdrop into a flat, square texture.

Finds the object's outline against the backdrop, fits a quadrilateral to it and
warps it to a fronto-parallel image whose aspect matches the real dimensions.

Usage: rectify_photo.py photo.jpg out.png --size-mm 222x218 [--px 2048] [--debug dbg.jpg]
"""
import argparse

import cv2
import numpy as np


def order_corners(pts: np.ndarray) -> np.ndarray:
    s, d = pts.sum(1), np.diff(pts, axis=1).ravel()
    return np.array([pts[np.argmin(s)], pts[np.argmin(d)], pts[np.argmax(s)], pts[np.argmax(d)]], np.float32)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("photo")
    ap.add_argument("out")
    ap.add_argument("--size-mm", required=True, help="WIDTHxHEIGHT of the face in mm")
    ap.add_argument("--px", type=int, default=2048, help="long edge of the output in px")
    ap.add_argument("--inset", type=float, default=0.0, help="shrink the quad by this fraction (drops edge chips)")
    ap.add_argument("--debug")
    a = ap.parse_args()

    img = cv2.imread(a.photo)
    h, w = img.shape[:2]
    # GrabCut on a downscaled copy, seeded with "object somewhere inside a 6%
    # margin": robust to gradient backdrops and soft drop shadows.
    f = 900 / max(h, w)
    small = cv2.resize(img, None, fx=f, fy=f, interpolation=cv2.INTER_AREA)
    sh, sw = small.shape[:2]
    m = int(0.06 * min(sh, sw))
    gc = np.zeros((sh, sw), np.uint8)
    bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
    cv2.grabCut(small, gc, (m, m, sw - 2 * m, sh - 2 * m), bgd, fgd, 6, cv2.GC_INIT_WITH_RECT)
    mask = np.where((gc == cv2.GC_FGD) | (gc == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
    mask = cv2.morphologyEx(cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k), cv2.MORPH_OPEN, k)
    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    c = max(cnts, key=cv2.contourArea)
    hull = cv2.convexHull(c)
    quad = None
    for eps in np.linspace(0.005, 0.08, 40):
        approx = cv2.approxPolyDP(hull, eps * cv2.arcLength(hull, True), True)
        if len(approx) == 4:
            quad = approx.reshape(4, 2).astype(np.float32)
            break
    if quad is None:
        quad = cv2.boxPoints(cv2.minAreaRect(c)).astype(np.float32)
    quad = order_corners(quad) / f
    if a.inset:
        centre = quad.mean(0)
        quad = centre + (quad - centre) * (1 - a.inset)

    wmm, hmm = (float(v) for v in a.size_mm.lower().split("x"))
    scale = a.px / max(wmm, hmm)
    ow, oh = round(wmm * scale), round(hmm * scale)
    dst = np.array([[0, 0], [ow - 1, 0], [ow - 1, oh - 1], [0, oh - 1]], np.float32)
    M = cv2.getPerspectiveTransform(quad, dst)
    out = cv2.warpPerspective(img, M, (ow, oh), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REPLICATE)
    cv2.imwrite(a.out, out)

    if a.debug:
        dbg = img.copy()
        cv2.polylines(dbg, [quad.astype(np.int32)], True, (0, 0, 255), max(2, w // 400))
        cv2.imwrite(a.debug, dbg)
    print(f"{a.out}: {ow}x{oh}px, corners {quad.round().astype(int).tolist()}")


if __name__ == "__main__":
    main()
