"""Turn the raw site captures into device screen textures.
mobile: 1170x2391 capture + a 141 px iOS-style status strip -> 1170x2532 (390x844 pt @3x)
desktop: 2880x1800 as captured."""
import sys, json, os
from PIL import Image, ImageDraw, ImageFont
src, dst, font = sys.argv[1], sys.argv[2], sys.argv[3]
log = json.load(open(os.path.join(src, 'capture-log.json')))
manifest = {'mobile': [], 'desktop': []}
def status_bar(w, h, bg):
    bar = Image.new('RGB', (w, h), bg)
    lum = 0.299 * bg[0] + 0.587 * bg[1] + 0.114 * bg[2]
    ink = (255, 255, 255) if lum < 140 else (17, 24, 39)
    d = ImageDraw.Draw(bar)
    f = ImageFont.truetype(font, 50)
    d.text((165, h // 2 + 6), '9:41', font=f, fill=ink, anchor='mm')
    # right cluster: signal bars, wifi, battery
    x0, cy = 870, h // 2 + 6
    for i in range(4):
        bh = 14 + i * 8
        d.rounded_rectangle([x0 + i * 15, cy + 18 - bh, x0 + i * 15 + 10, cy + 18], radius=3, fill=ink)
    wx, wy = 965, cy + 16
    for r, wdt in ((34, 7), (22, 7), (10, 10)):
        if r == 10:
            d.pieslice([wx - r, wy - r, wx + r, wy + r], 225, 315, fill=ink)
        else:
            d.arc([wx - r, wy - r, wx + r, wy + r], 225, 315, fill=ink, width=wdt)
    bx = 1010
    d.rounded_rectangle([bx, cy - 15, bx + 70, cy + 17], radius=10, outline=ink, width=4)
    d.rounded_rectangle([bx + 7, cy - 8, bx + 58, cy + 10], radius=5, fill=ink)
    d.rounded_rectangle([bx + 74, cy - 6, bx + 80, cy + 8], radius=2, fill=ink)
    return bar
for row in log:
    if 'file' not in row:
        continue
    dev, label = row['device'], row['label']
    im = Image.open(os.path.join(src, row['file'])).convert('RGB')
    if dev == 'mobile':
        top = im.crop((0, 0, 24, 6)).resize((1, 1), Image.BOX).getpixel((0, 0))
        canvas = Image.new('RGB', (1170, 2532))
        canvas.paste(status_bar(1170, 141, top), (0, 0))
        canvas.paste(im, (0, 141))
        im = canvas
    name = f'{label}.jpg'
    im.save(os.path.join(dst, dev, name), quality=90, optimize=True, progressive=False)
    manifest[dev].append(label)
json.dump(manifest, open(os.path.join(dst, 'manifest.json'), 'w'), indent=1)
print({k: len(v) for k, v in manifest.items()})
