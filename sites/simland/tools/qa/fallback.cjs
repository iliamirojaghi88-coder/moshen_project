// reduced motion and no-WebGL: the still layers must show the picture, no errors
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const file = 'file://' + path.resolve(process.argv[2]);
  for (const mode of ['reduced', 'nowebgl']) {
    const browser = await chromium.launch({ args: mode === 'nowebgl' ? ['--disable-webgl', '--disable-3d-apis'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: mode === 'reduced' ? 'reduce' : 'no-preference' });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto(file, { waitUntil: 'load' });
    await page.waitForTimeout(3000);
    const r = await page.evaluate(() => ({ live: document.querySelector('[data-scene]').classList.contains('is-live'), canvas: !!document.querySelector('.scene-live'), stillVisible: getComputedStyle(document.querySelector('.scene-still')).visibility }));
    await page.screenshot({ path: `${process.argv[3]}-${mode}.png` });
    console.log(mode, JSON.stringify(r), errors.join(' | ') || 'no errors');
    await browser.close();
  }
})();
