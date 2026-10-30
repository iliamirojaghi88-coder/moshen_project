// Renders the fallback posters from the live 3D scene, so the images shown
// without WebGL (or on a slow connection) are the same cable, same light.
// Needs the site served locally:  python3 -m http.server 8765
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
const isolate = `
  body > *:not(.stage), .stage-light, .stage-poster { visibility: hidden !important; }
  html, body { background: transparent !important; }
`;

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

async function shoot(viewport, dpr, capture, fn) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: dpr });
  await page.goto(`${base}/index.html?capture=${capture}`, { waitUntil: 'load' });
  if (capture === 'macro') await page.evaluate(() => document.querySelector('[data-macro-host]').scrollIntoView({ block: 'center' }));
  await page.waitForFunction(() => document.documentElement.dataset.captureReady === '1', null, { timeout: 60000 });
  await page.waitForTimeout(800);
  const buf = await fn(page);
  await page.close();
  return buf;
}

// Wide hero: transparent PNG of the stage at 1600×1000.
const wide = await shoot({ width: 1600, height: 1000 }, 1, 'hero', async (page) => {
  await page.addStyleTag({ content: isolate });
  return page.screenshot({ omitBackground: true });
});
await sharp(wide).webp({ quality: 84, alphaQuality: 90, effort: 6 }).toFile(out('cable-hero-wide.webp'));

// Tall hero (phones): the upper part of a 430×932 screen at 2×.
const tall = await shoot({ width: 430, height: 932 }, 2, 'hero', async (page) => {
  await page.addStyleTag({ content: isolate });
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: 430, height: 500 } });
});
await sharp(tall).webp({ quality: 84, alphaQuality: 90, effort: 6 }).toFile(out('cable-hero-tall.webp'));

// Macro close-up for the "why SIMLAND" panel, background included.
const macro = await shoot({ width: 1440, height: 1000 }, 1.6, 'macro', async (page) => {
  return page.locator('[data-macro-host]').screenshot();
});
await sharp(macro).resize({ width: 900 }).webp({ quality: 82, effort: 6 }).toFile(out('cable-macro.webp'));

// Social preview image.
const og = await shoot({ width: 1200, height: 630 }, 1, 'hero', async (page) => page.screenshot());
await sharp(og).jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(root, 'assets/images/og-simland.jpg'));

await browser.close();
console.log('posters written');
