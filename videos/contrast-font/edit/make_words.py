"""Whisper word times (source) + the owner's script wording -> edit/words.json on the OUTPUT timeline.

  python3 videos/contrast-font/edit/make_words.py <whisper_words.json> <source_16k.wav>
Each FIX entry: (first whisper word index, how many whisper words it replaces, script text).
"""
import json, sys
from pathlib import Path

P = Path(__file__).resolve().parents[1]
edl = json.loads((P / "edit/edl.json").read_text())
fps = edl["fps"]
segs = [(s["in"] / fps, s["out"] / fps) for s in edl["segments"]]

# whisper heard → script says (indices into the flat whisper word list)
FIX = {4: (2, "سرمو"), 8: (2, "خواناست؟"), 11: (2, "اینو"), 14: (1, "سرمه‌ای"), 21: (1, "می‌شد."),
       24: (2, "اونو"), 31: (1, "اصلاً"), 33: (1, "نمی‌شد."), 54: (2, "ویدیوهامون"), 56: (1, "مهمه."),
       62: (1, "بینندهٔ"), 71: (1, "متن"), 78: (1, "متن"), 79: (1, "ارجحیت"), 82: (2, "توجهشو"),
       86: (1, "می‌کنه."), 87: (2, "کم‌ریسک‌ترین"), 94: (1, "بکنین،"), 96: (1, "سفیده."),
       100: (1, "ناخوانا"), 101: (1, "بود،"), 109: (1, "خوشگل"), 111: (1, "بذاری،"), 115: (1, "پس‌زمینه‌ها،"),
       124: (1, "بذاری."), 135: (1, "بکنه."), 139: (1, "می‌ذاری،"), 141: (2, "نیا"), 145: (1, "توپل،"),
       146: (1, "درشت،"), 148: (3, "عجیب‌وغریب"), 152: (1, "کن،"), 160: (1, "باشه."), 165: (1, "می‌نویسی،"),
       166: (1, "اتفاقاً"), 169: (3, "عجیب‌وغریب"), 172: (1, "و"), 173: (1, "درشت"), 175: (1, "کن،"),
       188: (1, "بکنی."), 190: (1, "آموزش"), 201: (2, "مناسب"), 203: (1, "حوزهٔ"), 205: (1, "توئه،"),
       208: (2, "پست رو"), 214: (1, "کپشن رو"), 215: (1, "بخون.")}
SRC_START = {22: 8.36}  # «یا»: Whisper put its start inside the tail of «می‌شد»; measured onset
DROP = set(range(34, 41))  # the first, incomplete take of «پس اینجا می‌فهمیم که چقدر کنتراست رنگی»

ww = [w for s in json.load(open(sys.argv[1])) for w in s["words"]]

# voice-onset refinement: Whisper often starts a word inside the pause before it. Snap the start to the
# first 10 ms frame above -30 dBFS within the word (source audio from sys.argv[2], 16 kHz mono wav).
import wave, array, math
wv = wave.open(sys.argv[2]); sr = wv.getframerate()
pcm = array.array("h", wv.readframes(wv.getnframes()))
def db(t):
    i = int(t * sr); seg = pcm[i:i + sr // 100] or [0]
    return 20 * math.log10(math.sqrt(sum(v * v for v in seg) / len(seg)) / 32768 + 1e-9)
def onset(s, e):
    t = s
    while t < min(e, s + 0.7):
        if db(t) > -30:
            return t
        t += 0.01
    return s


def to_out(t):
    off = 0.0
    for a, b in segs:
        if t < a:
            return off  # inside a removed gap: snap to the next kept start
        if t <= b:
            return off + t - a
        off += b - a
    return off


out, i = [], 0
while i < len(ww):
    n, text = FIX.get(i, (1, ww[i]["w"].strip()))
    s, e = ww[i]["s"], ww[i + n - 1]["e"]
    s = SRC_START.get(i, onset(s, e))
    first, i = i, i + n
    if first in DROP:
        continue
    out.append({"id": f"w{len(out)}", "text": text, "src": round(s, 2),
                "start": round(to_out(s), 3), "end": round(to_out(e), 3)})
assert all(a["start"] <= b["start"] for a, b in zip(out, out[1:])), "word starts must be monotonic on the cut timeline"
(P / "edit/words.json").write_text(json.dumps(out, ensure_ascii=False, indent=0))
print(len(out), "words")
print(" ".join(f"{w['id']}:{w['text']}@{w['start']:.2f}" for w in out))
