"""edit/words.json + the grouping below -> compositions/captions.html (static HTML, editable in Studio).

  python3 videos/contrast-font/edit/build_captions.py
Each group: (first word, last word, {word: emphasis}) or (first, last, "bad") for the bad-subtitle demo.
"""
import html, json
from pathlib import Path

P = Path(__file__).resolve().parents[1]
W = {int(w["id"][1:]): w for w in json.loads((P / "edit/words.json").read_text())}

G = [(0, 2, {2: "gold"}), (3, 5, {}), (6, 7, {7: "gold"}), (8, 11, {11: "navy"}), (12, 15, {13: "black"}),
     (16, 18, {17: "red"}), (19, 21, {}), (22, 24, {24: "blue"}), (25, 26, {}), (27, 29, {28: "red"}),
     (30, 33, {}), (34, 36, {35: "blue", 36: "blue"}), (37, 41, {38: "gold", 40: "gold"}), (42, 44, {44: "gold"}),
     (45, 47, {45: "blue", 46: "blue"}), (48, 51, {}), (52, 54, {53: "gold"}), (55, 56, {56: "blue"}),
     (57, 61, {59: "gold"}), (62, 66, {}), (67, 68, {67: "gold"}), (69, 71, {70: "gold"}), (72, 73, {72: "gold"}),
     (74, 75, {74: "gold"}), (76, 78, {}), (79, 80, {}), (81, 82, {82: "white"}), (83, 87, {86: "red"}),
     (88, 91, {88: "gold"}), (92, 94, {94: "blue"}), (95, 97, {95: "gold"}), (98, 101, {101: "blue"}),
     (102, 106, {104: "gold"}), (107, 110, {109: "blue"}), (111, 113, {112: "gold", 113: "gold"}),
     (114, 117, {115: "blue"}), (118, 121, {119: "gold"}), (122, 125, {124: "gold"}),
     (126, 131, "bad"), (132, 135, "bad"),
     (136, 137, {137: "green"}), (138, 143, {140: "gold", 142: "gold"}), (144, 147, {147: "gold"}),
     (148, 149, {149: "blue"}), (150, 152, {152: "gold"}), (153, 156, {154: "gold"}),
     (157, 160, {159: "blue", 160: "blue"}), (161, 164, {}), (165, 169, {167: "gold"}),
     (170, 174, {171: "gold", 172: "gold", 173: "gold", 174: "gold"}), (175, 179, {}),
     (180, 182, {181: "gold", 182: "gold"}), (183, 185, {183: "gold", 184: "gold", 185: "gold"}),
     (186, 190, {189: "red"}), (191, 194, {193: "blue"})]
assert [i for a, b, _ in G for i in range(a, b + 1)] == sorted(W), "groups must cover every word once, in order"

END = 76.6
EM = {"gold": "#ffc94a", "blue": "#55c8ff", "red": "#ff5468", "green": "#3be38c", "white": "#ffffff",
      "navy": "#1d2b66", "black": "#050608"}
BAD_COLORS = ["#ff2bd6", "#39ff14", "#ffe600", "#00e5ff", "#ff7a00", "#b04bff"]
BAD_TILT = [-5, 4, -3, 6, -4, 3]

rows, js = [], []
for gi, (a, b, em) in enumerate(G):
    start = max(0.0, W[a]["start"] - 0.06)
    nxt = W[G[gi + 1][0]]["start"] - 0.06 if gi + 1 < len(G) else END
    end = W[b]["end"] + 0.35
    end = nxt if nxt - W[b]["end"] < 0.6 else min(end, nxt)
    end = min(end, END - 0.02)
    bad = em == "bad"
    spans = []
    for k, i in enumerate(range(a, b + 1)):
        txt = html.escape(W[i]["text"])
        if bad:
            spans.append(f'<span id="cw{i}" class="w bw" style="color:{BAD_COLORS[i % 6]};--r:{BAD_TILT[i % 6]}deg">{txt}</span>')
        else:
            cls = f"w em {em[i]}" if i in em else "w"
            spans.append(f'<span id="cw{i}" class="{cls}">{txt}</span>')
    rows.append(f'      <div id="cg{gi}" class="cg{" bad" if bad else ""}"><div class="line">{" ".join(spans)}</div></div>')
    ws = ",".join(f'[{i},{W[i]["start"]:.3f},"{EM[em[i]] if not bad and i in em else ""}"]' for i in range(a, b + 1))
    js.append(f"  [{gi},{start:.3f},{end:.3f},[{ws}],{1 if bad else 0}]")

page = f"""<template>
  <style>
    @font-face {{ font-family: "Estedad"; src: url("assets/fonts/Estedad-Bold.woff2") format("woff2"); font-weight: 700; }}
    @font-face {{ font-family: "Estedad"; src: url("assets/fonts/Estedad-Black.woff2") format("woff2"); font-weight: 900; }}
    @font-face {{ font-family: "Rakkas"; src: url("assets/fonts/Rakkas-Regular.ttf") format("truetype"); }}
    #captions {{ position: absolute; inset: 0; direction: rtl; font-family: "Estedad"; }}
    #captions .cg {{ position: absolute; left: 70px; right: 70px; top: 1048px; height: 150px;
                     display: flex; align-items: center; justify-content: center; opacity: 0; }}
    #captions .line {{ text-align: center; font-weight: 700; font-size: 58px; line-height: 1.32; color: #fff;
                       text-shadow: 0 3px 6px rgba(0,0,0,.55), 0 8px 26px rgba(0,0,0,.45); }}
    #captions .w {{ display: inline-block; opacity: .78; }}
    #captions .em {{ font-weight: 900; }}
    #captions .white {{ text-shadow: 0 0 18px rgba(255,255,255,.9), 0 3px 6px rgba(0,0,0,.5); }}
    #captions .navy, #captions .black {{ -webkit-text-stroke: 7px #fff; paint-order: stroke fill; }}
    /* the demo of what NOT to do: chunky, loud, tilted, crowded */
    #captions .cg.bad {{ top: 880px; height: 440px; left: 64px; right: 64px; }}
    #captions .bad .line {{ font-family: "Rakkas"; font-weight: 400; font-size: 92px; line-height: 1.14; }}
    #captions .bw {{ opacity: 0; transform: rotate(var(--r)); -webkit-text-stroke: 10px #000; paint-order: stroke fill;
                     text-shadow: 7px 7px 0 #000, 0 0 30px rgba(255,255,255,.35); margin: 0 6px; }}
  </style>
  <div id="captions" data-composition-id="captions" data-width="1080" data-height="1920">
{chr(10).join(rows)}
  </div>
  <script>
    (function () {{
      const tl = gsap.timeline({{ paused: true, defaults: {{ immediateRender: false }} }});
      // [group, start, end, [[word, start]...], bad]
      const G = [
{(","+chr(10)).join(js)}
      ];
      gsap.set("#captions .cg", {{ opacity: 0, visibility: "hidden" }});
      G.forEach(([g, s, e, words, bad], n) => {{
        const el = "#cg" + g;
        const prevBad = n > 0 && G[n - 1][4] && !bad;
        tl.set(el, {{ visibility: "visible" }}, s);
        if (bad) tl.set(el, {{ opacity: 1 }}, s);
        else tl.fromTo(el, {{ opacity: 0, filter: "blur(8px)" }}, {{ opacity: 1, filter: "blur(0px)", duration: prevBad ? 0.22 : 0.15, ease: "power2.out" }}, s);
        words.forEach(([w, t, c]) => {{
          const we = "#cw" + w;
          if (bad) {{
            tl.fromTo(we, {{ opacity: 0, scale: 1.9 }}, {{ opacity: 1, scale: 1, duration: 0.22, ease: "back.out(2.6)" }}, t);
          }} else if (c) {{
            tl.fromTo(we, {{ opacity: 0.78, scale: 1, color: "#ffffff" }}, {{ keyframes: [{{ opacity: 1, scale: 1.16, color: c, duration: 0.1, ease: "power2.out" }}, {{ scale: 1, duration: 0.22, ease: "back.out(2)" }}] }}, t);
          }} else {{
            tl.fromTo(we, {{ opacity: 0.78 }}, {{ opacity: 1, duration: 0.08 }}, t);
          }}
        }});
        const nextBad = G[n + 1] && G[n + 1][4];
        if (bad && !nextBad) {{
          // glitch out of the bad subtitle into the clean one
          tl.to(el, {{ keyframes: [{{ x: -18, filter: "blur(2px)" }}, {{ x: 14 }}, {{ x: -8, opacity: 0.5 }}, {{ x: 0, opacity: 0, filter: "blur(12px)", scale: 0.86 }}], duration: 0.2, ease: "none" }}, e - 0.2);
        }} else if (!bad || !nextBad) {{
          tl.to(el, {{ opacity: 0, duration: 0.1, ease: "power2.in" }}, e - 0.1);
        }} else {{
          tl.set(el, {{ opacity: 0 }}, e);
        }}
        tl.set(el, {{ opacity: 0, visibility: "hidden" }}, e);
      }});
      window.__timelines["captions"] = tl;
    }})();
  </script>
</template>
"""
(P / "compositions/captions.html").write_text(page)
print(len(G), "caption groups")
