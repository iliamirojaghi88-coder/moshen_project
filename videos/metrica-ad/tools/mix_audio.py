#!/usr/bin/env python3
"""Mix the METRICA film's sound: the user's voice (untouched), a two-mood
music bed that opens on the logo reveal, and effects placed on the visible
actions. Writes assets/audio/mix.m4a (48 kHz stereo AAC), loudness -14 LUFS.

  python3 tools/mix_audio.py
"""
import json
import os
import subprocess
import sys
import tempfile

import numpy as np
import soundfile as sf

SR = 48000
DUR = 67.0
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
A = os.path.join(ROOT, "assets", "audio")
SFX = os.path.join(A, "sfx")


def load(path, sr=SR):
    """Decode any file to float32 stereo at sr via ffmpeg."""
    with tempfile.NamedTemporaryFile(suffix=".wav") as f:
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", path, "-ar", str(sr), "-ac", "2", "-f", "wav", f.name], check=True)
        x, _ = sf.read(f.name, dtype="float32", always_2d=True)
    return x


def db(v):
    return 10 ** (v / 20)


def place(bus, clip, at, gain_db=0.0):
    i = int(round(at * SR))
    if i >= len(bus):
        return
    n = min(len(clip), len(bus) - i)
    bus[i : i + n] += clip[:n] * db(gain_db)


def env_follow(x, attack, release):
    """Peak envelope follower on a mono signal, times in seconds."""
    a = np.exp(-1 / (attack * SR))
    r = np.exp(-1 / (release * SR))
    out = np.zeros_like(x)
    e = 0.0
    for i, v in enumerate(np.abs(x)):
        c = a if v > e else r
        e = c * e + (1 - c) * v
        out[i] = e
    return out


def strongest_offset(x, win, search):
    """Start offset (s) in the first `search` seconds whose next `win` s carry the most energy."""
    best, best_e = 0.0, -1
    for off in np.arange(0, search, 0.25):
        seg = x[int(off * SR) : int((off + win) * SR)]
        e = float(np.mean(seg ** 2)) if len(seg) else 0
        if e > best_e:
            best, best_e = off, e
    return best


def tape_stop(x, t0, length):
    """Slow the audio from t0 to a halt over `length` s (pitch drops with it)."""
    i0, n = int(t0 * SR), int(length * SR)
    src = x[i0 : i0 + 4 * n].copy()
    speed = np.linspace(1.0, 0.0, n) ** 1.5
    pos = np.cumsum(speed)
    pos = np.clip(pos, 0, len(src) - 1)
    out = np.stack([np.interp(pos, np.arange(len(src)), src[:, c]) for c in range(2)], 1)
    out *= np.linspace(1, 0.2, n)[:, None]
    y = x.copy()
    y[i0 : i0 + n] = out
    return y


def main():
    N = int(DUR * SR)
    voice = load(os.path.join(A, "voice.mp3"))
    music_dir = os.path.join(A, "music")
    tension = load(os.path.join(music_dir, "tension.wav"))
    bright = load(os.path.join(music_dir, "bright_ext.wav"))

    # ---- music bed: tension until the reveal, then the bright bed
    REVEAL = 25.93
    t_off = strongest_offset(tension, 8, 6)
    b_off = strongest_offset(bright, 4, 3)
    bed = np.zeros((N, 2), np.float32)
    seg = tension[int(t_off * SR) : int(t_off * SR) + int(REVEAL * SR)]
    seg = seg * np.minimum(1, np.arange(len(seg)) / (0.03 * SR))[:, None]
    bed[: len(seg)] += seg
    # the hook's freeze: tape-stop into silence, back on the next beat
    bed = tape_stop(bed, 4.36, 0.28)
    i0, i1 = int(4.64 * SR), int(5.22 * SR)
    bed[i0:i1] = 0
    ramp = int(0.12 * SR)
    bed[i1 : i1 + ramp] *= np.linspace(0, 1, ramp)[:, None]
    # short fade at the reveal seam, under the riser and impact
    k = int(0.08 * SR)
    e = int(REVEAL * SR)
    bed[e - k : e] *= np.linspace(1, 0, k)[:, None]
    seg = bright[int(b_off * SR) :]
    seg = seg[: N - e]
    bed[e : e + len(seg)] += seg
    # final bars: ride out after the last word, end on the closing hit
    END_HIT = 65.05
    fo0, fo1 = int(END_HIT * SR), int((END_HIT + 1.9) * SR)
    bed[fo0:fo1] *= np.linspace(1, 0, fo1 - fo0)[:, None] ** 2
    bed[fo1:] = 0

    # ---- ducking under the voice
    vmono = np.zeros(N, np.float32)
    vmono[: min(N, len(voice))] = voice[:N, 0]
    envv = env_follow(vmono[::48], 0.02 / 1, 0.35)  # 1 kHz control rate
    envv = np.interp(np.arange(N) / 48, np.arange(len(envv)), envv)
    speaking = np.clip(envv / 0.04, 0, 1)
    music_gain = db(-9.5) * (1 - speaking) + db(-19.5) * speaking
    bed *= music_gain[:, None].astype(np.float32)

    # ---- effects (file, time of the visible action, gain dB)
    fx = np.zeros((N, 2), np.float32)
    clips = {}

    def c(name):
        if name not in clips:
            clips[name] = load(os.path.join(SFX, name + ".mp3"))
        return clips[name]

    cues = [
        ("impact-bass-1", 0.0, -3), ("whoosh-cinematic", 0.0, -6),
        ("glitch-3", 2.3, -14), ("whoosh", 2.85, -12), ("whoosh-short", 3.6, -12),
        ("impact-bass-2", 4.42, -4),  # the freeze lands at 4.62 (swell before the hit)
        ("whoosh", 6.45, -10),
        ("whoosh-cinematic", 8.9, -14),
        ("pop", 12.1, -10), ("click", 12.94, -10), ("pop", 14.53, -11),
        ("whoosh-cinematic", 15.2, -12), ("sparkle", 17.0, -12),
        ("whoosh-short", 19.72, -9), ("whoosh", 21.97, -11),
        ("riser", 25.93 - 10.03, -8), ("impact-bass-2", 25.93 - 0.35, -2), ("sparkle", 25.95, -9),
        ("whoosh-short", 30.8, -10),
        ("whoosh-short", 32.88, -12), ("click", 34.6, -8),
        ("whoosh-cinematic", 36.9, -11),
        ("ping", 39.03, -13), ("pop", 40.68, -12), ("ping", 43.34, -14), ("pop", 45.2, -12),
        ("whoosh", 47.3, -9), ("sparkle", 47.45, -11),
        ("impact-bass-1", 57.15, -6), ("sparkle", 57.2, -13),
        ("impact-bass-1", 59.26, -9), ("impact-bass-1", 60.54, -8),
        ("pop", 62.18, -12), ("click-soft", 63.09, -10),
        ("impact-bass-2", END_HIT - 0.35, -3),
    ]
    # soft key ticks while the land data is typed on the phone and the floor count on the laptop
    typing = [31.36, 31.45, 31.54, 31.63, 31.72, 31.98, 32.06, 32.14, 32.22, 32.3, 32.38, 32.62, 32.72, 32.82, 33.62]
    for i, t in enumerate(typing):
        cues.append(("key-press" if i % 2 else "click-soft", t, -16))
    for name, t, g in cues:
        place(fx, c(name), max(0.0, t), g)

    mix = bed + fx
    mix[: min(N, len(voice))] += voice[:N]
    # gentle safety limiter before loudness normalisation
    peak = np.max(np.abs(mix))
    if peak > 0.98:
        mix *= 0.98 / peak
    tmp = os.path.join(A, "mix_pre.wav")
    sf.write(tmp, mix, SR, subtype="FLOAT")
    out = os.path.join(A, "mix.m4a")
    # two-pass loudnorm to -14 LUFS / -1 dBTP
    r = subprocess.run(["ffmpeg", "-hide_banner", "-i", tmp, "-af", "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"], capture_output=True, text=True)
    j = json.loads(r.stderr[r.stderr.rfind("{") :])
    af = (
        f"loudnorm=I=-14:TP=-1.5:LRA=11:measured_I={j['input_i']}:measured_TP={j['input_tp']}:"
        f"measured_LRA={j['input_lra']}:measured_thresh={j['input_thresh']}:offset={j['target_offset']}:linear=true"
    )
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", tmp, "-af", af, "-ar", str(SR), "-c:a", "aac", "-b:a", "256k", out], check=True)
    os.remove(tmp)
    print("music offsets", t_off, b_off, "->", out)


if __name__ == "__main__":
    sys.exit(main())
