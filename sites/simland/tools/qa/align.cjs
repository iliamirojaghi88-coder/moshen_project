const { chromium } = require('playwright');
(async () => {
  const [url, w, h, dpr] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +dpr });
  await p.goto(url, { waitUntil: 'load' });
  await p.waitForFunction(() => document.querySelector('[data-scene]').classList.contains('is-live'), null, { timeout: 120000 });
  await p.waitForTimeout(1500);
  const r = await p.evaluate(() => {
    const c = document.querySelector('.scene-live');
    const img = document.querySelector('[data-layer="base"]');
    const st = document.querySelector('.scene-still');
    const R = (e) => { const q = e.getBoundingClientRect(); return [q.left, q.top, q.width, q.height].map((v) => +(v * devicePixelRatio).toFixed(3)); };
    return { canvas: R(c), cw: c.width, ch: c.height, still: R(st), img: R(img), scrollY, anim: getComputedStyle(document.querySelector('.scene')).transform, copyAnim: getComputedStyle(document.querySelector('.scene')).animationName };
  });
  console.log(JSON.stringify(r));
  await b.close();
})();
