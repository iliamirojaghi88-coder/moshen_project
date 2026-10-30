// Builds the product images used by the site from the standardised masters
// (source/standardized/<slug>.png, made by tools/standardize-products.py).
//
// One layout rule for all ten products, so they read as one studio set:
//   · canvas 880 × 1100 (4:5), pure black like the card's image well
//   · every product is scaled to the same height (80% of the canvas), unless
//     it would get wider than 80% of the canvas, then it is fitted by width
//   · centred, so the top and bottom margins are the same on every card
// Proportions are never changed: thick cables stay thick, thin ones thin.
//
//   node tools/build-images.mjs
import sharp from 'sharp';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const masterDir = path.join(root, 'source/standardized');
const outDir = path.join(root, 'assets/images/products');
const { products } = JSON.parse(await readFile(path.join(root, 'source/mapping.json'), 'utf8'));

const CANVAS_W = 880;
const CANVAS_H = 1100;
const PRODUCT_H = 0.8 * CANVAS_H;
const PRODUCT_MAX_W = 0.8 * CANVAS_W;
const WIDTHS = [440, 660, 880];

await mkdir(outDir, { recursive: true });

for (const p of products) {
  const master = path.join(masterDir, `${p.slug}.png`);
  const { width, height } = await sharp(master).metadata();
  const scale = Math.min(PRODUCT_H / height, PRODUCT_MAX_W / width);
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  const product = await sharp(master).resize(w, h, { kernel: 'lanczos3' }).toBuffer();

  const canvas = await sharp({
    create: { width: CANVAS_W, height: CANVAS_H, channels: 3, background: '#000000' },
  })
    .composite([{ input: product, left: Math.round((CANVAS_W - w) / 2), top: Math.round((CANVAS_H - h) / 2) }])
    .png()
    .toBuffer();

  for (const width of WIDTHS) {
    let img = sharp(canvas).resize(width, Math.round((width / CANVAS_W) * CANVAS_H), { kernel: 'lanczos3' });
    if (width < CANVAS_W) img = img.sharpen({ sigma: 0.45 });
    await img.webp({ quality: 86, smartSubsample: true, effort: 6 }).toFile(path.join(outDir, `${p.slug}-${width}.webp`));
  }
  console.log(`${p.slug.padEnd(17)} ${w}×${h}  scale ${scale.toFixed(2)}`);
}
