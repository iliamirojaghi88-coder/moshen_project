"""Cut the two telecom cable renders (black background with a coloured glow) out of their background.

A plain black-background matte would keep the glow as coloured haze, so a segmentation model draws the
outline: IS-Net general-use (DIS, Apache-2.0; the ONNX file from the rembg project, kept outside the repo
in ~/.cache/simland-models/, run with onnxruntime). Then:
  - inside the outline the cable is solid (alpha 1); the model's soft alpha is kept only on a thin edge band;
  - the black-sheathed render's body is nearly black on black, which the model cannot see: its outline below
    the sheath rim (row BODY_Y) is taken from the white-sheathed render of the same cable, the same geometry
    pixel for pixel (checked by overlay); above that row its own outline (the cores) is used.
Colours are the render's own pixels: nothing is painted, recoloured or reshaped.

    python3 -I tools/cutout-model.py
"""
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
MODEL = Path.home() / '.cache/simland-models/isnet-general-use.onnx'
URL = 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx'
BODY_Y = 680
CAT = ROOT / 'source/catalog'

if not MODEL.exists():
    raise SystemExit(f'model missing: download {URL} to {MODEL}')
sess = ort.InferenceSession(str(MODEL), providers=['CPUExecutionProvider'])


def model_alpha(im):
    x = np.asarray(im.resize((1024, 1024), Image.LANCZOS)).astype(np.float32) / 255.0 - 0.5
    y = sess.run(None, {sess.get_inputs()[0].name: x.transpose(2, 0, 1)[None]})[0][0, 0]
    y = (y - y.min()) / (y.max() - y.min() + 1e-8)
    return np.asarray(Image.fromarray((y * 255).astype(np.uint8)).resize(im.size, Image.LANCZOS)).astype(np.float32) / 255


def solid(a, thr=0.1):
    sil = (a > thr).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(sil, 8)
    sil = (lab == 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])).astype(np.uint8)
    ff = sil.copy()
    cv2.floodFill(ff, np.zeros((sil.shape[0] + 2, sil.shape[1] + 2), np.uint8), (0, 0), 1)
    sil[ff == 0] = 1  # holes inside the outline
    inner = cv2.erode(sil, np.ones((5, 5), np.uint8))
    return np.where(inner > 0, 1.0, np.where(sil > 0, a, 0.0)).astype(np.float32)


white = Image.open(CAT / 'telecom-indoor-cable-original.png').convert('RGB')
black = Image.open(CAT / 'telecom-outdoor-cable-original.png').convert('RGB')
assert white.size == black.size
aw = solid(model_alpha(white))
ab = solid(model_alpha(black))
ab[BODY_Y:] = np.maximum(ab[BODY_Y:], aw[BODY_Y:])
for im, a, name in [(white, aw, 'telecom-indoor-cable'), (black, ab, 'telecom-outdoor-cable')]:
    rgba = np.dstack([np.asarray(im), (a * 255 + 0.5).astype(np.uint8)])
    ys, xs = np.nonzero(rgba[..., 3] > 2)
    rgba = rgba[max(0, ys.min() - 2):ys.max() + 3, max(0, xs.min() - 2):xs.max() + 3]
    Image.fromarray(rgba, 'RGBA').save(CAT / f'{name}.png', optimize=True)
    print(name, rgba.shape[1], 'x', rgba.shape[0])
