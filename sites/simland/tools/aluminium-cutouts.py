"""The two aluminium-cable product photos of the catalogue pages, from the client's own SIMLAND photos.

  photo-01.jpg -> source/catalog/aluminium-single-core-cable.png  (single core, black sheath; the home card's photo)
  photo-07.jpg -> source/catalog/aluminium-multi-core-cable.png   (four aluminium cores, grey sheath)

Same treatment as the home-card masters (tools/standardize-products.py): the bottom end rebuilt where
source/retouch.json lists the photo, then the known-black-background matte, then a trim. Nothing is
painted, recoloured or reshaped. Then python3 -I tools/build-cutouts.py makes the lossless WebPs.

    python3 -I tools/aluminium-cutouts.py
"""
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('std', ROOT / 'tools/standardize-products.py')
std = importlib.util.module_from_spec(spec)
spec.loader.exec_module(std)

JOBS = [('photo-01.jpg', 'aluminium-single-core-cable'), ('photo-07.jpg', 'aluminium-multi-core-cable')]

for photo, name in JOBS:
    img = std.load(std.SRC / photo)
    end = std.retouch['ends'].get(photo)
    if end:
        img, _ = std.rebuild_end(img, end['rimY'], end['length'])
    colour, alpha = std.matte(img)
    colour, alpha, _ = std.trim(colour, alpha)
    master = std.to_rgba(colour, alpha)
    out = ROOT / 'source/catalog' / f'{name}.png'
    master.save(out, optimize=True)
    print(f'{photo} -> {out.relative_to(ROOT)}  {master.size[0]}x{master.size[1]}  end: {"rebuilt" if end else "original"}')
