#!/usr/bin/env python3
"""Build the standalone index.html from index.src.html:
- <!--skin:NAME--> / <!--bg:SECTION--> -> skins/NAME.svg / skins/bg-SECTION.svg (hand-built SVG)
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
import sys

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


sys.path.insert(0, str(HERE / "tools"))
from geom import C, crop  # noqa: E402


def skin(name):
    """skins/NAME.svg verbatim; its viewBox must match the component's crop."""
    svg = (HERE / "skins" / f"{name}.svg").read_text(encoding="utf-8").strip()
    if name in C:
        x0, y0, x1, y1 = crop(name)
        assert f'viewBox="0 0 {x1 - x0} {y1 - y0}"' in svg, f"{name}: viewBox must be 0 0 {x1 - x0} {y1 - y0}"
    return svg


src = (HERE / "index.src.html").read_text(encoding="utf-8")
out = re.sub(r"<!--skin:([\w-]+)-->", lambda m: skin(m.group(1)), src)
out = re.sub(r"<!--bg:([\w-]+)-->", lambda m: skin("bg-" + m.group(1)), out)
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
            cache[rel] = "data:font/woff2;base64," + base64.b64encode(p.read_bytes()).decode()
    return m.group(1) + cache[rel] + m.group(3)


REF = r'((?:assets|fonts)/[\w.-]+\.(?:png|woff2))'
out = re.sub(r'((?:src|href)="|url\()' + REF + r'("|\))', inline, out)
left = re.findall(REF + "|<!--(?:skin|bg):", out)
assert not left, f"references left un-inlined: {left}"
(HERE / "index.html").write_text(out, encoding="utf-8")
print(f"index.html: {len(out.encode()) / 1e6:.1f} MB, {len(cache)} files inlined")
