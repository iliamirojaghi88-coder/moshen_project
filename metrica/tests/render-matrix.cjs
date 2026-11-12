// usage: node shot.js <url-base> <outdir> [routes] [widths]
const { chromium } = require('playwright');
const [,, base = 'http://127.0.0.1:8765/index.html', out = '.', routesArg, widthsArg] = process.argv;
const routes = (routesArg || 'features,account,home,projects').split(',');
const sizes = (widthsArg || '360x780,390x844,430x932,768x1024,1280x900').split(',').map(s => s.split('x').map(Number));
(async () => {
  const b = await chromium.launch();
  const report = [];
  for (const [w, h] of sizes) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    const errs = [];
    p.on('console', m => m.type() === 'error' && errs.push(m.text()));
    p.on('pageerror', e => errs.push(e.message));
    p.on('requestfailed', r => errs.push('FAILED ' + r.url()));
    for (const r of routes) {
      await p.goto(`${base}#/${r}`);
      await p.waitForLoadState('networkidle');
      await p.evaluate(() => document.fonts.ready);
      await p.waitForTimeout(700);
      const info = await p.evaluate(() => ({
        sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
        sh: document.documentElement.scrollHeight,
        font: document.fonts.check('16px Estedad'),
        idx: getComputedStyle(document.getElementById('m-nav')).getPropertyValue('--idx'),
      }));
      report.push({ w, h, r, ...info, errs: [...errs] });
      errs.length = 0;
      await p.screenshot({ path: `${out}/${r}_${w}.png`, fullPage: true });
    }
    await ctx.close();
  }
  await b.close();
  console.log(JSON.stringify(report, null, 0).replace(/},{/g, '},\n{'));
})();
