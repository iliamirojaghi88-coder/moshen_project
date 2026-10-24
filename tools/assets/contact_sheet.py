#!/usr/bin/env python3
"""Labelled contact sheet for comparing asset candidates side by side.

contact_sheet.py out.jpg "label|image_path" ["label|image_path" ...] [--cols 5] [--size 240]
"""
import sys

from PIL import Image, ImageDraw


def main() -> None:
    args = sys.argv[1:]
    cols = int(args[args.index("--cols") + 1]) if "--cols" in args else 5
    size = int(args[args.index("--size") + 1]) if "--size" in args else 240
    items = [a for i, a in enumerate(args[1:], 1) if "|" in a and args[i - 1] not in ("--cols", "--size")]
    out = args[0]
    rows = (len(items) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * size, rows * (size + 34)), "white")
    draw = ImageDraw.Draw(sheet)
    for i, item in enumerate(items):
        label, path = item.split("|", 1)
        x, y = (i % cols) * size, (i // cols) * (size + 34)
        try:
            im = Image.open(path).convert("RGBA")
            im.thumbnail((size, size))
            bg = Image.new("RGB", (size, size), (233, 231, 227))
            bg.paste(im, ((size - im.width) // 2, (size - im.height) // 2), im)
            sheet.paste(bg, (x, y))
        except Exception as e:  # unreadable thumbnail: leave the tile blank, keep the label
            draw.text((x + 6, y + size // 2), f"no preview ({type(e).__name__})", fill="gray")
        draw.text((x + 4, y + size + 3), f"{i + 1}. {label[:34]}", fill="black")
        draw.text((x + 4, y + size + 18), label[34:68], fill="dimgray")
    sheet.save(out, quality=88)
    print(out)


if __name__ == "__main__":
    main()
