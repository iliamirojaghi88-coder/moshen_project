// consecutive frames at 30 fps; reports frame-to-frame change per region
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const [url, out, t0, n] = process.argv.slice(2);
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
  await p.goto(url, { waitUntil: 'load' });
  await p.waitForFunction(() => document.querySelector('[data-scene]').classList.contains('is-live'), null, { timeout: 120000 });
  await p.evaluate(() => window.__hero.pause());
  const c = await p.locator('.scene-live').boundingBox();
  for (let i = 0; i < +n; i++) {
    const t = +t0 + i / 30;
    await p.evaluate((t) => window.__hero.renderAt(t), t);
    await p.screenshot({ path: `${out}/f${String(i).padStart(3, '0')}.png`, clip: c });
  }
  await b.close();
})();
