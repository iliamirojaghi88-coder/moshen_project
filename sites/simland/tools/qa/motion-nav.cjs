// node motion-nav.cjs <dist/index.html> [<previous dist/index.html>]   (VP='[[w,h,dpr],…]')
// Hero buttons (compared with a previous build: only their order may differ), the
// menu and hero links to the page's sections (mouse, touch, keyboard, direct #hash),
// and the entrances (sides, no overflow while moving, nothing left transformed, all
// visible with reduced motion).
const { chromium } = require('playwright');
const path = require('path');
const [file, previous] = process.argv.slice(2);
const VP = process.env.VP
  ? JSON.parse(process.env.VP)
  : [[320, 640, 2], [375, 812, 3], [430, 932, 3], [768, 1024, 2], [1024, 768, 2], [1280, 800, 1], [1366, 768, 1], [1536, 864, 1.25], [1920, 1080, 1]];
const url = (f) => 'file://' + path.resolve(f);
const ARGS = { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] };

async function open(browser, f, [w, h, dpr], opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, hasTouch: w < 1024, ...opts });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(m.text().slice(0, 160)));
  await page.goto(url(f) + (opts.hash || ''), { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('[data-scene]').classList.contains('is-live') || matchMedia('(prefers-reduced-motion: reduce)').matches, null, { timeout: 120000 }).catch(() => {});
  await page.evaluate(() => window.__hero && window.__hero.pause());
  return { ctx, page, errors };
}

const buttons = (page) => page.evaluate(() => [...document.querySelectorAll('.hero-actions .btn')].map((b) => {
  const r = b.getBoundingClientRect();
  const cs = getComputedStyle(b);
  return {
    label: b.textContent.trim(), href: b.getAttribute('href'), x: +r.left.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1),
    style: [cs.paddingInlineStart, cs.paddingInlineEnd, cs.borderRadius, cs.fontSize, cs.fontWeight, cs.backgroundImage.slice(0, 60), cs.boxShadow.slice(0, 60), cs.color].join('|'),
  };
}));

(async () => {
  const browser = await chromium.launch(ARGS);
  let failed = 0;
  for (const vp of VP) {
    const [w, h] = vp;
    const fails = [];
    const { ctx, page, errors } = await open(browser, file, vp);

    // ---- hero buttons: order swapped, everything else as before
    const now = await buttons(page);
    const right = now.slice().sort((a, b) => b.x - a.x);
    if (!right[0].label.includes('مشاهده محصولات') || right[0].href !== '#products' || right[1].href !== '#contact') fails.push('button order: ' + right.map((b) => b.label).join(' / '));
    if (previous) {
      const { ctx: c0, page: p0 } = await open(browser, previous, vp);
      const before = await buttons(p0);
      await c0.close();
      for (const b of now) {
        const o = before.find((x) => x.label === b.label);
        if (!o || o.w !== b.w || o.h !== b.h || o.style !== b.style || o.href !== b.href) fails.push('button changed: ' + b.label);
      }
      const box = (bs) => [Math.min(...bs.map((b) => b.x)), Math.max(...bs.map((b) => b.x + b.w))].map((v) => +v.toFixed(1)).join('-');
      if (box(now) !== box(before)) fails.push(`button group moved ${box(before)} -> ${box(now)}`);
      const gap = (bs) => { const s = bs.slice().sort((a, b) => a.x - b.x); return +(s[1].x - s[0].x - s[0].w).toFixed(1); };
      if (gap(now) !== gap(before)) fails.push(`gap ${gap(before)} -> ${gap(now)}`);
    }

    // ---- entrances: sides chosen from the real rows, before anything is scrolled
    const sides = await page.evaluate(() => {
      const rows = new Map();
      for (const c of document.querySelectorAll('.pcard')) { const k = c.offsetTop; if (!rows.has(k)) rows.set(k, []); rows.get(k).push(c); }
      const firstRow = [...rows.values()][0].sort((a, b) => b.offsetLeft - a.offsetLeft).map((c) => c.dataset.reveal);
      return { products: firstRow.join(','), why: [...document.querySelectorAll('.why-card')].map((c) => c.dataset.reveal).join(','), on: document.documentElement.classList.contains('reveal-on') };
    });
    if (!sides.on) fails.push('entrances not active');
    // scroll down through the page while the blocks move: never a horizontal scroll
    const overflow = await page.evaluate(async () => {
      document.documentElement.style.scrollBehavior = 'auto';
      let worst = 0;
      for (const el of document.querySelectorAll('[data-reveal]')) {
        el.scrollIntoView({ block: 'center' });
        for (let k = 0; k < 3; k++) { await new Promise((r) => setTimeout(r, 70)); worst = Math.max(worst, document.documentElement.scrollWidth - innerWidth); }
      }
      return worst;
    });
    if (overflow > 0) fails.push('horizontal overflow while moving: ' + overflow);
    await page.waitForFunction(() => [...document.querySelectorAll('[data-reveal]')].every((e) => e.classList.contains('is-in') && !e.getAnimations().length), null, { timeout: 15000 }).catch(() => fails.push('entrances never settled'));
    const settled = await page.evaluate(() => [...document.querySelectorAll('[data-reveal]')].filter((e) => { const cs = getComputedStyle(e); return cs.opacity !== '1' || cs.transform !== 'none'; }).length);
    if (settled) fails.push(settled + ' blocks not settled (opacity/transform left)');

    // ---- menu and hero buttons (mouse or touch, as the device has)
    const land = async (sel, how) => {
      await page.evaluate(() => { document.documentElement.style.scrollBehavior = ''; scrollTo(0, document.body.scrollHeight / 2); });
      await page.waitForTimeout(150);
      if (how === 'tap') await page.locator(sel).tap(); else if (how === 'key') { await page.locator(sel).focus(); await page.keyboard.press('Enter'); } else await page.locator(sel).click();
      // wait for the landing itself (smooth scrolling is slow in software rendering), then for rest
      await page.waitForFunction((sel) => {
        const href = document.querySelector(sel).getAttribute('href');
        if (href === '#top') return scrollY <= 2;
        const t = document.getElementById(href.slice(1) + '-title').getBoundingClientRect();
        const sec = document.getElementById(href.slice(1)).getBoundingClientRect();
        const bar = document.querySelector('.topbar').getBoundingClientRect().bottom;
        const atEnd = Math.abs(scrollY - (document.documentElement.scrollHeight - innerHeight)) <= 2;
        return t.top >= bar - 0.5 && t.bottom <= innerHeight && (sec.top <= 90 || atEnd);
      }, sel, { timeout: 20000, polling: 150 }).catch(() => {});
      await page.evaluate(async () => {
        let last = -1, still = 0;
        for (let k = 0; k < 80 && still < 4; k++) { await new Promise((r) => setTimeout(r, 150)); still = scrollY === last ? still + 1 : 0; last = scrollY; }
      });
      return page.evaluate(() => {
        const bar = document.querySelector('.topbar').getBoundingClientRect().bottom;
        const t = (id) => { const e = document.getElementById(id); if (!e) return null; const r = e.getBoundingClientRect(); return { top: Math.round(r.top), clear: r.top >= bar - 0.5, inView: r.bottom <= innerHeight }; };
        return { y: Math.round(scrollY), hash: location.hash, products: t('products-title'), contact: t('contact-title'), sectionTop: { p: Math.round(document.getElementById('products').getBoundingClientRect().top), c: Math.round(document.getElementById('contact').getBoundingClientRect().top) } };
      });
    };
    const how = w < 1024 ? 'tap' : 'click';
    const nav = {};
    nav.home = await land('.topnav-item[href="#top"]', how);
    if (nav.home.y > 2) fails.push('خانه did not reach the top: ' + nav.home.y);
    nav.products = await land('.topnav-item[href="#products"]', how);
    if (!nav.products.products.clear || !nav.products.products.inView || nav.products.sectionTop.p > 90 || nav.products.hash !== '#products') fails.push('menu محصولات: ' + JSON.stringify(nav.products.products) + ' section ' + nav.products.sectionTop.p);
    nav.contact = await land('.topnav-item[href="#contact"]', how);
    const endOfPage = Math.abs(nav.contact.y - (await page.evaluate(() => document.documentElement.scrollHeight - innerHeight))) <= 2;
    if (!nav.contact.contact.clear || !nav.contact.contact.inView || (nav.contact.sectionTop.c > 90 && !endOfPage)) fails.push('menu ارتباط با ما: ' + JSON.stringify(nav.contact.contact) + ' section ' + nav.contact.sectionTop.c);
    nav.key = await land('.topnav-item[href="#products"]', 'key');
    if (!nav.key.products.clear || nav.key.sectionTop.p > 90) fails.push('keyboard محصولات');
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForTimeout(400);
    nav.cta1 = await land('.hero-actions .btn-primary', how);
    if (!nav.cta1.products.clear || nav.cta1.sectionTop.p > 90) fails.push('hero مشاهده محصولات ' + JSON.stringify(nav.cta1));
    nav.cta2 = await land('.hero-actions .btn-soft', how);
    if (!nav.cta2.contact.clear || !nav.cta2.contact.inView) fails.push('hero دریافت مشاوره');
    await ctx.close();

    // ---- direct #hash loads
    for (const id of ['products', 'contact']) {
      const { ctx: c, page: p } = await open(browser, file, vp, { hash: '#' + id });
      await p.waitForTimeout(1200);
      const t = await p.evaluate((id) => { const r = document.getElementById(id + '-title').getBoundingClientRect(); const bar = document.querySelector('.topbar').getBoundingClientRect().bottom; return r.top >= bar - 0.5 && r.bottom <= innerHeight; }, id);
      if (!t) fails.push('direct #' + id + ' load');
      await c.close();
    }

    // ---- reduced motion: no entrances, everything there at once
    const { ctx: rc, page: rp } = await open(browser, file, vp, { reducedMotion: 'reduce' });
    const hidden = await rp.evaluate(() => document.documentElement.classList.contains('reveal-on') || [...document.querySelectorAll('[data-reveal]')].some((e) => getComputedStyle(e).opacity !== '1'));
    if (hidden) fails.push('reduced motion: something hidden');
    await rc.close();

    const ok = !fails.length && !errors.length;
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${w}x${h} buttons ${right.map((b) => b.label.split(' ')[0]).join('|')} products-row ${sides.products} why ${sides.why} ${fails.concat(errors).join('; ')}`);
  }
  await browser.close();
  process.exitCode = failed ? 1 : 0;
})();
