const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 760, height: 640 } });
  p.on('pageerror', (e) => console.log('pageerror', e.message));
  p.on('console', (m) => console.log(m.type(), m.text().slice(0, 300)));
  await p.goto('http://127.0.0.1:8765/tools/smoke-bench.html');
  await p.waitForFunction(() => window.ready, null, { timeout: 60000 });
  const out = process.argv[2];
  const times = process.argv.slice(3);
  for (const t of times) {
    await p.evaluate((t) => renderAt(+t), t);
    await p.screenshot({ path: `${out}-${t}.png` });
  }
  await b.close();
})();
