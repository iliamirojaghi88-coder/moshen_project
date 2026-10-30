// Renders the fallback posters from the live 3D scenes, so the images shown
// without WebGL (or on a slow connection) are the same world, same light.
// Needs the development page served locally:  python3 -m http.server 8765
//
//   node tools/render-posters.mjs [http://127.0.0.1:8765]
import { createRequire } from 'node:module';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Playwright is installed globally in this environment, so resolve it via require.
const { chromium } = createRequire(import.meta.url)('playwright');

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const base = process.argv[2] || 'http://127.0.0.1:8765';
const out = (f) => path.join(root, 'assets/images/hero', f);
// only the WebGL canvas is painted, on a transparent page
const isolate = `
  html, body { background: transparent !important; }
  body * { visibility: hidden !important; }
  .stage-canvas { visibility: visible !important; opacity: 1 !important; transition: none !important; }
`;

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

async function shoot(viewport, dpr, capture, fn) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: dpr });
  const route = capture === 'home' ? '' : `#/${capture}`;
  await page.goto(`${base}/index.html?capture=${capture}${route}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset.captureReady === '1', null, { timeout: 120000 });
  await page.addStyleTag({ content: isolate });
  await page.waitForTimeout(600);
  const buf = await fn(page);
  await page.close();
  return buf;
}

const webp = (buf, file, width) => {
  let img = sharp(buf);
  if (width) img = img.resize({ width });
  return img.webp({ quality: 78, alphaQuality: 85, effort: 6, smartSubsample: true }).toFile(out(file));
};

// Home: the whole stage, wide screens and phones.
await webp(await shoot({ width: 1600, height: 1000 }, 1, 'home', (p) => p.screenshot({ omitBackground: true })), 'home-wide.webp');
await webp(await shoot({ width: 430, height: 932 }, 1.6, 'home', (p) => p.screenshot({ omitBackground: true })), 'home-tall.webp');

// Products and contact: the 3D panel only.
const host = (name) => (p) => p.locator(`[data-stage-host="${name}"]`).screenshot({ omitBackground: true });
await webp(await shoot({ width: 1440, height: 900 }, 1.25, 'products', host('products')), 'products.webp', 1000);
await webp(await shoot({ width: 1440, height: 900 }, 1.25, 'contact', host('contact')), 'contact.webp', 1400);

await browser.close();
console.log('posters written');
