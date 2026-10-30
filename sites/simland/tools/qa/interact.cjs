const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const url = 'file://' + path.resolve(process.argv[2]);
  await p.goto(url, { waitUntil: 'load' });
  await p.waitForTimeout(2000);
  const before = p.url();
  for (const label of ['محصولات', 'ارتباط با ما']) {
    await p.getByText(label, { exact: true }).first().click({ force: true });
    await p.waitForTimeout(300);
  }
  const navOk = p.url() === before;
  await p.getByText('مشاهده محصولات').click();
  await p.getByText('دریافت مشاوره').click();
  await p.waitForTimeout(300);
  const r = await p.evaluate(() => ({
    url: location.href.split('/').pop(),
    scrollY,
    active: document.querySelector('.topnav-item.is-active').textContent,
    locked: [...document.querySelectorAll('[aria-disabled="true"]')].map((a) => a.textContent + ':' + (a.hasAttribute('href') ? 'href' : 'no-href')),
    focusables: [...document.querySelectorAll('a[href], button')].map((a) => a.textContent.trim()),
  }));
  console.log(JSON.stringify({ navOk, ...r }), errors.join(' | ') || 'no errors');
  await b.close();
})();
