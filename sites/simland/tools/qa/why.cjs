// node why.cjs <dist/index.html> <outdir>   (VP='[[w,h,dpr],…]' to choose viewports)
// «چرا سیم‌لند؟»: one column with alternating sides on phones and tablets, four in a
// row on laptops and desktops; every 3D image whole, undistorted and never enlarged
// past its pixels; no clipped or overlapping text; joined cleanly to the products.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const [file, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const VP = process.env.VP
  ? JSON.parse(process.env.VP)
  : [[320, 640, 2], [375, 812, 3], [430, 932, 3], [768, 1024, 2], [1024, 768, 2], [1280, 800, 1], [1366, 768, 1], [1536, 864, 1.25], [1920, 1080, 1]];
const TITLES = ['کیفیت تضمینی', 'تنوع کامل محصولات', 'مشاوره تخصصی', 'ارسال سریع و رایگان'];

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let failed = 0;
  for (const [w, h, dpr] of VP) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(m.type() + ': ' + m.text()));
    await page.goto('file://' + path.resolve(file), { waitUntil: 'load' });
    await page.waitForFunction(() => document.querySelector('[data-scene]').classList.contains('is-live'), null, { timeout: 120000 }).catch(() => errors.push('hero never went live'));
    await page.evaluate(() => window.__hero && window.__hero.pause());
    // scroll through the section so the cards reveal and the lazy images load
    await page.evaluate(async () => {
      document.documentElement.style.scrollBehavior = 'auto'; // measure a page that is not still scrolling
      const s = document.getElementById('why');
      for (const c of s.querySelectorAll('.why-card')) { c.scrollIntoView({ block: 'center' }); await new Promise((r) => setTimeout(r, 120)); }
    });
    await page.waitForFunction(() => [...document.querySelectorAll('.why-card img')].every((i) => i.complete && i.naturalWidth), null, { timeout: 30000 }).catch(() => errors.push('images not loaded'));
    await page.waitForFunction(() => !document.documentElement.classList.contains('reveal-on') || [...document.querySelectorAll('.why-card')].every((c) => c.classList.contains('is-in') && !c.getAnimations().length), null, { timeout: 15000 }).catch(() => errors.push('cards never settled'));
    await page.waitForTimeout(1200); // entrance finished
    const r = await page.evaluate((TITLES) => {
      // document coordinates, so a scroll in between cannot skew a comparison
      const R = (e) => { const b = e.getBoundingClientRect(); return { left: b.left, right: b.right, width: b.width, height: b.height, top: b.top + scrollY, bottom: b.bottom + scrollY }; };
      const fails = [];
      if (document.documentElement.scrollWidth > innerWidth) fails.push('horizontal overflow');
      const cards = [...document.querySelectorAll('.why-card')];
      const cr = cards.map((c) => R(c));
      const tops = [...new Set(cr.map((c) => Math.round(c.top)))];
      const cols = cr.filter((c) => Math.abs(c.top - cr[0].top) < 2).length;
      const titles = cards.map((c) => c.querySelector('.why-name').textContent);
      if (titles.join() !== TITLES.join()) fails.push('titles/order: ' + titles.join(' | '));
      const mode = cols === 4 ? 'row of 4' : cols === 1 ? 'one column' : cols + ' columns';
      const hs = cr.map((c) => c.height);
      if (cols === 4 && Math.max(...hs) - Math.min(...hs) > 1) fails.push('unequal heights in the row');
      const detail = [];
      cards.forEach((card, i) => {
        const c = cr[i];
        const art = R(card.querySelector('.why-art'));
        const body = R(card.querySelector('.why-body'));
        const img = card.querySelector('.why-art img');
        const ib = R(img);
        // the drawn picture inside the img box (object-fit: contain)
        const s = Math.min(ib.width / img.naturalWidth, ib.height / img.naturalHeight);
        const pw = img.naturalWidth * s, ph = img.naturalHeight * s;
        const px = ib.left + (ib.width - pw) / 2, py = ib.top + (ib.height - ph) / 2;
        const name = TITLES[i];
        if (getComputedStyle(img).objectFit !== 'contain') fails.push(name + ': not object-fit contain');
        if (px < c.left - 0.5 || px + pw > c.right + 0.5 || py < c.top - 0.5 || py + ph > c.bottom + 0.5) fails.push(name + ': picture leaves the card');
        if (pw * devicePixelRatio > img.naturalWidth + 1) fails.push(name + ': picture enlarged past its pixels');
        if (pw < 90) fails.push(name + `: picture too small (${Math.round(pw)} px)`);
        if (cols === 1) {
          const artLeft = art.left + art.width / 2 < body.left + body.width / 2;
          if (artLeft !== (i % 2 === 0)) fails.push(name + ': wrong side (' + (artLeft ? 'picture left' : 'picture right') + ')');
        } else if (cols === 4 && !(art.bottom <= body.top + 0.5)) fails.push(name + ': picture not above the text');
        for (const el of card.querySelectorAll('.why-num, .why-name, .why-text')) {
          const e = R(el);
          if (e.left < c.left - 0.5 || e.right > c.right + 0.5 || e.bottom > c.bottom + 0.5) fails.push(name + ': text outside the card');
          if (el.scrollWidth > el.clientWidth + 1) fails.push(name + ': text overflows');
          const ov = Math.min(e.right, px + pw) - Math.max(e.left, px) > 1 && Math.min(e.bottom, py + ph) - Math.max(e.top, py) > 1;
          if (ov && cols === 1) fails.push(name + ': text over the picture');
        }
        detail.push(`${Math.round(c.width)}x${Math.round(c.height)}/img ${Math.round(pw)}`);
      });
      const prod = R(document.getElementById('products'));
      const why = R(document.getElementById('why'));
      const lastCard = [...document.querySelectorAll('.pcard')].map(R).reduce((m, b) => Math.max(m, b.bottom), 0);
      if (Math.abs(why.top - prod.bottom) > 1) fails.push(`sections not adjacent (${Math.round(why.top - prod.bottom)} px)`);
      if (lastCard > why.top) fails.push('why overlaps the product cards');
      const head = R(document.querySelector('.why-head'));
      const curve = R(document.querySelector('.why-curves-top'));
      return { mode, cols, rows: tops.length, detail, gapProductsToWhyTitle: Math.round(R(document.getElementById('why-title')).top - lastCard), curveClearOfHead: curve.bottom <= head.top + 1, fails };
    }, TITLES);
    const tag = `${w}x${h}`;
    // page coordinates (a full-page clip is measured from the top of the document)
    const [sec, prod] = await page.evaluate(() => ['#why', '#products'].map((s) => {
      const b = document.querySelector(s).getBoundingClientRect();
      return { y: b.top + scrollY, height: b.height };
    }));
    // from the last row of products to the end of the section
    const y0 = Math.max(prod.y, prod.y + prod.height - Math.min(420, h));
    await page.screenshot({ path: path.join(out, `${tag}-why.png`), clip: { x: 0, y: y0, width: w, height: Math.min(sec.y + sec.height - y0, 4200) }, fullPage: true });
    const ok = !r.fails.length && !errors.length;
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${tag}@${dpr} ${r.mode} (${r.rows} rows) cards ${r.detail.join(' ')} last product→why title ${r.gapProductsToWhyTitle}px ${r.fails.concat(errors).join('; ')}`);
    await page.close();
  }
  await browser.close();
  process.exitCode = failed ? 1 : 0;
})();
