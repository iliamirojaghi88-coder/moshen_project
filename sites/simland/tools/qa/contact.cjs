// node contact.cjs <dist/index.html> <outdir>   (VP='[[w,h,dpr],…]' to choose viewports)
// «با ما در ارتباط باشید»: order and columns, the phone image whole and undistorted,
// the call link, the inactive second line, the address and its copy button, keyboard
// focus, no overflow, a clean join to «چرا سیم‌لند؟», and nothing after the section.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const [file, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const VP = process.env.VP
  ? JSON.parse(process.env.VP)
  : [[320, 640, 2], [375, 812, 3], [390, 844, 3], [430, 932, 3], [768, 1024, 2], [820, 1180, 2], [1024, 768, 2], [1280, 800, 1], [1366, 768, 1], [1536, 864, 1.25], [1920, 1080, 1]];
const ADDRESS = 'قم، خیابان مفتح، نبش کوچه ۶';

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let failed = 0;
  for (const [w, h, dpr] of VP) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(m.type() + ': ' + m.text()));
    await page.goto('file://' + path.resolve(file), { waitUntil: 'load' });
    await page.waitForFunction(() => document.querySelector('[data-scene]').classList.contains('is-live'), null, { timeout: 120000 }).catch(() => errors.push('hero never went live'));
    await page.evaluate(async () => {
      window.__hero && window.__hero.pause();
      document.documentElement.style.scrollBehavior = 'auto';
      for (const el of document.querySelectorAll('.contact-head, .contact-list > li, .contact-art')) { el.scrollIntoView({ block: 'center' }); await new Promise((r) => setTimeout(r, 120)); }
    });
    await page.waitForFunction(() => { const i = document.querySelector('.contact-phone'); return i.complete && i.naturalWidth; }, null, { timeout: 30000 }).catch(() => errors.push('phone image not loaded'));
    await page.waitForTimeout(1200);
    const r = await page.evaluate((ADDRESS) => {
      const R = (e) => { const b = e.getBoundingClientRect(); return { left: b.left, right: b.right, width: b.width, height: b.height, top: b.top + scrollY, bottom: b.bottom + scrollY }; };
      const fails = [];
      if (document.documentElement.scrollWidth > innerWidth) fails.push('horizontal overflow');
      const sec = document.getElementById('contact');
      const main = document.querySelector('main');
      if (main.lastElementChild !== sec) fails.push('contact is not the last section');
      if (document.querySelector('footer') || [...document.body.children].some((e) => !['SCRIPT', 'MAIN', 'HEADER', 'svg', 'SVG'].includes(e.tagName))) fails.push('something after/around the sections');
      const why = R(document.getElementById('why'));
      const S = R(sec);
      if (Math.abs(S.top - why.bottom) > 1) fails.push('not adjacent to «چرا سیم‌لند؟»');
      const kicker = R(sec.querySelector('.contact-kicker'));
      const title = R(sec.querySelector('.contact-title'));
      const lede = R(sec.querySelector('.contact-lede'));
      const items = [...sec.querySelectorAll('.contact-list > li')];
      const cards = items.map((li) => li.firstElementChild);
      const cr = cards.map(R);
      const art = R(sec.querySelector('.contact-art'));
      const copy = R(sec.querySelector('.contact-copy'));
      const side = art.right <= copy.left + 0.5;
      // order: SIMLAND, title, text, three cards one under another
      const seq = [kicker, title, lede, ...cr];
      for (let i = 1; i < seq.length; i++) if (seq[i].top < seq[i - 1].bottom - 0.5) fails.push('order broken at item ' + i);
      if (cr.some((c) => Math.abs(c.left - cr[0].left) > 0.5 || Math.abs(c.width - cr[0].width) > 0.5)) fails.push('cards not one under another at one width');
      if (!side) {
        if (art.top < cr[2].bottom) fails.push('phone not below the cards');
        if (Math.abs(art.left + art.width / 2 - innerWidth / 2) > 1) fails.push('phone not centred');
      } else if (!(art.bottom > copy.top && art.top < copy.bottom)) fails.push('phone not beside the text');
      // everything has finished its entrance and is fully visible
      for (const el of [sec.querySelector('.contact-head'), ...items, sec.querySelector('.contact-art')]) {
        if (getComputedStyle(el).opacity !== '1') fails.push('not visible after entrance: ' + (el.className || el.tagName));
      }
      // the phone: whole, undistorted, not enlarged past its pixels, inside the section and the screen
      const img = sec.querySelector('.contact-phone');
      const ib = R(img);
      if (getComputedStyle(img).objectFit !== 'contain') fails.push('phone not object-fit contain');
      if (Math.abs(ib.width / ib.height - img.naturalWidth / img.naturalHeight) > 0.005) fails.push('phone aspect changed');
      if (ib.width * devicePixelRatio > img.naturalWidth + 1) fails.push('phone enlarged past its pixels');
      if (ib.left < -0.5 || ib.right > innerWidth + 0.5 || ib.top < S.top || ib.bottom > S.bottom) fails.push('phone cut by the screen or the section');
      // sales card: «مشاوره و خرید», two rows, each its own tel: link; office card: one link over the whole card
      const [sales, office, addr] = cards;
      const hits = (link, parts) => {
        link.scrollIntoView({ block: 'center' }); // hit-testing only works inside the window
        for (const part of link.querySelectorAll(parts)) {
          const b = part.getBoundingClientRect();
          const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
          if (!hit || !link.contains(hit)) fails.push('not clickable: ' + link.getAttribute('href') + ' ' + part.className);
        }
      };
      if (sales.querySelector('.ccard-label').textContent !== 'مشاوره و خرید') fails.push('sales label');
      const rows = [...sales.querySelectorAll('a.ccard-line')];
      const want = [['tel:09123520415', '0912 352 0415'], ['tel:09127473187', '0912 747 3187']];
      if (rows.length !== 2) fails.push('sales rows: ' + rows.length);
      rows.forEach((a, i) => {
        if (a.getAttribute('href') !== want[i][0] || a.querySelector('.ccard-number').textContent !== want[i][1]) fails.push('sales row ' + (i + 1));
        if (a.getBoundingClientRect().height < 44) fails.push('sales row too low to tap');
        hits(a, '.ccard-number, .ccard-go-sm');
        // each number is its own inner card: border, rounded corners, a background,
        // inside the group's card, with its call button and number inside it
        const cs = getComputedStyle(a);
        const b = R(a);
        if (parseFloat(cs.borderTopWidth) < 1 || parseFloat(cs.borderTopLeftRadius) < 10 || cs.backgroundImage === 'none') fails.push('sales row ' + (i + 1) + ' is not a card');
        const m = R(sales);
        if (b.left < m.left + 4 || b.right > m.right - 4 || b.bottom > m.bottom - 4) fails.push('inner card ' + (i + 1) + ' leaves the group card');
        for (const part of a.querySelectorAll('.ccard-number, .ccard-go-sm')) {
          const p = R(part);
          if (p.left < b.left + 1 || p.right > b.right - 1 || p.top < b.top || p.bottom > b.bottom) fails.push('inner card ' + (i + 1) + ': ' + part.className + ' outside it');
        }
        const n = a.querySelector('.ccard-number');
        if (n.scrollWidth > n.clientWidth + 1) fails.push('inner card ' + (i + 1) + ': number overflows');
      });
      if (rows.length === 2) {
        const gap = R(rows[1]).top - R(rows[0]).bottom;
        if (gap < 6 || gap > 14) fails.push('gap between inner cards ' + gap.toFixed(1));
        if (Math.abs(R(rows[0]).width - R(rows[1]).width) > 0.5) fails.push('inner cards differ in width');
        if (Math.abs(R(rows[0]).height - R(rows[1]).height) > 0.5) fails.push('inner cards differ in height');
      }
      if (sales.querySelectorAll('.ccard-icon').length !== 1) fails.push('group phone icon');
      if (office.tagName !== 'A' || office.getAttribute('href') !== 'tel:02533551111' || office.querySelector('.ccard-label').textContent !== 'دفتر مرکزی' || office.querySelector('.ccard-number').textContent !== '025 3355 1111') fails.push('office card');
      hits(office, '.ccard-icon, .ccard-number, .ccard-go');
      for (const n of sec.querySelectorAll('.ccard-number')) {
        const cs = getComputedStyle(n);
        if (cs.direction !== 'ltr' || cs.unicodeBidi !== 'isolate') fails.push('number not isolated LTR');
      }
      if (sec.querySelector('[aria-disabled="true"]')) fails.push('an inactive card is left');
      if (addr.querySelector('.ccard-label').textContent !== 'آدرس شعبه مرکزی') fails.push('address title');
      // address: exact text, selectable, copy button with a name
      if (addr.querySelector('.ccard-addr').textContent !== ADDRESS) fails.push('address text');
      const btn = addr.querySelector('button.ccard-copy');
      if (!btn || !btn.getAttribute('aria-label')) fails.push('no labelled copy button');
      if (getComputedStyle(addr.querySelector('.ccard-addr')).userSelect === 'none') fails.push('address not selectable');
      for (const [i, c] of cards.entries()) {
        for (const el of c.querySelectorAll('.ccard-label, .ccard-main')) {
          if (el.scrollWidth > el.clientWidth + 1) fails.push(`card ${i + 1}: text overflows`);
          const e = R(el);
          if (e.left < cr[i].left || e.right > cr[i].right) fails.push(`card ${i + 1}: text leaves the card`);
        }
        if (cr[i].height < 72) fails.push(`card ${i + 1}: too low to tap (${Math.round(cr[i].height)} px)`);
      }
      return {
        layout: side ? 'two columns' : 'one column',
        card: `${Math.round(cr[0].width)}x${Math.round(cr[0].height)}`,
        phone: `${Math.round(ib.width)}x${Math.round(ib.height)}`,
        boundaryY: why.bottom,
        fails,
      };
    }, ADDRESS);
    // copy button: the address lands on the clipboard and a confirmation shows
    await page.locator('.ccard-copy').click();
    await page.waitForTimeout(250);
    const copied = await page.evaluate(async () => ({ clip: await navigator.clipboard.readText().catch(() => ''), status: document.querySelector('.ccard-status').textContent }));
    if (copied.clip !== ADDRESS) r.fails.push('clipboard: ' + copied.clip);
    if (!copied.status) r.fails.push('no copy confirmation');
    // keyboard: Tab reaches the call card and shows a focus ring
    await page.evaluate(() => document.querySelector('.contact-lede').scrollIntoView({ block: 'center' }));
    await page.locator('.ccard-copy').focus();
    await page.keyboard.press('Shift+Tab');
    const focus = await page.evaluate(() => { const a = document.activeElement; return { isCall: a.matches('a.ccard'), outline: getComputedStyle(a).outlineStyle }; });
    if (!focus.isCall || focus.outline === 'none') r.fails.push('keyboard focus on the call card: ' + JSON.stringify(focus));
    // colour step where «چرا سیم‌لند؟» ends (median over the width, curves aside)
    // the boundary where it really is on screen (near the end of the page it cannot be scrolled to the top)
    const by = await page.evaluate((y) => { document.querySelector('.topbar').style.visibility = 'hidden'; scrollTo(0, y - 100); return Math.round(y - scrollY); }, r.boundaryY);
    await page.waitForTimeout(200);
    const strip = await page.screenshot({ clip: { x: 0, y: by - 4, width: w, height: 8 } });
    const tag = `${w}x${h}`;
    fs.writeFileSync(path.join(out, `${tag}-seam.png`), strip);
    const seam = await page.evaluate(async (b64) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height });
      const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
      const mid = Math.floor(img.height / 2);
      const a = g.getImageData(0, mid - 1, img.width, 1).data, b = g.getImageData(0, mid, img.width, 1).data;
      const d = []; for (let i = 0; i < a.length; i += 4) d.push(Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])));
      d.sort((x, y) => x - y); return d[d.length >> 1];
    }, strip.toString('base64'));
    if (seam > 3) r.fails.push('colour step at the join with «چرا سیم‌لند؟»: ' + seam);
    const box = await page.evaluate(() => { const b = document.getElementById('contact').getBoundingClientRect(); return { y: b.top + scrollY, height: b.height }; });
    await page.screenshot({ path: path.join(out, `${tag}-contact.png`), clip: { x: 0, y: box.y, width: w, height: Math.min(box.height, 4000) }, fullPage: true });
    const ok = !r.fails.length && !errors.length;
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${tag}@${dpr} ${r.layout} card ${r.card} phone ${r.phone} copy ✓${copied.status ? '' : '✗'} ${r.fails.concat(errors).join('; ')}`);
    await ctx.close();
  }
  await browser.close();
  process.exitCode = failed ? 1 : 0;
})();
