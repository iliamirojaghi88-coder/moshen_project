#!/usr/bin/env python3
"""Derive PBR maps from a rectified, evenly lit photo of a glazed surface.

Outputs into OUT_DIR:  basecolor.png (studio light gradient removed),
roughness.png, normal.png (OpenGL convention), height.png.

Glaze heuristics: glossy where the glaze is intact and saturated, rougher in
speckled / chipped / unglazed spots (low saturation + high local contrast).

Usage: pbr_from_photo.py rectified.png OUT_DIR [--gloss 0.12] [--matte 0.55] [--relief 3.0]
"""
import argparse
from pathlib import Path

import cv2
import numpy as np


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("out_dir")
    ap.add_argument("--gloss", type=float, default=0.12, help="roughness of intact glaze")
    ap.add_argument("--matte", type=float, default=0.55, help="roughness of chips / bare body")
    ap.add_argument("--relief", type=float, default=3.0, help="normal-map strength")
    a = ap.parse_args()
    out = Path(a.out_dir)
    out.mkdir(parents=True, exist_ok=True)

    img = cv2.imread(a.src).astype(np.float32) / 255.0
    h, w = img.shape[:2]

    # De-light: divide out the very low-frequency luminance (studio falloff),
    # keep the mean so colours stay calibrated.
    lum = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    low = cv2.GaussianBlur(lum, (0, 0), sigmaX=w / 6)
    gain = (low.mean() / np.clip(low, 1e-3, None))[..., None]
    base = np.clip(img * gain, 0, 1)
    cv2.imwrite(str(out / "basecolor.png"), (base * 255).round().astype(np.uint8))

    hsv = cv2.cvtColor(base, cv2.COLOR_BGR2HSV)
    sat = hsv[..., 1]
    g = cv2.cvtColor(base, cv2.COLOR_BGR2GRAY)
    local = cv2.GaussianBlur(np.abs(g - cv2.GaussianBlur(g, (0, 0), 2.0)), (0, 0), 3.0)
    local = local / (local.max() + 1e-6)
    satn = cv2.GaussianBlur(sat, (0, 0), 4.0)
    satn = (satn - satn.min()) / (np.ptp(satn) + 1e-6)
    matte = np.clip(0.65 * (1 - satn) * local * 4 + 0.35 * local, 0, 1)
    rough = a.gloss + (a.matte - a.gloss) * matte
    cv2.imwrite(str(out / "roughness.png"), (rough * 255).round().astype(np.uint8))

    # Height: cuerda seca outlines and glaze pools read as slight relief.
    height = cv2.GaussianBlur(g, (0, 0), 1.5) - cv2.GaussianBlur(g, (0, 0), 25)
    height = (height - height.min()) / (np.ptp(height) + 1e-6)
    cv2.imwrite(str(out / "height.png"), (height * 255).round().astype(np.uint8))
    dx = cv2.Sobel(height, cv2.CV_32F, 1, 0, ksize=3) * a.relief
    dy = cv2.Sobel(height, cv2.CV_32F, 0, 1, ksize=3) * a.relief
    n = np.dstack([-dx, dy, np.ones_like(dx)])  # OpenGL: +Y up
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    rgb = ((n + 1) * 0.5 * 255).round().astype(np.uint8)
    cv2.imwrite(str(out / "normal.png"), rgb[..., ::-1])
    print(f"{out}: basecolor, roughness, normal, height ({w}x{h})")


if __name__ == "__main__":
    main()
