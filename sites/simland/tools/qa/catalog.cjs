// node catalog.cjs <dist/index.html> <outdir>   (VP='[[w,h,dpr],…]', CAT='armored,instrumentation')
// The catalogue pages and the contact panel, as a visitor uses them (mouse or touch),
// for every category: the home card opens its page; the grid (2 / 3 / 4 columns); the
// card (whole photo, name, full-width «استعلام قیمت»); the product page and its exact
// texts; the panel from both buttons (three tel: rows, each clickable over its whole
// area, × / Escape / outside closes it, page behind does not scroll, focus returns);
// Back, Forward, Refresh, direct links; the menu and «بازگشت» links back to the home
// page; the live hero after coming back; no horizontal overflow, no console errors.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const [file, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const VP = process.env.VP ? JSON.parse(process.env.VP) : [[320, 640, 2], [360, 780, 3], [375, 812, 3], [390, 844, 3], [430, 932, 3], [768, 1024, 2], [1024, 768, 2], [1280, 800, 1], [1440, 900, 1], [1536, 864, 1.25]];
const URL0 = 'file://' + path.resolve(file);
const TELS = ['tel:09123520415', 'tel:09127473187', 'tel:02533551111'];
const LABELS = ['مشاوره و خرید', 'مشاوره و خرید', 'دفتر مرکزی'];
const NUMBERS = ['0912 352 0415', '0912 747 3187', '025 3355 1111'];
const HINT = 'برای تماس، روی شماره دلخواه ضربه بزنید';
// the client's texts, exactly as given (rendered texts of the product page, in order)
const CATS = {
  armored: {
    title: 'کابل آرموردار',
    product: 'armored-copper-cable',
    name: 'کابل تک رشته و چند رشته مسلح (زره دار)',
    ltr: true,
    texts: ['کابل تک رشته و چند رشته مسلح (زره دار)', 'کدهای فنی', 'N2XRY, NYRY, N2XBY, NYBY', 'کاربرد:',
      'این نوع کابل‌ها در تاسیسات داخل یا خارج ساختمان به صورت نصب ثابت در زیرزمین و در داکت‌ها و فضای باز که نیاز به حفاظت مکانیکی زیادی از کابل وجود دارد به کار می‌روند. در مکان‌هایی که احتمال آتش سوزی وجود دارد برای جلوگیری از آزاد شدن گازهای سمی و گازهای خورنده، از مواد LSZH استفاده می‌شود.',
      'ساختار:', 'Cu/PVC/Bd/SWA/PVC'],
  },
  instrumentation: {
    title: 'کابل ابزار دقیق',
    product: 'instrumentation-armored-cable',
    name: 'کابل ابزار دقیق زره دار',
    ltr: true,
    muted: true, // codes in grey, section titles in the site's blue
    accordion: 'توضیحات',
    texts: ['کابل ابزار دقیق زره دار', 'کدهای فنی', 'REY(ST)Y, REY(ST)YRY', 'کاربرد:',
      'این کابل‌ها در اتاق کنترل دستگاه‌های صنعتی و پست‌های برق به منظور انتقال سیگنال‌های آنالوگ و دیجیتال استفاده می‌شوند.',
      'ساختار:', 'Cu/PVC/ISCR/OSCR/Bd/SWA/PVC', 'توضیحات',
      'این نوع کابل‌ها جهت انتقال اطلاعات مناسب بوده و می‌توانند در اتاق‌های کنترل دستگاه‌های صنعتی و پست‌های برق به کار روند. حفاظ الکترواستاتیکی می‌تواند مدارها را در برابر تداخل الکتریکی محافظت کند. استفاده از ساختار کابل‌های زوجی باعث کاهش همشنوایی می‌شود. این کابل‌ها برای ارتباط مستقیم با منابعی مانند برق شهر که امپدانس پایینی دارند مناسب نیستند.'],
  },
};
const RUN = (process.env.CAT || 'armored,instrumentation').split(',');

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let failed = 0;
  for (const [w, h, dpr] of VP) {
    const touch = w < 1024;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, hasTouch: touch });
    const page = await ctx.newPage();
    const fails = [];
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(m.text().slice(0, 140)));
    const press = async (sel) => (touch ? page.locator(sel).first().tap() : page.locator(sel).first().click());
    const state = () => page.evaluate(() => ({
      hash: location.hash,
      home: !document.getElementById('top').hidden,
      view: [...document.querySelectorAll('.route-view')].filter((v) => !v.hidden).map((v) => v.dataset.route).join(),
      h1: [...document.querySelectorAll('h1')].filter((x) => x.getClientRects().length).map((x) => x.textContent).join('|'),
      title: document.title,
      active: [...document.querySelectorAll('.topnav-item.is-active')].map((a) => a.getAttribute('href')).join(),
      y: Math.round(scrollY),
      overflow: document.documentElement.scrollWidth - innerWidth,
    }));
    await page.goto(URL0, { waitUntil: 'load' });
    await page.waitForFunction(() => document.querySelector('[data-scene]').classList.contains('is-live'), null, { timeout: 120000 }).catch(() => fails.push('hero never went live'));
    await page.evaluate(() => window.__hero && window.__hero.pause());
    const sums = [];
    for (const key of RUN) {
    const C = CATS[key];
    const CAT = '#/products/' + key;
    const PROD = CAT + '/' + C.product;
    const HOMECARD = `.pcard.is-linked:has(a[href="${CAT}"])`;
    const tag = `${w}-${key}`;
    // start from the home page (its address without a hash), the hero live
    if ((await state()).view) await page.goto(URL0, { waitUntil: 'load' });
    else await page.evaluate(() => history.pushState(null, '', location.pathname + location.search));
    await page.waitForFunction(() => document.querySelector('[data-scene]').classList.contains('is-live'), null, { timeout: 120000 }).catch(() => fails.push(key + ': hero not live'));

    // 1. the home card opens the category page (a tap/click on the card itself, not only its link)
    await page.evaluate(async (sel) => {
      document.documentElement.style.scrollBehavior = 'auto';
      const c = document.querySelector(sel);
      c.scrollIntoView({ block: 'center' });
      for (let k = 0; k < 100 && !c.classList.contains('is-in'); k++) await new Promise((r) => setTimeout(r, 100));
      await new Promise((r) => setTimeout(r, 1200));
      document.documentElement.style.scrollBehavior = '';
    }, HOMECARD);
    const cardBox = await page.locator(HOMECARD + ' .pcard-media').boundingBox();
    const homeY = await page.evaluate(() => scrollY);
    if (touch) await page.touchscreen.tap(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
    else await page.mouse.click(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
    await page.waitForTimeout(400);
    let s = await state();
    if (s.hash !== CAT || s.home || s.view !== CAT.slice(1)) fails.push('home card did not open the category: ' + JSON.stringify(s));
    if (s.h1 !== C.title || !s.title.startsWith(C.title)) fails.push('category title ' + s.h1 + ' / ' + s.title);
    if (s.active !== '#products') fails.push('menu active ' + s.active);
    if (s.y > 2) fails.push('category not at the top: ' + s.y);

    // 2. the grid and the card
    await page.waitForFunction(() => { const i = document.querySelector('.rv-category:not([hidden]) .acard-img'); return i && i.complete && i.naturalWidth; }, null, { timeout: 15000 }).catch(() => fails.push('card photo not loaded'));
    const g = await page.evaluate(() => {
      const R = (e) => e.getBoundingClientRect();
      const grid = document.querySelector('.rv-category:not([hidden]) .agrid');
      const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
      const wrap = R(document.querySelector('.rv-category:not([hidden]) .agrid-wrap')).width;
      const cards = grid.querySelectorAll('.acard');
      const card = R(cards[0].querySelector('.acard-in'));
      const media = R(cards[0].querySelector('.acard-media'));
      const img = cards[0].querySelector('.acard-img');
      const ib = R(img);
      const title = cards[0].querySelector('.acard-title');
      const tb = R(title);
      const btn = cards[0].querySelector('.acard-inquiry');
      const bb = R(btn);
      return {
        cols, wrap, n: cards.length, card: [Math.round(card.width), Math.round(card.height)], fit: getComputedStyle(img).objectFit,
        imgInside: ib.left >= media.left - 0.5 && ib.right <= media.right + 0.5 && ib.top >= media.top - 0.5 && ib.bottom <= media.bottom + 0.5,
        titleText: title.textContent, titleClear: tb.top >= media.bottom - 0.5 && tb.bottom <= bb.top + 0.5, titleOverflow: title.scrollWidth > title.clientWidth + 1,
        btnFull: Math.abs(bb.left - card.left) <= 1.5 && Math.abs(bb.right - card.right) <= 1.5 && Math.abs(bb.bottom - card.bottom) <= 1.5,
        btnTall: bb.height, btnText: btn.textContent.trim(), btnBigger: parseFloat(getComputedStyle(btn).fontSize) >= parseFloat(getComputedStyle(title).fontSize),
        btnInLink: !!btn.closest('a'),
      };
    });
    const wantCols = g.wrap < 560 ? 2 : g.wrap < 900 ? 3 : 4;
    if (g.cols !== wantCols) fails.push(`grid ${g.cols} columns (want ${wantCols})`);
    if (w < 600 && g.cols !== 2) fails.push('phone grid not 2 columns');
    if (g.n !== 1) fails.push(g.n + ' cards (one product)');
    if (g.fit !== 'contain' || !g.imgInside) fails.push('card photo not whole in its box');
    if (g.titleText !== C.name || !g.titleClear || g.titleOverflow) fails.push('card title ' + JSON.stringify([g.titleText === C.name, g.titleClear, g.titleOverflow]));
    if (!g.btnFull || g.btnTall < 44 || g.btnText !== 'استعلام قیمت' || !g.btnBigger || g.btnInLink) fails.push('inquiry bar ' + JSON.stringify(g));
    if ((await state()).overflow > 0) fails.push('horizontal overflow on the category page');
    await page.screenshot({ path: path.join(out, `${tag}-category.png`), fullPage: true, timeout: 60000 });

    // 3. the panel from the card's «استعلام قیمت»
    const panelCheck = async (label) => {
      const r = await page.evaluate(() => {
        const d = document.getElementById('contact-panel');
        const rows = [...d.querySelectorAll('a.cpanel-row')];
        const pb = d.getBoundingClientRect();
        const hits = rows.map((a) => {
          const b = a.getBoundingClientRect();
          return [[b.left + b.width / 2, b.top + b.height / 2], [b.left + 8, b.top + b.height / 2], [b.right - 8, b.top + b.height / 2], [b.left + b.width / 2, b.top + 6]]
            .every(([x, y]) => { const e = document.elementFromPoint(x, y); return e && a.contains(e); });
        });
        return {
          open: d.open, hrefs: rows.map((a) => a.getAttribute('href')), labels: rows.map((a) => a.querySelector('.cpanel-label').textContent),
          numbers: rows.map((a) => a.querySelector('.cpanel-number').textContent), numberFits: rows.every((a) => { const n = a.querySelector('.cpanel-number'); return n.scrollWidth <= n.clientWidth + 1; }),
          hits, title: d.querySelector('.cpanel-title').textContent, hint: d.querySelector('.cpanel-hint').textContent, address: /آدرس|خیابان/.test(d.textContent),
          box: { left: pb.left, right: innerWidth - pb.right, bottom: innerHeight - pb.bottom, top: pb.top, width: pb.width },
          locked: document.documentElement.classList.contains('panel-open') && getComputedStyle(document.documentElement).overflow === 'hidden',
          focusInside: d.contains(document.activeElement), hash: location.hash,
        };
      });
      if (!r.open) { fails.push(label + ': panel not open'); return r; }
      if (r.hrefs.join() !== TELS.join() || r.labels.join() !== LABELS.join() || r.numbers.join() !== NUMBERS.join()) fails.push(label + ': rows ' + JSON.stringify([r.hrefs, r.labels, r.numbers]));
      if (!r.hits.every(Boolean)) fails.push(label + ': a row is not clickable over its whole area ' + r.hits);
      if (!r.numberFits) fails.push(label + ': a number does not fit');
      if (r.title !== 'تماس با ما' || r.hint !== HINT || r.address) fails.push(label + ': panel texts');
      if (w < 600 ? (Math.abs(r.box.bottom) > 1 || Math.abs(r.box.width - w) > 1) : (Math.abs(r.box.left - r.box.right) > 2 || r.box.top < 0)) fails.push(label + ': panel position ' + JSON.stringify(r.box));
      if (!r.locked || !r.focusInside) fails.push(label + ': scroll lock / focus ' + JSON.stringify([r.locked, r.focusInside]));
      // the page behind does not move
      const y0 = await page.evaluate(() => scrollY);
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(300);
      if ((await page.evaluate(() => scrollY)) !== y0) fails.push(label + ': page behind scrolled');
      return r;
    };
    const closedOk = async (label, opener) => {
      const r = await page.evaluate((opener) => ({ open: document.getElementById('contact-panel').open, unlocked: !document.documentElement.classList.contains('panel-open'), focusBack: document.activeElement === document.querySelector(opener) }), opener);
      if (r.open || !r.unlocked || !r.focusBack) fails.push(label + ' ' + JSON.stringify(r));
    };
    await press('.rv-category:not([hidden]) .acard-inquiry');
    await page.waitForTimeout(500);
    const p1 = await panelCheck('card «استعلام قیمت»');
    if (p1.hash !== CAT) fails.push('the card button navigated: ' + p1.hash);
    await page.screenshot({ path: path.join(out, `${tag}-panel.png`), timeout: 60000 });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await closedOk('Escape', '.rv-category:not([hidden]) .acard-inquiry');
    // outside the panel
    await press('.rv-category:not([hidden]) .acard-inquiry');
    await page.waitForTimeout(400);
    if (touch) await page.touchscreen.tap(w / 2, 12); else await page.mouse.click(12, 12);
    await page.waitForTimeout(300);
    await closedOk('tap outside', '.rv-category:not([hidden]) .acard-inquiry');
    // the × button
    await press('.rv-category:not([hidden]) .acard-inquiry');
    await page.waitForTimeout(400);
    await press('#contact-panel .cpanel-close');
    await page.waitForTimeout(300);
    await closedOk('×', '.rv-category:not([hidden]) .acard-inquiry');

    // 4. the product page (the card's photo / name)
    await press('.rv-category:not([hidden]) .acard-link');
    await page.waitForTimeout(400);
    s = await state();
    if (s.hash !== PROD || s.h1 !== C.name) fails.push('product page did not open: ' + JSON.stringify(s));
    await page.waitForFunction(() => { const i = document.querySelector('.rv-product:not([hidden]) .pdetail-img'); return i && i.complete && i.naturalWidth; }, null, { timeout: 15000 }).catch(() => fails.push('product photo not loaded'));
    const d = await page.evaluate(() => {
      const v = document.querySelector('.rv-product:not([hidden])');
      const R = (e) => e.getBoundingClientRect();
      const img = v.querySelector('.pdetail-img');
      const ib = R(img), mb = R(v.querySelector('.pdetail-media')), info = R(v.querySelector('.pdetail-info'));
      const ib0 = R(v.querySelector('.pdetail-info'));
      const outside = [...v.querySelectorAll('.pdetail-info *')].filter((e) => { const b = R(e); return b.width && (b.left < ib0.left - 1 || b.right > ib0.right + 1); }).length;
      const big = [...v.querySelectorAll('.pdetail-title, .pdetail-text, .pdetail-structure, .pdetail-codes span, .pdetail-list li')].filter((e) => e.scrollWidth > e.clientWidth + 1).length;
      return {
        // every text of the details, in order, exactly (the button aside)
        texts: [...v.querySelector('.pdetail-info').querySelectorAll('h1, h2, p, li')].map((x) => x.textContent),
        codeColor: getComputedStyle(v.querySelector('.pdetail-codes span')).color, hColor: getComputedStyle(v.querySelector('.pdetail-h')).color,
        codesDir: getComputedStyle(v.querySelector('.pdetail-codes span')).direction, structDir: getComputedStyle(v.querySelector('.pdetail-structure')).direction,
        codesRight: (() => { const a = v.querySelector('.pdetail-codes span').getBoundingClientRect(), b = v.querySelector('.pdetail-info').getBoundingClientRect(); return Math.abs(a.right - b.right) < 1.5; })(),
        rtl: [...v.querySelectorAll('.pdetail-text, .pdetail-list li')].every((x) => getComputedStyle(x).direction === 'rtl' && getComputedStyle(x).textAlign === 'right'),
        fonts: [...v.querySelectorAll('.pdetail-info h1, .pdetail-info h2, .pdetail-info p, .pdetail-info li')].every((x) => getComputedStyle(x).fontFamily.replace(/["']/g, '').startsWith('Estedad')),
        side: ib.right <= info.left + 0.5 || mb.right <= info.left + 0.5, above: mb.bottom <= info.top + 0.5,
        whole: ib.left >= mb.left - 0.5 && ib.right <= mb.right + 0.5 && ib.top >= mb.top - 0.5 && ib.bottom <= mb.bottom + 0.5,
        ratio: Math.abs(ib.width / ib.height - img.naturalWidth / img.naturalHeight) < 0.01, enlarged: ib.height * devicePixelRatio > img.naturalHeight + 1,
        big, outside, wide: R(v.querySelector('.rv-wrap')).width,
      };
    });
    if (JSON.stringify(d.texts) !== JSON.stringify(C.texts)) fails.push('product texts differ: ' + JSON.stringify(d.texts).slice(0, 300));
    if (d.outside) fails.push(d.outside + ' elements stick out of the details column');
    const lines = await page.evaluate(() => [...document.querySelectorAll('.rv-product:not([hidden]) .pdetail-structure, .rv-product:not([hidden]) .pdetail-codes span')].map((e) => { const r = document.createRange(); r.selectNodeContents(e); return new Set([...r.getClientRects()].filter((x) => x.width).map((x) => Math.round(x.top / 4))).size === 1; }));
    if (!lines.every(Boolean)) fails.push('a code line wraps ' + lines);
    const rgb = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number);
    const [cr, cg, cb] = rgb(d.codeColor);
    if (C.muted ? Math.max(cr, cg, cb) - Math.min(cr, cg, cb) > 45 || cr < 60 : cb - cr < 100) fails.push('codes colour ' + d.codeColor);
    if (C.muted && d.hColor !== 'rgb(8, 120, 249)') fails.push('section title colour ' + d.hColor);
    if (!C.muted && d.hColor !== 'rgb(7, 28, 75)') fails.push('armored section title colour changed ' + d.hColor);
    if (d.codesDir !== 'ltr' || d.structDir !== 'ltr' || !d.codesRight || !d.rtl || !d.fonts) fails.push('direction / alignment / font ' + JSON.stringify([d.codesDir, d.structDir, d.codesRight, d.rtl, d.fonts]));
    if (d.wide >= 860 ? !d.side : !d.above) fails.push('product layout ' + JSON.stringify({ side: d.side, above: d.above, wide: d.wide }));
    if (!d.whole || !d.ratio || d.enlarged) fails.push('product photo ' + JSON.stringify(d));
    if (d.big) fails.push(d.big + ' texts overflow on the product page');
    if ((await state()).overflow > 0) fails.push('horizontal overflow on the product page');
    // the accordion: closed at first, slides open (height in between), text readable, closes again
    if (C.accordion) {
      const acc = '.rv-product:not([hidden]) details.pdetail-acc';
      const st = () => page.evaluate((sel) => { const a = document.querySelector(sel); const b = a.querySelector('.pdetail-acc-body'); const t = a.querySelector('.pdetail-text'); const r = t.getBoundingClientRect(); return { open: a.open, cls: a.classList.contains('is-open'), h: Math.round(b.getBoundingClientRect().height), full: b.scrollHeight, shown: !!t.getClientRects().length && r.height > 20, title: a.querySelector('summary').textContent.trim() }; }, acc);
      let a0 = await st();
      if (a0.open || a0.cls || a0.title !== C.accordion) fails.push('accordion not closed at first ' + JSON.stringify(a0));
      await page.locator(acc + ' summary').scrollIntoViewIfNeeded();
      await press(acc + ' summary');
      await page.waitForTimeout(120);
      const mid = await st();
      await page.waitForTimeout(600);
      const a1 = await st();
      if (!a1.open || !a1.cls || !a1.shown || Math.abs(a1.h - a1.full) > 1) fails.push('accordion did not open ' + JSON.stringify(a1));
      if (!(mid.h > 0 && mid.h < a1.full - 2)) fails.push('accordion opened without sliding ' + JSON.stringify(mid));
      if ((await state()).overflow > 0) fails.push('horizontal overflow with the accordion open');
      await page.screenshot({ path: path.join(out, `${tag}-product-open.png`), fullPage: true, timeout: 60000 });
      await press(acc + ' summary');
      await page.waitForTimeout(120);
      const mid2 = await st();
      await page.waitForTimeout(600);
      const a2 = await st();
      if (a2.open || a2.cls) fails.push('accordion did not close ' + JSON.stringify(a2));
      if (!(mid2.open && mid2.h > 0 && mid2.h < a1.full - 2)) fails.push('accordion closed without sliding ' + JSON.stringify(mid2));
      if (!touch) {
        await page.focus(acc + ' summary');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(600);
        const k = await st();
        if (!k.open) fails.push('accordion: Enter did not open it');
        await page.keyboard.press(' ');
        await page.waitForTimeout(600);
        if ((await st()).open) fails.push('accordion: Space did not close it');
      }
      await page.evaluate(() => scrollTo(0, 0));
    }
    await page.screenshot({ path: path.join(out, `${tag}-product.png`), fullPage: true, timeout: 60000 });
    await press('.rv-product:not([hidden]) .pdetail-inquiry');
    await page.waitForTimeout(500);
    const p2 = await panelCheck('product «استعلام قیمت»');
    if (p2.hash !== PROD) fails.push('the product button navigated');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await closedOk('Escape (product)', '.rv-product:not([hidden]) .pdetail-inquiry');

    // 5. Back / Forward / Refresh / direct link
    await page.goBack(); await page.waitForTimeout(300);
    s = await state();
    if (s.view !== CAT.slice(1)) fails.push('Back: ' + JSON.stringify(s));
    await page.goBack(); await page.waitForTimeout(500);
    s = await state();
    // back where it was left (a tap may first nudge the focused link fully into view), the card in sight
    const cardSeen = await page.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; }, HOMECARD);
    if (!s.home || s.view || Math.abs(s.y - homeY) > 16 || !cardSeen || s.title.includes(C.title)) fails.push(`Back to home: ${JSON.stringify(s)} (was at ${Math.round(homeY)}, card in view ${cardSeen})`);
    const heroOk = await page.evaluate(() => { const c = document.querySelector('.scene-live'); return document.querySelector('[data-scene]').classList.contains('is-live') && c && c.width > 0; });
    if (!heroOk) fails.push('hero not live after coming back');
    await page.goForward(); await page.waitForTimeout(300);
    await page.goForward(); await page.waitForTimeout(300);
    s = await state();
    if (s.view !== PROD.slice(1)) fails.push('Forward: ' + JSON.stringify(s));
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(600);
    s = await state();
    if (s.view !== PROD.slice(1) || s.h1 !== C.name) fails.push('Refresh: ' + JSON.stringify(s));
    // 6. the menu from a catalogue page, and Back to it
    await press('.topnav-item[href="#contact"]');
    await page.waitForTimeout(800);
    s = await state();
    const contactSeen = await page.evaluate(() => { const r = document.getElementById('contact-title').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; });
    if (!s.home || !contactSeen) fails.push('menu «ارتباط با ما» from the product page: ' + JSON.stringify(s));
    await page.goBack(); await page.waitForTimeout(400);
    if ((await state()).view !== PROD.slice(1)) fails.push('Back after the menu');
    // 7. a direct link to the category, and its «بازگشت به محصولات»
    await page.goto(URL0 + CAT, { waitUntil: 'load' }); await page.waitForTimeout(500);
    s = await state();
    if (s.view !== CAT.slice(1)) fails.push('direct link: ' + JSON.stringify(s));
    await press('.rv-category:not([hidden]) .rv-back');
    await page.waitForTimeout(800);
    s = await state();
    const prodSeen = await page.evaluate(() => { const r = document.getElementById('products-title').getBoundingClientRect(); const bar = document.querySelector('.topbar').getBoundingClientRect(); return r.top >= bar.bottom - 1 && r.bottom <= innerHeight; });
    if (!s.home || !prodSeen) fails.push('«بازگشت به محصولات»: ' + JSON.stringify(s));
    sums.push(`${key}: ${g.cols} cols, card ${g.card.join('x')}, product ${d.side ? 'side by side' : 'stacked'}`);
    }

    const all = fails.concat(errors);
    if (all.length) failed++;
    console.log(`${all.length ? 'FAIL' : 'PASS'} ${w}x${h}@${dpr} ${sums.join(' | ')} ${all.join('; ')}`);
    await ctx.close();
  }
  await browser.close();
  process.exitCode = failed ? 1 : 0;
})();
