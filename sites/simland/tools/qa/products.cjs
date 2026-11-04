// node products.cjs <dist/index.html> <outdir>   (VP='[[w,h,dpr],…]' to choose viewports)
// Hero buttons below the picture, and the product grid: columns, rows, equal gaps and
// heights, page order, every cable whole at one size, no clipped or overlapping text.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const [file, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const VP = process.env.VP
  ? JSON.parse(process.env.VP)
  : [[320, 640, 2], [360, 800, 3], [375, 812, 3], [390, 844, 3], [412, 915, 2.625], [430, 932, 3], [768, 1024, 2], [1024, 768, 1], [1180, 820, 2], [1200, 800, 1], [1280, 800, 1], [1366, 768, 1], [1440, 900, 1], [1536, 864, 1.25], [1920, 1080, 1]];
// names in page order (right to left), each matching what its image shows (client's labelled reference)
const ORDER = ['کابل کنترل افشان', 'سیم و کابل ساختمانی', 'کابل آرموردار', 'کابل آسانسوری', 'کابل ابزار دقیق', 'کابل مخابراتی', 'کابل نسوز', 'کابل آلومینیومی', 'کابل سولار', 'کابل جوش'];
// each card's symbol (the icon in the corner and the faint mark behind the cable) and its photo's pixel size
const ICONS = ['gear', 'house', 'shield', 'elevator', 'precision', 'telecom', 'flame', 'conductor', 'sun', 'spark'];
const PHOTOS = { 'کابل آسانسوری': [405, 640], 'کابل مخابراتی': [506, 640], 'کابل سولار': [223, 640] };

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let failed = 0;
  for (const [w, h, dpr] of VP) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(m.type() + ': ' + m.text()));
    await page.goto('file://' + path.resolve(file), { waitUntil: 'load' });
    await page.waitForFunction(() => document.querySelector('[data-scene]').classList.contains('is-live'), null, { timeout: 120000 }).catch(() => errors.push('never went live'));
    await page.evaluate(() => { if (window.__hero) { window.__hero.pause(); window.__hero.renderAt(9); } });
    // lazy images: bring the section into view once so they load, then back to the top
    // bring every card into view once so it makes its entrance, then measure the settled page
    await page.evaluate(async () => {
      document.documentElement.style.scrollBehavior = 'auto';
      // one card at a time, and on to the next only once it has been seen (software WebGL
      // can be so slow that a fast pass skips cards before the browser notices them)
      for (const c of document.querySelectorAll('.pcard')) {
        c.scrollIntoView({ block: 'center' });
        for (let k = 0; k < 100 && document.documentElement.classList.contains('reveal-on') && !c.classList.contains('is-in'); k++) await new Promise((r) => setTimeout(r, 100));
      }
    });
    await page.waitForFunction(() => !document.documentElement.classList.contains('reveal-on') || [...document.querySelectorAll('.pcard')].every((c) => c.classList.contains('is-in') && !c.getAnimations().length), null, { timeout: 40000 }).catch(() => errors.push('cards never settled'));
    await page.waitForFunction(() => [...document.querySelectorAll('.pcard img')].every((i) => i.complete && i.naturalWidth), null, { timeout: 30000 }).catch(() => errors.push('images not loaded'));
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForTimeout(300);
    // coming back into view restarts the hero's loop: stop it again (software WebGL is slow)
    await page.evaluate(() => { if (window.__hero) { window.__hero.pause(); window.__hero.renderAt(9); } });
    const r = await page.evaluate(([ORDER, ICONS, PHOTOS]) => {
      const R = (e) => e.getBoundingClientRect();
      const fails = [];
      const sc = R(document.querySelector('[data-scene]'));
      const act = R(document.querySelector('.hero-actions'));
      const copy = R(document.querySelector('.hero-copy'));
      const side = sc.right <= copy.left + 0.5;
      if (side) {
        if (!(act.left >= sc.right - 0.5)) fails.push('buttons not in the copy column');
        if (!(act.top > sc.top + sc.height / 2)) fails.push('buttons not in the lower half of the hero');
        if (Math.abs(act.bottom - sc.bottom) > 6) fails.push(`buttons end ${Math.round(act.bottom - sc.bottom)} px from the picture foot`);
        if (!(copy.bottom <= act.top)) fails.push('copy overlaps buttons');
      } else {
        if (!(act.top >= sc.bottom - 0.5)) fails.push('buttons not below the picture');
        if (Math.abs(sc.left + sc.width / 2 - innerWidth / 2) > 0.6) fails.push('picture not centred');
      }
      if (document.documentElement.scrollWidth > innerWidth) fails.push('horizontal overflow');
      const btns = [...document.querySelectorAll('.hero-actions .btn')].map(R);
      if (Math.abs(btns[0].top - btns[1].top) > 1 || btns.some((b) => b.left < 0 || b.right > innerWidth)) fails.push('hero buttons not in one row inside the screen');

      const cards = [...document.querySelectorAll('.pcard')];
      const cr = cards.map(R);
      const tops = [...new Set(cr.map((c) => Math.round(c.top)))].sort((a, b) => a - b);
      const rows = tops.map((t) => cr.map((c, i) => [c, i]).filter(([c]) => Math.abs(c.top - t) < 2));
      const cols = Math.max(...rows.map((r) => r.length));
      // visual order: top to bottom, right to left
      const order = cr.map((c, i) => [c, i]).sort((a, b) => Math.round(a[0].top) - Math.round(b[0].top) || b[0].right - a[0].right).map(([, i]) => cards[i].querySelector('.pcard-title').textContent);
      if (order.join() !== ORDER.join()) fails.push('order: ' + order.join(' | '));
      // equal heights within each row, same gaps between columns and rows
      for (const row of rows) {
        const hs = row.map(([c]) => c.height);
        if (Math.max(...hs) - Math.min(...hs) > 1) fails.push('unequal heights in a row');
      }
      const r0 = rows[0].map(([c]) => c).sort((a, b) => b.right - a.right);
      const colGap = r0.length > 1 ? r0[0].left - r0[1].right : null;
      const rowGap = rows.length > 1 ? rows[1][0][0].top - rows[0][0][0].bottom : null;
      if (colGap !== null && rowGap !== null && Math.abs(colGap - rowGap) > 1) fails.push(`gaps differ: ${colGap} / ${rowGap}`);
      // an unfinished last row is centred
      const last = rows[rows.length - 1].map(([c]) => c);
      const grid = R(document.querySelector('.pgrid'));
      if (last.length < cols) {
        const mid = (Math.min(...last.map((c) => c.left)) + Math.max(...last.map((c) => c.right))) / 2;
        if (Math.abs(mid - (grid.left + grid.right) / 2) > 1) fails.push('last row not centred');
      }
      const layout = [];
      const imgH = [];
      cards.forEach((card, i) => {
        const c = cr[i];
        const media = R(card.querySelector('.pcard-media'));
        const el = card.querySelector('.pcard-media img');
        const box = R(el);
        const name = ORDER[i];
        // the picture as drawn (object-fit: contain, bottom centre), not its box
        const k = Math.min(box.width / el.naturalWidth, box.height / el.naturalHeight);
        const pw = el.naturalWidth * k, ph = el.naturalHeight * k;
        const img = { left: box.left + (box.width - pw) / 2, right: box.left + (box.width + pw) / 2, top: box.bottom - ph, bottom: box.bottom, width: pw, height: ph };
        if (!el.complete || !el.naturalWidth) fails.push(name + ': photo not loaded');
        const s = parseFloat(getComputedStyle(el).getPropertyValue('--s')) || 1;
        // one height for all (÷ the photo's own weight), unless the 92% width cap had to fit a very wide one
        const capped = box.width < el.naturalWidth * (box.height / el.naturalHeight) - 0.5;
        imgH.push(capped ? null : +(ph / s).toFixed(1));
        if (capped && box.width > media.width * 0.92 + 0.5) fails.push(name + ': wider than 92% of its picture');
        const uses = [...card.querySelectorAll('.pcard-mark use, .pcard-icon use')].map((u) => u.getAttribute('href'));
        if (uses.length !== 2 || uses.some((h) => h !== '#p-' + ICONS[i]) || !document.getElementById('p-' + ICONS[i])) fails.push(name + ': symbol ' + uses.join());
        if (PHOTOS[name] && (el.naturalWidth !== PHOTOS[name][0] || el.naturalHeight !== PHOTOS[name][1])) fails.push(name + ': not its new photo ' + el.naturalWidth + 'x' + el.naturalHeight);
        if (img.left < media.left + 2 || img.right > media.right - 2) fails.push(name + ': cable cut at the side');
        if (img.top < media.top + 2) fails.push(name + ': cable top cut');
        const visible = (Math.min(img.bottom, media.bottom) - img.top) / img.height;
        if (visible < 0.85) fails.push(name + `: only ${Math.round(visible * 100)}% of the cable shows`);
        const t = card.querySelector('.pcard-title');
        const p = card.querySelector('.pcard-text');
        const cta = card.querySelector('.pcard-cta');
        if (t.scrollWidth > t.clientWidth + 1) fails.push(name + ': title overflows');
        if (p.scrollHeight > p.clientHeight + 1) fails.push(name + ': text cut');
        const body = R(card.querySelector('.pcard-body'));
        const ctaR = R(cta);
        if (ctaR.left < c.left || ctaR.right > c.right || ctaR.bottom > c.bottom + 0.5) fails.push(name + ': button outside the card');
        // no text over the picture (stacked: body below the media; side by side: body right of it)
        for (const el of [t, p, cta]) {
          const e = R(el);
          const overlap = Math.min(e.right, img.right) - Math.max(e.left, img.left) > 0.5 && Math.min(e.bottom, Math.min(img.bottom, media.bottom)) - Math.max(e.top, img.top) > 0.5;
          if (overlap) fails.push(name + ': text over the cable');
        }
        if (i === 0) layout.push(getComputedStyle(card.querySelector('.pcard-in')).flexDirection === 'row-reverse' ? 'side-by-side' : 'stacked', Math.round(c.width) + 'x' + Math.round(c.height));
      });
      const hs = imgH.filter((x) => x !== null);
      if (Math.max(...hs) - Math.min(...hs) > 1) fails.push('cables not at one size: ' + imgH.join(','));
      const sec = R(document.getElementById('products'));
      return { cols, rows: rows.length, colGap, rowGap, layout, cableH: hs[0], capped: imgH.map((x, i) => (x === null ? ORDER[i] : '')).filter(Boolean), heroToProducts: Math.round(sec.top - Math.max(act.bottom, sc.bottom)), fails };
    }, [ORDER, ICONS, PHOTOS]);
    const tag = `${w}x${h}`;
    // the hero from the first view (a full-page capture resizes the window, which rebuilds the live canvas)
    // software WebGL draws a large 2x hero slowly: give the captures time
    await page.screenshot({ path: path.join(out, `${tag}-hero.png`), timeout: 120000 });
    const sec = await page.locator('#products').boundingBox();
    await page.screenshot({ path: path.join(out, `${tag}-products.png`), clip: { x: 0, y: sec.y, width: w, height: Math.min(sec.height, 2600) }, fullPage: true, timeout: 120000 });
    const ok = !r.fails.length && !errors.length;
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${w}x${h}@${dpr} cols ${r.cols} rows ${r.rows} gap ${r.colGap}/${r.rowGap} card ${r.layout.join(' ')} cable ${r.cableH}px${r.capped.length ? ' (fitted to 92%: ' + r.capped.join(', ') + ')' : ''} hero→products ${r.heroToProducts}px ${r.fails.concat(errors).join('; ')}`);
    await page.close();
  }
  await browser.close();
  process.exitCode = failed ? 1 : 0;
})();
