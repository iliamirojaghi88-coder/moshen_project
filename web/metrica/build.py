#!/usr/bin/env python3
"""Inline assets/*.png and fonts/*.woff2 from index.src.html into one standalone index.html."""
import base64
import pathlib
import re

HERE = pathlib.Path(__file__).resolve().parent
MIME = {".png": "image/png", ".woff2": "font/woff2"}
REF = r'((?:assets|fonts)/[\w.-]+\.(?:png|woff2))'

src = (HERE / "index.src.html").read_text(encoding="utf-8")
cache = {}


def inline(m):
    rel = m.group(2)
    if rel not in cache:  # a missing file raises here, so the build never ships a broken reference
        p = HERE / rel
        cache[rel] = f"data:{MIME[p.suffix]};base64," + base64.b64encode(p.read_bytes()).decode()
    return m.group(1) + cache[rel] + m.group(3)


out = re.sub(r'(src="|url\()' + REF + r'("|\))', inline, src)
left = re.findall(REF, out)
assert not left, f"references left un-inlined: {left}"
(HERE / "index.html").write_text(out, encoding="utf-8")
print(f"index.html: {len(out) / 1e6:.1f} MB, {len(cache)} files inlined")
