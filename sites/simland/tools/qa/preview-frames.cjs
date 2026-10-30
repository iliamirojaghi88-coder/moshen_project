// deterministic frames of the live hero for a preview video
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const [file, out, t0, seconds, fps, w, h, dpr] = process.argv.slice(2);
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +dpr });
  await p.goto('file://' + path.resolve(file), { waitUntil: 'load' });
  await p.waitForFunction(() => document.querySelector('[data-scene]').classList.contains('is-live'), null, { timeout: 120000 });
  await p.waitForTimeout(1600); // entrance fade finished
  await p.evaluate(() => window.__hero.pause());
  const n = Math.round(+seconds * +fps);
  for (let i = 0; i < n; i++) {
    await p.evaluate((t) => window.__hero.renderAt(t), +t0 + i / +fps);
    await p.screenshot({ path: `${out}/f${String(i).padStart(4, '0')}.png`, fullPage: false });
  }
  await b.close();
  console.log('frames', n);
})();
