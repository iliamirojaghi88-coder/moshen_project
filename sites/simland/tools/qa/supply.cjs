// node supply.cjs <dist/index.html>   (VP='[[w,h,dpr],…]')
// «در انتظار تأمین»: a click (tap on touch screens) on کابل نسوز, کابل جوش or کابل آسانسوری shows one small
// note in the middle of the viewport (role=status) for 2 s, then it fades; a click while it shows restarts
// the 2 s; no navigation, no backdrop, the page still scrolls; Enter on the card's button works too;
// the other cards keep their behaviour (a linked card still opens its page).
// Software WebGL makes timers jittery: the hero runs without WebGL here (it is not part of this test).
const { chromium } = require('playwright');
const path = require('path');
const [file] = process.argv.slice(2);
const VP = process.env.VP ? JSON.parse(process.env.VP) : [[320, 640, 2], [375, 812, 3], [390, 844, 3], [768, 1024, 2], [1024, 768, 2], [1440, 900, 1]];
const NAMES = ['کابل آسانسوری', 'کابل نسوز', 'کابل جوش'];
(async () => {
  const browser = await chromium.launch({ args: ['--disable-webgl', '--disable-3d-apis'] });
  let failed = 0;
  for (const [w, h, dpr] of VP) {
    const touch = w < 1024;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, hasTouch: touch });
    const page = await ctx.newPage();
    const fails = [];
    page.on('pageerror', (e) => fails.push('pageerror: ' + e.message));
    page.on('console', (m) => m.type() === 'error' && fails.push(m.text().slice(0, 120)));
    await page.goto('file://' + path.resolve(file), { waitUntil: 'load' });
    const supply = await page.evaluate(() => [...document.querySelectorAll('.pcard[data-supply]')].map((c) => c.querySelector('.pcard-title').textContent));
    if (supply.slice().sort().join() !== NAMES.slice().sort().join()) fails.push('supply cards: ' + supply.join(', '));
    const st = () => page.evaluate(() => {
      const t = document.getElementById('supply-toast');
      const r = t.querySelector('.supply-toast-in').getBoundingClientRect();
      const cs = getComputedStyle(t);
      return { on: t.classList.contains('is-on'), op: +cs.opacity, vis: cs.visibility, text: t.textContent.trim(), cx: r.left + r.width / 2 - innerWidth / 2, cy: r.top + r.height / 2 - innerHeight / 2,
        w: r.width, h: r.height, count: document.querySelectorAll('.supply-toast').length, role: t.getAttribute('role'), live: t.getAttribute('aria-live'), font: getComputedStyle(t.querySelector('.supply-toast-text')).fontFamily.replace(/["']/g, ''),
        hash: location.hash, locked: getComputedStyle(document.documentElement).overflow === 'hidden', y: scrollY };
    });
    for (const name of NAMES) {
      const card = page.locator('.pcard', { has: page.locator('.pcard-title', { hasText: name }) }).first();
      await page.evaluate((n) => [...document.querySelectorAll('.pcard')].find((x) => x.querySelector('.pcard-title').textContent === n).scrollIntoView({ block: 'center' }), name);
      await page.evaluate((n) => { const c = [...document.querySelectorAll('.pcard')].find((x) => x.querySelector('.pcard-title').textContent === n); c.classList.add('is-in'); }, name);
      await page.waitForTimeout(900);
      const box = await card.locator('.pcard-media').boundingBox();
      const hit = async () => (touch ? page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2) : page.mouse.click(box.x + box.width / 2, box.y + box.height / 2));
      const hash0 = await page.evaluate(() => location.hash);
      // 1. a click: shown at once, centred, sized, exact text, one note only, page not locked
      await hit();
      await page.waitForTimeout(300);
      let s = await st();
      if (!s.on || s.op < 0.99 || s.vis !== 'visible' || s.text !== 'در انتظار تأمین') fails.push(name + ': not shown ' + JSON.stringify(s));
      if (Math.abs(s.cx) > 1.5 || Math.abs(s.cy) > 1.5) fails.push(name + ': not centred ' + JSON.stringify([s.cx, s.cy]));
      const [wmin, wmax] = w < 768 ? [220, 260] : [260, 300];
      if (s.w < wmin - 0.5 || s.w > wmax + 0.5 || s.h < 80 || s.h > 100) fails.push(name + `: size ${Math.round(s.w)}x${Math.round(s.h)}`);
      if (s.count !== 1 || s.role !== 'status' || s.live !== 'polite' || !s.font.startsWith('Estedad')) fails.push(name + ': toast markup ' + JSON.stringify(s));
      if (s.hash !== hash0) fails.push(name + ': the click navigated ' + s.hash);
      if (s.locked) fails.push(name + ': page locked');
      // the page still scrolls while it shows, and the note stays in the middle of the viewport
      const y0 = s.y;
      await page.mouse.wheel(0, 200);
      await page.waitForTimeout(250);
      s = await st();
      if (s.y === y0 && y0 < (await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)) - 5) fails.push(name + ': page did not scroll');
      if (Math.abs(s.cy) > 1.5 || !s.on) fails.push(name + ': not centred after scrolling');
      // 2. gone about 2 s after the click
      await page.waitForTimeout(1250); // ≈1.8 s after the click
      s = await st();
      if (!s.on && s.op < 0.5) fails.push(name + ': gone too early');
      await page.waitForTimeout(500); // ≈2.3 s
      s = await st();
      if (s.on || s.op > 0.01 || s.vis !== 'hidden') fails.push(name + ': still shown after 2 s ' + JSON.stringify(s));
      // 3. click again after it closed: shown again; a third click 1.2 s later restarts the 2 s
      await page.evaluate((n) => [...document.querySelectorAll('.pcard')].find((x) => x.querySelector('.pcard-title').textContent === n).scrollIntoView({ block: 'center' }), name);
      await page.waitForTimeout(200);
      const box2 = await card.locator('.pcard-media').boundingBox();
      const under = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e && !!e.closest('.pcard[data-supply]'); }, [box2.x + box2.width / 2, box2.y + box2.height / 2]);
      if (!under) fails.push(name + ': tap point not on the card');
      const hit2 = async () => (touch ? page.touchscreen.tap(box2.x + box2.width / 2, box2.y + box2.height / 2) : page.mouse.click(box2.x + box2.width / 2, box2.y + box2.height / 2));
      await hit2();
      await page.waitForTimeout(1200);
      if (!(await st()).on) fails.push(name + ': not shown again');
      await hit2();
      await page.waitForTimeout(1300); // 2.5 s after the first of the two clicks, 1.3 s after the second
      s = await st();
      if (!s.on || s.op < 0.99) fails.push(name + ': timer not restarted');
      await page.waitForTimeout(1000); // 2.3 s after the second click
      if ((await st()).on) fails.push(name + ': not closed after the restarted 2 s');
      // 4. keyboard (desktop): Enter on the card's button
      if (!touch) {
        await card.locator('.pcard-cta').focus();
        await page.keyboard.press('Enter');
        await page.waitForTimeout(250);
        if (!(await st()).on) fails.push(name + ': Enter did not show it');
        await page.waitForTimeout(2100);
      }
    }
    // 5. a linked card still opens its page
    const linked = page.locator('.pcard.is-linked').first();
    await linked.scrollIntoViewIfNeeded();
    await page.evaluate(() => document.querySelector('.pcard.is-linked').classList.add('is-in'));
    await page.waitForTimeout(800);
    const lb = await linked.locator('.pcard-media').boundingBox();
    if (touch) await page.touchscreen.tap(lb.x + lb.width / 2, lb.y + lb.height / 2); else await page.mouse.click(lb.x + lb.width / 2, lb.y + lb.height / 2);
    await page.waitForTimeout(500);
    const after = await st();
    if (!after.hash.startsWith('#/products/') || after.on) fails.push('linked card: ' + JSON.stringify(after));
    if (fails.length) failed++;
    console.log(`${fails.length ? 'FAIL' : 'PASS'} ${w}x${h}@${dpr} ${fails.join('; ')}`);
    await ctx.close();
  }
  await browser.close();
  process.exitCode = failed ? 1 : 0;
})();
