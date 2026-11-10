"""Component crop boxes in reference px: the measured box plus its margin, clipped to the section."""
import json
import pathlib

HERE = pathlib.Path(__file__).resolve().parent.parent
C = json.loads((HERE / "tools/components.json").read_text())
SEC = json.loads((HERE / "tools/layout_spec.json").read_text())["sections"]


def crop(name):
    c = C[name]
    W, H = SEC[c["ref"]]["w"], SEC[c["ref"]]["h"]
    x0, y0, x1, y1 = c["box"]
    m = c["margin"]
    return [max(0, x0 - m), max(0, y0 - m), min(W, x1 + m), min(H, y1 + m)]
