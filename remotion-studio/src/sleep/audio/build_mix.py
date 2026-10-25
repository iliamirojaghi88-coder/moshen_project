#!/usr/bin/env python3
"""Music bed + sound design for the sleep explainer, mixed under the user's narration.

Everything is synthesised here (numpy only, deterministic): no third-party
music or SFX files, so there is nothing to license. The narration file is used
as-is (only gain/limiting in the final master).

usage: build_mix.py <voice.mp3> <out_dir>
writes <out_dir>/music.wav, sfx.wav and mix.wav (48 kHz stereo, -14 LUFS, -1 dBTP).
"""
import json
import subprocess
import sys

import numpy as np

SR = 48000
DUR = 69.4857
N = int(DUR * SR) + SR // 2
rng = np.random.default_rng(11)


def t_axis(n):
    return np.arange(n) / SR


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def env_adsr(n, a, r, sustain=1.0):
    e = np.ones(n) * sustain
    na, nr = int(a * SR), int(r * SR)
    na = min(na, n)
    e[:na] = np.linspace(0, sustain, na)
    if nr > 0 and nr < n:
        e[-nr:] *= np.linspace(1, 0, nr) ** 1.5
    return e


def place(buf, sig, at, gain=1.0, pan=0.0):
    i = int(at * SR)
    if i >= buf.shape[1]:
        return
    j = min(buf.shape[1], i + len(sig))
    s = sig[: j - i] * gain
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    buf[0, i:j] += s * l * 1.414
    buf[1, i:j] += s * r * 1.414


def fft_filter(x, lo, hi):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    m = np.clip((f - lo) / (lo * 0.3 + 1), 0, 1) * np.clip((hi - f) / (hi * 0.3 + 1), 0, 1)
    return np.fft.irfft(X * m, len(x))


# ---------------------------------------------------------------- music

def pad_note(freq, dur, bright=0.5, det=0.15):
    n = int(dur * SR)
    tt = t_axis(n)
    out = np.zeros(n)
    nh = 6 + int(bright * 8)
    for d in (-det, 0, det):
        f = freq * 2 ** (d / 12)
        for h in range(1, nh + 1):
            if f * h > 9000:
                break
            out += np.sin(2 * np.pi * f * h * tt + h * 0.7 + d) / (h ** (1.6 - 0.5 * bright))
    out *= 1 + 0.08 * np.sin(2 * np.pi * 0.21 * tt)
    return out / 6 * env_adsr(n, min(1.2, dur / 3), min(1.5, dur / 2.5))


def pluck(freq, dur=0.9, bright=0.6):
    n = int(dur * SR)
    tt = t_axis(n)
    s = np.zeros(n)
    for h, a in ((1, 1), (2, 0.5 * bright), (3, 0.25 * bright), (4, 0.12 * bright), (6, 0.05 * bright)):
        s += a * np.sin(2 * np.pi * freq * h * tt) * np.exp(-tt * (3 + h * 2.2))
    s *= np.minimum(1, tt / 0.004)
    return s * 0.6


def bell(freq, dur=1.6):
    n = int(dur * SR)
    tt = t_axis(n)
    s = np.sin(2 * np.pi * freq * tt) * np.exp(-tt * 2.2)
    s += 0.4 * np.sin(2 * np.pi * freq * 2.76 * tt) * np.exp(-tt * 4)
    s += 0.2 * np.sin(2 * np.pi * freq * 5.4 * tt) * np.exp(-tt * 7)
    return s * np.minimum(1, tt / 0.002) * 0.5


def kick(level=1.0):
    n = int(0.35 * SR)
    tt = t_axis(n)
    f = 45 + 70 * np.exp(-tt * 30)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-tt * 9) * level


# sections: (start, end, chords as midi roots + quality, bright, arp rate, kick)
DM9 = [50, 57, 61, 64, 66]   # D maj9 voicing
BM9 = [47, 54, 57, 61, 62]   # Bm9
GM9 = [43, 50, 54, 57, 62]   # Gmaj9 (add9)
A6 = [45, 52, 57, 61, 64]    # A (add6/sus colour)
EM9 = [40, 47, 54, 55, 59]   # Em9
CM7 = [48, 55, 59, 62, 64]   # Cmaj9-ish (bright lift)
night = [DM9, BM9, GM9, A6]
day = [GM9, DM9, EM9, CM7]

music = np.zeros((2, N))
BAR = 60 / 88 * 4  # 88 BPM, 4/4


def chord_at(t, prog):
    return prog[int(t // BAR) % len(prog)]


def lay_pad(t0, t1, prog, bright, gain):
    t = t0
    while t < t1:
        bar_end = min(t1, (np.floor(t / BAR) + 1) * BAR)
        ch = chord_at(t + 1e-3, prog)
        dur = bar_end - t + 0.9
        for k, m in enumerate(ch):
            p = pad_note(midi(m), dur, bright)
            place(music, p, t, gain * (0.9 if k == 0 else 0.55), pan=(-0.4 + 0.2 * k))
        t = bar_end


def lay_arp(t0, t1, prog, rate, gain, bright=0.6, octave=12):
    step = 60 / 88 / rate
    i = 0
    t = t0
    while t < t1:
        ch = chord_at(t + 1e-3, prog)
        m = ch[1 + (i * 3 % 4)] + octave
        place(music, pluck(midi(m), 0.8, bright), t, gain * (1.0 if i % 4 == 0 else 0.7), pan=0.35 * np.sin(i * 1.3))
        i += 1
        t += step


def lay_kick(t0, t1, gain):
    t = np.ceil(t0 / (60 / 88)) * (60 / 88)
    while t < t1:
        place(music, kick(), t, gain)
        t += 60 / 88


def lay_bass(t0, t1, prog, gain):
    t = t0
    while t < t1:
        bar_end = min(t1, (np.floor(t / BAR) + 1) * BAR)
        root = chord_at(t + 1e-3, prog)[0] - 12
        n = int((bar_end - t + 0.3) * SR)
        tt = t_axis(n)
        s = np.sin(2 * np.pi * midi(root) * tt) * env_adsr(n, 0.05, 0.3)
        place(music, s, t, gain)
        t = bar_end


# 0–9.2 night/morning: soft pad, ticking handled in sfx
lay_pad(0, 9.4, night, 0.25, 0.20)
# 9.2–19.2 science: pad + gentle arp
lay_pad(9.2, 19.4, night, 0.45, 0.17)
lay_arp(9.4, 19.2, night, 2, 0.11, 0.5)
lay_bass(9.4, 19.2, night, 0.10)
# 19.2–41.5 reasons: arp + soft pulse
lay_pad(19.2, 41.7, night, 0.4, 0.16)
lay_arp(19.4, 41.5, night, 2, 0.10, 0.55)
lay_kick(20.0, 28.7, 0.10)
lay_kick(29.4, 38.4, 0.10)
lay_bass(19.4, 41.5, night, 0.11)
# 41.5–46.2 inertia: slow, dark, half-rate arp an octave down, no pulse
lay_pad(41.5, 46.4, night, 0.1, 0.17)
lay_arp(41.7, 46.1, night, 0.5, 0.09, 0.25, 0)
# 46.2–48.6 waking up: brighter again
lay_pad(46.2, 48.8, night, 0.6, 0.16)
lay_arp(46.3, 48.6, night, 4, 0.08, 0.7)
# 48.6–66.6 solutions + doctor: warm, positive, brighter
lay_pad(48.6, 66.9, day, 0.7, 0.16)
lay_arp(48.7, 66.6, day, 2, 0.10, 0.75)
lay_kick(49.9, 58.2, 0.09)
lay_bass(48.7, 66.6, day, 0.11)
for k, tb in enumerate(np.arange(49.9, 66.0, BAR * 2)):
    place(music, bell(midi(chord_at(tb, day)[3] + 24)), tb, 0.06, pan=0.4 * (-1) ** k)
# ending: resolve on G maj9, long tail
for k, m in enumerate(GM9 + [74]):
    place(music, pad_note(midi(m), 3.4, 0.6), 66.4, 0.16 if k else 0.22, pan=-0.4 + 0.15 * k)
place(music, bell(midi(79), 3.0), 66.7, 0.08)

# gentle low-pass for the inertia section via crossfade with a filtered copy
a, b = int(41.5 * SR), int(46.4 * SR)
for ch in range(2):
    seg = music[ch, a:b].copy()
    filt = fft_filter(seg, 20, 900)
    w = np.ones(b - a)
    ramp = int(0.6 * SR)
    w[:ramp] = np.linspace(0, 1, ramp)
    w[-ramp:] = np.linspace(1, 0, ramp)
    music[ch, a:b] = seg * (1 - w) + filt * w
# fade in/out
music[:, : int(0.6 * SR)] *= np.linspace(0, 1, int(0.6 * SR))
end = int(DUR * SR)
music[:, end - int(1.2 * SR) : end] *= np.linspace(1, 0, int(1.2 * SR)) ** 2
music[:, end:] = 0

# ---------------------------------------------------------------- sfx

sfx = np.zeros((2, N))


def whoosh(dur=0.7, lo=300, hi=4000, up=True):
    n = int(dur * SR)
    x = rng.standard_normal(n)
    x = fft_filter(x, lo, hi)
    tt = np.linspace(0, 1, n)
    e = np.sin(np.pi * tt) ** 2 if up else np.exp(-tt * 4)
    # moving brightness: blend with a darker copy
    dark = fft_filter(x, lo, lo * 2.5)
    k = tt if up else 1 - tt
    s = (dark * (1 - k) + x * k) * e
    return s / (np.abs(s).max() + 1e-9)


def impact(level=1.0):
    n = int(0.6 * SR)
    tt = t_axis(n)
    f = 38 + 90 * np.exp(-tt * 25)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 6)
    click = fft_filter(rng.standard_normal(n), 1500, 8000) * np.exp(-tt * 60) * 0.25
    return (body + click) * level


def blip(f0=1100, f1=1650, dur=0.18):
    n = int(dur * SR)
    tt = t_axis(n)
    f = f0 + (f1 - f0) * (tt / dur)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 18) * np.minimum(1, tt / 0.003)
    s += 0.3 * np.sin(2 * np.pi * np.cumsum(f * 2) / SR) * np.exp(-tt * 30)
    return s * 0.5


def tick():
    n = int(0.03 * SR)
    tt = t_axis(n)
    return fft_filter(rng.standard_normal(n), 2000, 9000) * np.exp(-tt * 300) * 0.5 + np.sin(2 * np.pi * 3200 * tt) * np.exp(-tt * 200) * 0.3


def alarm(dur=1.6):
    # twin-bell mechanical alarm: inharmonic bell partials struck ~24x per second
    n = int(dur * SR)
    tt = t_axis(n)
    tone = np.zeros(n)
    for f, a in ((1870, 1.0), (2490, 0.7), (3920, 0.4), (5230, 0.25)):
        tone += a * np.sin(2 * np.pi * f * tt)
    strike = (np.sin(2 * np.pi * 24 * tt) > 0).astype(float)
    hit = np.convolve(np.diff(strike, prepend=0).clip(0), np.exp(-np.arange(int(0.035 * SR)) / (0.012 * SR)), "same")
    s = tone * (0.25 + hit)
    s *= env_adsr(n, 0.01, 0.35)
    return s / np.abs(s).max()


def riser(dur=1.2):
    n = int(dur * SR)
    tt = np.linspace(0, 1, n)
    x = fft_filter(rng.standard_normal(n), 2000, 12000) * tt ** 2
    s = sum(np.sin(2 * np.pi * f * (1 + tt) * t_axis(n)) for f in (880, 1320, 1760)) * tt ** 2 * 0.15
    return (x * 0.4 + s) * np.sin(np.pi * np.minimum(1, tt * 1.1)) ** 0.5


def room_tone(dur):
    n = int(dur * SR)
    x = fft_filter(rng.standard_normal(n), 40, 600)
    return x / np.abs(x).max()


# clock time-lapse ticks accelerating, then the alarm
tt = 0.05
step = 0.22
while tt < 1.5:
    place(sfx, tick(), tt, 0.10, pan=0.3)
    tt += step
    step = max(0.05, step * 0.86)
place(sfx, alarm(1.55), 1.55, 0.17, pan=0.25)
place(sfx, alarm(0.9) * np.linspace(1, 0.3, int(0.9 * SR)), 3.1, 0.06, pan=0.25)

for t0, d, lo, hi, g in [
    (0.0, 1.3, 200, 3000, 0.10),
    (1.9, 0.5, 400, 6000, 0.16),
    (8.8, 0.6, 300, 5000, 0.12),
    (15.9, 0.8, 300, 4000, 0.07),
    (17.0, 0.8, 300, 4000, 0.07),
    (18.7, 0.65, 300, 6000, 0.12),
    (27.15, 0.5, 400, 6000, 0.15),
    (28.6, 0.8, 200, 3500, 0.12),
    (36.0, 2.5, 150, 2500, 0.08),
    (39.6, 0.6, 300, 5000, 0.12),
    (48.2, 0.9, 200, 4000, 0.10),
    (52.8, 0.6, 300, 6000, 0.11),
    (55.75, 0.9, 200, 3500, 0.08),
    (57.7, 0.9, 300, 6000, 0.10),
    (65.3, 1.2, 200, 3000, 0.07),
]:
    place(sfx, whoosh(d, lo, hi), t0, g, pan=0.2 * np.sin(t0))

for t0, g in [(0.5, 0.20), (1.98, 0.22), (10.25, 0.16), (13.4, 0.14), (19.4, 0.12), (26.3, 0.13), (29.2, 0.12), (38.75, 0.12), (40.16, 0.20), (48.6, 0.16), (66.65, 0.18)]:
    place(sfx, impact(), t0, g)

for t0 in [10.3, 16.05, 17.1, 31.0, 31.35, 31.7, 32.7, 33.6, 34.5, 50.2, 50.6, 54.4]:
    place(sfx, blip(), t0, 0.07, pan=0.3)
for g in (0.28, 0.55, 0.8):
    tg = 19.6 + 7.4 * g
    place(sfx, blip(700, 520, 0.3), tg, 0.08, pan=-0.2)
place(sfx, riser(1.4), 45.0, 0.12)
place(sfx, riser(1.6), 55.9, 0.10)
for t0 in np.arange(46.25, 47.6, 0.12):
    place(sfx, blip(1500 + 300 * np.sin(t0 * 7), 2200, 0.12), t0, 0.03, pan=np.sin(t0 * 5))

# room tone in bedroom scenes
for a0, b0, g in [(0, 9.2, 0.012), (19.15, 29.0, 0.012), (38.6, 40.1, 0.01), (53.25, 58.35, 0.01)]:
    r = room_tone(b0 - a0)
    r *= env_adsr(len(r), 0.3, 0.3)
    place(sfx, r, a0, g)

# ---------------------------------------------------------------- mix


def write_wav(path, x):
    x = np.clip(x, -1, 1)
    pcm = (x.T * 32767).astype("<i2").tobytes()
    import wave

    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm)


def main():
    voice_path, out = sys.argv[1], sys.argv[2]
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", voice_path, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True, check=True).stdout
    v = np.frombuffer(raw, dtype="<f4").astype(np.float64)
    voice = np.zeros(N)
    voice[: min(N, len(v))] = v[:N]
    # speech envelope for ducking (50 ms RMS, smoothed)
    win = int(0.05 * SR)
    rms = np.sqrt(np.convolve(voice ** 2, np.ones(win) / win, "same"))
    speech = np.clip((20 * np.log10(rms + 1e-9) + 45) / 12, 0, 1)
    sm = int(0.25 * SR)
    speech = np.convolve(speech, np.ones(sm) / sm, "same")
    duck = 1 - 0.55 * speech
    m = music * duck
    vg = 10 ** (4.0 / 20)  # narration up front
    mix = np.vstack([voice * vg, voice * vg]) + m + sfx
    write_wav(f"{out}/music.wav", music * 0.9)
    write_wav(f"{out}/sfx.wav", sfx)
    pre = mix / (np.abs(mix).max() + 1e-9) * 0.7
    write_wav(f"{out}/premix.wav", pre)
    # two-pass loudnorm to -14 LUFS / -1 dBTP
    p1 = subprocess.run(
        ["ffmpeg", "-hide_banner", "-i", f"{out}/premix.wav", "-af", "loudnorm=I=-14:TP=-1.5:LRA=9:print_format=json", "-f", "null", "-"],
        capture_output=True,
        text=True,
    ).stderr
    j = json.loads(p1[p1.rindex("{") : p1.rindex("}") + 1])
    af = (
        f"loudnorm=I=-14:TP=-1.5:LRA=9:measured_I={j['input_i']}:measured_TP={j['input_tp']}:measured_LRA={j['input_lra']}:"
        f"measured_thresh={j['input_thresh']}:offset={j['target_offset']}:linear=true,alimiter=limit=0.84:level=false,"
        f"atrim=0:{DUR},aresample=48000"
    )
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", f"{out}/premix.wav", "-af", af, "-ar", "48000", "-c:a", "pcm_s16le", f"{out}/mix.wav"], check=True)
    print("ok", out)


if __name__ == "__main__":
    main()
