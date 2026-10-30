// node responsive.cjs <file> <outdir>
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const [file, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const VP = (process.env.VP ? JSON.parse(process.env.VP) : [[320, 640, 2], [360, 800, 3], [375, 812, 3], [390, 844, 3], [414, 896, 3], [430, 932, 3], [768, 1024, 2], [1024, 768, 1], [1366, 768, 1], [1536, 864, 1.25], [1920, 1080, 1]]);
(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const [w, h, dpr] of VP) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(m.type() + ': ' + m.text()));
    page.on('requestfailed', (r) => errors.push('requestfailed ' + r.url().slice(0, 60)));
    await page.goto('file://' + path.resolve(file), { waitUntil: 'load' });
    await page.waitForFunction(() => document.querySelector('[data-scene]').classList.contains('is-live'), null, { timeout: 120000 }).catch(() => errors.push('never went live'));
    await page.evaluate(() => window.__hero && window.__hero.renderAt(9));
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => {
      const box = (s) => { const e = document.querySelector(s); const b = e.getBoundingClientRect(); return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1), b: +b.bottom.toFixed(1), r: +b.right.toFixed(1) }; };
      const lines = (s) => { const e = document.querySelector(s); return Math.round(e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight)); };
      const btns = [...document.querySelectorAll('.hero-actions .btn')].map((b) => b.getBoundingClientRect());
      const c = document.querySelector('.scene-live');
      return {
        overflowX: document.documentElement.scrollWidth > innerWidth,
        bar: box('.topbar'),
        navItems: [...document.querySelectorAll('.topnav-item')].map((a) => a.textContent),
        titleLines: lines('.hero-title'),
        ledeLines: lines('.hero-lede'),
        buttonsOneRow: Math.abs(btns[0].top - btns[1].top) < 1,
        buttonsInside: btns.every((b) => b.left >= 0 && b.right <= innerWidth),
        scene: box('[data-scene]'),
        sceneRatio: +(document.querySelector('[data-scene]').getBoundingClientRect().width / document.querySelector('[data-scene]').getBoundingClientRect().height).toFixed(3),
        sceneInside: (() => { const b = document.querySelector('[data-scene]').getBoundingClientRect(); return b.left >= -0.5 && b.right <= innerWidth + 0.5; })(),
        canvas: c ? { w: c.width, h: c.height, cssW: +c.getBoundingClientRect().width.toFixed(2) } : null,
        live: document.querySelector('[data-scene]').classList.contains('is-live'),
      };
    });
    await page.screenshot({ path: path.join(out, `${w}x${h}.png`) });
    console.log(JSON.stringify({ vp: `${w}x${h}@${dpr}`, ...r, errors }));
    await page.close();
  }
  await browser.close();
})();
