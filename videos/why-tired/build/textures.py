"""Procedural PBR texture maps for the film (numpy only, seeded, tileable).

python3 build/textures.py assets/tex
"""
import os, sys, zlib, struct
import numpy as np

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
R = np.random.RandomState(1234)


def png(path, a):
    """Write uint8 HxW, HxWx3 or HxWx4 as PNG (no PIL needed)."""
    a = np.ascontiguousarray(a)
    if a.ndim == 2:
        a = a[:, :, None]
    h, w, c = a.shape
    ct = {1: 0, 3: 2, 4: 6}[c]
    raw = b"".join(b"\0" + a[y].tobytes() for y in range(h))

    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, ct, 0, 0, 0))
    data += chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    open(os.path.join(OUT, path), "wb").write(data)
    print("wrote", path, a.shape)


def u8(x):
    return np.clip(x * 255 + 0.5, 0, 255).astype(np.uint8)


def norm01(x):
    return (x - x.min()) / (x.max() - x.min() + 1e-9)


def fft_noise(n, m, beta=2.0, fmin=1.0, fmax=None, aniso=(1.0, 1.0), seed=0):
    """Periodic (tileable) noise with 1/f^beta spectrum."""
    rs = np.random.RandomState(seed)
    wn = rs.randn(n, m)
    fy = np.fft.fftfreq(n)[:, None] * n * aniso[0]
    fx = np.fft.fftfreq(m)[None, :] * m * aniso[1]
    f = np.sqrt(fx * fx + fy * fy)
    filt = np.where(f < fmin, 0, 1 / np.maximum(f, 1e-6) ** (beta / 2))
    if fmax:
        filt *= np.exp(-(f / fmax) ** 2)
    out = np.real(np.fft.ifft2(np.fft.fft2(wn) * filt))
    return out / (out.std() + 1e-9)


def height_to_normal(h, strength):
    """Tileable central differences -> tangent-space normal map (OpenGL, +Y up)."""
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5 * strength
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5 * strength
    nz = np.ones_like(h)
    nx, ny = -dx, dy
    l = np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.stack([nx / l * 0.5 + 0.5, ny / l * 0.5 + 0.5, nz / l * 0.5 + 0.5], -1)


# ---- linen / cotton weave: interlaced warp and weft with slub irregularity
N = 512
y, x = np.mgrid[0:N, 0:N] / N
th = 64  # threads per tile
warp = 0.5 + 0.5 * np.cos(2 * np.pi * x * th)
weft = 0.5 + 0.5 * np.cos(2 * np.pi * y * th)
over = (np.floor(x * th) + np.floor(y * th)) % 2
slub = 0.25 * fft_noise(N, N, 2.0, fmin=2, aniso=(4, 0.5), seed=2) + 0.25 * fft_noise(N, N, 2.0, fmin=2, aniso=(0.5, 4), seed=3)
h = np.where(over > 0, warp ** 0.7, weft ** 0.7) + 0.35 * slub + 0.15 * fft_noise(N, N, 1.0, fmin=8, seed=4)
png("linen_n.png", u8(height_to_normal(norm01(h), 3.0)))

# ---- wool rug: soft tufts
h = fft_noise(N, N, 1.4, fmin=6, fmax=140, seed=5) + 0.5 * fft_noise(N, N, 2.4, fmin=1, seed=6)
png("wool_n.png", u8(height_to_normal(norm01(h), 7.0)))

# ---- plaster wall: very low relief
h = fft_noise(N, N, 2.6, fmin=1, seed=7) + 0.12 * fft_noise(N, N, 1.0, fmin=20, seed=8)
png("plaster_n.png", u8(height_to_normal(norm01(h), 2.0)))

# ---- brushed metal: long streaks along X
h = fft_noise(N, N, 1.6, fmin=1, aniso=(1.0, 40.0), seed=9)
png("brushed_n.png", u8(height_to_normal(norm01(h), 1.2)))
png("brushed_r.png", u8(0.5 + 0.12 * h / 3))

# ---- walnut: flowing grain along X with darker rays, tileable
M = 1024
yy, xx = np.mgrid[0:M, 0:M] / M
warpn = fft_noise(M, M, 3.0, fmin=1, seed=10)
rings = np.sin(2 * np.pi * (yy * 18 + 0.35 * warpn + 0.05 * fft_noise(M, M, 2.0, fmin=2, aniso=(1, 6), seed=11)))
fine = fft_noise(M, M, 1.3, fmin=4, aniso=(1.0, 30.0), seed=12)
g = 0.5 + 0.5 * rings
base = np.array([0.30, 0.18, 0.11])
dark = np.array([0.15, 0.085, 0.05])
alb = base[None, None] * (1 - g[..., None] * 0.55) + dark[None, None] * g[..., None] * 0.55
alb *= (1 + 0.08 * fine[..., None])
png("walnut_a.png", u8(np.clip(alb, 0, 1) ** (1 / 2.2)))
png("walnut_n.png", u8(height_to_normal(norm01(0.6 * g + 0.25 * fine), 1.6)))

# ---- oak floor: 2 m x 2 m tile, 11 planks of 0.18 m, staggered butt joints
M = 2048
yy, xx = np.mgrid[0:M, 0:M] / M  # metres / 2
pw = 1 / 11
plank = np.floor(xx / pw)
offs = (plank * 0.37 % 1.0)
along = (yy + offs) % 1.0
seam_x = np.minimum(xx % pw, pw - xx % pw) / pw
seam_y = np.minimum(along % 0.5, 0.5 - along % 0.5) / 0.5
seam = np.minimum(np.clip(seam_x / 0.012, 0, 1), np.clip(seam_y / 0.004, 0, 1))
board = plank * 3.17 + np.floor(along * 2) * 1.37
tone = 0.88 + 0.12 * np.sin(board * 12.9898) * 0.5 + 0.06 * np.cos(board * 7.31)
grainw = fft_noise(M, M, 1.5, fmin=3, aniso=(1.0, 50.0), seed=13)
figure = np.sin(2 * np.pi * (xx * 140 + 0.6 * fft_noise(M, M, 3.0, fmin=1, seed=14) + board))
oak = np.array([0.55, 0.40, 0.27])
oakd = np.array([0.36, 0.24, 0.15])
t = (0.5 + 0.5 * figure) * 0.35 + 0.1 * grainw
alb = oak[None, None] * (1 - t[..., None]) + oakd[None, None] * t[..., None]
alb *= tone[..., None]
alb *= (0.55 + 0.45 * seam[..., None])
png("oak_a.png", u8(np.clip(alb, 0, 1) ** (1 / 2.2)))
png("oak_n.png", u8(height_to_normal(seam * 0.8 + 0.08 * grainw, 2.5)))
png("oak_r.png", u8(0.42 + 0.12 * norm01(grainw) + 0.25 * (1 - seam)))

# ---- moon: equirect albedo + bump with maria and craters
Wm, Hm = 2048, 1024
lat = (np.arange(Hm)[:, None] + 0.5) / Hm * np.pi - np.pi / 2
lon = (np.arange(Wm)[None, :] + 0.5) / Wm * 2 * np.pi - np.pi
P = np.stack(np.broadcast_arrays(np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)), -1).reshape(-1, 3)
sys.path.insert(0, os.path.dirname(__file__))
from noise import Perlin3, smoothstep
Pn = Perlin3(77)
maria = smoothstep(0.05, 0.35, Pn.fbm(P * 1.6 + 3, 4)).reshape(Hm, Wm)
alb = 0.6 - 0.25 * maria + 0.05 * Pn.fbm(P * 9, 4).reshape(Hm, Wm) + 0.03 * Pn.fbm(P * 30, 3).reshape(Hm, Wm)
bump = 0.15 * Pn.fbm(P * 6, 5).reshape(Hm, Wm)
rs = np.random.RandomState(99)
nC = 1600
cdir = rs.randn(nC, 3)
cdir /= np.linalg.norm(cdir, axis=1, keepdims=True)
crad = 0.006 + 0.08 * rs.rand(nC) ** 7
Pg = P.reshape(Hm, Wm, 3)
for d, r in zip(cdir, crad):
    ang = np.arccos(np.clip((Pg * d).sum(-1), -1, 1))
    m = ang < r * 1.6
    if not m.any():
        continue
    q = ang[m] / r
    bowl = np.where(q < 1, (q * q - 1) * 0.9, 0) + np.where((q > 0.8) & (q < 1.6), 0.35 * np.exp(-((q - 1.05) / 0.18) ** 2), 0)
    bump[m] += bowl * r * 4
    alb[m] += np.where(q < 1.0, -0.012 * (1 - q * q), 0.0) + 0.04 * np.exp(-((q - 1.0) / 0.6) ** 2) * (r > 0.05) * rs.rand()
png("moon_a.png", u8(np.clip(alb, 0, 1) ** (1 / 2.2)))
png("moon_h.png", u8(norm01(bump)))

# ---- sun: granulation + faculae (equirect, emissive)
Ps = Perlin3(31)
gran = Ps.fbm(P * 40, 3).reshape(Hm, Wm)
cells = 1 - np.abs(Ps(P * 22).reshape(Hm, Wm))
spots = smoothstep(0.55, 0.75, Ps.fbm(P * 3 + 9, 3).reshape(Hm, Wm))
v = 0.72 + 0.18 * cells + 0.1 * gran - 0.25 * spots
png("sun_e.png", u8(np.clip(v, 0, 1)))
