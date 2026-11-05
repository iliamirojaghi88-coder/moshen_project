#!/usr/bin/env python3
"""Make a Persian/Arabic font render in libass (ffmpeg `subtitles`/`ass`, the MP ASS captions and cards).

  .venv-cloud/bin/python scripts/font-fix-libass.py FONT.ttf [...]          patch in place (idempotent)
  .venv-cloud/bin/python scripts/font-fix-libass.py --check FONT.ttf [...]  exit 1 if a font needs it

libass 0.17 (ffmpeg here) draws boxes for isolated letters (ا ی ر و ن ... not joined to a neighbour) when the font's
cmap has no Arabic Presentation Forms, e.g. Lalezar 1.004; Chrome/HarfBuzz render the same font fine. The patch maps
each missing isolated presentation form to the font's own base glyph: no outline changes (OFL allows it; keep the
font's licence file next to it). Needs fontTools (in .venv-cloud via matplotlib).
"""
import sys
import unicodedata

from fontTools.ttLib import TTFont


def missing_isolated(font):
    best = font.getBestCmap()
    out = {}
    for cp in list(range(0xFB50, 0xFE00)) + list(range(0xFE70, 0xFF00)):
        d = unicodedata.decomposition(chr(cp)).split()
        if len(d) == 2 and d[0] == "<isolated>" and int(d[1], 16) in best and cp not in best:
            out[cp] = best[int(d[1], 16)]
    return out


def main(argv):
    check = "--check" in argv
    paths = [a for a in argv if a != "--check"]
    if not paths:
        sys.exit(__doc__)
    need = 0
    for p in paths:
        font = TTFont(p)
        if not any(0x0600 <= cp <= 0x06FF for cp in font.getBestCmap()):
            print(f"{p}: no Arabic script, skipped")
            continue
        add = missing_isolated(font)
        if not add:
            print(f"{p}: ok")
            continue
        need += 1
        if check:
            print(f"{p}: needs patch ({len(add)} isolated forms missing)")
            continue
        for t in font["cmap"].tables:
            if t.isUnicode():
                t.cmap.update(add)
        font.save(p)
        assert not missing_isolated(TTFont(p)), p  # self-check: the saved font is complete
        print(f"{p}: patched ({len(add)} isolated forms mapped)")
    sys.exit(1 if check and need else 0)


if __name__ == "__main__":
    main(sys.argv[1:])
