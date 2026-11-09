#!/usr/bin/env python3
"""Inline src/index.src.html + assets into one offline index.html (no external requests)."""
import base64, pathlib, re

HERE = pathlib.Path(__file__).resolve().parent
SRC = HERE / "src"
MIME = {"img": ("assets", ".webp", "image/webp"), "font": ("fonts", "", "font/woff2")}
FONTS = {"arabic": "estedad-arabic-wght-normal.woff2", "latin": "estedad-latin-wght-normal.woff2"}


def data_uri(kind, name):
    folder, ext, mime = MIME[kind]
    path = SRC / folder / (FONTS[name] if kind == "font" else name + ext)
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode()


html = (SRC / "index.src.html").read_text(encoding="utf-8")
out = re.sub(r"\{\{(img|font):([a-z]+)\}\}", lambda m: data_uri(*m.groups()), html)
assert "{{" not in out and not re.search(r"""(src|href)=["']https?:""", out), "unresolved or external reference"
(HERE / "index.html").write_text(out, encoding="utf-8")
print(f"index.html {len(out.encode()) / 1024:.0f} KB")
