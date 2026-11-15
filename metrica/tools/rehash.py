#!/usr/bin/env python3
"""Cache busting for METRICA: every file in public_html/assets/{css,js} is named <name>.<sha256[:12]>.<ext>, because
.htaccess caches assets for a year as immutable. Renames each new or edited file to the hash of its content and updates
the references in index.html. Idempotent: run it after any change to CSS or JS. Run: python3 -I tools/rehash.py"""
import hashlib
import pathlib
import re

SITE = pathlib.Path(__file__).resolve().parent.parent / "public_html"


def main():
    page = SITE / "index.html"
    html = page.read_text(encoding="utf-8")
    for d in ("css", "js"):
        for f in sorted((SITE / "assets" / d).iterdir()):
            h = hashlib.sha256(f.read_bytes()).hexdigest()[:12]
            stem = re.sub(r"\.[0-9a-f]{12}$", "", f.stem)
            want = f"{stem}.{h}{f.suffix}"
            if f.name == want:
                continue
            old, new = f"assets/{d}/{f.name}", f"assets/{d}/{want}"
            if html.count(f'"{old}"') != 1:
                raise SystemExit(f"{old}: expected exactly one reference in index.html")
            html = html.replace(f'"{old}"', f'"{new}"')
            f.rename(f.with_name(want))
            print(f"{old} → {new}")
    page.write_text(html, encoding="utf-8")


if __name__ == "__main__":
    main()
