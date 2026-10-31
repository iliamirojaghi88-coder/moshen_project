// node nav-spy.cjs <dist/index.html>   (VP='[[w,h,dpr],…]')
// The menu's active item: «خانه» on the hero; the menu (mouse, touch, keyboard) and
// the hero buttons move it to their destination at once and it never passes through
// another item on the way; scrolling by hand selects what is in view (products,
// «چرا سیم‌لند؟» and the résumé → «محصولات», contact and the end of the page → «ارتباط با ما»);
// rapid clicks end on the last one; always exactly one active item with
// aria-current; the items never change size or move when it changes.
const { chromium } = require('playwright');
const path = require('path');
const [file] = process.argv.slice(2);
const VP = process.env.VP
  ? JSON.parse(process.env.VP)
  : [[320, 640, 2], [375, 812, 3], [430, 932, 3], [768, 1024, 2], [1024, 768, 2], [1366, 768, 1], [1920, 1080, 1], [2560, 1440, 1]];
const ARGS = { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] };
const NAME = { top: 'خانه', products: 'محصولات', contact: 'ارتباط با ما' };

(async () => {
  const browser = await chromium.launch(ARGS);
  let failed = 0;
  for (const [w, h, dpr] of VP) {
    const fails = [];
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, hasTouch: w < 1024 });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(m.text().slice(0, 160)));
    await page.goto('file://' + path.resolve(file), { waitUntil: 'load' });
    await page.waitForFunction(() => document.querySelector('[data-scene]').classList.contains('is-live'), null, { timeout: 120000 }).catch(() => {});
    await page.evaluate(() => {
      window.__hero && window.__hero.pause();
      // every state the menu passes through, and the item boxes in each
      window.__nav = [];
      const items = [...document.querySelectorAll('.topnav-item')];
      const snap = () => {
        const act = items.filter((a) => a.classList.contains('is-active')).map((a) => a.getAttribute('href').slice(1));
        const cur = items.filter((a) => a.hasAttribute('aria-current')).map((a) => a.getAttribute('href').slice(1));
        const boxes = items.map((a) => { const r = a.getBoundingClientRect(); return `${r.left.toFixed(2)}/${r.width.toFixed(2)}`; }).join(' ');
        const last = window.__nav[window.__nav.length - 1];
        const key = act.join(',') + '|' + cur.join(',');
        if (!last || last.key !== key) window.__nav.push({ key, act, cur, boxes });
      };
      snap();
      new MutationObserver(snap).observe(document.querySelector('.topnav'), { subtree: true, attributes: true, attributeFilter: ['class', 'aria-current'] });
    });
    const states = () => page.evaluate(() => window.__nav.splice(0));
    // software WebGL draws the hero at about two frames a second, which delays the start
    // of every smooth scroll from the top: keep it stopped whenever it comes back into view
    const hold = () => page.evaluate(() => window.__hero && window.__hero.pause());
    const settle = () => page.evaluate(async () => {
      window.__hero && window.__hero.pause();
      let last = -1, still = 0;
      for (let k = 0; k < 120 && still < 5; k++) { await new Promise((r) => setTimeout(r, 120)); window.__hero && window.__hero.pause(); still = scrollY === last ? still + 1 : 0; last = scrollY; }
      await new Promise((r) => setTimeout(r, 1200)); // the menu's own rest check (up to a second)
    });
    const now = () => page.evaluate(() => {
      const items = [...document.querySelectorAll('.topnav-item')];
      return { act: items.filter((a) => a.classList.contains('is-active')).map((a) => a.getAttribute('href').slice(1)), cur: items.filter((a) => a.getAttribute('aria-current') === 'true').map((a) => a.getAttribute('href').slice(1)) };
    });
    const expect = async (label, want, path) => {
      const s = await now();
      if (s.act.join() !== want || s.cur.join() !== want) fails.push(`${label}: active ${s.act.join(',') || 'none'} / current ${s.cur.join(',') || 'none'} (want ${NAME[want]})`);
      if (path) {
        const seen = path.map((p) => p.act.join(','));
        const bad = seen.filter((k) => k !== want);
        if (bad.length) fails.push(`${label}: passed through ${bad.join(' → ')}`);
        if (path.some((p) => p.act.length > 1 || p.cur.length > 1)) fails.push(`${label}: two active at once`);
      }
    };
    const how = w < 1024 ? 'tap' : 'click';
    const press = async (sel, mode = how) => {
      await hold();
      if (mode === 'tap') await page.locator(sel).tap(); else if (mode === 'key') { await page.locator(sel).focus(); await page.keyboard.press('Enter'); } else await page.locator(sel).click();
    };
    // the item boxes of the first state, to compare all others with
    const first = await page.evaluate(() => window.__nav[0].boxes);

    // 1. on load: خانه
    await expect('load', 'top');
    await states();
    // 2. محصولات from the menu: active at once, nothing else on the way, still after landing
    await press('.topnav-item[href="#products"]');
    const at0 = await now();
    if (at0.act.join() !== 'products') fails.push('محصولات not active right after the click');
    await settle();
    await expect('menu محصولات', 'products', await states());
    // 3. ارتباط با ما
    await press('.topnav-item[href="#contact"]');
    await settle();
    await expect('menu ارتباط با ما', 'contact', await states());
    // 4. خانه
    await press('.topnav-item[href="#top"]');
    await settle();
    await expect('menu خانه', 'top', await states());
    // keyboard
    await press('.topnav-item[href="#products"]', 'key');
    await settle();
    await expect('keyboard محصولات', 'products', await states());
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await settle();
    await states();
    // hero buttons move it too
    await press('.hero-actions .btn-soft');
    await settle();
    await expect('hero دریافت مشاوره', 'contact', await states());
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await settle();
    await expect('back to the top by hand', 'top');
    await states();

    // 5. by hand: down to the products, the middle of «چرا سیم‌لند؟»
    const wheelTo = async (y) => {
      // a real wheel scroll in steps (as a person does), then rest
      for (let k = 0; k < 60; k++) {
        const d = y - (await page.evaluate(() => scrollY));
        const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight - scrollY);
        if (Math.abs(d) < 2 || (d > 0 && max < 1)) break;
        await page.mouse.move(w / 2, h / 2);
        await page.mouse.wheel(0, Math.max(-400, Math.min(400, d)));
        await page.waitForTimeout(80);
      }
      await settle();
    };
    const top = (sel) => page.evaluate((sel) => document.querySelector(sel).getBoundingClientRect().top + scrollY, sel);
    await wheelTo((await top('#products')) + 40);
    await expect('scroll to products', 'products');
    const why = await page.evaluate(() => { const r = document.getElementById('why').getBoundingClientRect(); return r.top + scrollY + r.height / 2 - innerHeight / 2; });
    await wheelTo(why);
    await expect('scroll to «چرا سیم‌لند؟»', 'products');
    const resume = await page.evaluate(() => { const r = document.getElementById('resume').getBoundingClientRect(); return r.top + scrollY + r.height / 2 - innerHeight / 2; });
    await wheelTo(resume);
    await expect('scroll to the résumé', 'products');
    // 6. by hand to the contact section, then to the very end
    await wheelTo((await top('#contact')) + 20);
    await expect('scroll to contact', 'contact');
    await wheelTo(1e7);
    await expect('end of the page', 'contact');
    // and back up to the hero
    await wheelTo(0);
    await expect('scroll back to the top', 'top');
    await states();

    // 7. rapid clicks: the last one wins, never two at once, the menu never lags behind a click
    for (const t of ['products', 'contact', 'top', 'products', 'contact']) {
      await press(`.topnav-item[href="#${t}"]`);
      const s = await now();
      if (s.act.join() !== t) fails.push(`rapid: ${NAME[t]} not active right after its click`);
      await page.waitForTimeout(90);
    }
    await settle();
    const rapid = await states();
    await expect('rapid clicks', 'contact');
    if (rapid.some((p) => p.act.length !== 1 || p.cur.length !== 1)) fails.push('rapid clicks: not exactly one active at some point');

    // the items never moved or changed size
    const all = await page.evaluate(() => [...document.querySelectorAll('.topnav-item')].map((a) => { const r = a.getBoundingClientRect(); return `${r.left.toFixed(2)}/${r.width.toFixed(2)}`; }).join(' '));
    const moved = (bx) => bx.split(' ').some((v, i) => v.split('/').some((n, j) => Math.abs(+n - +first.split(' ')[i].split('/')[j]) > 0.2));
    const odd = [all, ...rapid.map((p) => p.boxes)].find(moved);
    if (odd) fails.push(`menu items moved: ${first} → ${odd}`);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (over > 0) fails.push('horizontal overflow ' + over);
    await ctx.close();

    // reduced motion: instant jumps, same states
    const rc = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, reducedMotion: 'reduce', hasTouch: w < 1024 });
    const rp = await rc.newPage();
    await rp.goto('file://' + path.resolve(file), { waitUntil: 'load' });
    await rp.waitForTimeout(300);
    for (const t of ['products', 'contact', 'top']) {
      if (w < 1024) await rp.locator(`.topnav-item[href="#${t}"]`).tap(); else await rp.locator(`.topnav-item[href="#${t}"]`).click();
      await rp.waitForTimeout(700);
      const a = await rp.evaluate(() => [...document.querySelectorAll('.topnav-item.is-active')].map((x) => x.getAttribute('href').slice(1)).join());
      if (a !== t) fails.push(`reduced motion ${NAME[t]}: ${a}`);
    }
    // direct #contact load
    await rp.goto('file://' + path.resolve(file) + '#contact', { waitUntil: 'load' });
    await rp.waitForTimeout(900);
    const d = await rp.evaluate(() => [...document.querySelectorAll('.topnav-item.is-active')].map((x) => x.getAttribute('href').slice(1)).join());
    if (d !== 'contact') fails.push('opened with #contact: ' + d);
    await rc.close();

    const ok = !fails.length && !errors.length;
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${w}x${h} ${fails.concat(errors).join('; ')}`);
  }
  await browser.close();
  process.exitCode = failed ? 1 : 0;
})();
