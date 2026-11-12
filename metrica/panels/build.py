#!/usr/bin/env python3
"""Build the METRICA single-file web app with the sign-in and subscription mini-panels.

Input : metrica/source/metrica-webapp.original.html  (the owner's file, never edited — it is also the backup)
        metrica/panels/panels.{css,html,js}, i18n.js    (the new code)
        metrica/source/panels/*.png                     (the owner's approved images)
Output: metrica/dist/metrica-webapp.html                (one self-contained HTML, no network access)
        metrica/dist/metrica-webapp-panels.zip          (with --zip: app, backup, docs, screenshots)

    python3 metrica/panels/build.py [--zip]
"""
import base64, io, sys, zipfile
from pathlib import Path
from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
SRC, DIST = ROOT / "source", ROOT / "dist"
ORIGINAL = SRC / "metrica-webapp.original.html"
OUT = DIST / "metrica-webapp.html"

# name -> (source png, crop box or None = trim to visible pixels, max width, max height, webp quality)
IMAGES = {
    "mark":    ("logo-main.png",        (193, 231, 946, 896), None, 200, 90),  # bars + R only, above the lettering
    "hero":    ("login-hero.png",       None, 1000, None, 82),
    "plus":    ("plan-plus-cube.png",   None, 260, 260, 88),
    "pro":     ("plan-pro-bolt.png",    None, 260, 260, 88),
    "max":     ("plan-max-diamond.png", None, 300, 260, 88),
}


def image_uri(src, box, mw, mh, q):
    im = Image.open(SRC / "panels" / src).convert("RGBA")
    if box is None:
        box = im.getchannel("A").point(lambda v: 255 if v > 6 else 0).getbbox()
    im = im.crop(box)
    s = min((mw or 1e9) / im.width, (mh or 1e9) / im.height, 1)
    if s < 1:
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=q, method=6)
    return f"data:image/webp;base64,{base64.b64encode(buf.getvalue()).decode()}", im.size


def swap(html, old, new):
    """Replace text that must occur exactly once."""
    n = html.count(old)
    assert n == 1, f"anchor found {n}x: {old[:60]!r}"
    return html.replace(old, new)


def put(html, anchor, text):
    """Insert text before an anchor that must occur exactly once."""
    return swap(html, anchor, text + anchor)


def build():
    html = ORIGINAL.read_text(encoding="utf-8")
    markup = (HERE / "panels.html").read_text(encoding="utf-8")
    for name, spec in IMAGES.items():
        uri, (w, h) = image_uri(*spec)
        markup = markup.replace(f"{{{{img:{name}}}}}", uri).replace(f"{{{{w:{name}}}}}", str(w)).replace(f"{{{{h:{name}}}}}", str(h))
    assert "{{" not in markup, "unfilled placeholder in panels.html"

    css = (HERE / "panels.css").read_text(encoding="utf-8")
    js = (HERE / "panels.js").read_text(encoding="utf-8")
    i18n = (HERE / "i18n.js").read_text(encoding="utf-8")

    html = put(html, "</head>", f"<!-- sign-in and subscription mini-panels -->\n<style>\n{css}</style>\n")
    html = put(html, "<!-- interface language: dictionaries", f"{markup}\n")
    html = put(html, "<script>\n/* assets/js/i18n.js\n", f"<script>\n{i18n}</script>\n")
    html = put(html, "</body>", f"<script>\n{js}</script>\n")
    # the account page learns the MAX plan label (shown only once the server reports plan "max"); same gold badge as Pro
    html = swap(html, "pro: 'پرو' };", "pro: 'پرو', max: 'MAX' };")
    html = put(html, '.acc-plan[data-plan="pro"]{', '.acc-plan[data-plan="max"],')
    html = put(html, '.acc-plan[data-plan="pro"] b{', '.acc-plan[data-plan="max"] b,')

    DIST.mkdir(exist_ok=True)
    OUT.write_text(html, encoding="utf-8")
    print(f"{OUT.relative_to(ROOT.parent)}  {OUT.stat().st_size / 1e6:.2f} MB")


def package():
    z = DIST / "metrica-webapp-panels.zip"
    with zipfile.ZipFile(z, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as f:
        f.write(OUT, "metrica-webapp.html")
        f.write(ORIGINAL, "backup/metrica-webapp.original.html")
        for doc in ("README-fa.md", "API-fa.md"):
            f.write(HERE / doc, doc)
        for p in sorted((DIST / "screenshots").glob("*.png")):
            f.write(p, f"screenshots/{p.name}")
        for p in ("panels.css", "panels.html", "panels.js", "i18n.js", "build.py"):
            f.write(HERE / p, f"source/{p}")
    print(f"{z.relative_to(ROOT.parent)}  {z.stat().st_size / 1e6:.2f} MB")


if __name__ == "__main__":
    build()
    if "--zip" in sys.argv:
        package()
