// node resume.cjs <http url of dist/index.html> <outdir>   (VP='[[w,h,dpr],…]')
// Serve dist/ over HTTP first (python3 -m http.server 8770 --bind 127.0.0.1 in dist/).
// The résumé section: its own section right after «چرا سیم‌لند؟» and right before the
// contact; the client's folder image whole, undistorted, never enlarged past its
// pixels; the text exact, nothing clipped or overlapping; the button opens the real
// PDF (served, application/pdf, byte size of the original) in a new tab with
// noopener noreferrer and a descriptive name. The hero's new line: exact text, the
// brand never broken, clear of the title and the picture. No horizontal scroll,
// no console errors.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const [url, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const VP = process.env.VP
  ? JSON.parse(process.env.VP)
  : [[320, 640, 2], [360, 800, 3], [375, 812, 3], [390, 844, 3], [430, 932, 3], [768, 1024, 2], [1024, 768, 2], [1366, 768, 1], [1536, 864, 1.25], [1920, 1080, 1], [2560, 1440, 1]];
const PDF_BYTES = 28724812;
const LEDE = 'کامل‌ترین مجموعه نمایندگی سیم و کابل آرین ابهر در استان قم';

(async () => {
  // the full browser (not the headless shell): it has the built-in PDF viewer, so the new tab really shows the PDF
  const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let failed = 0;
  // the PDF itself, as a visitor's browser gets it
  const ctx0 = await browser.newContext();
  const res = await ctx0.request.get(new URL('assets/docs/simland-catalog.pdf', url).href);
  const body = await res.body();
  const pdfOk = res.status() === 200 && /application\/pdf/.test(res.headers()['content-type'] || '') && body.length === PDF_BYTES && body.subarray(0, 5).toString() === '%PDF-';
  console.log(`PDF ${res.status()} ${res.headers()['content-type']} ${body.length} bytes ${pdfOk ? 'ok' : 'WRONG'}`);
  if (!pdfOk) failed++;
  await ctx0.close();

  for (const [w, h, dpr] of VP) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, hasTouch: w < 1024 });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(m.text().slice(0, 160)));
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => document.querySelector('[data-scene]').classList.contains('is-live'), null, { timeout: 120000 }).catch(() => errors.push('hero never went live'));
    await page.evaluate(() => window.__hero && window.__hero.pause());
    // the hero line, in the first view
    const hero = await page.evaluate((LEDE) => {
      const fails = [];
      const R = (e) => e.getBoundingClientRect();
      const lede = document.querySelector('.hero-lede');
      if (lede.textContent !== LEDE) fails.push('hero line text: ' + lede.textContent);
      const brand = lede.querySelector('.lede-brand');
      if (brand.getClientRects().length !== 1) fails.push('brand broken across lines');
      const lh = parseFloat(getComputedStyle(lede).lineHeight);
      const lines = Math.round(R(lede).height / lh);
      const t = R(document.querySelector('.hero-title'));
      const sc = R(document.querySelector('[data-scene]'));
      const L = R(lede);
      if (L.top < t.bottom - 0.5) fails.push('line overlaps the title');
      const side = sc.right <= L.left + 0.5;
      if (!side && L.bottom > sc.top + 0.5) fails.push('line overlaps the picture');
      if (L.left < 0 || L.right > innerWidth) fails.push('line leaves the screen');
      const cs = getComputedStyle(lede);
      return { lines, size: cs.fontSize, fails };
    }, LEDE);
    // scroll the section into view so it makes its entrance and its image loads
    await page.evaluate(async () => {
      document.documentElement.style.scrollBehavior = 'auto';
      document.getElementById('resume').scrollIntoView({ block: 'center' });
      await new Promise((r) => setTimeout(r, 300));
    });
    await page.waitForFunction(() => { const i = document.querySelector('.resume-folder'); return i.complete && i.naturalWidth; }, null, { timeout: 30000 }).catch(() => errors.push('folder image not loaded'));
    await page.waitForFunction(() => [...document.querySelectorAll('#resume [data-reveal]')].every((e) => !document.documentElement.classList.contains('reveal-on') || (e.classList.contains('is-in') && !e.getAnimations().length)), null, { timeout: 20000 }).catch(() => errors.push('entrance never settled'));
    const r = await page.evaluate(() => {
      const fails = [];
      const R = (e) => { const b = e.getBoundingClientRect(); return { left: b.left, right: b.right, width: b.width, height: b.height, top: b.top + scrollY, bottom: b.bottom + scrollY }; };
      const sec = document.getElementById('resume');
      if (sec.tagName !== 'SECTION' || sec.previousElementSibling.id !== 'why' || sec.nextElementSibling.id !== 'contact') fails.push('not its own section between why and contact');
      const S = R(sec), why = R(document.getElementById('why')), con = R(document.getElementById('contact'));
      if (Math.abs(S.top - why.bottom) > 1 || Math.abs(con.top - S.bottom) > 1) fails.push('sections not adjacent');
      if (document.documentElement.scrollWidth > innerWidth) fails.push('horizontal overflow ' + (document.documentElement.scrollWidth - innerWidth));
      const card = R(sec.querySelector('.resume-card'));
      const img = sec.querySelector('.resume-folder');
      const ib = R(img);
      if (Math.abs(ib.width / ib.height - img.naturalWidth / img.naturalHeight) > 0.01) fails.push('image aspect changed');
      if (ib.width * devicePixelRatio > img.naturalWidth + 1) fails.push(`image enlarged past its pixels (${Math.round(ib.width * devicePixelRatio)} > ${img.naturalWidth})`);
      if (ib.left < card.left - 0.5 || ib.right > card.right + 0.5 || ib.bottom > card.bottom + 0.5) fails.push('image leaves the card');
      if (ib.top < S.top) fails.push('image reaches into «چرا سیم‌لند؟»');
      if (ib.left < 0 || ib.right > innerWidth) fails.push('image cut by the screen');
      const copy = R(sec.querySelector('.resume-copy'));
      const side = ib.right <= copy.left + 0.5;
      if (!side && ib.bottom > copy.top + 0.5) fails.push('image overlaps the text');
      if (side && !(ib.right <= copy.left)) fails.push('image not left of the text');
      const want = { '.resume-tag': 'SIMLAND | معرفی مجموعه', '.resume-title': 'اعتبار ما، پشتوانه انتخاب شما', '.resume-lede': 'آشنایی با سوابق، توانمندی‌ها و مستندات تخصصی مجموعه' };
      for (const [sel, text] of Object.entries(want)) {
        const el = sec.querySelector(sel);
        if (el.textContent.trim() !== text) fails.push(sel + ' text: ' + el.textContent.trim());
        if (el.scrollWidth > el.clientWidth + 1) fails.push(sel + ' overflows');
        const e = R(el);
        if (e.left < card.left || e.right > card.right) fails.push(sel + ' leaves the card');
      }
      const a = sec.querySelector('a.resume-cta');
      const ab = R(a);
      if (a.querySelector('span').textContent !== 'مشاهده رزومه و کاتالوگ') fails.push('button text');
      if (ab.left < card.left || ab.right > card.right || ab.bottom > card.bottom) fails.push('button leaves the card');
      if (a.scrollWidth > a.clientWidth + 1) fails.push('button text clipped');
      if (ab.height < 44) fails.push('button too low to tap');
      const rel = (a.getAttribute('rel') || '').split(/\s+/);
      if (a.target !== '_blank' || !rel.includes('noopener') || !rel.includes('noreferrer')) fails.push('link target/rel');
      if (!/assets\/docs\/simland-catalog\.pdf$/.test(a.href)) fails.push('link href ' + a.href);
      const name = a.textContent.replace(/\s+/g, ' ').trim();
      if (!/PDF/.test(name) || !/زبانه/.test(name)) fails.push('accessible name: ' + name);
      return { layout: side ? 'side by side' : 'stacked', card: `${Math.round(card.width)}x${Math.round(card.height)}`, img: `${Math.round(ib.width)}x${Math.round(ib.height)}`, gapAbove: Math.round(card.top - S.top), fails };
    });
    // the button opens the PDF in a new tab
    const [popup] = await Promise.all([
      page.waitForEvent('popup', { timeout: 15000 }).catch(() => null),
      page.locator('a.resume-cta').click({ modifiers: [] }),
    ]);
    const popUrl = popup ? popup.url() : '';
    if (!popup || !/assets\/docs\/simland-catalog\.pdf$/.test(popUrl)) r.fails.push('no new tab with the PDF: ' + popUrl);
    if (popup) {
      const opener = await popup.evaluate(() => window.opener === null).catch(() => true);
      if (!opener) r.fails.push('new tab can reach its opener');
      await popup.close();
    }
    // section picture, page coordinates
    const box = await page.evaluate(() => { const b = document.getElementById('resume').getBoundingClientRect(); return { y: b.top + scrollY, h: b.height }; });
    await page.screenshot({ path: path.join(out, `${w}x${h}-resume.png`), clip: { x: 0, y: box.y, width: w, height: Math.min(box.h, 3000) }, fullPage: true });
    await page.evaluate(() => { scrollTo(0, 0); });
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__hero && window.__hero.pause());
    await page.screenshot({ path: path.join(out, `${w}x${h}-hero.png`) });
    const fails = hero.fails.concat(r.fails, errors);
    if (fails.length) failed++;
    console.log(`${fails.length ? 'FAIL' : 'PASS'} ${w}x${h}@${dpr} hero line ${hero.lines} lines ${hero.size} | résumé ${r.layout} card ${r.card} folder ${r.img} ${fails.join('; ')}`);
    await ctx.close();
  }
  await browser.close();
  process.exitCode = failed ? 1 : 0;
})();
