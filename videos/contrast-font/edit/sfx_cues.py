"""Sound-design cue sheet -> assets/sfx/cues.json for scripts/audio-master.sh.

  python3 videos/contrast-font/edit/sfx_cues.py
Each cue: (visual time on the cut timeline, sound, gain dB, why). The sound is placed so its measured
peak lands one frame after the picture (light arrives before sound).
"""
import json, subprocess, struct
from pathlib import Path

P = Path(__file__).resolve().parents[1]
SFX = P / "assets/sfx"

CUES = [
    # S1 hook
    (0.05, "whoosh", -13, "title settles, light sweep"), (0.30, "sparkle", -17, "glint on the gold"),
    (2.50, "pop", -14, "✓ readable chip + underline"),
    (3.81, "click", -9, "title wipes to navy"), (4.57, "click_lo", -9, "title wipes to black"),
    (5.99, "impact_soft", -12, "punch-in on «خیلی بد»"), (6.00, "error", -12, "✕ unreadable"),
    (8.30, "tick", -8, "font roll 1"), (8.39, "tick", -8, "font roll 2"), (8.48, "pop_lo", -15, "lands on the wrong font"),
    (10.00, "glitch_hit", -16, "✕ wrong font"),
    (11.22, "impact", -10, "snap back to the professional title"), (11.26, "sparkle", -18, "flash glint"),
    (11.42, "whoosh_hi", -13, "gold streak transition"),
    # S2 contrast + font matter
    (12.84, "whoosh_lo", -13, "«کنتراست رنگی» flips up"), (14.05, "sweep", -12, "«انتخاب فونت» reveal + light lines"),
    (17.09, "revrise", -14, "reverse riser into «مهمه»"), (17.09, "impact", -9, "«مهمه» hit"),
    (17.78, "whoosh", -12, "whip lines into the card"),
    # S3 contrast definition
    (21.32, "sweep_lo", -13, "panel splits, contrast changes live"), (21.62, "pop_hi", -17, "labels"),
    (22.21, "click", -10, "selection: background"), (23.87, "click_lo", -10, "selection: text"),
    (26.51, "ping", -16, "priority glow"), (28.78, "impact_soft", -13, "focus punch"), (28.75, "sparkle", -19, "light over the strong panel"),
    (29.70, "whoosh_hi", -13, "card folds, light leak"),
    # S4 white + three backgrounds
    (29.98, "pop_hi", -17, "low-risk chip"), (33.12, "sparkle", -14, "«سفید» lands"),
    (35.35, "riser", -15, "glare washes the text out"), (35.36, "glitch_hit", -17, "✕"),
    (37.29, "click", -9, "glass background"), (40.07, "sweep", -12, "gradient background wipes in"),
    (43.35, "click_lo", -9, "plain background snaps open"), (44.76, "sweep_lo", -13, "neon zip transition"),
    # S5 font choice / subtitles
    (45.40, "tick", -9, "picker step"), (45.76, "tick", -9, "picker step"), (45.98, "pop", -13, "right font ✓"),
    (46.70, "message", -16, "message bubble"), (48.62, "whoosh", -12, "message sent"),
    (51.30, "glitch_bed", -22, "bad subtitle chaos bed"),
    (52.43, "pop_hi", -15, "«توپل»"), (52.89, "pop", -14, "«درشت»"), (53.83, "pop_lo", -13, "«عجیب‌وغریب»"),
    (55.00, "glitch_hit", -13, "bad subtitle glitches into a clean one"), (55.62, "click", -12, "✓ clean subtitle"),
    # S6 headline (music drop on the cut)
    (58.333, "impact_lo", -10, "hard cut, rhythm change"),
    (59.36, "impact", -8, "«تیتر» slams in"), (59.30, "whoosh_lo", -15, "air before the slam"),
    (61.66, "tick", -8, "slot roll"), (61.75, "tick", -8, "slot roll"), (61.84, "tick", -8, "slot roll"), (61.93, "pop", -14, "lands"),
    (62.66, "impact_lo", -6, "«درشت», the biggest hit"),
    (66.72, "riser", -11, "rays converge into «کلمه»"), (66.72, "impact_soft", -9, "«کلمه» lands"), (66.82, "sparkle", -16, "sweep"),
    (67.80, "whoosh_hi", -13, "cyan streak transition"),
    # S7 CTA
    (68.02, "click_lo", -14, "chip"), (72.85, "sweep", -15, "underline"), (73.62, "whoosh", -16, "titles leave"),
    (74.20, "pop", -9, "heart"), (74.30, "sparkle", -13, "heart sparks"), (74.86, "whoosh_lo", -16, "caption pointer"),
    (76.36, "whoosh", -15, "clean exit"),
]


def peak_offset(path):
    """Seconds from file start to its attack: the first 10 ms window within 3 dB of the loudest one."""
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", "8000", "-f", "s16le", "-"],
                         capture_output=True, check=True).stdout
    s = struct.unpack(f"<{len(raw) // 2}h", raw)
    win = 80
    e = [sum(v * v for v in s[i:i + win]) for i in range(0, len(s) - win, win)]
    return next(i for i, v in enumerate(e) if v >= max(e) / 2) * win / 8000


SYNC = {"revrise": "end"}  # a reverse riser lands on its last sample

peaks = {}
out = []
for t, name, gain, why in CUES:
    f = SFX / f"{name}.wav"
    if name not in peaks:
        peaks[name] = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(f)],
                                           capture_output=True, text=True).stdout) - 0.02 if SYNC.get(name) == "end" else peak_offset(f)
    at = max(0.0, t + 1 / 30 - peaks[name])
    out.append({"file": str(f), "at": round(at, 3), "gain_db": gain, "why": why})
(SFX / "cues.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))
print(len(out), "cues;", ", ".join(f"{k} {v:.2f}s" for k, v in sorted(peaks.items())))
