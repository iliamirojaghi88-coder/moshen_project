"""Tonemap + grade the linear Cycles EXRs (run with .venv-cloud/bin/python: needs cv2, numpy, PIL).

  post.py beauty <beauty.exr> <out.png>         full frame: grade + bloom + veiling glare (baked)
  post.py layers <render_dir> <out_dir>         per-layer RGBA (grade only; glare is a CSS overlay in the viewer)
"""
import os, sys, json
os.environ["OPENCV_IO_ENABLE_OPENEXR"] = "1"
import cv2
import numpy as np
from PIL import Image

LOOK = dict(
    exposure=0.75,        # stops
    sat=1.12,
    shadow_tint=(0.000, 0.010, 0.030),   # navy lift in the darks (reference palette)
    high_tint=(0.985, 1.0, 1.02),
    glare=0.32,           # veiling glare from the sun side (top-left), like the reference light leak
    bloom=0.10,
)


def read_exr(path):
    im = np.load(path[:-4] + ".npy").astype(np.float32)      # written by city.py next to the EXR (RGBA, top-down)
    return im[:, :, :3], im[:, :, 3]


def tonemap(rgb):
    x = rgb * (2.0 ** LOOK["exposure"])
    # ACES fitted (Narkowicz), applied per channel, then a gentle shoulder blend to keep highlights soft
    y = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14)
    y = np.clip(y, 0, 1)
    lum = y @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    y = lum[..., None] + (y - lum[..., None]) * LOOK["sat"]
    t = np.clip(1.0 - lum * 2.2, 0, 1)[..., None]           # weight of the darks
    y = y + np.array(LOOK["shadow_tint"], np.float32) * t
    y = y * np.array(LOOK["high_tint"], np.float32)
    return np.clip(y, 0, 1)


def srgb(y):
    return np.where(y <= 0.0031308, 12.92 * y, 1.055 * np.power(y, 1 / 2.4) - 0.055)


def glare_field(h, w):
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = -0.25 * w, -0.12 * h                     # just outside the top-left corner
    d = np.hypot((xx - cx) / w, (yy - cy) / w)
    g = np.exp(-(d / 0.55) ** 1.6)
    return g


def beauty(src, dst):
    rgb, a = read_exr(src)
    h, w = a.shape
    y = tonemap(rgb)
    # bloom: blurred highlights
    hi = np.clip(y - 0.75, 0, None)
    k = max(3, int(w * 0.02) | 1)
    bl = cv2.GaussianBlur(hi, (0, 0), w * 0.012) + cv2.GaussianBlur(hi, (0, 0), w * 0.04)
    y = y + LOOK["bloom"] * bl
    # veiling glare (screen blend, slightly warm white)
    g = glare_field(h, w)[..., None] * LOOK["glare"]
    y = 1 - (1 - y) * (1 - g * np.array([1.0, 0.99, 0.97], np.float32))
    out = (srgb(np.clip(y, 0, 1)) * 255 + 0.5).astype(np.uint8)
    Image.fromarray(out).save(dst)
    print("wrote", dst, out.shape)


def layers(src_dir, dst_dir):
    os.makedirs(dst_dir, exist_ok=True)
    meta = []
    for name in ("sky", "far", "mid", "near", "front"):
        p = os.path.join(src_dir, f"layer_{name}.exr")
        rgb, a = read_exr(p)
        straight = np.where(a[..., None] > 1e-4, rgb / np.maximum(a[..., None], 1e-4), 0)
        y = srgb(tonemap(straight))
        rgba = np.dstack([y, np.clip(a, 0, 1)])
        out = (rgba * 255 + 0.5).astype(np.uint8)
        # crop to the non-empty band (saves decode memory on phones)
        rows = np.where(out[:, :, 3].max(axis=1) > 0)[0]
        y0, y1 = (int(rows[0]), int(rows[-1]) + 1) if len(rows) else (0, out.shape[0])
        Image.fromarray(out[y0:y1]).save(os.path.join(dst_dir, f"{name}.png"))
        meta.append({"name": name, "top": y0, "height": y1 - y0, "width": out.shape[1], "full_height": out.shape[0]})
        print(name, "rows", y0, y1)
    json.dump(meta, open(os.path.join(dst_dir, "layers.json"), "w"), indent=1)


if __name__ == "__main__":
    mode = sys.argv[1]
    if mode == "beauty":
        beauty(sys.argv[2], sys.argv[3])
    elif mode == "layers":
        layers(sys.argv[2], sys.argv[3])
    else:
        raise SystemExit(__doc__)
