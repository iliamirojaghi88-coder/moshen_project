#!/usr/bin/env python3
"""Build the web copies of METRICA's design assets from the owner's originals.

Sources stay untouched in metrica/source/ (Git LFS). Outputs are the same images,
only trimmed to their visible pixels and scaled to ~3x their largest display size.
The six tool images come out of the original sections HTML byte-for-byte, then resized.

    python3 metrica/tools/prepare-assets.py
"""
import base64, re, io
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC, OUT = ROOT / "source", ROOT / "assets"

# name -> (source file, output path, max width, max height, crop box or None = trim to alpha)
PNGS = {
    "nav-home":      ("nav-home.png",          "img/nav/home.png",            None, 200, None),
    "nav-features":  ("nav-features.png",      "img/nav/features.png",        None, 200, None),
    "nav-projects":  ("nav-projects.png",      "img/nav/projects.png",        None, 200, None),
    "nav-account":   ("nav-account.png",       "img/nav/account.png",         None, 200, None),
    "info":          ("icon-account-info.png", "img/account/info.png",        320, None, None),
    "support":       ("icon-support.png",      "img/account/support.png",     320, None, None),
    "settings":      ("icon-settings.png",     "img/account/settings.png",    300, None, None),
    "logout":        ("icon-logout.png",       "img/account/logout.png",      300, None, None),
    "avatar":        ("avatar-default.png",    "img/account/avatar-default.png", 420, None, None),
    "arch-left":     ("arch-construction.png", "img/account/arch-construction.png", 1200, None, None),
    "arch-right":    ("arch-skyline.png",      "img/account/arch-skyline.png", 760, None, None),
    # the mark only: rows above the METRICA / متریکا lettering (gap starts at y=890)
    "logo":          ("logo-full.png",         "img/brand/logo-mark.png",     None, 256, (195, 234, 943, 890)),
}

TOOLS = {  # md5[:8] of the data URI in the original HTML -> output name
    "587b8231": "project", "bdfac287": "analysis", "e3e4d19f": "marketing",
    "eaf161a2": "cashflow", "525567fd": "free-trial", "18521e58": "contractors",
}


def trim(im, box):
    if box is None:
        box = im.getchannel("A").point(lambda v: 255 if v > 6 else 0).getbbox()
        pad = 4
        box = (max(box[0] - pad, 0), max(box[1] - pad, 0), min(box[2] + pad, im.width), min(box[3] + pad, im.height))
    return im.crop(box)


def fit(im, mw, mh):
    s = min((mw or 1e9) / im.width, (mh or 1e9) / im.height, 1)
    return im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS) if s < 1 else im


def main():
    for src, out, mw, mh, box in PNGS.values():
        im = fit(trim(Image.open(SRC / src).convert("RGBA"), box), mw, mh)
        p = OUT / out
        p.parent.mkdir(parents=True, exist_ok=True)
        im.save(p, optimize=True)
        print(f"{out:42} {im.width}x{im.height}  {p.stat().st_size // 1024} KB")

    import hashlib
    html = (SRC / "metrica-sections (2).original.html").read_text(encoding="utf-8")
    for m in re.finditer(r"data:(image/webp);base64,([A-Za-z0-9+/=\s]+)", html):
        h = hashlib.md5(m.group(0).encode()).hexdigest()[:8]
        if h in TOOLS:
            im = Image.open(io.BytesIO(base64.b64decode(re.sub(r"\s", "", m.group(2))))).convert("RGBA")
            w0, h0 = im.size  # CSS crops by percentages of the full image, so keep the full canvas
            im = fit(im, 760, None)
            p = OUT / "img/tools" / f"{TOOLS[h]}.webp"
            im.save(p, quality=90, method=6)
            print(f"img/tools/{TOOLS[h]}.webp{'':24} {w0}x{h0} -> {im.width}x{im.height}  {p.stat().st_size // 1024} KB")
    m = re.search(r"data:font/woff2;base64,([A-Za-z0-9+/=\s]+)", html)
    (OUT / "fonts").mkdir(parents=True, exist_ok=True)
    (OUT / "fonts/Estedad.woff2").write_bytes(base64.b64decode(re.sub(r"\s", "", m.group(1))))


if __name__ == "__main__":
    main()
