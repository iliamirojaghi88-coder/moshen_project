/* METRICA mini-panels — browser tests on the built single file (dist/metrica-webapp.html).
     node metrica/panels/tests/panels.test.cjs [--shots]
   Without a backend (the shipped state) nothing may reach the network and the code step must stay closed.
   The server-flow tests point METRICA_CONFIG at a fake HTTPS host that exists only inside this test (page.route);
   the app itself has no test switch. --shots also writes the delivery screenshots to dist/screenshots/. */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { pathToFileURL } = require('url');
const { run: otpScenarios } = require('./otp-scenarios.cjs');

const ROOT = path.resolve(__dirname, '../..');
const URL0 = `file://${ROOT}/dist/metrica-webapp.html`;
const SHOTS = process.argv.includes('--shots') ? path.join(ROOT, 'dist/screenshots') : null;
const API = 'https://api.metrica.test/v1';
let pass = 0, fail = 0;
const ok = (cond, name, extra) => { if (cond) pass++; else { fail++; console.log(`  ✗ ${name}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`); } };

async function newPage(browser, { w = 390, h = 844, dsf = 1, api = null, lang = null, reduced = false, clock = false, server = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  page.errors = [];
  page.net = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text()); });
  page.on('request', (r) => { if (!/^(data|file|blob):/.test(r.url())) page.net.push(r); });
  if (clock) await page.clock.install();
  if (server) page.calls = await fakeServer(page, server);
  await page.addInitScript(([apiBase, l]) => {
    if (apiBase) window.METRICA_CONFIG = { apiBase };
    if (l) localStorage.setItem('metrica.lang', l);
  }, [api, lang]);
  await page.goto(`${URL0}#/features`);
  await page.waitForTimeout(250);
  return page;
}
const settle = (page) => page.waitForTimeout(320);
const isOpen = (page, id) => page.evaluate((i) => document.getElementById(i).open, id);
const text = (page, sel) => page.$eval(sel, (e) => e.textContent.trim());
async function openAuth(page) { await page.click('.m-hdr__login'); await settle(page); }
async function openSub(page) { await page.click('.m-hdr__sub'); await settle(page); }

// fake server: answers by path, records every call (CORS as a real API would answer a credentialed request)
const cors = (req) => ({ 'access-control-allow-origin': req.headers().origin || 'null', 'access-control-allow-credentials': 'true',
  'access-control-allow-headers': 'content-type, x-metrica-client', 'access-control-allow-methods': 'GET, POST' });
function fakeServer(page, handlers) {
  const calls = [];
  return page.route(`${API}/**`, async (route) => {
    const req = route.request(), p = new URL(req.url()).pathname.replace('/v1', '');
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors(req) });
    const body = req.postData() ? JSON.parse(req.postData()) : null;
    calls.push({ p, body, headers: req.headers() });
    const h = handlers[p];
    const [status, json, delay] = h ? (typeof h === 'function' ? h(body, calls) : h) : [404, { error: 'NOT_FOUND' }];
    if (delay) await new Promise((r) => setTimeout(r, delay));
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json), headers: cors(req) });
  }).then(() => calls);
}

/* ---------- reference server (../server): the real OTP rules behind the built page, on http://localhost ---------- */
async function referenceServer() {
  const load = (f) => import(pathToFileURL(path.join(__dirname, '../server', f)).href);
  const { OtpPolicy } = await load('otp-policy.mjs');
  const { createApi } = await load('api.mjs');
  const srv = { label: 'reference server (Node)', apiBase: '/api', offset: 0, outbox: [] };
  srv.policy = new OtpPolicy({ now: () => Date.now() + srv.offset, sms: async (phone, t) => { srv.outbox.push({ phone, code: t.match(/\d{4}/)[0] }); } });
  const api = createApi({ policy: srv.policy });
  const html = fs.readFileSync(path.join(ROOT, 'dist/metrica-webapp.html'));
  srv.http = http.createServer(async (req, res) => {
    if (await api(req, res)) return;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  });
  await new Promise((r) => srv.http.listen(0, '127.0.0.1', r));
  srv.base = `http://localhost:${srv.http.address().port}`;
  srv.shift = async (s) => { srv.offset += s * 1000; };
  srv.prefill = async (phone, n) => { // n codes already sent to and used by this number, from another device
    for (let i = 0; i < n; i++) {
      const r = await srv.policy.request(phone, { ip: '10.0.0.9', device: 'other' });
      await srv.policy.verify(r.body.requestId, srv.outbox[srv.outbox.length - 1].code, { ip: '10.0.0.9', device: 'other' });
    }
  };
  return srv;
}
/* ---------- layout probe: everything inside the open panel stays inside it, nothing is clipped or overlapping ---------- */
async function layout(page, id) {
  return page.evaluate((dlgId) => {
    const d = document.getElementById(dlgId), r = d.getBoundingClientRect(), bad = [];
    const vw = innerWidth, vh = innerHeight;
    if (document.documentElement.scrollWidth > vw) bad.push(`page scrolls sideways (${document.documentElement.scrollWidth} > ${vw})`);
    if (r.left < -0.5 || r.right > vw + 0.5 || r.top < -0.5 || r.bottom > vh + 0.5) bad.push(`panel outside viewport ${JSON.stringify([r.left, r.top, r.right, r.bottom])}`);
    if (d.scrollWidth > d.clientWidth + 1) bad.push(`panel scrolls sideways ${d.scrollWidth}/${d.clientWidth}`);
    const shown = (el) => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
    for (const el of d.querySelectorAll('*')) {
      if (el.closest('svg') && el.tagName !== 'svg' || !shown(el)) continue;
      const b = el.getBoundingClientRect();
      if (b.width && (b.left < r.left - 1 || b.right > r.right + 1)) bad.push(`outside panel: ${el.className || el.tagName} ${b.left.toFixed(0)}–${b.right.toFixed(0)}`);
      if (/^(BUTTON|P|B|SPAN|H2|H3|LABEL|LI)$/.test(el.tagName) && el.textContent.trim() && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).display !== 'inline')
        bad.push(`clipped text: ${el.className || el.tagName} «${el.textContent.trim().slice(0, 30)}» ${el.scrollWidth}/${el.clientWidth}`);
    }
    // pairs that must not overlap
    const pairs = [['.mp-top .mp-close', '.mp-top .mp-brand'], ['.mp-sub__top .mp-close', '.mp-sub__top .mp-brand']];
    d.querySelectorAll('.mp-plan').forEach((_, i) => {
      const s = `.mp-plans > li:nth-child(${i + 1}) `;
      pairs.push([`${s}.mp-pick`, `${s}.mp-price`], [`${s}.mp-plan__info`, `${s}.mp-plan__name`], [`${s}.mp-plan__art`, `${s}.mp-plan__name h3`]);
    });
    pairs.push(['.mp-resend', '.mp-timer__t'], ['.mp-numbox__num', '.mp-edit']);
    for (const [a, b] of pairs) {
      const A = d.querySelector(a), B = d.querySelector(b);
      if (!A || !B || !shown(A) || !shown(B)) continue;
      const x = A.getBoundingClientRect(), y = B.getBoundingClientRect();
      if (x.left < y.right - 1 && y.left < x.right - 1 && x.top < y.bottom - 1 && y.top < x.bottom - 1) bad.push(`overlap: ${a} × ${b}`);
    }
    // images keep their proportions
    for (const img of d.querySelectorAll('img')) {
      if (!shown(img) || !img.naturalWidth) continue;
      const b = img.getBoundingClientRect();
      if (Math.abs(b.width / b.height - img.naturalWidth / img.naturalHeight) > 0.03) bad.push(`stretched image ${img.className}`);
    }
    // touch targets
    for (const el of d.querySelectorAll('button,.mp-consent__box')) {
      if (!shown(el)) continue;
      const b = el.getBoundingClientRect();
      if (Math.min(b.width, b.height) < 20) bad.push(`tiny control ${el.className}`);
    }
    return { bad, scrollable: d.scrollHeight > d.clientHeight + 1, w: Math.round(r.width), h: Math.round(r.height) };
  }, id);
}

(async () => {
  const browser = await chromium.launch();
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

  console.log('1. shipped state: no backend');
  {
    const page = await newPage(browser);
    ok(page.errors.length === 0, 'no errors on load', page.errors);
    const len0 = await page.evaluate(() => history.length);
    await openAuth(page);
    ok(await isOpen(page, 'mp-auth'), 'header «ورود / ثبت‌نام» opens the sign-in panel');
    ok(await page.evaluate(() => document.documentElement.classList.contains('m-lock')), 'page behind is scroll-locked');
    ok(await page.evaluate(() => document.getElementById('mp-auth').contains(document.activeElement)), 'focus moved into the panel');
    ok(await page.evaluate(() => history.length) === len0 + 1, 'opening adds one history entry (Back closes)');
    ok(await page.$eval('[data-step="code"]', (e) => e.hidden), 'code step hidden');

    await page.keyboard.press('Escape'); await settle(page);
    ok(!(await isOpen(page, 'mp-auth')), 'Escape closes');
    ok(await page.evaluate(() => document.activeElement && document.activeElement.matches('.m-hdr__login')), 'focus returns to the opener');
    ok(!(await page.evaluate(() => document.documentElement.classList.contains('m-lock'))), 'scroll lock released');
    ok(await page.evaluate(() => location.hash) === '#/features', 'route unchanged after close');

    await openAuth(page);
    await page.mouse.click(4, 400); await settle(page);
    ok(!(await isOpen(page, 'mp-auth')), 'click outside closes');
    await openAuth(page);
    await page.goBack(); await settle(page);
    ok(!(await isOpen(page, 'mp-auth')), 'browser/phone Back closes');
    ok(await page.evaluate(() => location.hash) === '#/features', 'Back did not leave the page');
    await openAuth(page);
    await page.click('#mp-auth [data-mp-close]'); await settle(page);
    ok(!(await isOpen(page, 'mp-auth')), 'X closes');

    // validation and normalisation
    await openAuth(page);
    const submit = () => page.click('[data-mp-form="phone"] .mp-cta');
    await submit();
    ok((await text(page, '#mp-phone-msg')) === 'شماره موبایل را وارد کنید.', 'empty number message');
    ok(await page.$eval('#mp-phone', (e) => e.getAttribute('aria-invalid') === 'true'), 'aria-invalid on the field');
    await page.fill('#mp-phone', '0912');
    await submit();
    ok((await text(page, '#mp-phone-msg')).startsWith('شماره موبایل معتبر نیست'), 'short number rejected');
    await page.fill('#mp-phone', '08123456789');
    await submit();
    ok((await text(page, '#mp-phone-msg')).startsWith('شماره موبایل معتبر نیست'), 'non-09 number rejected');
    await page.fill('#mp-phone', '');
    await page.type('#mp-phone', '٠٩١٢٣٤٥٦٧٨٩');
    ok((await page.inputValue('#mp-phone')) === '۰۹۱۲ ۳۴۵ ۶۷۸۹', 'Arabic digits normalised and grouped', await page.inputValue('#mp-phone'));
    await page.fill('#mp-phone', ''); await page.type('#mp-phone', '+98 912 345 6789');
    ok((await page.inputValue('#mp-phone')) === '۰۹۱۲ ۳۴۵ ۶۷۸۹', '+98 prefix normalised', await page.inputValue('#mp-phone'));
    await page.fill('#mp-phone', ''); await page.type('#mp-phone', '09123456789123');
    ok((await page.inputValue('#mp-phone')) === '۰۹۱۲ ۳۴۵ ۶۷۸۹', 'capped at 11 digits');
    ok(await page.$eval('#mp-phone', (e) => getComputedStyle(e).direction === 'ltr' && e.inputMode === 'numeric' && e.type === 'tel'), 'number field is LTR, numeric keypad');
    await submit();
    ok((await text(page, '#mp-phone-msg')) === 'برای ادامه، قوانین و حریم خصوصی را بپذیرید.', 'consent required');
    await page.click('[data-mp-doc="terms"]');
    ok(!(await page.isChecked('#mp-consent')), 'terms link does not tick the box');
    ok((await text(page, '#mp-phone-msg')).startsWith('متن قوانین'), 'terms link: not-published notice');
    await page.check('#mp-consent');
    await page.click('[data-mp-form="phone"] .mp-cta', { clickCount: 3, delay: 10 });
    await settle(page);
    ok((await text(page, '#mp-phone-msg')) === 'ارسال کد تأیید پس از فعال‌سازی سرویس پیامک در دسترس خواهد بود.', 'SMS-not-active notice');
    ok(await page.$eval('#mp-phone-msg', (e) => e.dataset.tone) === 'info', 'notice is informational');
    ok(await page.$eval('[data-step="code"]', (e) => e.hidden) && await page.$eval('#mp-auth', (e) => e.dataset.step) === 'phone', 'stays on step 1 (no code step)');
    ok(page.net.length === 0, 'no network request at all', page.net.map((r) => r.url()));
    ok(await page.evaluate(() => !Object.keys(localStorage).some((k) => /phone|otp|token|session/i.test(k)) && !document.cookie), 'nothing stored in the browser');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/04-signin-sms-not-active-390.png` });
    await page.keyboard.press('Escape'); await settle(page);

    // subscription
    await openSub(page);
    ok(await isOpen(page, 'mp-sub'), 'header «خرید اشتراک» opens the subscription panel');
    const subText = await text(page, '#mp-sub');
    ok(['۵۰۰ هزار تومان', '۱ میلیون تومان', '۵ میلیون تومان'].every((p) => subText.includes(p)), 'three exact prices in Toman');
    ok(!/سازمانی|Enterprise|ماهانه|سالانه/i.test(subText), 'no «سازمانی»/Enterprise and no invented billing period');
    ok(await page.$$eval('#mp-sub .mp-plan', (a) => a.map((x) => x.dataset.plan).join()) === 'plus,pro,max', 'plans in order Plus, Pro, MAX');
    const lenSub = await page.evaluate(() => history.length);
    await page.click('[data-mp-plan="pro"]'); await settle(page);
    ok(await isOpen(page, 'mp-auth') && !(await isOpen(page, 'mp-sub')), 'signed out: choosing a plan opens sign-in');
    ok(!(await page.$eval('[data-mp-plan-chip]', (e) => e.hidden)) && (await text(page, '[data-mp-plan-name]')) === 'پرو', 'chosen plan carried into sign-in');
    ok(await page.evaluate(() => history.length) === lenSub, 'panel swap adds no history entry');
    ok(await page.evaluate(() => window.MetricaPanels.selectedPlan) === 'pro', 'selected plan kept in app state');
    await page.goBack(); await settle(page);
    ok(!(await isOpen(page, 'mp-auth')) && await page.evaluate(() => location.hash) === '#/features', 'one Back returns to the page');
    await openSub(page);
    ok(await page.$eval('[data-mp-plan="pro"]', (e) => e.getAttribute('aria-pressed')) === 'true', 'plan still selected on reopen');
    ok(page.net.length === 0, 'still no network request');
    await page.keyboard.press('Escape'); await settle(page);

    // «اطلاعات حساب» while signed out
    await page.evaluate(() => { location.hash = '#/account'; }); await settle(page);
    await page.click('[data-action="account-info"]'); await settle(page);
    ok(await isOpen(page, 'mp-auth'), '«اطلاعات حساب» (signed out) opens sign-in');
    await page.keyboard.press('Escape'); await settle(page);
    ok(page.errors.length === 0, 'no errors', page.errors);
    await page.context().close();
  }

  console.log('2. the rest of the app is unchanged');
  {
    const page = await newPage(browser);
    for (const r of ['#/home', '#/projects', '#/account', '#/account/settings', '#/account/settings/security', '#/features']) {
      await page.evaluate((h) => { location.hash = h; }, r); await settle(page);
      ok(await page.evaluate(() => document.querySelector('#view').children.length > 0), `route ${r} renders`);
    }
    await page.click('[data-mtr-tool="analysis"]').catch(() => page.evaluate(() => { location.hash = '#/features/analysis'; }));
    await page.waitForTimeout(600);
    ok(await page.evaluate(() => location.hash.startsWith('#/features/analysis') && !!document.querySelector('#demo-dialog')), '«آنالیز ساخت» opens', await page.evaluate(() => location.hash));
    ok(await page.evaluate(() => document.body.dataset.chrome) === 'hidden', 'analysis keeps its full-screen layout');
    await page.goBack(); await settle(page);
    ok(await page.evaluate(() => location.hash) === '#/features' && await page.evaluate(() => document.querySelector('.m-nav [aria-current="page"]').dataset.route) === 'features', 'back to «امکانات», nav selector intact');
    await openAuth(page); await page.keyboard.press('Escape'); await settle(page);
    ok(await page.evaluate(() => document.querySelector('.m-nav').style.getPropertyValue('--idx')) === '1', 'bottom nav state untouched by a panel');
    await page.evaluate(() => { window.Metrica.setUser({ plan: 'max' }); location.hash = '#/account'; }); await settle(page);
    ok(await page.$eval('.acc-plan', (e) => e.dataset.plan === 'max' && e.textContent.includes('MAX')), 'account page shows a MAX plan');
    ok(page.errors.length === 0, 'no errors across routes', page.errors);
    await page.context().close();
  }

  console.log('3. reduced motion');
  {
    const page = await newPage(browser, { reduced: true });
    await page.click('.m-hdr__login'); await page.waitForTimeout(30);
    ok(await page.$eval('#mp-auth', (e) => getComputedStyle(e).animationName) === 'none', 'no open animation');
    await page.keyboard.press('Escape'); await page.waitForTimeout(30);
    ok(!(await isOpen(page, 'mp-auth')), 'closes at once');
    await page.context().close();
  }

  console.log('4. http API address is refused');
  {
    const page = await newPage(browser, { api: 'http://api.metrica.test/v1' });
    await openAuth(page);
    await page.fill('#mp-phone', '09123456789'); await page.check('#mp-consent');
    await page.click('[data-mp-form="phone"] .mp-cta'); await settle(page);
    ok(page.net.length === 0 && (await text(page, '#mp-phone-msg')).startsWith('ارسال کد تأیید پس از'), 'plain http never used');
    await page.context().close();
  }

  {
    const srv = await referenceServer();
    await otpScenarios(browser, srv, { ok, SHOTS });
    srv.http.close();
  }

  console.log('7. English (LTR) and Arabic');
  {
    const page = await newPage(browser, { lang: 'en', w: 390, h: 844, dsf: SHOTS ? 2 : 1 });
    await openAuth(page);
    ok((await text(page, '#mp-auth-title')) === 'Sign in' && await page.evaluate(() => document.dir) === 'ltr', 'sign-in panel in English, LTR');
    await page.type('#mp-phone', '۰۹۱۲۳۴۵۶۷۸۹');
    ok((await page.inputValue('#mp-phone')) === '0912 345 6789', 'Latin digits in English');
    ok((await page.getAttribute('#mp-phone', 'placeholder')) === '0912 345 6789', 'placeholder localised');
    ok(!(await layout(page, 'mp-auth')).bad.length, 'English sign-in layout clean', (await layout(page, 'mp-auth')).bad);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/08-english-signin-390.png` });
    await page.keyboard.press('Escape'); await settle(page);
    await openSub(page);
    ok((await text(page, '#mp-sub-title')) === 'METRICA subscription' && (await text(page, '#mp-price-pro')) === '1,000,000 Toman', 'subscription panel in English');
    ok(await page.$eval('#mp-plan-plus', (e) => e.innerText.trim()) === 'Plus', 'plan name shown once in English', await page.$eval('#mp-plan-plus', (e) => e.innerText));
    ok(!(await layout(page, 'mp-sub')).bad.length, 'English subscription layout clean', (await layout(page, 'mp-sub')).bad);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/09-english-subscription-390.png` });
    await page.context().close();
    const ar = await newPage(browser, { lang: 'ar' });
    await openSub(ar);
    ok((await text(ar, '#mp-sub-title')) === 'الاشتراك في متريكا' && (await text(ar, '#mp-price-max')) === '٥ ملايين تومان', 'subscription panel in Arabic');
    ok(!(await layout(ar, 'mp-sub')).bad.length, 'Arabic subscription layout clean', (await layout(ar, 'mp-sub')).bad);
    ok(ar.errors.length === 0, 'no errors (ar)', ar.errors);
    await ar.context().close();
  }

  console.log('8. responsive matrix');
  const sizes = [[320, 568], [320, 480], [360, 740], [375, 667], [390, 844], [390, 560], [430, 932], [600, 960], [768, 1024],
    [1024, 768], [1024, 600], [1440, 900], [1440, 700], [1920, 1080]];
  const keep = new Set(['320x568', '360x740', '390x844', '768x1024', '1024x768', '1440x900', '1920x1080']);
  for (const [w, h] of sizes) {
    const tag = `${w}x${h}`, shoot = SHOTS && keep.has(tag);
    const page = await newPage(browser, { w, h, api: API, dsf: shoot && w <= 1024 ? 2 : 1,
      server: { '/auth/session': [200, { user: null }], '/auth/otp/request': [200, { requestId: 'x', expiresIn: 120, resendIn: 60 }] } });
    await openAuth(page);
    let L = await layout(page, 'mp-auth');
    ok(!L.bad.length, `${tag} sign-in step 1`, L.bad);
    if (shoot) await page.screenshot({ path: `${SHOTS}/signin-${tag}.png` });
    await page.fill('#mp-phone', '09123456789'); await page.check('#mp-consent');
    await page.click('[data-mp-form="phone"] .mp-cta'); await page.waitForTimeout(300);
    L = await layout(page, 'mp-auth');
    ok(!L.bad.length, `${tag} sign-in step 2`, L.bad);
    if (shoot) await page.screenshot({ path: `${SHOTS}/code-${tag}.png` });
    await page.keyboard.press('Escape'); await settle(page);
    await openSub(page);
    L = await layout(page, 'mp-sub');
    ok(!L.bad.length, `${tag} subscription`, L.bad);
    if (shoot) await page.screenshot({ path: `${SHOTS}/subscription-${tag}.png` });
    if (L.scrollable) { // the last card is reachable inside the panel
      await page.$eval('#mp-sub', (d) => { d.scrollTop = d.scrollHeight; });
      ok(await page.$eval('#mp-sub', (d) => { const r = d.getBoundingClientRect(), m = d.querySelector('.mp-plan--max .mp-pick').getBoundingClientRect(); return m.bottom <= r.bottom && m.top >= r.top; }), `${tag} MAX button reachable by inner scroll`);
    }
    ok(page.errors.length === 0, `${tag} no errors`, page.errors);
    await page.context().close();
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
