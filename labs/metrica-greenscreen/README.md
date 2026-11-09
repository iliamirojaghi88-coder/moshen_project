# METRICA — green-screen removal + responsive hero test

Deliverable: **one self-contained HTML file** (`dist/metrica-hero.html`, ~35 MB). The processed video and both
city PNGs are embedded as base64, so it opens straight from disk (double-click), offline, no server.

```bash
python3 tools/build_single.py            # -> dist/metrica-hero.html
```

## How it works
- `tools/keyer.py` — green-difference key against a local background plate (removes the soft shadow on the
  screen) + colour unmixing (despill on edges only; solid subject pixels untouched).
- `tools/process.py <tools dir> <source.mp4> <out dir>` — keys all 358 frames, crops only rows that are
  transparent in every frame, writes `assets/hero-stacked.mp4` (H.264 2160×1424, 24 fps: colour | alpha).
- `template.html` — WebGL composites colour × alpha over the city image (2D-canvas fallback without WebGL).
  The embedded video is turned into a Blob URL, which is same-origin with the page, so WebGL can read it
  even from `file://`.
- `tools/qc.py <source.mp4> <hero-stacked.mp4>` — residual-green / colour-change / leak report over every frame.

Media and `dist/` are git-ignored.
