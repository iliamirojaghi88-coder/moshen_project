#!/usr/bin/env python3
"""Score for the nocebo film: music bed + sound effects, ducked under the voice.

Writes assets/audio/score.wav (48 kHz stereo). The voice stays its own track in
the composition; the final loudness pass happens on the rendered file.
Every effect sits on a visible action (times are film seconds, see SPEC.md).
Designed sounds are synthesised from seeded noise and sines; library hits come
from the media-use bundle (Pixabay licence), each used once.

Usage: mix_score.py <music-dir> <sfx-dir> <voice.mp3> <out.wav>
"""
import subprocess
import sys

import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt

SR = 48000
DUR = 81.0
VOICE_AT = 0.3
N = int(DUR * SR)


def load(path, sr=SR):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "2", "-ar", str(sr), "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).copy()


def db(x):
    return 10 ** (x / 20)


def t(n):
    return np.arange(n) / SR


def env(n, a, r, shape=2.0):
    """attack a s, then exponential-ish release over the rest"""
    x = t(n)
    e = np.minimum(1, x / max(a, 1e-4)) ** shape
    rel = np.clip((x - a) / max(r, 1e-4), 0, 1)
    return e * (1 - rel) ** 2


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], btype="band", fs=SR, output="sos"), x, axis=0)


def lp(x, f, order=2):
    return sosfilt(butter(order, f, btype="low", fs=SR, output="sos"), x, axis=0)


def hp(x, f, order=2):
    return sosfilt(butter(order, f, btype="high", fs=SR, output="sos"), x, axis=0)


def noise(n, seed, ch=2):
    return np.random.default_rng(seed).standard_normal((n, ch)).astype(np.float32)


def stereo(m, pan=0.0):
    l = np.cos((pan + 1) * np.pi / 4)
    r = np.sin((pan + 1) * np.pi / 4)
    return np.stack([m * l * 1.41, m * r * 1.41], -1)


# ---------- designed sounds ----------
def sub_thump(f0=70, f1=42, dur=0.9):
    n = int(dur * SR)
    x = t(n)
    f = f1 + (f0 - f1) * np.exp(-x * 18)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-x * 5.5)
    click = lp(noise(n, 11, 1)[:, 0] * np.exp(-x * 160), 1800)
    return stereo(body * 0.9 + click * 0.25)


def air(dur, lo, hi, seed, pan0=0.0, pan1=0.0, peak=0.55):
    """filtered air moving past: band sweeps lo->hi, rises then falls"""
    n = int(dur * SR)
    out = np.zeros((n, 2), np.float32)
    src = noise(n, seed)
    steps = 24
    for i in range(steps):
        a, b = i * n // steps, (i + 1) * n // steps
        k = i / (steps - 1)
        c = lo * (hi / lo) ** k
        out[a:b] = bp(src[a:b], c * 0.6, min(c * 1.6, 20000))
    x = t(n) / dur
    shape = np.sin(np.pi * np.clip(x, 0, 1)) ** 1.5 * (x < peak) + (x >= peak) * np.sin(np.pi * np.clip(x, 0, 1)) ** 2.4
    pan = pan0 + (pan1 - pan0) * x
    l = np.cos((pan + 1) * np.pi / 4)
    r = np.sin((pan + 1) * np.pi / 4)
    out[:, 0] *= shape * l * 1.41
    out[:, 1] *= shape * r * 1.41
    return out * 0.6


def liquid(dur, seed, rate=0.45):
    """slow liquid movement: low band noise breathing with the swell"""
    n = int(dur * SR)
    x = t(n)
    src = lp(noise(n, seed), 700, 3)
    mod = 0.55 + 0.45 * np.sin(2 * np.pi * rate * x - 1.2)
    slosh = bp(noise(n, seed + 1), 180, 1400) * ((0.5 + 0.5 * np.sin(2 * np.pi * rate * 2 * x)) ** 3 * 0.35)[:, None]
    fade = np.minimum(1, x / 0.8) * np.minimum(1, (dur - x) / 0.6)
    return (src * mod[:, None] + slosh) * fade[:, None] * 0.9


def drop():
    """water drop + ring: a plip with a rising pitch, then a low swell"""
    n = int(1.6 * SR)
    x = t(n)
    f = 650 + 1500 * (1 - np.exp(-x * 90))
    plip = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-x * 38)
    ring = np.sin(2 * np.pi * 220 * x) * np.exp(-x * 3.2) * 0.12
    return stereo(plip * 0.55 + ring) + sub_thump(64, 40, 1.6)[:n] * 0.7


def tick(freq, seed, dur=0.09):
    """ceramic tick for a glyph landing: bright transient + a short body"""
    n = int(dur * SR)
    x = t(n)
    tr = bp(noise(n, seed, 1)[:, 0], 2500, 7000) * np.exp(-x * 300)
    body = np.sin(2 * np.pi * freq * x) * np.exp(-x * 60)
    return stereo(tr * 0.6 + body * 0.5, (seed % 7 - 3) * 0.1)


def shimmer(dur, seed, pan0=0.7, pan1=-0.7):
    """light sweeping across metal: high, airy, with a few resonances"""
    n = int(dur * SR)
    x = t(n)
    src = hp(noise(n, seed), 5000)
    res = sum(np.sin(2 * np.pi * f * x + i) for i, f in enumerate([2349, 3136, 4186, 5274])) * 0.04
    e = np.sin(np.pi * np.clip(x / dur, 0, 1)) ** 2
    m = (src[:, 0] * 0.25 + res) * e
    pan = pan0 + (pan1 - pan0) * x / dur
    return np.stack([m * np.cos((pan + 1) * np.pi / 4), m * np.sin((pan + 1) * np.pi / 4)], -1) * 1.41


def crackle(dur, seed, rate0, rate1):
    """neural activity: sparse soft clicks whose rate rises"""
    n = int(dur * SR)
    out = np.zeros((n, 2), np.float32)
    rs = np.random.default_rng(seed)
    pos = 0.0
    while pos < dur:
        k = pos / dur
        rate = rate0 + (rate1 - rate0) * k * k
        pos += rs.exponential(1 / rate)
        i = int(pos * SR)
        if i + 400 >= n:
            break
        c = tick(1200 + rs.random() * 900, int(rs.integers(1e6)), 0.008)
        g = 0.25 + 0.35 * k
        out[i : i + len(c)] += c * g * (0.6 + 0.4 * rs.random())
    return out


def place(buf, clip, at, gain_db=0.0):
    i = int(at * SR)
    if i >= len(buf):
        return
    j = min(len(buf), i + len(clip))
    buf[i:j] += clip[: j - i] * db(gain_db)


def peak_offset(clip):
    """seconds from the clip start to its loudest moment"""
    e = np.abs(clip).max(1)
    return float(np.argmax(e)) / SR


def main():
    music_dir, sfx_dir, voice_path, out_path = sys.argv[1:5]
    lib = lambda name: load(f"{sfx_dir}/{name}.mp3")

    # ----- music bed -----
    bed = np.zeros((N, 2), np.float32)

    def section(name, at, end, fade_in=0.6, fade_out=0.8, loop_from=None, gain_db=0.0, ramp=None):
        try:
            m = load(f"{music_dir}/{name}.wav")
        except subprocess.CalledProcessError:
            print("missing music section", name)
            return
        # sections come out of the generator at different levels: level them first
        m = m / max(1e-6, float(np.sqrt(np.mean(m**2)))) * db(-24)
        need = int((end - at) * SR)
        if len(m) < need and loop_from is not None:
            # extend by looping from loop_from with a 1.5 s crossfade
            xf = int(1.5 * SR)
            while len(m) < need:
                tail = m[int(loop_from * SR) :]
                w = np.linspace(0, 1, xf)[:, None]
                m = np.concatenate([m[:-xf], m[-xf:] * (1 - w) + tail[:xf] * w, tail[xf:]])
        m = m[:need]
        x = np.arange(len(m)) / SR
        g = np.minimum(1, x / fade_in) * np.minimum(1, np.maximum(0, (end - at - x) / fade_out))
        if ramp:
            a, b, g0, g1 = ramp
            k = np.clip((x + at - a) / (b - a), 0, 1)
            g = g * db(g0 + (g1 - g0) * k)
        place(bed, m * g[:, None], at, gain_db)

    section("m1", 0.0, 19.1, fade_in=0.4, fade_out=0.7)
    section("m2", 22.45, 53.7, fade_in=0.5, fade_out=0.5, loop_from=8.0, gain_db=2.0, ramp=(44.0, 52.5, -2.5, 2.5))
    section("m3", 53.7, 61.2, fade_in=1.2, fade_out=0.7, loop_from=2.0, ramp=(53.7, 58.6, -9.0, 0.0))
    section("m4", 61.0, 81.0, fade_in=0.9, fade_out=1.6, loop_from=6.0)

    # normalise the bed, then duck it under the voice
    bed /= max(1e-6, np.sqrt(np.mean(bed**2)) / db(-28.5))
    voice = load(voice_path)
    vbuf = np.zeros((N, 2), np.float32)
    place(vbuf, voice, VOICE_AT)
    hop = 480
    rms = np.sqrt(np.convolve(np.mean(vbuf**2, 1), np.ones(hop) / hop, mode="same"))
    act = np.clip((20 * np.log10(rms + 1e-6) + 45) / 15, 0, 1)
    sm = np.zeros_like(act)
    a_att, a_rel = np.exp(-1 / (0.03 * SR)), np.exp(-1 / (0.35 * SR))
    # one-pole follower, decimated for speed
    dec = act[::hop]
    out = np.zeros_like(dec)
    s = 0.0
    att, rel = np.exp(-1 / (0.03 * SR / hop)), np.exp(-1 / (0.35 * SR / hop))
    for i, v in enumerate(dec):
        s = att * s + (1 - att) * v if v > s else rel * s + (1 - rel) * v
        out[i] = s
    sm = np.interp(np.arange(N), np.arange(len(out)) * hop, out)
    bed *= (1 - 0.62 * sm)[:, None]

    # ----- effects -----
    fx = np.zeros((N, 2), np.float32)
    # S1 hook: the pulse sets off; the words arrive out of depth; hard cut on «واقعاً»
    place(fx, sub_thump(58, 38, 1.2), 0.0, -11)
    place(fx, air(0.9, 900, 3500, 21, 0.4, -0.4), 1.0, -16)
    place(fx, air(1.6, 300, 2600, 22, -0.6, 0.6, 0.35), 1.45, -14)  # the pulse runs the fibre
    hit = lib("impact-bass-2")
    hit = hit[: int(1.6 * SR)] * np.minimum(1, np.linspace(1.6, 0, int(1.6 * SR)) / 0.8)[: len(hit), None]
    place(fx, hit, 3.47 - peak_offset(hit) + 0.033, -17)
    # S2: liquid swell under insert 1; tension then the ring on «درد»; throbs; bleach
    place(fx, liquid(3.1, 31), 8.5, -9)
    place(fx, hp(air(1.5, 3000, 9000, 33, 0.2, -0.2), 2500), 14.3, -20)
    place(fx, drop(), 15.86 + 0.02, -8)
    place(fx, drop()[::1] * 0.7, 16.48, -14)
    for k, at in enumerate([17.27, 18.09]):
        place(fx, sub_thump(66, 40, 0.8), at, -9 - 2 * k)
    rise = lib("riser")
    place(fx, rise[-int(1.1 * SR):] * np.linspace(0.2, 1, int(1.1 * SR))[:, None], 18.0, -14)
    # S3: out of the white, the glyphs fly in and tick into place, the word locks
    place(fx, air(1.4, 200, 1400, 41, -0.3, 0.3), 19.0, -14)
    for i, (at, f) in enumerate([(20.85, 900), (20.98, 1040), (21.11, 820)]):
        place(fx, tick(f, 50 + i), at, -16)
    imp = lib("impact-bass-1")
    place(fx, imp, 21.11 - peak_offset(imp) + 0.033, -18)
    for i, at in enumerate([21.25, 21.32, 21.39, 21.46]):
        place(fx, tick(2100 + 130 * i, 60 + i, 0.05), at, -22)
    wc = lib("whoosh-cinematic")
    place(fx, wc, 22.6 - peak_offset(wc) + 0.03, -18)
    # S4: signals in the lab fibre; the drop into the dark; the filament; the reaction lands
    place(fx, crackle(2.4, 71, 3, 9), 31.6, -18)
    place(fx, sub_thump(52, 34, 1.4), 34.3, -10)
    place(fx, hp(air(1.2, 2500, 8000, 73), 2000), 34.55, -20)
    place(fx, air(2.1, 400, 5000, 74, 0.2, -0.1, 0.8), 35.5, -19)
    place(fx, sub_thump(80, 46, 0.7), 37.6, -11)
    place(fx, air(1.25, 1800, 500, 75, 0.0, 0.0, 0.85), 37.85, -18)
    place(fx, tick(700, 76, 0.2), 39.05, -15)
    # S5: the attention rack, then the network's activity rising
    place(fx, air(1.6, 250, 900, 81, -0.2, 0.2), 44.3, -16)
    place(fx, crackle(4.6, 82, 2, 28), 48.2, -14)
    place(fx, air(0.7, 2000, 150, 83, 0.0, 0.0, 0.25), 53.05, -15)
    # S6: the strip light crosses the metal on the term, with the low reveal
    place(fx, lp(shimmer(1.5, 91), 11000), 58.3, -19)
    place(fx, sub_thump(46, 30, 2.4), 58.58, -8)
    # S7: brain to man, mind to body
    ws = lib("whoosh-short")
    place(fx, ws, 64.4 - peak_offset(ws) + 0.03, -16)
    # S8: into the dark view; the last word lands
    place(fx, sub_thump(40, 28, 2.6), 69.0, -10)
    place(fx, sub_thump(62, 40, 1.8), 77.9, -12)

    mix = bed + fx
    mix = np.tanh(mix * 1.1) / 1.1  # soft safety, nothing clips
    sf.write(out_path, mix, SR, subtype="PCM_24")
    print("score", out_path, "peak", float(np.abs(mix).max()))


if __name__ == "__main__":
    main()
