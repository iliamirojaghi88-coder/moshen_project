// node hero-check.cjs <url> <w> <h> <dpr> <outdir> [times...]
// Screenshots the scene as still layers and as live frames at fixed times,
// and writes per-frame difference stats against the still.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const [url, w, h, dpr, out, ...times] = process.argv.slice(2);
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +dpr });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(m.type() + ': ' + m.text()));
  page.on('requestfailed', (r) => errors.push('requestfailed ' + r.url().slice(0, 90)));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('[data-scene]')?.classList.contains('is-live'), null, { timeout: 90000 });
  await page.waitForTimeout(1500);
  const tag = `${w}x${h}@${dpr}`;
  await page.screenshot({ path: path.join(out, `${tag}-page.png`) });
  await page.evaluate(() => window.__hero.pause());
  const scene = page.locator('[data-scene]');
  const box = await scene.boundingBox();
  // area: the scene plus the smoke room above it
  const ext = Math.round(box.height * 0.27);
  const clip = { x: box.x, y: Math.max(0, box.y - ext), width: box.width, height: box.height + Math.min(ext, box.y) };
  // still layers
  await page.evaluate(() => {
    const s = document.querySelector('[data-scene]');
    s.classList.remove('is-live');
    s.querySelector('canvas').style.visibility = 'hidden';
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(out, `${tag}-still.png`), clip });
  await page.evaluate(() => {
    const s = document.querySelector('[data-scene]');
    s.classList.add('is-live');
    s.querySelector('canvas').style.visibility = '';
  });
  for (const t of times) {
    await page.evaluate((t) => window.__hero.renderAt(+t), t);
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(out, `${tag}-t${t}.png`), clip });
  }
  const info = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    iw: innerWidth,
    scene: document.querySelector('[data-scene]').getBoundingClientRect().toJSON(),
    canvas: (() => {
      const c = document.querySelector('.scene-live');
      return c ? { w: c.width, h: c.height, css: c.getBoundingClientRect().toJSON() } : null;
    })(),
  }));
  console.log(JSON.stringify({ tag, clip, info }));
  console.log(errors.join('\n') || 'no errors');
  await browser.close();
})();
