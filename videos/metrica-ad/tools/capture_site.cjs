// Walk the real METRICA page (desktop and mobile layouts) and save each state as a screenshot.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const SITE = path.resolve(process.argv[2]);
const LOTTIE = path.resolve(process.argv[3]);
const OUT = path.resolve(process.argv[4]);
const DEVICES = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  // 844 px phone screen minus a 47 px status bar strip drawn later
  mobile: { viewport: { width: 390, height: 797 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};
const log = [];
(async () => {
  const browser = await chromium.launch();
  for (const [name, opts] of Object.entries(DEVICES)) {
    const dir = path.join(OUT, name);
    fs.mkdirSync(dir, { recursive: true });
    const ctx = await browser.newContext({ ...opts, locale: 'fa-IR' });
    const page = await ctx.newPage();
    await page.route('**/lottie.min.js', r => r.fulfill({ path: LOTTIE, contentType: 'application/javascript' }));
    await page.goto('file://' + SITE, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(3000);
    let n = 0;
    const snap = async (label, caret = 'hide') => {
      const f = `${String(n++).padStart(3, '0')}_${label}.png`;
      await page.screenshot({ path: path.join(dir, f), caret, animations: 'allow' });
      log.push({ device: name, file: `${name}/${f}`, label });
    };
    await snap('hero');
    // open the demo flow the way a visitor does
    await page.click('.hero .demo-button');
    await page.waitForTimeout(1800);
    await snap('s1_empty');
    const typeField = async (sel, text, label) => {
      await page.click(sel);
      await page.waitForTimeout(250);
      await snap(`${label}_focus`, 'initial');
      let i = 0;
      for (const ch of text) {
        await page.keyboard.type(ch);
        await page.waitForTimeout(90);
        await snap(`${label}_${++i}`, 'initial');
      }
    };
    await typeField('#md-input-2', 'شمالی', 's1_land');
    await typeField('#md-input-3', 'مسکونی', 's1_type');
    await typeField('#md-input-0', '۵۰۰', 's1_area');
    await page.fill('#md-input-1', '۱۲۰۰۰۰');
    await page.locator('#md-input-1').blur();
    await page.waitForTimeout(300);
    await snap('s1_filled');
    await page.click('.md-next');
    await page.waitForTimeout(1800);
    await snap('s2_empty');
    // scroll through the occupancy rules
    const max = await page.evaluate(() => { const s = document.querySelector('#demo-dialog .md-scroll'); return s.scrollHeight - s.clientHeight; });
    log.push({ device: name, label: 's2_scroll_max', value: max });
    if (max > 8) {
      for (let k = 1; k <= 16; k++) {
        const y = Math.round(max * (0.5 - 0.5 * Math.cos(Math.PI * k / 16)));
        await page.evaluate(y => { document.querySelector('#demo-dialog .md-scroll').scrollTop = y; }, y);
        await page.waitForTimeout(60);
        await snap(`s2_scroll_${k}`);
      }
    }
    for (let i = 4; i <= 13; i++) await page.fill(`#md-input-${i}`, '۶۰');
    await page.click('.md-next');
    await page.waitForTimeout(1800);
    await snap('s3_empty');
    await page.fill('#md-input-14', '۳۰');
    await page.fill('#md-input-15', '۱');
    await page.fill('#md-input-16', '۱');
    await page.locator('#md-input-17').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await typeField('#md-input-17', '۶', 's3_floors');
    await page.fill('#md-input-18', '۴۰');
    await page.locator('#md-input-18').blur();
    await page.waitForTimeout(300);
    await snap('s3_filled');
    await page.click('.md-next');
    await page.waitForTimeout(1800);
    await snap('s4_empty');
    for (let i = 19; i <= 23; i++) await page.fill(`#md-input-${i}`, '1');
    await page.click('.md-next');
    await page.waitForTimeout(1800);
    await snap('s5_empty');
    for (let i = 24; i <= 27; i++) await page.fill(`#md-input-${i}`, '1');
    // put the form back to its untouched look before the button press
    await page.evaluate(() => { for (let i = 24; i <= 27; i++) document.getElementById('md-input-' + i).value = ''; });
    await page.evaluate(() => { const s = document.querySelector('#demo-dialog .md-scroll'); s.scrollTop = 0; });
    await page.waitForTimeout(200);
    await snap('s5_ready');
    for (let i = 24; i <= 27; i++) await page.fill(`#md-input-${i}`, '1');
    await page.click('.md-next');
    await page.waitForTimeout(600);
    // drive the real Lottie loader deterministically
    const total = await page.evaluate(() => { const a = window.lottie.getRegisteredAnimations()[0]; a.pause(); return a.totalFrames; });
    log.push({ device: name, label: 'lottie_total', value: total });
    for (let k = 0; k < 36; k++) {
      await page.evaluate(f => { const a = window.lottie.getRegisteredAnimations()[0]; a.goToAndStop(f, true); }, k * 5);
      await page.waitForTimeout(40);
      await snap(`load_${String(k).padStart(2, '0')}`);
    }
    // subscription plans (real prices are not used in the film)
    await page.evaluate(() => { document.getElementById('demo-dialog').close(); document.body.classList.remove('modal-open'); });
    await page.waitForTimeout(500);
    await page.click('.hero .start-button');
    await page.waitForTimeout(2200);
    await snap('plans');
    await ctx.close();
  }
  fs.writeFileSync(path.join(OUT, 'capture-log.json'), JSON.stringify(log, null, 1));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
