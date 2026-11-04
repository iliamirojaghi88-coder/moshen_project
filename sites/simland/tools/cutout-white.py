"""Cut a product photo shot on pure white out of its background.

The same known-background matting as tools/standardize-products.py (which works on
black), run on the inverted photo: for C = a*F + (1 - a)*white, 1 - C = a*(1 - F), so
matting 1 - C on black gives the alpha and 1 - F. Colours are un-premultiplied exactly,
so the cut-out composited back on white gives the photo's own pixels; nothing is
painted, recoloured or reshaped.

A JPEG's white is not clean: compression leaves near-white noise (every channel >= 238)
around the edges. Near-white noise connected to the frame edge counts as background,
and stray specks apart from the product are dropped. The product's own colours (its
lightest pink and copper highlights stay far below 238 in at least one channel) are
untouched.

    python3 -I tools/cutout-white.py source/catalog/solar-panel-cable.jpg source/catalog/solar-panel-cable.png
"""
import importlib.util
import sys
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("standardize", HERE / "standardize-products.py")
std = importlib.util.module_from_spec(spec)
spec.loader.exec_module(std)

src, dst = Path(sys.argv[1]), Path(sys.argv[2])
import cv2  # noqa: E402

NEAR_WHITE = 238 / 255
img = std.load(src)
# near-white JPEG noise reached from the frame edge is background: make it clean white
light = (img.min(axis=2) >= NEAR_WHITE).astype(np.uint8)
n, labels, _, _ = cv2.connectedComponentsWithStats(light, connectivity=4)
border = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
img = img.copy()
img[np.isin(labels, border[border != 0])] = 1.0
colour_inv, alpha = std.matte(1.0 - img)
# keep the product (and any sizeable part of it), drop stray specks apart from it
n, labels, stats, _ = cv2.connectedComponentsWithStats((alpha > 0).astype(np.uint8), connectivity=8)
areas = stats[1:, cv2.CC_STAT_AREA]
keep = [i + 1 for i, a in enumerate(areas) if a >= areas.max() * 0.01]
alpha = np.where(np.isin(labels, keep), alpha, 0.0).astype(np.float32)
colour = np.where(alpha[..., None] > 0, 1.0 - colour_inv, 1.0)
colour, alpha, box = std.trim(colour, alpha)
std.to_rgba(colour, alpha).save(dst, optimize=True)
# check: back on white, the cut-out gives the photo's pixels
back = np.asarray(std.over(Image.open(dst), (255, 255, 255, 255))).astype(int)
x0, y0, x1, y1 = box
orig = np.asarray(Image.open(src).convert("RGB")).astype(int)[y0:y1, x0:x1]
prod = np.asarray(Image.open(dst))[..., 3] > 250  # the product itself: exactly the photo's pixels
print(f"{src.name} -> {dst.name} {x1 - x0}x{y1 - y0}  max diff on the product {np.abs(back - orig)[prod].max()}, "
      f"specks dropped {len(areas) + 1 - len(keep) - 1}")
