// Builds the product images used by the product cards from the standardised
// masters (source/standardized/<slug>.png, made by tools/standardize-products.py).
//
// One rule for all ten products, so they read as one studio set: every cable
// is trimmed to itself and scaled to the same height (HEIGHT px). The card
// shows every image at the same share of its picture area, so all ten stand at
// one size; thick cables stay thick, thin ones thin. No sharpening: a Lanczos
// downscale of the lossless master is as crisp as the photo allows.
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

// enough for the largest card picture on a 3x phone or a 2x tablet
const HEIGHT = 640;

await mkdir(outDir, { recursive: true });

for (const p of products) {
  const master = path.join(masterDir, `${p.slug}.png`);
  const trimmed = await sharp(master).trim({ threshold: 1 }).png().toBuffer({ resolveWithObject: true });
  const { width, height } = trimmed.info;
  const w = Math.round((width * HEIGHT) / height);
  const out = path.join(outDir, `${p.slug}.webp`);
  await sharp(trimmed.data)
    .resize(w, HEIGHT, { kernel: 'lanczos3' })
    .webp({ quality: 90, alphaQuality: 95, smartSubsample: true, effort: 6 })
    .toFile(out);
  console.log(`${p.slug.padEnd(17)} ${width}×${height} -> ${w}×${HEIGHT}`);
}
