# Green-difference keyer with a local background plate (captures the soft shadow on the
# green floor) and colour unmixing: F = (C - (1-a)P)/a, so edge pixels lose the green
# exactly while fully-opaque subject pixels (g <= max(r,b)) are never touched.
import numpy as np, cv2

LO, HI = 0.06, 0.94          # alpha remap: kills codec noise in the plate / snaps solid core

def normconv(img, w, sigma):
    k = int(sigma * 3) | 1
    num = cv2.GaussianBlur(img * w[..., None], (k, k), sigma)
    den = cv2.GaussianBlur(w, (k, k), sigma)
    return num, den

def key(rgb_u8):
    C = rgb_u8.astype(np.float32)
    r, g, b = C[..., 0], C[..., 1], C[..., 2]
    gd = g - np.maximum(r, b)
    # clean-background samples by green purity, so the shadowed / faintly blue-lit floor
    # counts as screen (removed) while real glows (purity < 0.6) stay foreground
    bgm = ((gd > 0.6 * g) & (g > 40) & (r < 0.3 * g) & (b < 0.5 * g)).astype(np.uint8)
    bgm = cv2.erode(bgm, np.ones((7, 7), np.uint8)).astype(np.float32)
    P = np.empty_like(C)
    n1, d1 = normconv(C, bgm, 14)
    n2, d2 = normconv(C, bgm, 60)
    glob = np.median(C[bgm > 0], axis=0) if bgm.sum() > 1000 else np.array([14, 169, 31], np.float32)
    for c in range(3):
        p1 = n1[..., c] / np.maximum(d1, 1e-4)
        p2 = n2[..., c] / np.maximum(d2, 1e-4)
        p = np.where(d1 > 0.05, p1, np.where(d2 > 0.01, p2, glob[c]))
        P[..., c] = p
    gdP = np.maximum(P[..., 1] - np.maximum(P[..., 0], P[..., 2]), 20)
    a_raw = np.clip(1 - gd / gdP, 0, 1)
    a_safe = np.maximum(a_raw, 1e-3)[..., None]
    F = np.clip((C - (1 - a_raw[..., None]) * P) / a_safe, 0, 255)
    a = np.clip((a_raw - LO) / (HI - LO), 0, 1)
    F = np.where((a_raw >= 1)[..., None], C, F)   # opaque subject: untouched source pixels
    return F, a, P

if __name__ == '__main__':
    import sys
    a = key(np.zeros((8, 8, 3), np.uint8) + np.array([14, 169, 31], np.uint8))[1]
    assert a.max() == 0, 'pure key colour must be fully transparent'
    a = key(np.zeros((8, 8, 3), np.uint8) + np.array([230, 180, 20], np.uint8))[1]
    assert a.min() == 1, 'yellow crane colour must stay opaque'
    print('self-check ok')
