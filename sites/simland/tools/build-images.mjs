// Builds the product images used by the site from the source photos.
//
// Every photo is shot on pure black. This script finds the cable inside each
// frame, re-frames it on a uniform 4:5 black canvas so all ten cards share the
// same visual scale, and writes sharp WebP derivatives for responsive srcset.
// Pixels of the product itself are only resampled, never retouched.
//
//   node tools/build-images.mjs
import sharp from 'sharp';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const srcDir = path.join(root, 'source/products');
const outDir = path.join(root, 'assets/images/products');
const mapping = JSON.parse(await readFile(path.join(root, 'source/mapping.json'), 'utf8'));

const MASTER_W = 880;
const MASTER_H = 1100;
const WIDTHS = [440, 660, 880];
const THRESHOLD = 14; // ignore JPEG noise in the black background

async function bbox(file) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: c } = info;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * c;
      if (Math.max(data[i], data[i + 1], data[i + 2]) > THRESHOLD) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return { w, h, x0, y0, x1, y1 };
}

await mkdir(outDir, { recursive: true });

for (const p of mapping.products) {
  const file = path.join(srcDir, p.photo);
  const b = await bbox(file);
  const pad = 6;
  const left = Math.max(0, b.x0 - pad);
  const top = Math.max(0, b.y0 - pad);
  const right = Math.min(b.w - 1, b.x1 + pad);
  const bottom = Math.min(b.h - 1, b.y1 + pad);
  const cw = right - left + 1;
  const ch = bottom - top + 1;
  // Close-ups run off the bottom of the frame: keep them anchored to the bottom
  // edge so the cable still reads as continuing out of the picture.
  const bleedsBottom = b.y1 >= b.h - 3;

  const targetH = (bleedsBottom ? 0.9 : 0.8) * MASTER_H;
  const scale = Math.min(targetH / ch, (0.84 * MASTER_W) / cw);
  const rw = Math.round(cw * scale);
  const rh = Math.round(ch * scale);
  const offX = Math.round((MASTER_W - rw) / 2);
  const offY = bleedsBottom ? MASTER_H - rh : Math.round(MASTER_H * 0.49 - rh / 2);

  const product = await sharp(file)
    .extract({ left, top, width: cw, height: ch })
    .resize(rw, rh, { kernel: 'lanczos3' })
    .toBuffer();

  const master = await sharp({
    create: { width: MASTER_W, height: MASTER_H, channels: 3, background: '#000000' },
  })
    .composite([{ input: product, left: offX, top: offY }])
    .png()
    .toBuffer();

  for (const width of WIDTHS) {
    const height = Math.round((width / MASTER_W) * MASTER_H);
    let img = sharp(master).resize(width, height, { kernel: 'lanczos3' });
    if (width < MASTER_W) img = img.sharpen({ sigma: 0.45 });
    await img
      .webp({ quality: 86, smartSubsample: true, effort: 6 })
      .toFile(path.join(outDir, `${p.slug}-${width}.webp`));
  }
  console.log(
    `${p.slug.padEnd(17)} ${p.photo}  scale ${scale.toFixed(2)}  ${bleedsBottom ? 'bottom-anchored' : 'centred'}`,
  );
}
