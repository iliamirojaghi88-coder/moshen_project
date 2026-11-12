#!/usr/bin/env python3
"""Bundle the METRICA web app into one self-contained HTML file.

CSS, JS, every image and the Estedad font are embedded (data: URIs), and the font's
OFL licence text goes into the file as a comment. The result opens from disk with
no other files and makes no network requests.

    python3 metrica/tools/build-single-html.py [out.html]   # default: metrica/dist/metrica.html
"""
import base64, mimetypes, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIME = {".png": "image/png", ".webp": "image/webp", ".woff2": "font/woff2"}


def data_uri(path):
    return f"data:{MIME.get(path.suffix) or mimetypes.guess_type(path.name)[0]};base64,{base64.b64encode(path.read_bytes()).decode()}"


def main():
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "dist" / "metrica.html"
    html = (ROOT / "index.html").read_text(encoding="utf-8")

    def css(m):
        p = ROOT / m.group(1)
        text = p.read_text(encoding="utf-8")
        text = re.sub(r"url\((?!#|data:)([^)]+)\)", lambda u: f"url({data_uri((p.parent / u.group(1)).resolve())})", text)
        return f"<style>\n/* {m.group(1)} */\n{text}</style>"

    html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', css, html)
    html = re.sub(r'<script src="([^"]+)"></script>',
                  lambda m: f"<script>\n/* {m.group(1)} */\n{(ROOT / m.group(1)).read_text(encoding='utf-8')}</script>", html)
    html = re.sub(r'src="(assets/[^"]+)"', lambda m: f'src="{data_uri(ROOT / m.group(1))}"', html)

    ofl = (ROOT / "assets/fonts/OFL.txt").read_text(encoding="utf-8")
    assert "-->" not in ofl
    html = re.sub(r"<!-- Font: Estedad[^>]*-->", lambda _: f"<!--\n{ofl}-->", html, count=1)

    left = re.findall(r'(?<![-\w])(?:src|href)="(?!data:|#|https?:)([^"]+)"|url\((?!#|data:)[^)]+\)', html)
    assert not left, f"unbundled references: {left}"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding="utf-8")
    print(f"{out}  {out.stat().st_size / 1e6:.2f} MB")


if __name__ == "__main__":
    main()
