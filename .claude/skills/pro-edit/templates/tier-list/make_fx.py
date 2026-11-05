"""fx.json for compare tools from panel/timing.json (re-run after build_panel.py)."""
import json
from pathlib import Path
E = Path(__file__).resolve().parent
T = json.loads((E.parent / "panel/timing.json").read_text(encoding="utf-8"))
cats, revs, cta, W, dur = T["cats"], T["reveals"], T["cta"], T["words"], T["dur"]
sfx, flash, glitch = [], [], []
for c, (t0, rv) in enumerate(zip(cats, revs)):
    sfx.append({"name": "whoosh", "t": round(max(0, t0 - 0.12), 2), "db": -15})
    if c: flash.append(round(t0, 2))
    bad, good, great = (max(r, t0 + 0.45 + 0.1 * j) for j, r in enumerate(rv))
    sfx += [{"name": "glitch", "t": round(bad + 0.04, 2), "db": -19}, {"name": "pop", "t": round(bad + 0.22, 2), "db": -17},
            {"name": "pop", "t": round(good + 0.06, 2), "db": -16},
            {"name": "impact", "t": round(great + 0.06, 2), "db": -15}, {"name": "ding", "t": round(great + 0.16, 2), "db": -19}]
    glitch.append([round(bad + 0.02, 2), round(bad + 0.16, 2)])
sfx += [{"name": "riser", "t": round(cta - 1.4, 2), "db": -21}, {"name": "swipe_up", "t": round(cta, 2), "db": -15},
        {"name": "whoosh_short", "t": round(W["list"] - 0.1, 2), "db": -16},
        {"name": "whoosh_short", "t": round(W["follow"] - 0.45, 2), "db": -17}, {"name": "click", "t": round(W["follow"], 2), "db": -12},
        {"name": "pop", "t": round(W["here"], 2), "db": -17}, {"name": "click", "t": round(W["word"] + 0.1, 2), "db": -16},
        {"name": "click", "t": round(W["word"] + 0.3, 2), "db": -16}, {"name": "impact", "t": round(W["send"] + 0.05, 2), "db": -15}]
flash.append(round(cta, 2))
fx = {
    "base": "base_voice.mp4",
    "matte": {"type": "video", "file": "matte/matte.mp4"},
    "layout": {"type": "popout", "windows": [[0, dur]], "scale": 0.9, "box_y": 1180, "box_w": 960, "box_h": 680,
               "anchor_y": 540, "radius": 40, "canvas": "0x05060B", "panel": "../panel/renders/panel.mp4", "panel_y": 0},
    "flash": flash, "glitch": glitch, "vignette": True, "grain": 4,
    "voice": {"highpass": 0, "compress": False},
    "music": {"file": "../../../assets/music/bed_108_v4.wav", "db": -20, "duck": True},
    "sfx_dir": "../../../assets/sfx", "sfx": sorted(sfx, key=lambda s: s["t"]),
}
(E / "fx.json").write_text(json.dumps(fx, indent=1), encoding="utf-8")
print(len(sfx), "sfx,", len(flash), "flashes,", len(glitch), "glitches")
