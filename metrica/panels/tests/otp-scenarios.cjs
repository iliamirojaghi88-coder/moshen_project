/* METRICA — OTP step 2 scenarios through the real panel, shared by every backend:
     panels.test.cjs  → the Node reference server (panels/server)
     host.test.cjs    → the PHP + MySQL package on Apache (host/)
   A backend adapter gives: label, base (page root URL), apiBase (null = the page's own config),
   outbox [{phone, code}] of SMS sent, shift(seconds) to move server time, prefill(phone, n) for n earlier code requests. */
const settle = (page) => page.waitForTimeout(320);
const isOpen = (page, id) => page.evaluate((i) => document.getElementById(i).open, id);
const text = (page, sel) => page.$eval(sel, (e) => e.textContent.trim());
async function openAuth(page) { await page.click('.m-hdr__login'); await settle(page); }
async function openSub(page) { await page.click('.m-hdr__sub'); await settle(page); }

// a page on the backend under test; advance(s) moves the page clock and the server clock together
async function livePage(browser, srv, { w = 390, h = 844, dsf = 1 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/status of (400|410|429|503)/.test(m.text())) page.errors.push(m.text()); });
  page.on('request', (r) => { const u = new URL(r.url()); if (/\/(auth|subscription)(\/|$)/.test(u.pathname)) srv.calls.push(`${r.method()} ${u.pathname}`); });
  await page.clock.install();
  if (srv.apiBase) await page.addInitScript((b) => { window.METRICA_CONFIG = { apiBase: b }; }, srv.apiBase);
  await page.goto(`${srv.base}/#/features`);
  await page.waitForTimeout(300);
  page.advance = async (s) => { await srv.shift(s); await page.clock.fastForward(s * 1000); await page.waitForTimeout(350); };
  return page;
}
const FAD = '۰۱۲۳۴۵۶۷۸۹';
const faDigits = (s) => String(s).replace(/\d/g, (d) => FAD[d]);
const wrongOf = (c, k = 1) => String((Number(c[0]) + k) % 10) + c.slice(1); // differs from c in the first digit only
const W = {
  wrong: 'کد واردشده صحیح نیست. لطفاً آن را بررسی و اصلاح کنید.',
  blocked: 'تعداد تلاش‌های شما بیش از حد مجاز است. لطفاً تا زمان اعلام‌شده صبر کنید.',
  limit: 'تعداد درخواست‌های کد برای این شماره به سقف مجاز رسیده است.',
  locked: 'تعداد تلاش‌ها برای این کد به حد مجاز رسید؛ کد جدید دریافت کنید.',
  expired: 'کد تأیید منقضی شده است؛ کد جدید دریافت کنید.',
};
async function askCode(page, phone) {
  await openAuth(page);
  await page.fill('#mp-phone', phone);
  if (!(await page.isChecked('#mp-consent'))) await page.check('#mp-consent');
  await page.click('[data-mp-form="phone"] .mp-cta');
  await page.waitForTimeout(400);
}
async function typeCode(page, c) { await page.click('.mp-otp__box >> nth=0'); await page.keyboard.type(c); await page.waitForTimeout(400); }
async function setDigit(page, i, d) { await page.click(`.mp-otp__box >> nth=${i}`); await page.keyboard.type(d); await page.waitForTimeout(150); }
// force: Playwright waits for aria-disabled controls to become enabled; the point here is to click them while locked
const verifyBtn = async (page) => { await page.click('[data-mp-form="code"] .mp-cta', { force: true }); await page.waitForTimeout(400); };
const resend = async (page) => { await page.click('[data-mp-resend]', { force: true }); await page.waitForTimeout(400); };
const boxValues = (page) => page.$$eval('.mp-otp__box', (b) => b.map((x) => x.value).join(''));
const secsLeft = async (page) => { const [m, s] = (await text(page, '.mp-timer__t b')).replace(/[۰-۹]/g, (c) => FAD.indexOf(c)).split(':'); return +m * 60 + +s; };
const attr = (page, sel, a) => page.getAttribute(sel, a);

async function run(browser, srv, { ok, SHOTS = null }) {
  srv.calls = [];
  srv.code = (phone) => [...srv.outbox].reverse().find((m) => m.phone === phone).code;
  srv.count = (p) => srv.calls.filter((c) => c.endsWith(p)).length;
  console.log(`5. OTP step 2 end to end, against the ${srv.label}`);
  {
    console.log('  5a. correct code, timer 02:00, resend locked for the whole 2 minutes');
    srv.calls.length = 0;
    const page = await livePage(browser, srv);
    await askCode(page, '09121110001');
    ok(await page.$eval('#mp-auth', (e) => e.dataset.step) === 'code', 'code step after the server sent the code');
    ok((await text(page, '.mp-timer__t b')) === '۰۲:۰۰', 'timer starts at 02:00', await text(page, '.mp-timer__t b'));
    ok((await text(page, '[data-mp-num]')) === '۰۹۱۲ ۱۱۱ ۰۰۰۱', 'number shown');
    ok(await attr(page, '[data-mp-resend]', 'aria-disabled') === 'true', 'resend locked at start');
    ok(await page.evaluate(() => document.activeElement === document.querySelector('.mp-otp__box')), 'first box focused, ready to type');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/10-code-step-02-00-390.png` });
    await page.advance(100);
    ok(await attr(page, '[data-mp-resend]', 'aria-disabled') === 'true' && (await secsLeft(page)) === 20, 'resend still locked at 01:40 → 00:20', await secsLeft(page));
    await resend(page);
    ok(srv.count('/auth/otp/request') === 1, 'a click on the locked resend sends nothing', srv.calls);
    await page.click('.mp-otp__box >> nth=0');
    await page.keyboard.type(srv.code('09121110001'));
    await page.waitForTimeout(450);
    ok(srv.count('/auth/otp/verify') === 1, 'four digits are verified automatically, once');
    ok(await page.$eval('#mp-auth', (e) => e.dataset.step) === 'profile', 'new user: name step');
    await page.fill('#mp-first', 'سارا'); await page.fill('#mp-last', 'محمدی');
    await page.click('[data-mp-form="profile"] .mp-cta'); await settle(page);
    ok(!(await isOpen(page, 'mp-auth')) && await page.evaluate(() => window.Metrica.user.name) === 'سارا محمدی', 'signed in by the server');
    ok(await page.evaluate(() => !document.cookie && !Object.keys(localStorage).concat(Object.keys(sessionStorage)).some((k) => /otp|code|phone|session|token/i.test(k))), 'nothing readable stored in the browser (HttpOnly cookie only)');
    ok(page.errors.length === 0, 'no errors (5a)', page.errors);
    await page.context().close();
  }
  {
    console.log('  5b. wrong code: digits kept, red, corrected by the user, no auto-loop');
    srv.calls.length = 0;
    const page = await livePage(browser, srv);
    const phone = '09121110002';
    await askCode(page, phone);
    const c = srv.code(phone), w = wrongOf(c);
    await typeCode(page, w);
    ok(srv.count('/auth/otp/verify') === 1, 'wrong code sent once');
    ok((await text(page, '#mp-code-msg')) === `${W.wrong} تلاش باقی‌مانده: ۴`, 'exact wrong-code message + attempts left', await text(page, '#mp-code-msg'));
    ok((await boxValues(page)) === faDigits(w), 'the four digits stay', await boxValues(page));
    ok(await page.$eval('.mp-otp', (e) => e.hasAttribute('data-invalid')) && await page.$eval('.mp-otp__box', (e) => getComputedStyle(e).boxShadow.includes('224, 86, 107')), 'boxes get a thin red border');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/11-code-wrong-digits-kept-390.png` });
    await verifyBtn(page);
    ok(srv.count('/auth/otp/verify') === 1, 'the same refused code is never sent again (button)');
    ok((await text(page, '#mp-code-msg')).startsWith(W.wrong), 'message repeated instead');
    await setDigit(page, 3, w[3]);
    ok(srv.count('/auth/otp/verify') === 1, 'retyping the same digit sends nothing');
    await page.click('.mp-otp__box >> nth=1'); await page.keyboard.press('Backspace'); await page.waitForTimeout(150);
    ok(!(await page.$eval('.mp-otp', (e) => e.hasAttribute('data-invalid'))) && !(await text(page, '#mp-code-msg')), 'changing a digit clears the error');
    await page.keyboard.type(c[1]); await page.waitForTimeout(300);
    ok(srv.count('/auth/otp/verify') === 1, 'a corrected code waits for the user (no automatic re-check)');
    const selected = await page.evaluate(() => { const b = document.querySelectorAll('.mp-otp__box')[2]; b.click(); return [b.selectionStart, b.selectionEnd, b.value.length]; });
    ok(selected[0] === 0 && selected[1] === selected[2] && selected[2] === 1, 'clicking a box selects its digit for replacing', selected);
    await setDigit(page, 0, c[0]);
    await verifyBtn(page);
    ok(srv.count('/auth/otp/verify') === 2 && await page.$eval('#mp-auth', (e) => e.dataset.step) === 'profile', '«تأیید و ادامه» checks the corrected code → signed in');
    await page.context().close();
  }
  {
    console.log('  5c. reload and panel close keep the clock; expiry; resend');
    srv.calls.length = 0;
    const page = await livePage(browser, srv);
    const phone = '09121110003';
    await askCode(page, phone);
    await page.advance(30);
    await page.keyboard.press('Escape'); await settle(page);
    await openAuth(page);
    ok(await page.$eval('#mp-auth', (e) => e.dataset.step) === 'code' && Math.abs((await secsLeft(page)) - 90) <= 1, 'closing and reopening keeps the countdown', await secsLeft(page));
    await page.reload(); await page.waitForTimeout(500);
    await openAuth(page);
    ok(await page.$eval('#mp-auth', (e) => e.dataset.step) === 'code' && Math.abs((await secsLeft(page)) - 90) <= 1, 'a page reload keeps the countdown (server pending code)', await secsLeft(page));
    ok((await text(page, '[data-mp-num]')) === '۰۹۱۲ ۱۱۱ ۰۰۰۳' && await attr(page, '[data-mp-resend]', 'aria-disabled') === 'true', 'number and locked resend restored');
    await page.click('[data-mp-edit] >> nth=1'); await page.waitForTimeout(200); // «ویرایش»
    await page.click('[data-mp-form="phone"] .mp-cta'); await page.waitForTimeout(400);
    const resumed = await secsLeft(page);
    ok(srv.outbox.filter((m) => m.phone === phone).length === 1 && resumed > 80 && resumed <= 90, 'editing and asking again resumes the same code and clock (no new SMS)', resumed);
    await page.advance(resumed + 1);
    ok((await text(page, '.mp-timer__t b')) === '۰۰:۰۰' && (await text(page, '#mp-code-msg')) === W.expired, 'expired at 00:00', [await text(page, '.mp-timer__t b'), await text(page, '#mp-code-msg'), await page.$eval('#mp-auth', (e) => e.dataset.step), srv.calls.slice(-4)]);
    ok(await attr(page, '.mp-otp__box', 'aria-disabled') === 'true' && await page.$eval('.mp-otp__box', (e) => e.readOnly) && await attr(page, '[data-mp-form="code"] .mp-cta', 'aria-disabled') === 'true', 'an expired code cannot be entered or verified');
    const before = srv.count('/auth/otp/verify');
    await verifyBtn(page);
    ok(srv.count('/auth/otp/verify') === before, 'no verify request after expiry');
    ok(await attr(page, '[data-mp-resend]', 'aria-disabled') === 'false', 'resend allowed by the server after 2 minutes');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/12-code-expired-resend-390.png` });
    await resend(page);
    ok(srv.outbox.filter((m) => m.phone === phone).length === 2 && (await text(page, '#mp-code-msg')) === 'کد جدید ارسال شد.' && (await text(page, '.mp-timer__t b')) === '۰۲:۰۰', 'new code, timer back at 02:00');
    ok(await attr(page, '[data-mp-resend]', 'aria-disabled') === 'true' && !(await page.$eval('.mp-otp__box', (e) => e.readOnly)), 'resend locked again, boxes open');
    await typeCode(page, srv.code(phone));
    ok(await page.$eval('#mp-auth', (e) => e.dataset.step) === 'profile', 'the new code works');
    ok(page.errors.length === 0, 'no errors (5c)', page.errors);
    await page.context().close();
  }
  {
    console.log('  5d. 5 wrong per code, 7 wrong per phone in 10 minutes — not lifted by a new code, a reload or another try');
    srv.calls.length = 0;
    const page = await livePage(browser, srv);
    const phone = '09121110004';
    await askCode(page, phone);
    const c1 = srv.code(phone);
    await typeCode(page, wrongOf(c1, 1));
    for (let k = 2; k <= 5; k++) { await setDigit(page, 0, wrongOf(c1, k)[0]); await verifyBtn(page); }
    ok(srv.count('/auth/otp/verify') - 0 >= 5 && (await text(page, '#mp-code-msg')) === W.locked, '5th wrong code locks this code', await text(page, '#mp-code-msg'));
    ok(await attr(page, '.mp-otp__box', 'aria-disabled') === 'true', 'locked code cannot be entered');
    ok(await attr(page, '[data-mp-resend]', 'aria-disabled') === 'true', 'resend still waits for the 2 minutes');
    await page.advance(121);
    await resend(page);
    const c2 = srv.code(phone);
    await typeCode(page, wrongOf(c2, 1));
    ok((await text(page, '#mp-code-msg')) === `${W.wrong} تلاش باقی‌مانده: ۱`, '6th wrong: one try left for this phone', await text(page, '#mp-code-msg'));
    await setDigit(page, 0, wrongOf(c2, 2)[0]); await verifyBtn(page);
    const m = await text(page, '#mp-code-msg'), waitOf = (t) => { const [a, b] = t.slice(-5).replace(/[۰-۹]/g, (x) => FAD.indexOf(x)).split(':'); return +a * 60 + +b; };
    const w0 = waitOf(m);
    ok(m.startsWith(`${W.blocked} زمان مجاز بعدی:`) && w0 > 440 && w0 <= 479, '7th wrong: blocked until the first wrong code leaves the 10-minute window', m);
    ok(await attr(page, '.mp-otp__box', 'aria-disabled') === 'true' && await attr(page, '[data-mp-form="code"] .mp-cta', 'aria-disabled') === 'true', 'verification closed');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/13-code-attempts-blocked-390.png` });
    await page.advance(10);
    const w1 = waitOf(await text(page, '#mp-code-msg'));
    ok(w0 - w1 >= 10 && w0 - w1 <= 12, 'the waiting time counts down', [w0, w1]);
    await page.reload(); await page.waitForTimeout(500);
    await openAuth(page);
    ok((await text(page, '#mp-code-msg')).startsWith(W.blocked) && await attr(page, '.mp-otp__box', 'aria-disabled') === 'true', 'still blocked after a reload');
    await page.click('[data-mp-edit] >> nth=1'); await page.waitForTimeout(200);
    await page.click('[data-mp-form="phone"] .mp-cta'); await page.waitForTimeout(400);
    ok((await text(page, '#mp-phone-msg')).startsWith(`${W.blocked} زمان مجاز بعدی:`) && await page.$eval('#mp-auth', (e) => e.dataset.step) === 'phone', 'a new code request does not lift the block');
    const sent = srv.outbox.filter((x) => x.phone === phone).length;
    await page.advance(w1 + 2);
    ok(!(await text(page, '#mp-phone-msg')), 'the wait message ends with the window');
    await page.click('[data-mp-form="phone"] .mp-cta'); await page.waitForTimeout(400);
    ok(srv.outbox.filter((x) => x.phone === phone).length === sent + 1, 'allowed again after the 10-minute window');
    await typeCode(page, srv.code(phone));
    ok(await page.$eval('#mp-auth', (e) => e.dataset.step) === 'profile', 'and the right code signs in');
    ok(page.errors.length === 0, 'no errors (5d)', page.errors);
    await page.context().close();
  }
  {
    console.log('  5e. 5 code requests per phone in 10 minutes: the 6th is refused with the next allowed time');
    srv.calls.length = 0;
    const phone = '09121110005';
    await srv.prefill(phone, 5); // five codes already sent to this number in the last 10 minutes
    const page = await livePage(browser, srv);
    await askCode(page, phone);
    const m = await text(page, '#mp-phone-msg');
    ok(m.startsWith(`${W.limit} زمان مجاز بعدی:`) && /(۱۰:۰۰|۰۹:۵۹)$/.test(m), '6th request refused, next allowed time shown', m);
    ok(await page.$eval('#mp-auth', (e) => e.dataset.step) === 'phone', 'no code step');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/14-request-limit-390.png` });
    const n = srv.count('/auth/otp/request');
    await page.click('[data-mp-form="phone"] .mp-cta'); await page.waitForTimeout(200);
    ok(srv.count('/auth/otp/request') === n, 'no request while the time runs');
    await page.advance(601);
    await page.click('[data-mp-form="phone"] .mp-cta'); await page.waitForTimeout(400);
    ok(await page.$eval('#mp-auth', (e) => e.dataset.step) === 'code', 'allowed once the window has room');
    ok(page.errors.length === 0, 'no errors (5e)', page.errors);
    await page.context().close();
  }

  console.log(`6. buying while signed out continues after sign-in (${srv.label})`);
  {
    const page = await livePage(browser, srv);
    await openSub(page);
    await page.click('[data-mp-plan="max"]'); await settle(page);
    ok((await text(page, '[data-mp-plan-name]')) === 'MAX', 'MAX carried into sign-in');
    await page.fill('#mp-phone', '۰۹۱۲۱۱۱۰۰۰۶'); await page.check('#mp-consent');
    await page.click('[data-mp-form="phone"] .mp-cta'); await page.waitForTimeout(400);
    await typeCode(page, srv.code('09121110006'));
    await page.fill('#mp-first', 'علی'); await page.fill('#mp-last', 'رضایی');
    await page.click('[data-mp-form="profile"] .mp-cta'); await page.waitForTimeout(500);
    ok(await isOpen(page, 'mp-sub') && !(await isOpen(page, 'mp-auth')), 'subscription panel back after sign-in');
    ok(srv.count('/subscription/checkout') === 1, 'checkout requested');
    ok((await text(page, '[data-mp-sub-msg]')) === 'پرداخت آنلاین پس از اتصال درگاه پرداخت در دسترس خواهد بود.', 'payment-not-connected notice');
    ok(await page.evaluate(() => location.hash) === '#/features', 'no fake payment, page did not move');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/07-subscription-payment-not-connected-390.png` });
    await page.context().close();
  }
}

module.exports = { run, livePage };
