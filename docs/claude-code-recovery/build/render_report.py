#!/usr/bin/env python3
"""tools-inventory.json (+ test-results.json) → build/out/report.html (Persian, RTL, A4 landscape).
build/html_to_pdf.cjs turns it into the PDF. Fonts are embedded from node_modules (Vazirmatn, OFL)."""
import base64, html, json, sys
from collections import Counter
from pathlib import Path

KIT = Path(__file__).resolve().parents[1]
REPO = KIT.parents[1]
inv = json.loads((KIT / "tools-inventory.json").read_text(encoding="utf-8"))
tests_path = KIT / "test-results.json"
tests = json.loads(tests_path.read_text(encoding="utf-8")) if tests_path.exists() else None
items = inv["items"]
E = lambda s: html.escape(str(s)) if s is not None else ""

FONT_DIR = REPO / "node_modules/@fontsource/vazirmatn/files"
faces = []
for sub, rng in (("arabic", "U+0600-06FF,U+0750-077F,U+08A0-08FF,U+200C-200F,U+FB50-FDFF,U+FE70-FEFF"), ("latin", "U+0000-00FF,U+2000-206F,U+20AC,U+2190-21FF")):
    for w in (400, 700):
        f = FONT_DIR / f"vazirmatn-{sub}-{w}-normal.woff2"
        if not f.exists():
            sys.exit(f"missing font {f} — run npm ci in the repo root")
        b64 = base64.b64encode(f.read_bytes()).decode()
        faces.append(f"@font-face{{font-family:Vazirmatn;font-weight:{w};src:url(data:font/woff2;base64,{b64}) format('woff2');unicode-range:{rng}}}")
        if sub == "arabic":  # Persian inside monospace code: shaped glyphs, Latin falls through to the mono font
            faces.append(f"@font-face{{font-family:VazFa;font-weight:{w};src:url(data:font/woff2;base64,{b64}) format('woff2');unicode-range:{rng}}}")

STATUS_FA = {"installed": "نصب و آزموده", "vendored": "در ریپو", "account": "از حساب", "builtin": "داخلی", "session": "نشست ابری",
             "configured": "پیکربندی‌شده", "configured-missing": "پیکربندی‌شده، غایب", "failed-connect": "اتصال ناموفق",
             "optional": "اختیاری", "mentioned": "فقط ذکرشده", "proposed": "پیشنهادی", "rejected": "ردشده", "excluded": "منتقل‌نشده"}
STATUS_CLS = {"installed": "ok", "vendored": "ok", "account": "acc", "builtin": "acc", "session": "acc", "configured": "warn",
              "configured-missing": "bad", "failed-connect": "bad", "optional": "muted", "mentioned": "muted", "proposed": "muted",
              "rejected": "muted", "excluded": "muted"}
REC_FA = {"auto": "خودکار", "manual": "دستی", "no": "غیرقابل‌بازیابی"}
GROUPS = [
    ("هستهٔ Claude Code و پیش‌نیازها", ["claude-code-core", "runtime"]),
    ("ریپو، حساب و محیط‌های ابری", ["repository", "account-auth", "cloud-environment"]),
    ("بسته‌ها و پلاگین‌های حساب", ["bundle", "account-plugin"]),
    ("سرورهای MCP و کانکتورها", ["project-mcp", "connector", "session-mcp"]),
    ("CLIهای ایجنت", ["cli"]),
    ("هوک‌ها و تنظیمات", ["hook", "settings", "cloud-env"]),
    ("اسکیل‌های پروژه (vendored در .claude/skills)", ["skill", "licence-file"]),
    ("ایجنت‌ها، فرمان‌ها و مراجع پروژه", ["agent", "command", "reference"]),
    ("اسکیل‌های حساب claude.ai", ["account-skill"]),
    ("اسکیل‌ها و ایجنت‌های داخلی Claude Code", ["builtin-skill", "builtin-agent"]),
    ("ابزارهای داخلی Claude Code", ["builtin-tool"]),
    ("ابزارهای اختصاصی پروژهٔ moshen_project", ["project-runtime", "library", "project-tool"]),
    ("ابزارهای ایمیج ابری", ["image-cli"]),
    ("سرویس‌های بیرونی (فقط احراز هویت)", ["external-service"]),
    ("ذکرشده، پیشنهادی، ردشده، منتقل‌نشده", ["candidate"]),
    ("مراحل خود کیت", ["restore-step"]),
]
assert {c for _, cs in GROUPS for c in cs} >= {i["category"] for i in items}, "a category has no report group"


def chip(st):
    return f'<span class="chip {STATUS_CLS.get(st, "muted")}">{E(STATUS_FA.get(st, st))}</span>'


def link(u):
    if not u:
        return "—"
    if not u.startswith("http"):
        return f'<span dir="ltr">{E(u)}</span>'
    short = u.split("://", 1)[1].rstrip("/")
    short = short if len(short) <= 46 else short[:44] + "…"
    return f'<a href="{E(u)}" dir="ltr">{E(short)}</a>'


def code(s, limit=230):
    if not s:
        return "—"
    s = str(s)
    s = s if len(s) <= limit else s[:limit] + " …"
    return f'<span class="code">{E(s)}</span>'


def row_full(i, n):
    rest = i.get("restore") or {}
    plats = i["portability"]
    port = " ".join(f'<span class="p {plats[k]}">{lbl}</span>' for k, lbl in (("cloud", "C"), ("linux", "L"), ("macos", "M"), ("windows", "W")))
    flags = ("🔒 " if i["sensitive"] else "") + ("📁 " if i["project_specific"] else "")
    return (f"<tr><td class='n'>{n}</td><td><b dir='auto'>{E(i['name'])}</b><div class='sub'>{flags}{E(i['version'] or '')}</div></td>"
            f"<td>{chip(i['status'])}</td><td>{E(i['purpose_fa'])}</td><td>{link(i['url'])}</td>"
            f"<td>{code(i['install'])}{('<div class=sub>فعال‌سازی: ' + E(i['activate']) + '</div>') if i.get('activate') else ''}</td>"
            f"<td>{E(REC_FA.get(i['recoverable'], i['recoverable']))}{(' · فاز ' + str(rest['phase'])) if rest else ''}<div class='sub'>{port}</div></td>"
            f"<td class='t'>{E(i.get('tested') or 'NOT TESTED')}{('<div class=sub>' + E(i['notes']) + '</div>') if i.get('notes') else ''}</td></tr>")


def row_compact(i, n):
    return (f"<tr><td class='n'>{n}</td><td><b dir='ltr'>{E(i['name'])}</b></td><td>{chip(i['status'])}</td><td>{E(i['purpose_fa'])}</td>"
            f"<td class='sub'>{E((i.get('bundle') or '').replace('bundle:', ''))}</td><td>{link(i['url'])}</td>"
            f"<td class='t'>{E(i.get('notes') or '')}</td></tr>")


FULL_HEAD = "<tr><th>#</th><th>نام / نسخه</th><th>وضعیت</th><th>کاربرد</th><th>لینک رسمی</th><th>نصب و فعال‌سازی</th><th>بازیابی · سکو</th><th>آزمون این نشست / یادداشت</th></tr>"
COMPACT_HEAD = "<tr><th>#</th><th>نام</th><th>وضعیت</th><th>کاربرد</th><th>بسته</th><th>لینک</th><th>یادداشت</th></tr>"
COMPACT = {"skill", "licence-file", "account-skill", "builtin-skill", "builtin-agent", "builtin-tool", "agent", "command", "reference", "library", "project-tool", "image-cli"}

by_status = Counter(i["status"] for i in items)
by_rec = Counter(i["recoverable"] for i in items)
real = [i for i in items if i["category"] not in ("candidate", "restore-step")]
LEGEND_FA = {"installed": "موجود و بررسی‌شده در همین نشست", "vendored": "کامیت‌شده در ریپو؛ هر نشست بارگذاری می‌شود",
             "account": "همگام از حساب claude.ai", "builtin": "همراه Claude Code", "session": "فقط در نشست ابری",
             "configured": "پیکربندی‌شده؛ کلید/اتصال آزموده نشد", "configured-missing": "پیکربندی‌شده ولی در این نشست حاضر نبود",
             "failed-connect": "پیکربندی‌شده؛ اتصال ناموفق", "optional": "اختیاری مستندشده؛ نصب‌نشده", "mentioned": "فقط ذکرشده",
             "proposed": "پیشنهادشده؛ نصب‌نشده", "rejected": "بررسی و رد شد", "excluded": "عمداً منتقل نشد"}
summary_rows = "".join(f"<tr><td>{chip(s)}</td><td>{E(LEGEND_FA.get(s, inv['status_legend'].get(s, '')))}</td><td class='num'>{c}</td></tr>" for s, c in by_status.most_common())

sections = []
n = 0
for title, cats in GROUPS:
    group = [i for i in items if i["category"] in cats]
    if not group:
        continue
    compact = all(i["category"] in COMPACT for i in group)
    rows = []
    for i in group:
        n += 1
        rows.append(row_compact(i, n) if compact else row_full(i, n))
    sections.append(f"<h2>{E(title)} <small>({len(group)})</small></h2><table class='{'compact' if compact else 'full'}'><thead>{COMPACT_HEAD if compact else FULL_HEAD}</thead><tbody>{''.join(rows)}</tbody></table>")

bundle_rows = "".join(
    f"<tr><td><b>{E(b['name'])}</b></td><td>{E(b['version'] or '')}</td><td>{E(b['license'] or '')}</td><td>{link(b['url'])}</td>"
    f"<td class='num'>{sum(1 for i in items if i.get('bundle') == b['id'])}</td><td>{code(b['install'], 400)}</td></tr>"
    for b in items if b["category"] in ("bundle", "account-plugin"))

PHASE_NOTE = {"2": f"manual only: {sum(1 for i in items if i['category'] in ('repository', 'account-auth', 'account-plugin', 'connector', 'cloud-environment'))} account/auth items (sections 4, 7)",
              "8": f"manual only: {sum(1 for i in items if i['category'] == 'external-service' and i['sensitive'])} keyed services + --include-sensitive installs (section 8)",
              "3": "payload:project-claude-layer (+ optional payload:global-skills) restores all 99 skills, 4 agents, 9 commands, hooks, licences",
              "9": "bash verify.sh"}
phase_rows = "".join(
    f"<tr><td class='num'>{p}</td><td dir='ltr'>{E(name)}</td><td class='num'>{sum(1 for i in items if (i.get('restore') or {}).get('phase') == int(p))}</td>"
    f"<td class='sub' dir='ltr'>{E(PHASE_NOTE.get(p) or ', '.join(i['id'] for i in items if (i.get('restore') or {}).get('phase') == int(p) and i['restore']['method'] != 'bundle')[:600])}</td></tr>"
    for p, name in inv["phases"].items())

mcp_rows = "".join(
    f"<tr><td><b dir='ltr'>{E(i['name'])}</b><div class='sub'>{len(i['tools'])} ابزار · {chip(i['status'])}</div></td><td class='tools' dir='ltr'>{E(' · '.join(i['tools']))}</td></tr>"
    for i in items if i.get("tools"))

if tests:
    test_rows = "".join(f"<tr><td class='num'>{t['n']}</td><td>{E(t['title'])}</td><td><span class='chip {dict(PASS='ok', FAIL='bad').get(t['status'], 'warn')}'>{E(t['status'])}</span></td><td class='t' dir='ltr' style='text-align:left'>{E(t['details'] if len(t['details']) <= 900 else t['details'][:900] + ' … (full text: TEST-RESULTS.md)')}</td></tr>" for t in tests["results"])
    test_block = f"<p class='sub'>اجرا: <span dir='ltr'>{E(tests['ran_at'])}</span> · <span dir='ltr'>{E(tests['environment'])}</span> · خلاصه: <span dir='ltr'>{E(', '.join(f'{k}={v}' for k, v in tests['summary'].items()))}</span></p><table class='tests'><thead><tr><th>#</th><th>آزمون</th><th>نتیجه</th><th>جزئیات</th></tr></thead><tbody>{test_rows}</tbody></table>"
else:
    test_block = "<p>NOT TESTED — این نسخهٔ گزارش پیش از اجرای tests/run_tests.py ساخته شده است.</p>"

sensitive = [i for i in items if i["sensitive"]]
nontransfer = [i for i in items if i["recoverable"] in ("no", "manual") and i["auth"] != "بدون کلید"
               and i["category"] not in ("builtin-tool", "builtin-skill", "builtin-agent", "candidate", "project-tool", "image-cli", "account-skill")]
li_nt = lambda xs: "".join(f"<li><b dir='auto'>{E(i['name'])}</b> — {E(REC_FA.get(i['recoverable']))}"
                           f"{(' · احراز هویت: ' + E(i['auth'])) if i['auth'] != 'none' else ''} · {E(i['install'] or '')}</li>" for i in xs)
missing = [i for i in items if i["status"] in ("configured-missing", "failed-connect")]
li = lambda xs: "".join(f"<li><b dir='auto'>{E(i['name'])}</b> — {E(i.get('notes') or i.get('tested') or i['purpose_fa'])}</li>" for i in xs)

DOC = f"""<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>کیت بازیابی اکوسیستم Claude Code</title>
<style>
{''.join(faces)}
@page {{ size: A4 landscape; margin: 11mm 10mm 12mm; }}
:root {{ --ink:#1d2433; --mute:#667085; --line:#d0d5dd; --ok:#067647; --okb:#ecfdf3; --bad:#b42318; --badb:#fef3f2; --warn:#b54708; --warnb:#fffaeb; --acc:#175cd3; --accb:#eff8ff; }}
html {{ background:#fff; }}
body {{ font-family: Vazirmatn, sans-serif; color:var(--ink); font-size:8.6pt; line-height:1.55; margin:0; }}
h1 {{ font-size:22pt; margin:0 0 4mm; }} h2 {{ font-size:12.5pt; margin:7mm 0 2mm; border-bottom:2px solid var(--ink); padding-bottom:1mm; break-after:avoid; }}
h2 small {{ color:var(--mute); font-weight:400; }} h3 {{ font-size:10.5pt; margin:4mm 0 1.5mm; break-after:avoid; }}
p, li {{ max-width:none; }} ul {{ margin:1mm 0 2mm; padding-inline-start:6mm; }}
a {{ color:var(--acc); text-decoration:none; unicode-bidi:isolate; }}
span[dir=ltr] {{ unicode-bidi:isolate; white-space:nowrap; }}
table {{ width:100%; border-collapse:collapse; margin:1mm 0 3mm; table-layout:fixed; }}
thead {{ display:table-header-group; }} tr {{ break-inside:avoid; }}
th {{ background:#f2f4f7; font-weight:700; text-align:right; }}
th, td {{ border:1px solid var(--line); padding:1.2mm 1.6mm; vertical-align:top; overflow-wrap:anywhere; }}
table.full td:nth-child(1) {{ width:7mm; }} table.full th:nth-child(1) {{ width:7mm; }}
table.full th:nth-child(2) {{ width:30mm; }} table.full th:nth-child(3) {{ width:20mm; }} table.full th:nth-child(4) {{ width:42mm; }}
table.full th:nth-child(5) {{ width:33mm; }} table.full th:nth-child(6) {{ width:62mm; }} table.full th:nth-child(7) {{ width:22mm; }}
table.compact th:nth-child(1) {{ width:7mm; }} table.compact th:nth-child(2) {{ width:46mm; }} table.compact th:nth-child(3) {{ width:20mm; }}
table.compact th:nth-child(4) {{ width:78mm; }} table.compact th:nth-child(5) {{ width:30mm; }} table.compact th:nth-child(6) {{ width:42mm; }}
td.n, td.num {{ text-align:center; color:var(--mute); }} .sub {{ color:var(--mute); font-size:7.4pt; }} td.t {{ font-size:7.6pt; }}
.code {{ font-family: VazFa, "DejaVu Sans Mono", "Courier New", monospace; font-size:7.2pt; direction:ltr; unicode-bidi:plaintext; display:block; text-align:left; background:#f8f9fb; padding:.6mm 1mm; border-radius:1mm; white-space:pre-wrap; }}
pre.code {{ margin:1mm 0 2mm; padding:2mm; font-size:7.8pt; }}
.chip {{ display:inline-block; padding:.2mm 1.6mm; border-radius:3mm; font-size:7.2pt; font-weight:700; white-space:nowrap; }}
.ok {{ color:var(--ok); background:var(--okb); }} .bad {{ color:var(--bad); background:var(--badb); }} .warn {{ color:var(--warn); background:var(--warnb); }}
.acc {{ color:var(--acc); background:var(--accb); }} .muted {{ color:var(--mute); background:#f2f4f7; }}
.p {{ display:inline-block; width:4mm; text-align:center; border-radius:.8mm; font-size:6.8pt; font-weight:700; margin-inline-end:.4mm; direction:ltr; }}
.p.yes {{ background:var(--okb); color:var(--ok); }} .p.partial {{ background:var(--warnb); color:var(--warn); }} .p.no {{ background:var(--badb); color:var(--bad); }}
td.tools {{ font-size:6.9pt; text-align:left; color:#344054; }}
.cover {{ height:180mm; display:flex; flex-direction:column; justify-content:center; break-after:page; }}
.cover .lead {{ font-size:12pt; color:#344054; max-width:220mm; }}
.kpis {{ display:flex; gap:4mm; margin-top:8mm; flex-wrap:wrap; }}
.kpi {{ border:1px solid var(--line); border-radius:2mm; padding:3mm 5mm; min-width:34mm; }}
.kpi b {{ display:block; font-size:18pt; }} .kpi span {{ color:var(--mute); }}
.two {{ display:grid; grid-template-columns:1fr 1fr; gap:6mm; }}
.box {{ border:1px solid var(--line); border-radius:2mm; padding:2mm 4mm; break-inside:avoid; }}
.pb {{ break-before:page; }}
table.tests tr {{ break-inside:auto; }} table.tests th:nth-child(1) {{ width:7mm; }} table.tests th:nth-child(2) {{ width:52mm; }} table.tests th:nth-child(3) {{ width:18mm; }}
</style></head><body>

<section class="cover">
<h1>کیت بازیابی اکوسیستم Claude Code</h1>
<p class="lead">فهرست کامل، آزموده و قابل‌اجرای همهٔ ابزارها، اسکیل‌ها، پلاگین‌ها، سرورهای MCP، کانکتورها، هوک‌ها و CLIهایی که از نشست ابری
پروژهٔ <span dir="ltr">moshen_project</span> قابل دسترسی بودند، همراه با دستور نصب، ترتیب وابستگی، اسکریپت بازیابی و نتیجهٔ آزمون‌ها.</p>
<p class="sub">تاریخ موجودی: {E(inv['generated'])} · شِما: <span dir="ltr">{E(inv['schema'])}</span> · منبع حقیقت: <span dir="ltr">tools-inventory.json</span></p>
<div class="kpis">
<div class="kpi"><b>{len(items)}</b><span>کل موارد فهرست‌شده</span></div>
<div class="kpi"><b>{len(real)}</b><span>ابزار/قابلیت واقعی (بدون کاندیدا و مراحل کیت)</span></div>
<div class="kpi"><b>{by_rec['auto']}</b><span>بازیابی خودکار (اسکریپت/payload)</span></div>
<div class="kpi"><b>{by_rec['manual']}</b><span>بازیابی دستی (حساب، احراز هویت)</span></div>
<div class="kpi"><b>{by_rec['no']}</b><span>غیرقابل‌بازیابی</span></div>
<div class="kpi"><b>{len(missing)}</b><span>پیکربندی‌شده ولی غایب/ناموفق در این نشست</span></div>
</div></section>

<h2>۱. خلاصهٔ وضعیت</h2>
<div class="two"><div><table class="full"><thead><tr><th style="width:32mm">وضعیت</th><th>معنی</th><th style="width:14mm">تعداد</th></tr></thead><tbody>{summary_rows}</tbody></table></div>
<div class="box"><h3>نشانه‌ها</h3><ul>
<li>🔒 حساس (امنیت، حریم خصوصی یا هزینه): پیش از نصب بررسی شود؛ اسکریپت بدون <span dir="ltr">--include-sensitive</span> نصبش نمی‌کند.</li>
<li>📁 اختصاصی پروژهٔ <span dir="ltr">moshen_project</span>؛ بیرون از آن ریپو معنا ندارد.</li>
<li>سکو: <span class="p yes">C</span> ابری، <span class="p yes">L</span> لینوکس، <span class="p yes">M</span> مک، <span class="p yes">W</span> ویندوز؛ سبز = کامل، نارنجی = جزئی، قرمز = ندارد.</li>
<li>«آزمون این نشست» فقط چیزی را می‌گوید که واقعاً در ۲۰۲۶-۱۱-۰۵ اجرا یا مشاهده شد؛ هر چیز دیگر NOT TESTED است.</li>
<li>هیچ کلید، توکن، مقدار secret یا کوکی‌ای خوانده یا در این کیت قرار داده نشده است.</li></ul></div></div>

<h2>۲. بازیابی سریع</h2>
<div class="two"><div class="box"><h3>روی سیستم یا حساب جدید</h3>
<pre class="code">unzip claude-code-recovery-kit.zip &amp;&amp; cd claude-code-recovery-kit
sha256sum -c payload/MANIFEST.sha256 --quiet   # payload integrity
bash restore.sh                                 # plan only (dry run)
bash restore.sh --apply --phase 0,1             # prerequisites + Claude Code
claude                                          # then /login with your claude.ai account
# phase 2 (manual): GitHub App, connectors, plugins, environments, secrets
git clone https://github.com/iliamirojaghi88-coder/moshen_project.git
bash restore.sh --apply --phase 4,5,6 --target moshen_project
bash verify.sh --target moshen_project</pre></div>
<div class="box"><h3>پروژهٔ دیگر یا ریپوی بدون دسترسی</h3>
<pre class="code">bash restore.sh --apply --phase 3 --generic --target ~/my-repo
bash restore.sh --apply --phase 3 --include-optional   # + ~/.claude/skills
bash restore.sh --apply --phase 5 --include-optional   # graphify, MCP servers, ...
bash restore.sh --apply --only cli:claude-mem --include-sensitive   # only after review
python restore.py --os windows                          # Windows plan</pre>
<ul><li>اسکریپت هیچ فایل موجودی را بازنویسی نمی‌کند و پیش‌فرضش Dry Run است.</li>
<li><span dir="ltr">--generic</span> به‌جای هوک‌های پروژه (که اسکریپت‌های این ریپو را صدا می‌زنند) قالب عمومی را می‌گذارد.</li>
<li>هر قدم با یک بررسی فقط‌خواندنی شروع می‌شود؛ اگر ابزار هست، رد می‌شود (idempotent).</li></ul></div></div>

<h2>۳. ترتیب نصب و وابستگی‌ها</h2>
<table class="full"><thead><tr><th style="width:10mm">فاز</th><th style="width:48mm">مرحله</th><th style="width:14mm">موارد</th><th>شناسه‌های قابل‌اجرا</th></tr></thead><tbody>{phase_rows}</tbody></table>
<p>زنجیرهٔ اصلی: Git/Node/Python/uv/FFmpeg ← Claude Code CLI ← ورود به حساب ← لایهٔ <span dir="ltr">.claude</span> (۹۹ اسکیل، ۴ ایجنت، ۹ فرمان، هوک‌ها) ←
وابستگی‌های پروژه (npm، Remotion، Chrome، Piper) ← ابزارهای ایجنت (graphify، claude-mem، MCPها) ← runtime ویدیوی MP (<span dir="ltr">.venv-cloud</span>) ← ابزارهای سنگین اختیاری (Blender، KTX، whisper.cpp، Docker).
وابستگی هر مورد در ستون <span dir="ltr">depends_on</span> فایل JSON است و آزمون ۴ ترتیب آن را بررسی می‌کند.</p>

<h2>۴. نصب در برابر احراز هویت</h2>
<div class="two"><div class="box"><h3>نصب (قابل اسکریپت)</h3><p>گذاشتن کد یا باینری روی دیسک: <span dir="ltr">npm / pip / uv / git clone</span> یا کپی payload.
تکرارپذیر است و همین کیت انجامش می‌دهد. نمونه: اسکیل‌ها، graphify، kinocut، Remotion، Piper.</p></div>
<div class="box"><h3>احراز هویت (فقط دستی، توسط مالک)</h3><p>وصل‌کردن یک حساب یا کلید: ورود به claude.ai، نصب Claude GitHub App، OAuth کانکتورها
(Figma، Adobe، HeyGen) در <a href="https://claude.ai/customize/connectors" dir="ltr">claude.ai/customize/connectors</a>، و کلیدهای API (Gemini، HeyGen، ElevenLabs، Sketchfab، Drive).
در نشست ابری کلید در «Network secrets» محیط ذخیره می‌شود و پراکسی آن را به هدر درخواست تزریق می‌کند؛ روی سیستم شخصی متغیر محیطی است.
این مقادیر هرگز صادر نمی‌شوند؛ نصب یک ابزار به معنی فعال‌شدن سرویس پشت آن نیست.</p></div></div>

<h2>۵. محدودیت‌های هر محیط</h2>
<div class="two">
<div class="box"><h3>Cloud (claude.ai/code)</h3><ul>
<li>کانتینر موقت است؛ فقط <span dir="ltr">.claude/</span>، <span dir="ltr">.mcp.json</span> و هوک‌های ریپو در هر نشست بار می‌شوند. پلاگین‌های <span dir="ltr">enabledPlugins</span> نصب نمی‌شوند، برای همین vendored شده‌اند.</li>
<li>نصب‌های سطح کاربر با هر نشست پاک می‌شوند و هوک SessionStart باید دوباره نصبشان کند.</li>
<li>شبکهٔ محیط Default محدود است: صفحهٔ وب github.com و download.blender.org با 403 رد شدند و context7.com در دسترس نبود. git و رجیستری npm/PyPI کار می‌کنند.</li>
<li>حافظهٔ claude-mem با کانتینر از بین می‌رود؛ GitHub MCP و claude-code-remote فقط در نشست ابری وجود دارند.</li></ul></div>
<div class="box"><h3>Linux</h3><ul><li>پشتیبانی کامل؛ <span dir="ltr">setup-motion-env.sh</span> و <span dir="ltr">cloud/setup.sh</span> برای اوبونتو نوشته شده‌اند و root لازم دارند (apt، dpkg، /opt).</li>
<li>روی اوبونتو ۲۴، pip به venv یا <span dir="ltr">--break-system-packages</span> نیاز دارد.</li></ul></div>
<div class="box"><h3>macOS</h3><ul><li>اسکیل‌ها و هوک‌های bash کار می‌کنند. اسکریپت‌های setup پروژه فقط لینوکسی‌اند و دستورهای جایگزین brew در JSON آمده (آزموده نشده).</li>
<li>pipeline ویدیوی MP جزئی است: <span dir="ltr">cloud/setup.sh</span> برای اوبونتو نوشته شده.</li></ul></div>
<div class="box"><h3>Windows</h3><ul><li>هوک‌ها و لانچرهای MCP اسکریپت bash هستند، پس Git Bash یا ترجیحاً WSL لازم است.</li>
<li><span dir="ltr">python restore.py</span> اجرا می‌شود، ولی بررسی‌ها بدون bash «UNKNOWN» برمی‌گردند. دستورهای winget آزموده نشده‌اند.</li>
<li>نسخهٔ ویندوزی MP Studio (exe، CUDA) عمداً منتقل نشده است.</li></ul></div></div>

<h2>۶. ابزارهای عمومی و اختصاصی پروژه</h2>
<p><b>عمومی (برای هر پروژه):</b> ابزارها، اسکیل‌ها و ایجنت‌های داخلی Claude Code؛ پلاگین‌ها و کانکتورهای حساب؛ Agent Skills؛ Ponytail؛ Graphify؛ claude-mem؛ find-skills؛
UI/UX Pro Max؛ LLM Council؛ پنج ابزار سراسری؛ اسکیل‌های GSAP و HyperFrames؛ اسکیل‌های محتوایی Ootto؛ MCPهای context7، playwright و kinocut.
<b>اختصاصی (📁):</b> {E('، '.join(i['name'] for i in items if i['project_specific'] and i['category'] in ('skill', 'hook')))}؛ ابزارهای <span dir="ltr">tools/</span>، <span dir="ltr">scripts/</span>، <span dir="ltr">cloud/</span> و <span dir="ltr">mp-studio/</span>؛ کتابخانه‌های npm پروژه؛ محیط Motion-Production.</p>

<h2>۷. موارد غیرقابل‌انتقال یا نیازمند اقدام دستی</h2>
<ul>{li_nt(nontransfer)}
<li><b>پایگاه حافظهٔ claude-mem</b> (<span dir="ltr">~/.claude-mem</span>) — محلی در کانتینر؛ snapshot با <span dir="ltr">backup-setup</span> ساخته نشده و منتقل نمی‌شود.</li>
<li><b>اشتراک و پلن حساب Claude</b> — در دسترس‌بودن اسکیل‌های حساب، پلاگین‌ها و Cowork به پلن حساب جدید بستگی دارد.</li></ul>

<h2>۸. امنیت و انتقال‌پذیری</h2>
<div class="two"><div class="box"><h3>موارد حساس (🔒)</h3><ul>{li(sensitive)}</ul></div>
<div class="box"><h3>بررسی امنیتی پیش از اجرا در محیط جدید</h3><ul>
<li>سلامت فایل‌ها را با <span dir="ltr">sha256sum -c payload/MANIFEST.sha256</span> بسنجید.</li>
<li>اول <span dir="ltr">bash restore.sh</span> را بدون <span dir="ltr">--apply</span> اجرا کنید و همهٔ دستورها را بخوانید.</li>
<li>نصب‌کننده‌هایی که اسکریپت را مستقیم به شل می‌دهند (uv، Bun، NodeSource، Claude) را پیش از اجرا بخوانید یا از مدیر بستهٔ سیستم استفاده کنید.</li>
<li>strix را فقط روی سیستم‌های خودتان یا با مجوز کتبی اجرا کنید. claude-mem خلاصهٔ کارها را ذخیره می‌کند و توکن Haiku مصرف می‌کند.</li>
<li>playwright MCP و context7-mcp بدون نسخهٔ ثابت‌اند (<span dir="ltr">@latest</span>). برای تکرارپذیری نسخه را ثابت کنید.</li>
<li>بار اول در یک کانتینر یا ماشین آزمایشی اجرا کنید.</li>
<li>تولید AI پولی (Gemini، Atlas، MuAPI، HeyGen) و انتشار یا آپلود فقط با تأیید صریح هر بار.</li></ul></div></div>

<h2>۹. یافته‌های مهم این موجودی</h2>
<ul>{li(missing)}
<li><b>context7</b> — MCP متصل شد، ولی API آن در شبکهٔ محیط Default در دسترس نبود.</li>
<li><b>browser-testing-with-devtools</b> — به chrome-devtools MCP نیاز دارد که پیکربندی نشده است. قدم اختیاری <span dir="ltr">mcp:chrome-devtools</span> اضافه شد.</li>
<li><b>نسخه‌ها</b> — پلاگین حساب Remotion نسخهٔ 4.0.528 است و workspace نسخهٔ 4.0.538؛ اختلاف جزئی است.</li></ul>

<h2 class="pb">۱۰. نتایج آزمون‌ها</h2>{test_block}

<h2>۱۱. بسته‌ها و پلاگین‌ها</h2>
<table class="full"><thead><tr><th style="width:50mm">بسته</th><th style="width:30mm">نسخه</th><th style="width:30mm">مجوز</th><th style="width:40mm">لینک</th><th style="width:12mm">اعضا</th><th>نصب از منبع رسمی</th></tr></thead><tbody>{bundle_rows}</tbody></table>

<h2 class="pb">۱۲. فهرست کامل</h2>
{''.join(sections)}

<h2 class="pb">پیوست: نام ابزارهای هر سرور MCP</h2>
<table class="full"><thead><tr><th style="width:52mm">سرور</th><th>ابزارها</th></tr></thead><tbody>{mcp_rows}</tbody></table>
</body></html>"""

out = KIT / "build" / "out"
out.mkdir(parents=True, exist_ok=True)
(out / "report.html").write_text(DOC, encoding="utf-8")
print(f"wrote {out/'report.html'} ({len(DOC)//1024} KB, {n} rows)")
