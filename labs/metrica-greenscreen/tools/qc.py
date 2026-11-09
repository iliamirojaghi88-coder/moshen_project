# Numeric QC over ALL frames of the final stacked MP4 against the source.
import sys, subprocess, numpy as np
src, stk = sys.argv[1], sys.argv[2]
W, H, Y0 = 1080, 1424, 272
def frames(path, w, h, vf=None):
    cmd = ['ffmpeg', '-v', 'error', '-i', path] + (['-vf', vf] if vf else []) + ['-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE)
    while True:
        b = p.stdout.read(w * h * 3)
        if len(b) < w * h * 3: return
        yield np.frombuffer(b, np.uint8).reshape(h, w, 3).astype(np.int16)
n = 0; green_vis = 0; vis = 0; worst = 0; diffs = []; leak = 0; pure = 0
for s, k in zip(frames(src, W, H, f'crop={W}:{H}:0:{Y0}'), frames(stk, 2 * W, H)):
    F, a = k[:, :W], k[:, W:, 0] / 255.0
    a = np.clip((a - 0.02) / 0.96, 0, 1)                      # same remap as the shader
    gd = F[..., 1] - np.maximum(F[..., 0], F[..., 2])
    sgd = s[..., 1] - np.maximum(s[..., 0], s[..., 2])
    v = a > 0.05; vis += v.sum()
    gv = v & (gd > 15) & (sgd <= 0)                           # green in output where the source subject had none
    green_vis += gv.sum(); worst = max(worst, int((gd * v).max()))
    op = (a > 0.99) & (sgd <= -10)                            # solid subject pixels
    diffs.append(np.abs(F[op] - s[op]).mean())
    pg = (sgd > 0.75 * s[..., 1]) & (s[..., 1] > 100)         # pure, unshadowed screen green in the source
    pure += pg.sum(); leak += (pg & (a > 0.02)).sum()
    n += 1
print(f'frames checked: {n}')
print(f'visible pixels with green cast not present in source subject: {green_vis} of {vis} ({green_vis / vis * 100:.4f}%)')
print(f'max green excess over visible pixels: {worst}')
print(f'solid subject mean abs colour change vs source (codec only): {np.mean(diffs):.2f} /255')
print(f'pure screen-green pixels left visible (alpha>2%): {leak} of {pure} ({leak / pure * 100:.4f}%)')
