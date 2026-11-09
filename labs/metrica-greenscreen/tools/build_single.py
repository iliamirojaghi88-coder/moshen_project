# Inline the processed video and both city PNGs (exact bytes, base64) into ONE self-contained HTML.
# Usage: python3 tools/build_single.py [out.html]   (run from labs/metrica-greenscreen)
import base64, sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
out = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else root / 'dist' / 'metrica-hero.html')
b64 = lambda p: base64.b64encode((root / 'assets' / p).read_bytes()).decode()
html = (root / 'template.html').read_text()
for key, src in {'__CITY_LANDSCAPE__': 'city-landscape.png', '__CITY_PORTRAIT__': 'city-portrait.png',
                 '__HERO_VIDEO__': 'hero-stacked.mp4'}.items():
    assert html.count(key) == 1, key
    html = html.replace(key, b64(src))
assert '__' + 'CITY' not in html and '__' + 'HERO' not in html
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(html)
# self-check: every embedded payload decodes back to the original bytes
for p in ('city-landscape.png', 'city-portrait.png', 'hero-stacked.mp4'):
    assert b64(p) in html, p
print(out, f'{out.stat().st_size / 1e6:.1f} MB')
