// Converts the Blender renders (tools/blender/render-imagery.py) into the
// WebP files the site uses.
//
//   node tools/build-imagery.mjs <renders-dir>
//
//   icon-<name>.png  → assets/images/icons/<name>.webp   trimmed to the icon, 320 × 320, transparent
//   section.png      → assets/images/render/cable-section.webp  transparent, 1500 wide
//   macro.png        → assets/images/render/copper-macro.webp   transparent, 1600 wide
//   tray.png         → assets/images/render/cable-tray.webp     1600 wide
import sharp from 'sharp';
import { access, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = path.resolve(process.argv[2] || '.');
const out = (...p) => path.join(root, 'assets/images', ...p);
const exists = (f) => access(f).then(() => true, () => false);

await mkdir(out('icons'), { recursive: true });
await mkdir(out('render'), { recursive: true });

// Square crop around the opaque part (the soft shadow included), centred.
async function iconWebp(file, dest) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let [x0, y0, x1, y1] = [info.width, info.height, 0, 0];
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] > 24) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  const side = Math.round(Math.max(x1 - x0, y1 - y0) * 1.08);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const left = Math.round(cx - side / 2);
  const top = Math.round(cy - side / 2);
  // extend with transparency where the square leaves the render
  const pad = { top: Math.max(0, -top), left: Math.max(0, -left), bottom: Math.max(0, top + side - info.height), right: Math.max(0, left + side - info.width) };
  const padded = await sharp(file).extend({ ...pad, background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  await sharp(padded)
    .extract({ left: left + pad.left, top: top + pad.top, width: side, height: side })
    .resize(320, 320, { kernel: 'lanczos3' })
    .webp({ quality: 88, alphaQuality: 90, effort: 6 })
    .toFile(dest);
}

for (const name of ['quality', 'variety', 'price', 'support', 'delivery']) {
  const file = path.join(src, `icon-${name}.png`);
  if (!(await exists(file))) continue;
  await iconWebp(file, out('icons', `${name}.webp`));
  console.log('icon', name);
}

const renders = [
  ['section.png', 'cable-section.webp', 1500, { quality: 84, alphaQuality: 90 }],
  ['macro.png', 'copper-macro.webp', 1600, { quality: 82, alphaQuality: 88 }],
  ['tray.png', 'cable-tray.webp', 1600, { quality: 80 }],
];
for (const [file, dest, width, opts] of renders) {
  const f = path.join(src, file);
  if (!(await exists(f))) continue;
  await sharp(f).resize({ width, withoutEnlargement: true }).webp({ ...opts, effort: 6, smartSubsample: true }).toFile(out('render', dest));
  console.log('render', dest);
}
