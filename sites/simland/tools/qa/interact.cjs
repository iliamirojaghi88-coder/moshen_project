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
  // the hero button scrolls to the products; the title ends up below the fixed header
  await p.locator('.hero-actions .btn-primary').click();
  await p.waitForTimeout(1500);
  const toProducts = await p.evaluate(() => {
    const t = document.getElementById('products-title').getBoundingClientRect();
    const bar = document.querySelector('.topbar').getBoundingClientRect();
    return { titleTop: Math.round(t.top), clearOfHeader: t.top >= bar.bottom, inView: t.bottom <= innerHeight };
  });
  // the product buttons are locked for now (no product pages yet): no navigation
  await p.locator('.pcard-cta').first().click({ force: true });
  await p.waitForTimeout(300);
  const cardsLocked = p.url() === before;
  await p.evaluate(() => scrollTo(0, 0));
  await p.locator('.hero-actions .btn-soft').click();
  await p.waitForTimeout(1500);
  // «دریافت مشاوره» lands on the contact section, its title clear of the fixed header
  const toContact = await p.evaluate(() => {
    const t = document.getElementById('contact-title').getBoundingClientRect();
    const bar = document.querySelector('.topbar').getBoundingClientRect();
    return { titleTop: Math.round(t.top), clearOfHeader: t.top >= bar.bottom, inView: t.bottom <= innerHeight };
  });
  const r = await p.evaluate(() => ({
    url: location.href.split('/').pop(),
    scrollY,
    active: document.querySelector('.topnav-item.is-active').textContent,
    locked: [...document.querySelectorAll('[aria-disabled="true"]')].map((a) => a.textContent + ':' + (a.hasAttribute('href') ? 'href' : 'no-href')),
    focusables: [...document.querySelectorAll('a[href], button')].map((a) => a.textContent.trim()),
  }));
  console.log(JSON.stringify({ navOk, toProducts, toContact, cardsLocked, ...r, locked: `${r.locked.length} locked` }), errors.join(' | ') || 'no errors');
  await b.close();
})();
