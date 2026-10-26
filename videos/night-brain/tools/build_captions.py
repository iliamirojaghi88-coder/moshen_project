#!/usr/bin/env python3
"""Writes compositions/captions.html from the narration script.

Wording is the script's, exactly (whisper's Persian spelling is not used).
Timing: each phrase is anchored to a measured speech region of the voiceover
(silencedetect, -36 dB / 120 ms); words inside a phrase share its span in
proportion to their length. Placement and emphasis are chosen per shot so
text never sits on a face or on the subject.

Run: python3 tools/build_captions.py   (from the project folder)
"""
import html
import json

Z = "‌"  # zero-width non-joiner

# Each group: one block on screen at a time.
#   at: [start, end] of the group on screen
#   pos: "top" | "upper" | "lower" | "bottom" | "end" | "end2"
#   align: "center" | "right" (RTL flush to a column)
#   theme: "light" | "dark" | "dusk" (dark ink that turns light as night falls)
#   lines: list of lines; each line a list of (word, style, t) with style in
#          "", "big", "huge", "blue", "orange", "gold", "glow"; t = reveal time
# Phrases: (text, start, end) → words timed by length.


def phrase(text, start, end, styles=None):
    words = text.split(" ")
    weights = [len(w.replace(Z, "")) + 1 for w in words]
    span = end - start
    out, t = [], start
    for i, w in enumerate(words):
        out.append([w, (styles or {}).get(i, ""), round(t, 3)])
        t += span * weights[i] / sum(weights)
    return out


def split(words, *cuts):
    lines, prev = [], 0
    for c in list(cuts) + [len(words)]:
        lines.append(words[prev:c])
        prev = c
    return lines


G = []


def group(gid, at, pos, lines, theme="light", align="center", col=None, scrim=False):
    G.append(dict(id=gid, at=at, pos=pos, lines=lines, theme=theme, align=align, col=col, scrim=scrim))


# 1 — hook
w = phrase("کل روز از خستگی هلاکی،", 0.07, 1.93, {4: "huge"})
group("c1", [0.06, 2.12], "top", split(w, 2))
w = phrase(f"ولی همین که سرت به بالش می{Z}رسه،", 2.32, 4.44)
group("c2", [2.28, 4.46], "top", split(w, 3))
w = [["مغزت", "", 4.51], ["تازه", "", 4.88], ["روشن", "glow", 5.33], [f"می{Z}شه!", "", 5.77]]
group("c3", [4.49, 6.3], "top", [w[:2], w[2:]])
# 2 — into the mind
w = phrase("اشتباهات چند سال پیش،", 6.79, 8.32, {0: "orange"})
group("c4", [6.86, 8.4], "top", split(w, 1))
w = [[f"نگرانی{Z}های", "", 8.46], ["فردا", "blue", 9.43]]
group("c5", [8.43, 9.95], "top", [w[:1], w[1:]])
w = phrase(f"و فکرهایی که انگار هیچ{Z}وقت تمومی ندارن!", 9.92, 12.63, {4: "orange"})
group("c6", [9.93, 12.8], "top", split(w, 4, 5))
# 3 — the day
w = [["دلیلش", "huge", 13.15], ["چیه؟", "huge", 13.53]]
group("c7", [13.12, 14.2], "upper", [w[:1], w[1:]], theme="dark")
w = [["روزها", "big", 14.63], ["توجه", "", 15.0], ["مغزت", "", 15.43]]
group("c8", [14.6, 16.08], "top", [w[:1], w[1:]], theme="dark", align="right", col="left")
w = [["درگیر", "", 16.04], ["کارها،", "blue", 16.71]]
group("c9", [16.02, 17.4], "low", [w[:1], w[1:]])
w = [["صداها", "big", 17.39]]
group("c10", [17.37, 17.97], "top", [w], theme="dark")
w = [["و", "", 17.89], ["اتفاقات", "", 18.0], ["اطرافته.", "orange", 18.78]]
group("c11", [17.97, 19.75], "top", [w[:2], w[2:]], theme="dark", align="right", col="left")
# 4 — night falls
w = phrase(f"اما شب، وقتی محیط آروم می{Z}شه،", 20.07, 22.42, {1: "big"})
w[1][2] = 20.3
group("c12", [20.04, 22.55], "top", split(w, 2), theme="dusk", align="right", col="left")
w = phrase(f"افکار و نگرانی{Z}هات", 22.67, 24.02)
group("c13", [22.62, 24.04], "top", [w])
w = phrase("فرصت بیشتری", 24.02, 25.04, {1: "big"})
group("c14", [24.02, 25.08], "top", [w])
w = phrase(f"برای جلب توجه پیدا می{Z}کنن.", 25.11, 26.79, {1: "orange", 2: "orange"})
group("c15", [25.06, 26.95], "top", split(w, 3))
# 5 — the worry loop
w = phrase(f"تازه وقتی نگران می{Z}شی که چرا خوابت نمی{Z}بره،", 27.31, 29.98, {6: "blue", 7: "blue"})
group("c16", [27.28, 30.1], "top", split(w, 4))
w = phrase(f"همین نگرانی می{Z}تونه بدنت رو", 30.27, 32.0)
group("c17", [30.24, 33.62], "top", [w])
w = [["هوشیارتر", "huge-orange", 32.0], ["نگه", "", 32.8], ["داره!", "", 33.07]]
group("c18", [31.97, 33.62], "low", [w])
w = [["راهکار", "huge-gold", 34.08], ["چیه؟", "huge-gold", 34.4]]
group("c19", [34.05, 35.3], "top", [w[:1], w[1:]])
# 6 — write it down (journal footage)
w = [["قبل", "", 35.52], ["خواب،", "", 35.62], ["چند", "", 36.42], ["دقیقه", "", 36.61]]
group("c20", [35.5, 37.12], "top", [w[:2], w[2:]], scrim=True)
w = phrase(f"نگرانی{Z}ها و کارهای فردات رو", 37.12, 39.18)
group("c21", [37.1, 39.17], "top", split(w, 2), scrim=True)
w = [["روی", "", 39.18], ["کاغذ", "", 39.45], ["بنویس.", "big-gold", 39.89]]
group("c22", [39.15, 40.6], "bottom", [w[:2], w[2:]], scrim=True)
# 7 — dim the light
w = phrase("نور محیط رو کم کن", 40.95, 42.22, {3: "gold", 4: "gold"})
group("c23", [40.9, 42.3], "top", split(w, 3), align="right", col="right")
w = phrase(f"و به{Z}جای تلاش اجباری برای خوابیدن،", 42.46, 44.84)
group("c24", [42.43, 44.95], "top", split(w, 3), scrim=True)
w = phrase("چند دقیقه آروم باش.", 45.1, 46.51, {2: "big-gold", 3: "big-gold"})
group("c25", [45.07, 46.7], "bottom", split(w, 2), scrim=True)
# 8 — the takeaway
w = phrase("یادت باشه،", 47.04, 47.68)
group("c26", [47.0, 47.8], "top", [w])
w = phrase(f"گاهی چیزی که نمی{Z}ذاره بخوابی،", 48.01, 49.9)
group("c27", [47.97, 49.93], "top", split(w, 3))
w = phrase("خستگی بدنت نیست؛", 49.95, 51.45, {2: "big-blue"})
group("c28", [49.9, 51.6], "top", split(w, 2))
w = [["شلوغی", "huge-orange", 51.77], ["ذهنته.", "big", 52.4]]
group("c29", [51.74, 53.5], "top", [w[:1], w[1:]])
# 9 — end card
w = phrase(f"تو هم شب{Z}ها ذهنت شلوغ می{Z}شه؟", 53.76, 55.41, {3: "big", 4: "big-orange", 5: "big"})
group("c30", [53.72, 59.6], "end", split(w, 3))
w = phrase(f"تو کامنت{Z}ها بگو!", 55.77, 56.57, {2: "gold"})
group("c31", [55.74, 59.6], "end2", [w])

assert all(g["at"][0] < g["at"][1] for g in G)

POS = {
    "top": "top: 200px;",
    "upper": "top: 300px;",
    "low": "top: 1135px;",
    "bottom": "top: 1110px;",
    "end": "top: 960px;",
    "end2": "top: 1225px;",
}
COL = {None: "left: 90px; right: 90px;", "left": "left: 70px; right: 470px;", "right": "left: 470px; right: 70px;"}


def word_html(gid, li, wi, word, style):
    cls = ["w"] + [f"s-{p}" for p in style.split("-") if p]
    return f'<span id="{gid}-w{li}-{wi}" class="{" ".join(cls)}">{html.escape(word)}</span>'


body = []
for g in G:
    style = POS[g["pos"]] + COL[g["col"]] + f"text-align: {'center' if g['align'] == 'center' else 'right'};"
    cls = f"cap t-{g['theme']}" + (" has-scrim" if g["scrim"] else "")
    dur = round(g["at"][1] - g["at"][0], 3)
    lines = []
    for li, line in enumerate(g["lines"]):
        words = " ".join(word_html(g["id"], li, wi, w, s) for wi, (w, s, _) in enumerate(line))
        lines.append(f'      <div class="ln">{words}</div>')
    if g["id"] == "c31":  # a line comment icon after the call to action
        svg = open("assets/icons/message-circle.svg", encoding="utf-8").read()
        svg = svg[svg.index("<svg"):].replace('stroke="currentColor"', 'stroke="#ffc870"').replace("\n", " ")
        lines[-1] = lines[-1].replace("</div>", f' <span id="c31-icon" class="w">{svg}</span></div>')
    body.append(
        f'    <div id="{g["id"]}" class="clip cap-frame" data-start="{g["at"][0]}" data-duration="{dur}" data-track-index="{1 + len(body) % 2}">\n'
        f'     <div class="{cls}" style="{style}" data-layout-allow-overflow>\n'
        + "\n".join(lines)
        + "\n     </div>\n    </div>"
    )

timing = {g["id"]: {"at": g["at"], "words": [[f'{g["id"]}-w{li}-{wi}', t, s] for li, line in enumerate(g["lines"]) for wi, (w, s, t) in enumerate(line)]} for g in G}

TEMPLATE = open("tools/captions.template.html", encoding="utf-8").read()
out = TEMPLATE.replace("<!--GROUPS-->", "\n".join(body)).replace("/*TIMING*/", json.dumps(timing, ensure_ascii=False))
open("compositions/captions.html", "w", encoding="utf-8").write(out)
print(f"{len(G)} groups → compositions/captions.html")
