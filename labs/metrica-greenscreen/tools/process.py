# Key every frame, crop to the union of non-transparent pixels (+16px), then write
#  1) hero-stacked.mp4: [straight colour | alpha] side by side, H.264 (all browsers via WebGL)
#  2) hero-alpha.webm : VP9 with real alpha (fallback when WebGL can't read the video, e.g. file://)
import sys, subprocess, numpy as np, cv2
from multiprocessing import Pool
sys.path.insert(0, sys.argv[1])
from keyer import key
SRC, OUT = sys.argv[2], sys.argv[3]
W0, H0, FPS = 1080, 1920, 24

def extend(F, a):
    # extend subject colour ~6px into transparent pixels (codec chroma bleed at edges stays on-colour);
    # everything farther stays flat black so it costs no bitrate
    w = (a > 0).astype(np.float32)
    num = cv2.GaussianBlur(F * w[..., None], (13, 13), 3); den = cv2.GaussianBlur(w, (13, 13), 3)
    fill = np.where((den > 0.02)[..., None], num / np.maximum(den, 1e-4)[..., None], 0)
    return np.where((w > 0)[..., None], F, fill)

def work(buf):
    im = np.frombuffer(buf, np.uint8).reshape(H0, W0, 3)
    F, a, _ = key(im)
    F = extend(F, a)
    return np.dstack([np.clip(F + 0.5, 0, 255), np.clip(a * 255 + 0.5, 0, 255)]).astype(np.uint8)

if __name__ == '__main__':
    dec = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', SRC, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE)
    def frames():
        while True:
            b = dec.stdout.read(W0 * H0 * 3)
            if len(b) < W0 * H0 * 3: return
            yield b
    with Pool(4) as p:
        R = list(p.imap(work, frames(), chunksize=2))
    print('frames', len(R), flush=True)
    U = np.zeros((H0, W0), bool)
    for f in R: U |= f[..., 3] > 0
    ys, xs = np.where(U)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    print('raw bbox x', x0, x1, 'y', y0, y1, flush=True)
    pad = 16
    cx0, cy0 = max(0, x0 - pad), max(0, y0 - pad)
    w = min(W0, x1 + pad) - cx0; h = min(H0, y1 + pad) - cy0
    w = min(W0 - cx0, (w + 15) // 16 * 16); h = min(H0 - cy0, (h + 15) // 16 * 16)
    w -= w % 2; h -= h % 2
    print('crop', cx0, cy0, w, h, flush=True)
    col = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv']
    x264 = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{2*w}x{h}', '-r', str(FPS), '-i', '-',
        '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18',
        '-profile:v', 'high', '-g', '48', *col, '-movflags', '+faststart', '-an', f'{OUT}/hero-stacked.mp4'], stdin=subprocess.PIPE)
    vp9 = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', f'{w}x{h}', '-r', str(FPS), '-i', '-',
        '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuva420p', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '30', '-row-mt', '1',
        '-deadline', 'good', '-cpu-used', '3', '-auto-alt-ref', '0', '-g', '48', *col, '-an', f'{OUT}/hero-alpha.webm'], stdin=subprocess.PIPE)
    for f in R:
        c = f[cy0:cy0 + h, cx0:cx0 + w]
        x264.stdin.write(np.hstack([c[..., :3], np.repeat(c[..., 3:], 3, 2)]).tobytes())
        vp9.stdin.write(np.ascontiguousarray(c).tobytes())
    x264.stdin.close(); vp9.stdin.close()
    assert x264.wait() == 0 and vp9.wait() == 0
    print('done', w, h)
