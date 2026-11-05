"""fx_noface.json — the motion-only cut (no speaker): punch-in on every reveal, flashes, glitches, dense SFX.
Run after build_panel.py --noface (reads panel_noface/timing.json). Base = base_noface.mp4 (panel + visualizer + voice).
"""
import json
from pathlib import Path
E = Path(__file__).resolve().parent
T = json.loads((E.parent / "panel_noface/timing.json").read_text(encoding="utf-8"))
cats, revs, cta, W, dur = T["cats"], T["reveals"], T["cta"], T["words"], T["dur"]
sfx, flash, glitch, zooms = [], [], [], []


def s(name, t, db):
    sfx.append({"name": name, "t": round(max(0.0, t), 2), "db": db})


def punch(t, z, hold=0.3, back=0.28):
    zooms.extend([{"t0": round(t, 2), "t1": round(t + 0.09, 2), "z0": 1.0, "z1": z, "ease": "out", "hold_to": round(t + 0.09 + hold, 2)},
                  {"t0": round(t + 0.09 + hold, 2), "t1": round(t + 0.09 + hold + back, 2), "z0": z, "z1": 1.0, "ease": "inout"}])


for c, (t0, rv) in enumerate(zip(cats, revs)):
    s("whoosh", t0 - 0.12, -12); s("swipe_up", t0 + 0.02, -16)
    for k in range(3):
        s("click", t0 + 0.04 + 0.06 * k, -18)                      # ghost cards landing
    if c:
        flash.append(round(t0, 2)); glitch.append([round(t0 - 0.03, 2), round(t0 + 0.07, 2)])
    bad, good, great = (max(r, t0 + 0.45 + 0.1 * j) for j, r in enumerate(rv))
    s("whoosh_short", bad - 0.05, -15); s("glitch", bad + 0.03, -14); s("impact", bad + 0.05, -17); s("pop", bad + 0.22, -15)
    glitch.append([round(bad + 0.02, 2), round(bad + 0.2, 2)])
    punch(bad + 0.04, 1.05, hold=0.2)
    s("whoosh_short", good - 0.05, -16); s("pop", good + 0.05, -13); s("click", good + 0.12, -14)
    punch(good + 0.04, 1.06, hold=0.2)
    s("riser", great - 0.9, -19); s("whoosh", great - 0.08, -13); s("impact", great + 0.05, -11); s("ding", great + 0.15, -15)
    s("swipe_up", great + 0.3, -18)
    flash.append(round(great + 0.04, 2))
    punch(great + 0.04, 1.12, hold=0.35, back=0.35)
s("riser", cta - 1.6, -16); s("impact", cta, -11); s("whoosh", cta + 0.05, -12)
for i in range(15):
    s("click", cta + 0.05 + i * 0.03, -22)                          # logo fan, one tick per tile
s("whoosh_short", W["list"] - 0.1, -14); s("impact", W["list"], -16)
s("whoosh_short", W["follow"] - 0.45, -14); s("click", W["follow"], -10); s("ding", W["follow"] + 0.1, -15)
s("pop", W["here"], -14)
for i in range(5):
    s("click", W["word"] + 0.02 + i * 0.09, -15)                    # typing «ابزار»
s("swipe_up", W["send"], -13); s("impact", W["send"] + 0.05, -10); s("ding", W["send"] + 0.12, -13)
flash += [round(cta, 2), round(W["send"] + 0.05, 2)]
glitch.append([round(cta - 0.02, 2), round(cta + 0.1, 2)])
punch(cta + 0.02, 1.08, hold=0.25); punch(W["send"] + 0.05, 1.1, hold=0.3)
zooms.append({"t0": round(W["send"] + 0.75, 2), "t1": round(dur - 0.05, 2), "z0": 1.0, "z1": 1.07, "ease": "inout"})

fx = {
    "base": "base_noface.mp4",
    "zoom_center": [0.5, 0.45], "zooms": sorted(zooms, key=lambda z: z["t0"]),
    "flash": sorted(flash), "glitch": sorted(glitch), "vignette": True, "grain": 6,
    "voice": {"highpass": 0, "compress": False},
    "music": {"file": "../../../assets/music/bed_108_v4.wav", "db": -16, "duck": True},
    "sfx_dir": "../../../assets/sfx", "sfx": sorted(sfx, key=lambda x: x["t"]),
}
(E / "fx_noface.json").write_text(json.dumps(fx, indent=1), encoding="utf-8")
print(len(sfx), "sfx,", len(flash), "flashes,", len(glitch), "glitches,", len(zooms), "zoom moves")
