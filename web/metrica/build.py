#!/usr/bin/env python3
"""Build the standalone index.html from index.src.html:
- <!--skin:NAME--> -> the component's body SVG: gradient patches + the decor crop (decor/NAME.webp)
- <!--bg:SECTION--> -> the section background (reference crop on mobile, gradient + band wider)
- <link rel="stylesheet" href="layout.css"> -> inline <style>
- assets/*.png -> lossless WebP data URIs (every visible pixel identical to the PNG)
- fonts/*.woff2 -> data URIs
"""
import base64
import hashlib
import io
import json
import pathlib
import re

import numpy as np
from PIL import Image

HERE = pathlib.Path(__file__).resolve().parent
CACHE = HERE / ".cache"
CACHE.mkdir(exist_ok=True)


def webp(png):
    """Lossless WebP; asserts every pixel with alpha > 0 is unchanged."""
    raw = png.read_bytes()
    key = CACHE / (hashlib.sha1(raw).hexdigest() + ".webp")
    if not key.exists():
        im = Image.open(png)
        buf = io.BytesIO()
        im.save(buf, "WEBP", lossless=True, quality=100, method=6)
        a = np.array(im.convert("RGBA"))
        b = np.array(Image.open(io.BytesIO(buf.getvalue())).convert("RGBA"))
        vis = a[..., 3] > 0
        assert np.array_equal(a[vis], b[vis]) and np.array_equal(a[..., 3], b[..., 3]), png
        key.write_bytes(buf.getvalue())
    return "data:image/webp;base64," + base64.b64encode(key.read_bytes()).decode()


DECOR = json.loads((HERE / "decor/meta.json").read_text())


def skin(name):
    m = DECOR[name]
    defs, rects = [], []
    for i, p in enumerate(m["patches"]):
        gid = f"pg-{name}-{i}"
        defs.append(f'<linearGradient id="{gid}" gradientUnits="userSpaceOnUse" x1="{p["p1"][0]}" y1="{p["p1"][1]}" '
                    f'x2="{p["p2"][0]}" y2="{p["p2"][1]}"><stop stop-color="{p["c1"]}"/><stop offset="1" stop-color="{p["c2"]}"/></linearGradient>')
        x0, y0, x1, y1 = p["rect"]
        rects.append(f'<rect x="{x0}" y="{y0}" width="{x1 - x0}" height="{y1 - y0}" fill="url(#{gid})"/>')
    return (f'<svg class="mtr-skin" viewBox="0 0 {m["w"]} {m["h"]}" preserveAspectRatio="none" aria-hidden="true" focusable="false">'
            f'<defs>{"".join(defs)}</defs>{"".join(rects)}'
            f'<image href="decor/{name}.webp" width="{m["w"]}" height="{m["h"]}" preserveAspectRatio="none"/></svg>')


def bg(sec):
    m = DECOR[f"bg-{sec}"]
    grad = ",".join(f"{c} {p}%" for p, c in m["stops"])
    return (f'<div class="mtr-bg" aria-hidden="true" style="background:linear-gradient(180deg,{grad})">'
            f'<img class="mtr-bg__ref" src="decor/bg-{sec}.webp" alt="">'
            f'<img class="mtr-bg__band" src="decor/band-{sec}.webp" alt=""></div>')


src = (HERE / "index.src.html").read_text(encoding="utf-8")
out = re.sub(r"<!--skin:([\w-]+)-->", lambda m: skin(m.group(1)), src)
out = re.sub(r"<!--bg:([\w-]+)-->", lambda m: bg(m.group(1)), out)
out = out.replace('<link rel="stylesheet" href="layout.css">',
                  "<style>\n" + (HERE / "layout.css").read_text(encoding="utf-8") + "</style>")
cache = {}


def inline(m):
    rel = m.group(2)
    if rel not in cache:  # a missing file raises here, so the build never ships a broken reference
        p = HERE / rel
        if p.suffix == ".png":
            cache[rel] = webp(p)
        else:
            mime = {".webp": "image/webp", ".woff2": "font/woff2"}[p.suffix]
            cache[rel] = f"data:{mime};base64," + base64.b64encode(p.read_bytes()).decode()
    return m.group(1) + cache[rel] + m.group(3)


REF = r'((?:assets|fonts|decor)/[\w.-]+\.(?:png|woff2|webp))'
out = re.sub(r'((?:src|href)="|url\()' + REF + r'("|\))', inline, out)
left = re.findall(REF + "|<!--(?:skin|bg):", out)
assert not left, f"references left un-inlined: {left}"
(HERE / "index.html").write_text(out, encoding="utf-8")
print(f"index.html: {len(out.encode()) / 1e6:.1f} MB, {len(cache)} files inlined")
