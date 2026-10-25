"""Sound design for «چرا بعد از ۸ ساعت خواب هنوز خسته‌ای؟».

Builds the derived effects from licensed sources (see assets/sfx/CREDITS.md),
the music bed segment, and assets/audio/sfx_cues.json for
scripts/audio-master.sh. Every cue sits on a picture event (peak one frame
after the visual), times are seconds on the film timeline.

python3 build/sfx.py <sources-dir>     # sources: alarm.ogg, voyage.mp3, birds_full.mp3
"""
import json, os, subprocess, sys
import numpy as np

SR = 48000
SRC = sys.argv[1]
OUT = "assets/sfx"
os.makedirs(OUT, exist_ok=True)


def load(path, start=None, dur=None, rate=1.0):
    cmd = ["ffmpeg", "-v", "error"]
    if start is not None:
        cmd += ["-ss", str(start)]
    if dur is not None:
        cmd += ["-t", str(dur)]
    cmd += ["-i", path, "-ac", "2", "-ar", str(int(SR / rate)), "-f", "f32le", "-"]
    a = np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, np.float32).reshape(-1, 2)
    return a.copy()


def save(name, a):
    a = np.clip(a, -1, 1).astype(np.float32)
    p = os.path.join(OUT, name)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-", "-c:a", "pcm_s16le", p],
                   input=a.tobytes(), check=True)
    print("wrote", p, f"{len(a) / SR:.2f}s")


def fade(a, fi=0.01, fo=0.05):
    n = len(a)
    i, o = int(fi * SR), int(fo * SR)
    if i:
        a[:i] *= np.linspace(0, 1, i)[:, None]
    if o:
        a[n - o:] *= np.linspace(1, 0, o)[:, None]
    return a


def onepole_lp(a, fc):
    k = np.exp(-2 * np.pi * fc / SR)
    out = np.empty_like(a)
    y = np.zeros(a.shape[1])
    for i in range(len(a)):
        y = (1 - k) * a[i] + k * y
        out[i] = y
    return out


# mechanical tick: the soft click, slowed (lower, woodier) and darkened
click = load(os.path.join(OUT, "click-soft.mp3"), rate=0.72)
click = click[: int(0.12 * SR)]
tick = fade(onepole_lp(click, 3800) * 1.6, 0.0005, 0.04)
save("tick.wav", tick)

# time sweep: ticks accelerating then easing as the hands race 23:00 → 07:00
sweep = np.zeros((int(1.6 * SR), 2), np.float32)
t = 0.0
while t < 1.45:
    u = t / 1.45
    gap = 0.11 - 0.085 * np.sin(np.pi * u)
    i = int(t * SR)
    seg = tick * (0.55 + 0.45 * np.sin(np.pi * u))
    sweep[i:i + len(seg)] += seg[: len(sweep) - i]
    t += gap
save("ticks_sweep.wav", sweep)

# alarm: a 1.3 s burst of the real bell recording
alarm = fade(load(os.path.join(SRC, "alarm.ogg"), 5.0, 1.3), 0.005, 0.18)
save("alarm_ring.wav", alarm)

# forgetting: a whoosh played backwards, swelling into nothing
w = load(os.path.join(OUT, "whoosh.mp3"))[::-1].copy()
save("whoosh_rev.wav", fade(w, 0.05, 0.02))

# draining: the riser's build reversed = a slow fall
r = load(os.path.join(OUT, "riser.mp3"), 0.0, 3.2)[::-1].copy()
save("fall.wav", fade(onepole_lp(r, 2500), 0.2, 0.6))

# phone buzzing on wood: pulsed motor rumble (filtered noise at the motor rate), three pulses
rng = np.random.RandomState(7)
n = int(1.25 * SR)
tt = np.arange(n) / SR
motor = np.sign(np.sin(2 * np.pi * 172 * tt)) * 0.5 + 0.5 * rng.randn(n) * 0.35
gate = ((tt % 0.42) < 0.27).astype(np.float32)
gate = np.convolve(gate, np.ones(240) / 240, "same")
buzz = onepole_lp((motor * gate)[:, None].repeat(2, 1), 900) * 0.6
save("phone_buzz.wav", fade(buzz.astype(np.float32), 0.01, 0.08))

# morning birds (public-domain field recording), with gentle fades
b = load(os.path.join(SRC, "birds_full.mp3"), 776.0, 4.0)
save("birds.wav", fade(b * 2.2, 0.8, 1.2))

# music bed: Living Voyage from 1 s, 71 s long (audio-master trims, fades and ducks it)
subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", "1.0", "-t", "71", "-i", os.path.join(SRC, "voyage.mp3"),
                "-c:a", "libmp3lame", "-b:a", "192k", "assets/audio/music_living-voyage.mp3"], check=True)
print("wrote assets/audio/music_living-voyage.mp3")

# ---------------------------------------------------------------- cue list
# (file, picture time, peak offset inside the file, gain dB)
P = {"whoosh.mp3": 0.16, "whoosh-short.mp3": 0.16, "whoosh-cinematic.mp3": 2.5, "impact-bass-1.mp3": 0.08,
     "impact-bass-2.mp3": 2.07, "glitch-1.mp3": 0.82, "glitch-3.mp3": 1.85, "pop.mp3": 0.12, "sparkle.mp3": 0.03,
     "click-soft.mp3": 0.05, "click.mp3": 0.05, "tick.wav": 0.005, "ticks_sweep.wav": 0.0, "alarm_ring.wav": 0.0,
     "whoosh_rev.wav": 0.4, "fall.wav": 0.0, "phone_buzz.wav": 0.0, "birds.wav": 0.0}
F = 1 / 30
cues = [
    ("whoosh-short.mp3", 3.18, -15),         # into the eye → dial
    ("ticks_sweep.wav", 3.32, -9),           # hands race 23:00 → 07:00
    ("alarm_ring.wav", 4.86, -17),           # «زنگ ساعت خورد», under the voice
    ("impact-bass-1.mp3", 8.36, -15),        # «نخوابیدی!»
    ("whoosh-short.mp3", 9.3, -18),          # «چرا؟» comes forward
    ("whoosh-cinematic.mp3", 12.32, -17),    # push through the dial into the brain
    ("pop.mp3", 13.93, -22),                 # «مدت»
    ("click-soft.mp3", 15.27, -18),          # strike-through
    ("sparkle.mp3", 15.98, -24),             # the quality wave draws on
    ("pop.mp3", 16.64, -22),                 # «زمان»
    ("whoosh.mp3", 19.05, -18),              # the wave unrolls into the night
    ("impact-bass-2.mp3", 19.99, -16),       # «اول»
    ("glitch-3.mp3", 21.18, -20),            # wake spike 1 «چند»
    ("glitch-1.mp3", 21.49, -24),            # wake spike 2 «بار»
    ("glitch-3.mp3", 22.31, -20),            # wake spike 3 «قطع»
    ("whoosh_rev.wav", 24.98, -20),          # «یادت بمونه» — forgotten
    ("fall.wav", 26.8, -22),                 # rest quality drains
    ("whoosh.mp3", 29.02, -18),              # into the second reason
    ("impact-bass-2.mp3", 29.85, -16),       # «دوم»
    ("tick.wav", 31.78, -14), ("tick.wav", 31.905, -15), ("tick.wav", 31.96, -14), ("tick.wav", 32.085, -15),
    ("tick.wav", 32.14, -14), ("tick.wav", 32.265, -15),     # «نامنظم» stutter
    ("tick.wav", 32.67, -12), ("whoosh-short.mp3", 32.66, -22),  # night 1
    ("tick.wav", 33.31, -12), ("whoosh-short.mp3", 33.3, -22),   # night 2
    ("tick.wav", 33.93, -12), ("whoosh-short.mp3", 33.92, -22),  # night 3
    ("tick.wav", 34.53, -12), ("whoosh-short.mp3", 34.52, -22),  # night 4
    ("sparkle.mp3", 35.5, -22),              # the orrery assembles
    ("glitch-1.mp3", 37.95, -22),            # «به هم بریزه»
    ("whoosh-cinematic.mp3", 38.75, -18),    # into the inertia fog
    ("impact-bass-2.mp3", 39.3, -16),        # «سوم»
    ("impact-bass-1.mp3", 40.2, -17),        # «اینرسی» lands heavy
    ("impact-bass-1.mp3", 40.92, -19),       # «خواب»
    ("whoosh.mp3", 41.9, -18),               # the camera slips between the words
    ("whoosh-cinematic.mp3", 48.3, -19),     # cold → morning
    ("pop.mp3", 48.9, -20),                  # «چیکار کنی؟»
    ("tick.wav", 50.0, -12), ("tick.wav", 51.0, -12), ("tick.wav", 52.0, -12), ("tick.wav", 53.0, -12),  # regular
    ("phone_buzz.wav", 53.05, -20),          # the phone buzzes…
    ("click.mp3", 53.73, -14),               # lamp off
    ("click.mp3", 54.28, -14),               # phone off
    ("click.mp3", 54.86, -15),               # LED off
    ("birds.wav", 55.95, -12),               # morning
    ("whoosh.mp3", 58.25, -18),              # into the white studio
    ("pop.mp3", 64.0, -22),                  # «پزشک»
    ("whoosh-cinematic.mp3", 65.3, -18),     # to the ending
    ("whoosh-short.mp3", 67.1, -18),         # the ۸ flies into the dial
    ("click-soft.mp3", 67.76, -14),          # …and lands
    ("impact-bass-2.mp3", 68.9, -15),        # «نیست.»
]
out = []
for f, at, g in cues:
    start = max(0.0, at + F - P[f])
    out.append({"file": os.path.join(OUT, f), "at": round(start, 3), "gain_db": g})
json.dump(out, open("assets/audio/sfx_cues.json", "w"), indent=1)
print(len(out), "cues -> assets/audio/sfx_cues.json")
