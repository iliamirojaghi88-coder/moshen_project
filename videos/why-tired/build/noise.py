"""Seeded, vectorised 3D Perlin noise (numpy) shared by the asset generators."""
import numpy as np

_GRAD = np.array(
    [[1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1],
     [1, 0, -1], [-1, 0, -1], [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]], float)


class Perlin3:
    def __init__(self, seed):
        p = np.random.RandomState(seed).permutation(256)
        self.p = np.concatenate([p, p, p])

    def __call__(self, P):
        P = np.asarray(P, float)
        Pi = np.floor(P).astype(np.int64)
        Pf = P - Pi
        Pi &= 255
        f = Pf * Pf * Pf * (Pf * (Pf * 6 - 15) + 10)
        p = self.p
        out = np.zeros(len(P))
        for dx in (0, 1):
            wx = f[:, 0] if dx else 1 - f[:, 0]
            for dy in (0, 1):
                wy = f[:, 1] if dy else 1 - f[:, 1]
                for dz in (0, 1):
                    wz = f[:, 2] if dz else 1 - f[:, 2]
                    h = p[p[p[Pi[:, 0] + dx] + Pi[:, 1] + dy] + Pi[:, 2] + dz] % 12
                    d = Pf - (dx, dy, dz)
                    out += wx * wy * wz * (_GRAD[h] * d).sum(1)
        return out

    def fbm(self, P, octaves=4, lac=2.0, gain=0.5):
        amp, tot, norm = 1.0, 0.0, 0.0
        P = np.asarray(P, float)
        for i in range(octaves):
            tot = tot + amp * self(P * (lac ** i) + i * 17.13)
            norm += amp
            amp *= gain
        return tot / norm


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)
