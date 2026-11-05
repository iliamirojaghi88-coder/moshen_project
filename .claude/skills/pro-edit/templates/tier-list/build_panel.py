"""Tier-list canvas (template from the "compare tools" reel; copy to mp-studio/work/<project>/panel/ and edit CATS): dark neon background, Bad/Good/Great tool cards
that reveal on each spoken «این», category titles, a hook header and the CTA scene.
Times come from the cut (edit/edl.json + the take's words), so a re-cut only needs a re-run.

  .venv/Scripts/python.exe "mp-studio/work/compare tools/panel/build_panel.py"
"""
import json, shutil, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
NOFACE = "--noface" in sys.argv   # motion-only cut: no speaker box, everything bigger, heavier FX
OUTD = HERE.parent / "panel_noface" if NOFACE else HERE
E = HERE.parent / "edit"
ROOT = HERE.parents[3]
sys.path.insert(0, str(ROOT / ".claude/skills/pro-edit/templates/motion-kit"))
import kit  # noqa: E402  (icon_svg: Simple Icons / Lucide, cached in mp-studio/assets/icons)

edl = json.loads((E / "edl.json").read_text(encoding="utf-8"))
OUT0, t = [], 0.0
for r in edl["ranges"]:
    OUT0.append((r["start"], r["end"], t)); t += r["end"] - r["start"]
base = E / "base_preview.mp4"
DUR = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(base)],
                           capture_output=True, text=True).stdout.strip() or t)


def R(src):
    """source time → output time (clamped into the range that holds it, else the next range)."""
    for s, e, o in OUT0:
        if src < e:
            return round(o + max(0.0, src - s), 3)
    return round(t, 3)


# ---------------------------------------------------------------- content
SPOKEN = [["بده", "بدک نیست", "بی‌نظیره!"], ["افتضاحه", "خوبه", "ایده‌آله!"], ["آشغاله", "ردیفه", "وایرالت می‌کنه!"],
          ["افتضاحه", "بد نیست", "پولدارت می‌کنه!"], ["جالب نیست", "خوبه", "فیوریتمه!"]]
CATS = [  # title, kicker, source time of each «این» (bad, good, great), tools (bad, good, great)
    ("ساخت انیمیشن", "برای", (3.06, 3.96, 5.28),
     [("brand:googlegemini", "Gemini", "#fff", "#4285F4"), ("mono:K", "Kling AI", "linear-gradient(135deg,#00E6A8,#0A84FF)", "#fff"),
      ("mono:H", "Higgsfield", "#D4FF3A", "#0B0B0B")]),
    ("سناریو ریلز", "برای نوشتن", (16.68, 18.42, 19.44),
     [("brand:x", "Grok", "#0B0B0B", "#fff"), ("brand:openai", "ChatGPT", "#fff", "#0B0B0B"),
      ("brand:claude", "Claude", "#fff", "#D97757")]),
    ("استوری، کاور، پست", "برای طراحی", (24.52, 25.84, 27.42),
     [("brand:canva", "Canva", "#fff", "#00C4CC"), ("brand:claude", "Claude", "#fff", "#D97757"),
      ("mono:P", "Poppy AI", "linear-gradient(135deg,#FFB3D1,#FF5FA2)", "#fff")]),
    ("درآمد دلاری", "برای کسب", (32.56, 33.88, 35.42),
     [("brand:youtube", "YouTube", "#fff", "#FF0000"), ("lucide:hand", "Manus", "#fff", "#0B0B0B"),
      ("mono:[c]", "CYTD", "#fff", "#0B0B0B")]),
    ("ساخت موزیک", "برای", (55.32, 56.50, 57.74),
     [("lucide:guitar", "GarageBand", "#fff", "#F27A1A"), ("mono:udio", "Udio", "#0B0B0B", "#fff"),
      ("brand:suno", "Suno AI", "#fff", "#0B0B0B")]),
]
# tools per tier exactly as in the reference (input/compare tools/ref/reference.mp4); no free logo for
# Kling, Higgsfield, Poppy AI, Manus, CYTD, GarageBand Loops, Udio → drawn tiles / Lucide stand-ins
STARTS = [R(s) for s, _, _ in OUT0 if s in (0.66, 14.20, 20.78, 29.76, 52.86, 101.12)]
CTA = STARTS[-1]
TIERS = [("بد", "#FF4D5E", 210), ("خوب", "#FFC400", 540), ("عالی", "#39FF88", 870)]  # bad on the viewer's left, great on the right: matches where the owner points
GLOW = ["#2B6BFF", "#D97757", "#00C4CC", "#1DBF73", "#B44CFF"]
FA = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")


def logo(kind, bg, fg):
    if kind.startswith("mono:"):
        txt = kind[5:]
        fs = 64 if len(txt) <= 2 else 46
        return f'<div class="tile" style="background:{bg};color:{fg}"><span class="mono" style="font-size:{fs}px">{txt}</span></div>'
    if kind.startswith("lucide:"):
        return f'<div class="tile" style="background:{bg};color:{fg}">{kit.icon_svg(kind[7:], 100, 2.2)}</div>'
    return f'<div class="tile" style="background:{bg};color:{fg}">{kit.icon_svg(kind, 96)}</div>'


# ---------------------------------------------------------------- markup + timeline
html, js, clips, extra = [], [], [], []
fx = {"cats": [], "reveals": []}

# particles (seeded) drift up for the whole film
import random
rnd = random.Random(7)
parts = []
for i in range(46):
    x, y, s = rnd.randint(0, 1080), rnd.randint(0, 1920), rnd.choice([3, 4, 5, 6])
    parts.append(f'<i class="pt" id="pt{i}" style="left:{x}px;top:{y}px;width:{s}px;height:{s}px;opacity:{rnd.uniform(.15,.55):.2f}"></i>')
    js.append(f'tl.to("#pt{i}",{{y:-{rnd.randint(300,900)},x:{rnd.randint(-80,80)},duration:{DUR:.2f},ease:"none"}},0);')

for k, col in enumerate(GLOW):
    html.append(f'<div class="glow" id="glow{k}" style="background:radial-gradient(closest-side,{col}55,{col}00)"></div>')

# hook header: big at 0, settles into a chip at the top
html.append('''<div id="hdr"><span class="d" style="background:#FF4D5E"></span><span class="d" style="background:#FFC400"></span>
<span class="d" style="background:#39FF88"></span><span class="ht">ابزار هوش مصنوعی: بد، خوب، عالی</span></div>''')
html.append('<div id="cnt" class="mono"></div>')
if not NOFACE:
  html.append('<div id="rim"></div><div id="rimg"></div>')
  js.append('tl.fromTo("#rim",{opacity:0,scale:1.08},{opacity:1,scale:1,duration:.5,ease:"expo.out"},0.05);')
js.append('tl.fromTo("#hdr",{scale:1.9,y:260,opacity:0,filter:"blur(14px)"},{scale:1,y:0,opacity:1,filter:"blur(0px)",duration:.45,ease:"expo.out"},0.02);')
js.append(f'tl.to("#hdr,#cnt",{{opacity:0,y:-30,duration:.3,ease:"power2.in"}},{CTA-0.05:.2f});')
js.append(f'tl.to("#grid",{{backgroundPositionY:"+=1400",duration:{DUR:.2f},ease:"none"}},0);')

for c, (title, kick, ins, tools) in enumerate(CATS):
    t0, t1 = STARTS[c], STARTS[c + 1]
    rev = [R(s) for s in ins]
    fx["cats"].append(t0); fx["reveals"].append(rev)
    cid = f"c{c}"
    js.append(f'tl.to("#glow{c}",{{opacity:1,scale:1,duration:.6,ease:"power2.out"}},{t0:.2f});'
              f'tl.to("#glow{c}",{{opacity:0,duration:.4}},{t1-0.2:.2f});')
    js.append(f'tl.set("#cnt",{{textContent:"{(str(c+1)+" / 5").translate(FA)}"}},{t0:.2f});'
              f'tl.fromTo("#cnt",{{scale:1.6,opacity:0}},{{scale:1,opacity:1,duration:.3,ease:"back.out(3)"}},{t0:.2f});')
    cards = []
    for j, ((kind, name, bg, fg), (lab, tc, x)) in enumerate(zip(tools, TIERS)):
        cards.append(f'''<div class="slot" id="{cid}s{j}" style="left:{x-140}px;--tc:{tc}">
  <div class="ghost" id="{cid}g{j}"><span>?</span></div>
  <div class="card" id="{cid}k{j}">{logo(kind, bg, fg)}<div class="nm">{name}</div></div>
  <div class="pill" id="{cid}p{j}" style="background:{tc}">{lab}</div>
  {"<div class='ring' id='%sr'></div><div class='crown' id='%scr'>%s</div>" % (cid, cid, kit.icon_svg("crown", 70, 2.4)) if j == 2 else ""}
  {"".join(f"<i class='sp' id='{cid}sp{n}'></i>" for n in range(12)) if j == 2 else ""}
  {f"<div class='x' id='{cid}x'>✕</div>" if j == 0 else ""}
</div>''')
    html.append(f'''<div class="clip cat" id="{cid}" data-start="{t0:.3f}" data-duration="{t1-t0:.3f}" data-track-index="1">
{''.join(cards)}
<div class="ttl"><div class="kick" id="{cid}kk">{kick}</div><div class="big" id="{cid}tt">{title}</div></div>
</div>''')
    # entrances: ghosts drop from depth, title slams
    js.append(f'tl.fromTo("#{cid} .slot",{{opacity:0,scale:.4,z:-400,y:-60}},{{opacity:1,scale:1,y:0,duration:.35,stagger:.06,ease:"expo.out"}},{t0+0.02:.2f});')
    js.append(f'tl.fromTo("#{cid}tt",{{scale:2.2,opacity:0,filter:"blur(16px)"}},{{scale:1,opacity:1,filter:"blur(0px)",duration:.32,ease:"expo.out"}},{t0+0.08:.2f});')
    js.append(f'tl.fromTo("#{cid}kk",{{y:30,opacity:0}},{{y:0,opacity:1,duration:.3,ease:"power3.out"}},{t0+0.15:.2f});')
    for j, rt in enumerate(rev):
        rt = max(rt, t0 + 0.45 + 0.1 * j)
        js.append(f'tl.to("#{cid}g{j}",{{rotationY:90,opacity:0,duration:.12,ease:"power2.in"}},{rt-0.06:.2f});')
        js.append(f'tl.fromTo("#{cid}k{j}",{{rotationY:-90,opacity:0,scale:.8}},{{rotationY:0,opacity:1,scale:1,duration:.3,ease:"back.out(2.2)"}},{rt+0.04:.2f});')
        js.append(f'tl.fromTo("#{cid}p{j}",{{scale:2.4,opacity:0,rotation:-8}},{{scale:1,opacity:1,rotation:0,duration:.25,ease:"expo.out"}},{rt+0.1:.2f});')
        if j == 0:  # bad: shake + red stamp
            js.append(f'tl.fromTo("#{cid}k{j}",{{x:-14}},{{x:0,duration:.35,ease:"elastic.out(1.2,.25)"}},{rt+0.3:.2f});')
            js.append(f'tl.fromTo("#{cid}x",{{scale:3,opacity:0,rotation:-25}},{{scale:1,opacity:.95,rotation:-12,duration:.22,ease:"expo.out"}},{rt+0.22:.2f});')
            js.append(f'tl.to("#{cid}k{j}",{{filter:"grayscale(.85) brightness(.7)",duration:.3}},{rt+0.35:.2f});')
        if j == 1:
            js.append(f'tl.to("#{cid}k0,#{cid}p0,#{cid}x",{{opacity:.45,scale:.92,duration:.3}},{rt+0.05:.2f});')
        if j == 2:  # great: glow, shockwave, crown, sparkles, others dim
            js.append(f'tl.to("#{cid}k1,#{cid}p1",{{opacity:.5,scale:.92,duration:.3}},{rt+0.05:.2f});')
            js.append(f'tl.fromTo("#{cid}k{j}",{{boxShadow:"0 0 0px 0px rgba(57,255,136,0)"}},{{boxShadow:"0 0 70px 8px rgba(57,255,136,.55)",duration:.3}},{rt+0.1:.2f});')
            js.append(f'tl.fromTo("#{cid}s{j}",{{scale:1}},{{scale:1.14,duration:.18,ease:"power3.out",yoyo:true,repeat:1}},{rt+0.08:.2f});')
            if not NOFACE: js.append(f'tl.fromTo("#rimg",{{opacity:1}},{{opacity:0,duration:.8,ease:"power2.out",immediateRender:false}},{rt+0.08:.2f});')
            js.append(f'tl.fromTo("#{cid}r",{{scale:.3,opacity:1}},{{immediateRender:false,scale:2.6,opacity:0,duration:.6,ease:"expo.out"}},{rt+0.08:.2f});')
            js.append(f'tl.fromTo("#{cid}cr",{{y:-140,opacity:0,rotation:-30}},{{y:0,opacity:1,rotation:-14,duration:.4,ease:"bounce.out"}},{rt+0.15:.2f});')
            for n in range(12):
                a = n / 12 * 6.283
                import math
                d = 170 + (n % 3) * 40
                js.append(f'tl.fromTo("#{cid}sp{n}",{{x:0,y:0,opacity:1,scale:1}},{{immediateRender:false,x:{math.cos(a)*d:.0f},y:{math.sin(a)*d:.0f},opacity:0,scale:.3,duration:.7,ease:"expo.out"}},{rt+0.1:.2f});')
    if NOFACE:
        sw = SPOKEN[c]
        extra.append(f'<div class="clip bw" id="bw{c}" data-start="{t0:.3f}" data-duration="{t1-t0:.3f}" data-track-index="3">'
                     + "".join(f'<div class="w w{j}" id="bw{c}_{j}" style="color:{TIERS[j][1]};font-size:{190 if len(w) <= 6 else 150 if len(w) <= 10 else 112}px">{w}</div>' for j, w in enumerate(sw)) + '</div>')
        js.append(f'tl.fromTo("#sweep",{{x:-1600}},{{immediateRender:false,x:1600,duration:.45,ease:"power2.inOut"}},{t0:.2f});')
        for j, rt in enumerate(rev):
            rt = max(rt, t0 + 0.45 + 0.1 * j)
            big = 1.12 if j == 2 else 1.0
            js.append(f'tl.fromTo("#bw{c}_{j}",{{scale:3.2,opacity:0,filter:"blur(24px)",rotation:{-6 if j%2 else 6}}},{{scale:{big},opacity:1,filter:"blur(0px)",rotation:0,duration:.28,ease:"expo.out"}},{rt+0.02:.2f});')
            if j: js.append(f'tl.to("#bw{c}_{j-1}",{{opacity:0,scale:.6,y:80,duration:.15,ease:"power3.in"}},{rt-0.02:.2f});')
            js.append(f'tl.fromTo("#shake",{{x:{[-26,22,-34][j]},y:{[10,-14,18][j]},rotation:{[-.8,.6,-1.2][j]}}},{{immediateRender:false,x:0,y:0,rotation:0,duration:.45,ease:"elastic.out(1,.28)"}},{rt+0.05:.2f});')
            js.append(f'tl.fromTo("#fl",{{opacity:{[.25,.18,.5][j]},backgroundColor:"{TIERS[j][1]}"}},{{immediateRender:false,opacity:0,duration:.35,ease:"power2.out"}},{rt+0.04:.2f});')
            if j == 2:
                js.append(f'tl.fromTo("#bw{c}_{j}",{{textShadow:"0 0 0px #39FF88"}},{{textShadow:"0 0 80px #39FF88",duration:.3,yoyo:true,repeat:3}},{rt+0.3:.2f});')
                js.append(f'tl.fromTo("#bring",{{scale:.2,opacity:1}},{{immediateRender:false,scale:3.2,opacity:0,duration:.7,ease:"expo.out"}},{rt+0.06:.2f});')
    # exit: everything falls back into depth
    js.append(f'tl.to("#{cid} .slot",{{y:120,scale:.6,opacity:0,filter:"blur(10px)",duration:.22,stagger:.03,ease:"power3.in"}},{t1-0.24:.2f});')
    js.append(f'tl.to("#{cid} .ttl",{{scale:.7,opacity:0,duration:.2,ease:"power3.in"}},{t1-0.2:.2f});')

# ---------------------------------------------------------------- CTA scene
W = {k: R(v) for k, v in dict(list=103.24, follow=106.36, here=106.88, word=107.88, send=108.88, full=109.50).items()}
html.append(f'''<div class="clip" id="cta" data-start="{CTA:.3f}" data-duration="{DUR-CTA:.3f}" data-track-index="2">
  <div id="fan">{''.join(f'<div class="ft" id="ft{i}">{logo(k, b, f)}</div>' for i, (k, n, b, f) in enumerate(t for c in CATS for t in c[3]))}</div>
  <div id="ctl"><div class="kick">لیست کامل</div><div class="big">همه‌ی ابزارها</div></div>
  <div id="fol"><img src="assets/avatar.png"><div class="fn"><b>mohammadpour.bi</b><span>محمدرضا محمدپور</span></div>
     <div class="fb" id="fb"><span id="fb1">دنبال کردن</span><span id="fb2">دنبال می‌کنید ✓</span></div></div>
  <div id="cmt"><div class="ck">کامنت کن</div><div class="cbox"><span id="typed">ابزار</span><i id="caret"></i>
     <div class="send" id="snd">{kit.icon_svg("send", 46, 2.4)}</div></div></div>
  <div id="kw">ابزار</div>
</div>''')
nf = sum(len(c[3]) for c in CATS)
for i in range(nf):
    ang = (i - (nf - 1) / 2) * 7
    js.append(f'tl.fromTo("#ft{i}",{{x:{(i-(nf-1)/2)*30:.0f},y:900,rotation:0,opacity:0}},{{x:{(i-(nf-1)/2)*44:.0f},y:{abs(i-(nf-1)/2)**1.6*2.2:.0f},rotation:{ang:.1f},opacity:1,duration:.5,ease:"expo.out"}},{CTA+0.05+i*0.03:.2f});')
js.append(f'tl.fromTo("#ctl",{{scale:2,opacity:0,filter:"blur(14px)"}},{{scale:1,opacity:1,filter:"blur(0px)",duration:.35,ease:"expo.out"}},{W["list"]-0.1:.2f});')
js.append(f'tl.to("#fan,#ctl",{{y:-80,opacity:0,scale:.8,duration:.3,ease:"power3.in"}},{W["follow"]-0.75:.2f});')
js.append(f'tl.fromTo("#fol",{{y:120,opacity:0,scale:.8}},{{y:0,opacity:1,scale:1,duration:.4,ease:"back.out(1.8)"}},{W["follow"]-0.45:.2f});')
js.append(f'tl.to("#fb",{{scale:.88,duration:.08,yoyo:true,repeat:1}},{W["follow"]:.2f});')
js.append(f'tl.set("#fb",{{background:"#2A2F3A"}},{W["follow"]+0.08:.2f});tl.set("#fb1",{{opacity:0}},{W["follow"]+0.08:.2f});tl.set("#fb2",{{opacity:1}},{W["follow"]+0.08:.2f});')
js.append(f'tl.to("#fol",{{y:-40,scale:.82,duration:.35,ease:"power3.inOut"}},{W["here"]-0.2:.2f});')
js.append(f'tl.fromTo("#cmt",{{y:140,opacity:0}},{{y:0,opacity:1,duration:.35,ease:"back.out(1.6)"}},{W["here"]-0.05:.2f});')
js.append(f'tl.fromTo("#typed",{{clipPath:"inset(0 0 0 100%)"}},{{clipPath:"inset(0 0 0 0%)",duration:.45,ease:"steps(5)"}},{W["word"]:.2f});')
js.append(f'tl.to("#snd",{{scale:1.35,duration:.1,yoyo:true,repeat:1}},{W["send"]:.2f});')
js.append(f'tl.fromTo("#kw",{{scale:3,opacity:0,filter:"blur(20px)"}},{{scale:1,opacity:1,filter:"blur(0px)",duration:.4,ease:"expo.out"}},{W["send"]+0.05:.2f});')
js.append(f'tl.to("#kw",{{scale:1.08,duration:.5,yoyo:true,repeat:{int((DUR-W["send"])/0.5)-2},ease:"sine.inOut"}},{W["send"]+0.5:.2f});')
fx.update(cta=CTA, words=W, dur=DUR)

# ---------------------------------------------------------------- page
OUTD.mkdir(exist_ok=True); (OUTD / "assets").mkdir(exist_ok=True)
for f in ["Lalezar-Regular.ttf", "Vazirmatn-Black.ttf", "Vazirmatn-Bold.ttf", "Inter[opsz,wght].ttf"]:
    shutil.copy(ROOT / "mp-studio/fonts" / f, OUTD / "assets" / f.replace("[opsz,wght]", ""))
shutil.copy(ROOT / "mp-studio/assets/logo/avatar.png", OUTD / "assets/avatar.png")

STAGE = ('<div id="stage"><div id="shake">', '</div></div><div id="fl"></div><div id="sweep"></div><div id="bring"></div><div id="scan"></div>') if NOFACE else ("", "")
NF_CSS = '''#stage{position:absolute;inset:0;transform:translateY(230px) scale(1.06);transform-origin:50% 0}
#shake{position:absolute;inset:0}
.bw{position:absolute;inset:0}
.bw .w{position:absolute;left:0;right:0;top:1400px;text-align:center;direction:rtl;font:400 190px Lalezar;line-height:1.1;opacity:0;text-shadow:0 10px 0 rgba(0,0,0,.45)}
#fl{position:absolute;inset:0;opacity:0;mix-blend-mode:screen}
#sweep{position:absolute;top:-200px;left:0;width:420px;height:2400px;transform:translateX(-1600px) skewX(-18deg);
  background:linear-gradient(90deg,transparent,rgba(160,230,255,.30),rgba(255,255,255,.6),rgba(160,230,255,.30),transparent)}
#bring{position:absolute;left:340px;top:1330px;width:400px;height:400px;border-radius:50%;border:10px solid #39FF88;opacity:0;box-shadow:0 0 60px #39FF88}
#scan{position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(255,255,255,.035) 0 2px,transparent 2px 5px);pointer-events:none}
''' if NOFACE else ""
page = f'''<!doctype html>
<html lang="fa"><head><meta charset="UTF-8"><meta name="viewport" content="width=1080, height=1920">
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>
@font-face{{font-family:Lalezar;src:url(assets/Lalezar-Regular.ttf)}}
@font-face{{font-family:Vaz;src:url(assets/Vazirmatn-Bold.ttf);font-weight:700}}
@font-face{{font-family:Vaz;src:url(assets/Vazirmatn-Black.ttf);font-weight:900}}
@font-face{{font-family:InterV;src:url(assets/Inter.ttf);font-weight:100 900}}
*{{margin:0;padding:0;box-sizing:border-box}}
html,body{{width:1080px;height:1920px;overflow:hidden;background:#05060B}}
#root{{position:relative;width:1080px;height:1920px;overflow:hidden;background:radial-gradient(120% 70% at 50% 30%,#0D1430 0%,#05060B 60%);font-family:Vaz;color:#fff;perspective:1200px}}
#grid{{position:absolute;left:-540px;right:-540px;bottom:-200px;height:1300px;transform:rotateX(68deg);transform-origin:50% 100%;
  background-image:linear-gradient(rgba(77,216,255,.22) 2px,transparent 2px),linear-gradient(90deg,rgba(77,216,255,.22) 2px,transparent 2px);
  background-size:90px 90px;-webkit-mask-image:linear-gradient(to top,#000 10%,transparent 85%)}}
.glow{{position:absolute;left:-160px;top:40px;width:1400px;height:1100px;opacity:0;transform:scale(.8)}}
.pt{{position:absolute;border-radius:50%;background:#9FE8FF;box-shadow:0 0 10px #4DD8FF}}
.mono{{font-family:InterV;font-weight:900;letter-spacing:-1px}}
#hdr{{position:absolute;top:226px;left:0;right:0;margin:auto;width:max-content;direction:rtl;display:flex;align-items:center;gap:10px;
  padding:14px 30px;border-radius:999px;background:rgba(14,20,36,.75);border:1.5px solid rgba(120,200,255,.3);box-shadow:0 0 40px rgba(77,216,255,.15);opacity:0}}
#hdr .d{{width:16px;height:16px;border-radius:50%}}
#hdr .ht{{font:900 36px Vaz;margin-right:8px}}
#cnt{{position:absolute;top:300px;left:0;right:0;text-align:center;font:900 30px Vaz;color:#8A97B5;opacity:0}}
.cat{{position:absolute;inset:0}}
.slot{{position:absolute;top:380px;width:280px;height:380px;transform-style:preserve-3d}}
.ghost,.card{{position:absolute;left:0;top:0;width:280px;height:300px;border-radius:34px;display:flex;flex-direction:column;align-items:center;justify-content:center}}
.ghost{{background:rgba(255,255,255,.05);border:2px dashed rgba(255,255,255,.18)}}
.ghost span{{font:900 120px InterV;color:rgba(255,255,255,.14)}}
.card{{background:rgba(14,20,36,.82);border:2.5px solid var(--tc);opacity:0;gap:22px}}
.tile{{width:160px;height:160px;border-radius:40px;display:flex;align-items:center;justify-content:center;box-shadow:0 10px 30px rgba(0,0,0,.45)}}
.nm{{font:800 32px InterV;letter-spacing:-.5px;white-space:nowrap}}
.pill{{position:absolute;left:0;right:0;margin:auto;top:320px;width:150px;padding:4px 0 10px;border-radius:999px;text-align:center;font:900 40px Vaz;color:#0A0A0A;opacity:0}}
.ring{{position:absolute;left:-10px;top:0;width:300px;height:300px;border-radius:50%;border:6px solid #39FF88;opacity:0}}
.crown{{position:absolute;left:-26px;top:-56px;color:#FFD84D;filter:drop-shadow(0 0 12px #FFC400);opacity:0}}
.sp{{position:absolute;left:134px;top:144px;width:14px;height:14px;border-radius:50%;background:#B8FFD4;box-shadow:0 0 14px #39FF88;opacity:0}}
.x{{position:absolute;right:-18px;top:-26px;width:84px;height:84px;border-radius:50%;background:#FF4D5E;font:900 50px InterV;color:#fff;display:flex;align-items:center;justify-content:center;opacity:0;box-shadow:0 0 30px rgba(255,77,94,.7)}}
.ttl{{position:absolute;top:790px;left:0;right:0;text-align:center;direction:rtl}}
.kick{{font:900 38px Vaz;color:#4DD8FF;letter-spacing:.5px}}
.big{{font:400 104px Lalezar;line-height:1.05;color:#FFC400;text-shadow:0 0 40px rgba(255,196,0,.35),0 6px 0 rgba(0,0,0,.4)}}
#fan{{position:absolute;left:0;right:0;top:330px;height:200px}}
.ft{{position:absolute;left:470px;top:0;transform-origin:50% 600px}}
.ft .tile{{width:140px;height:140px;border-radius:34px}}
.ft .tile svg{{width:76px;height:76px}}
.ft .mono{{font-size:44px !important}}
#ctl{{position:absolute;top:620px;left:0;right:0;text-align:center;direction:rtl}}
#fol{{position:absolute;top:340px;left:90px;width:900px;height:170px;border-radius:40px;background:rgba(14,20,36,.85);border:2px solid rgba(120,200,255,.3);
  display:flex;align-items:center;gap:24px;padding:0 30px;direction:rtl;opacity:0}}
#fol img{{width:112px;height:112px;border-radius:50%;border:4px solid #FFC400}}
.fn{{display:flex;flex-direction:column;flex:1}} .fn b{{font:800 36px InterV;direction:ltr;text-align:right}} .fn span{{font:700 28px Vaz;color:#8A97B5}}
.fb{{position:relative;width:250px;height:76px;border-radius:22px;background:#0A84FF;font:900 30px Vaz}}
.fb span{{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}} #fb2{{opacity:0}}
#cmt{{position:absolute;top:590px;left:90px;width:900px;direction:rtl;opacity:0}}
.ck{{font:900 40px Vaz;color:#4DD8FF;margin:0 10px 14px}}
.cbox{{position:relative;height:120px;border-radius:60px;background:#F4F6FA;display:flex;align-items:center;padding:0 44px;color:#0B0B0B}}
#typed{{font:900 60px Vaz}} #caret{{display:inline-block;width:4px;height:58px;background:#0A84FF;margin-right:8px}}
.send{{position:absolute;left:18px;top:18px;width:84px;height:84px;border-radius:50%;background:#0A84FF;color:#fff;display:flex;align-items:center;justify-content:center}}
#kw{{position:absolute;top:740px;left:0;right:0;text-align:center;font:400 190px Lalezar;color:#FFC400;opacity:0;
  text-shadow:0 0 60px rgba(255,196,0,.55),0 8px 0 rgba(0,0,0,.45)}}
#rim,#rimg{{position:absolute;left:52px;top:1172px;width:976px;height:696px;border-radius:48px;opacity:0}}
#rim{{border:4px solid rgba(77,216,255,.85);box-shadow:0 0 30px rgba(77,216,255,.55),inset 0 0 30px rgba(77,216,255,.35)}}
#rimg{{border:6px solid #39FF88;box-shadow:0 0 70px 10px rgba(57,255,136,.7)}}
{NF_CSS}
svg.draw{{stroke:currentColor;fill:none}}
</style></head><body>
<div id="root" data-composition-id="panel" data-start="0" data-duration="{DUR:.3f}" data-width="1080" data-height="1920" data-layout-allow-overflow data-layout-allow-overlap>
<div id="grid"></div>
{''.join(parts)}
{STAGE[0]}{chr(10).join(html)}{STAGE[1]}
{chr(10).join(extra)}
</div>
<script>
const tl = gsap.timeline({{ paused: true }});
{chr(10).join(js)}
tl.set({{}},{{}},{DUR:.3f});
window.__timelines = window.__timelines || {{}};
window.__timelines["panel"] = tl;
</script></body></html>'''
(OUTD / "index.html").write_text(page, encoding="utf-8")
(OUTD / "timing.json").write_text(json.dumps(fx, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"panel: {DUR:.2f}s, cats at {STARTS}, cta {CTA}")
