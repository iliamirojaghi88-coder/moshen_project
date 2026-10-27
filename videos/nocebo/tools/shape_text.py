#!/usr/bin/env python3
"""Shape Persian phrases with HarfBuzz and export per-glyph outlines.

Three.js cannot shape Arabic script, so the extruded titles are built from
these outlines: HarfBuzz picks each letter's joined form and position, fontTools
draws the glyph at the requested Estedad weight. Output is JSON in font units
(y up), one entry per glyph in visual left-to-right order.

Usage: shape_text.py <Estedad-VF.ttf> <out.js|out.json> "<id>=<weight>=<text>" ...
"""
import io
import json
import sys

import uharfbuzz as hb
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont


def shape(vf_path, weight, text):
    font = instantiateVariableFont(TTFont(vf_path), {"wght": weight})
    data = io.BytesIO()
    font.save(data)
    blob = hb.Blob(data.getvalue())
    hbfont = hb.Font(hb.Face(blob))
    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    hb.shape(hbfont, buf, {"kern": True, "liga": True})
    gs = font.getGlyphSet()
    order = font.getGlyphOrder()
    pen_x = 0
    glyphs = []
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        name = order[info.codepoint]
        pen = SVGPathPen(gs)
        gs[name].draw(pen)
        d = pen.getCommands()
        if d:
            glyphs.append({"name": name, "cluster": info.cluster, "x": pen_x + pos.x_offset, "y": pos.y_offset, "adv": pos.x_advance, "d": d})
        pen_x += pos.x_advance
    hhea = font["hhea"]
    return {
        "text": text,
        "weight": weight,
        "unitsPerEm": font["head"].unitsPerEm,
        "ascender": hhea.ascent,
        "descender": hhea.descent,
        "width": pen_x,
        "glyphs": glyphs,
    }


def main():
    vf, out = sys.argv[1], sys.argv[2]
    result = {}
    for spec in sys.argv[3:]:
        key, weight, text = spec.split("=", 2)
        result[key] = shape(vf, float(weight), text)
        print(key, len(result[key]["glyphs"]), "glyphs", result[key]["width"], "units")
    body = json.dumps(result, ensure_ascii=False)
    with open(out, "w", encoding="utf-8") as f:
        # an ES module, so scenes import it instead of fetching at render time
        f.write(f"export default {body};\n" if out.endswith(".js") else body)


if __name__ == "__main__":
    main()
