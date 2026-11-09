# METRICA — green-screen removal + responsive hero test

Open `index.html` through a local server (WebGL can't read a video from `file://` in Chrome/Firefox):

```bash
cd labs/metrica-greenscreen && python3 -m http.server 8000
# then open http://localhost:8000
```

Opened directly from disk, the page falls back to `assets/hero-alpha.webm` (VP9 + real alpha): works in Chrome/Edge/Firefox, not Safari.

## Files
- `assets/hero-stacked.mp4` — H.264, 2160×1424, 24 fps, 358 frames (14.917 s): straight colour (left) | alpha matte (right). WebGL composites it; one stream, so colour and alpha never drift.
- `assets/hero-alpha.webm` — VP9 with alpha, 1080×1424, fallback.
- `assets/city-landscape.png`, `assets/city-portrait.png` — supplied backgrounds, byte-identical copies (portrait used when the viewport is portrait).
- `tools/keyer.py` — green-difference key against a local background plate (removes the soft shadow on the screen) + colour unmixing (despill on edges only; solid subject pixels untouched).
- `tools/process.py <tools dir> <source.mp4> <out dir>` — keys all frames, crops only rows that are transparent in every frame, writes both videos.
- `tools/qc.py <source.mp4> <hero-stacked.mp4>` — residual-green / colour-change / leak report over every frame.

Media files are git-ignored (`*.mp4`, `*.webm`); the PNGs are kept out of git too (see `.gitignore`).
