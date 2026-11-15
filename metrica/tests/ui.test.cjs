// TEST ONLY: the home page in a real browser against the local test server (tests/serve.sh).
// Signs in through the real sign-in panel (code read from the SMS mock), then drives reminders and notifications.
// Run: RUN=/tmp/metrica-run node tests/ui.test.cjs   (screenshots go to $SHOTS, default /tmp/metrica-shots)
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const URL = 'http://127.0.0.1:8080/';
const RUN = process.env.RUN || '/tmp/metrica-run';
const SHOTS = process.env.SHOTS || '/tmp/metrica-shots';
fs.mkdirSync(SHOTS, { recursive: true });
let n = 0;
const ok = (m) => { n++; console.log('  ✓', m); };
const sql = (q) => execFileSync('mysql', ['--default-character-set=utf8mb4', '-N', 'metrica_test', '-e', q]).toString().trim();
const codeFor = (phone) => fs.readFileSync(`${RUN}/mock/sms-codes.log`, 'utf8').trim().split('\n').filter((l) => l.startsWith(phone)).pop().split(' ')[1];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // the 401s of this test's own probes of /home are expected; anything else logged as an error is not
  page.on('console', (m) => { if (m.type() === 'error' && !/status of 401/.test(m.text())) errors.push(m.text()); });
  const auth = page.locator('#mp-auth');

  console.log('guest');
  await page.goto(URL + '#/home', { waitUntil: 'networkidle' });
  await auth.waitFor({ state: 'visible' });
  assert.equal(await page.locator('.hm').getAttribute('data-phase'), 'guest');
  assert.equal(await page.locator('[data-hm-part="user"]').isVisible(), false); ok('guest on «خانه»: sign-in panel opens, dashboard hidden');
  assert.equal(await page.evaluate(() => fetch('api/index.php/home').then((r) => r.status)), 401); ok('the API refuses /home without a session');

  console.log('sign in with OTP');
  const phone = '0912' + String(Date.now()).slice(-7);
  await page.fill('#mp-phone', phone);
  await page.check('#mp-consent');
  await page.click('[data-mp-form="phone"] .mp-cta');
  await page.locator('.mp-step--code:not([hidden])').waitFor();
  const code = codeFor(phone);
  for (const [i, d] of [...code].entries()) await page.locator('.mp-otp__box').nth(i).fill(d);
  await page.locator('.mp-step--profile:not([hidden])').waitFor(); ok('code accepted; new user is asked for a name');
  await page.fill('#mp-first', 'امیرحسین');
  await page.click('[data-mp-form="profile"] .mp-cta');
  await auth.waitFor({ state: 'hidden' });
  await page.locator('.hm[data-phase="user"]:not([data-loading])').waitFor();
  assert.equal(await page.textContent('[data-hm-name]'), 'امیرحسین'); ok('dashboard opens with the real name «سلام امیرحسین، خوش آمدی!»');
  const today = await page.textContent('[data-hm-today]');
  assert.match(today, /^(شنبه|یکشنبه|دوشنبه|سه‌شنبه|چهارشنبه|پنجشنبه|جمعه) [۰-۹]+ \S+ [۰-۹]{4}$/); ok(`Persian date from the clock: «${today}»`);
  for (const k of ['activeProjects']) assert.equal(await page.textContent(`[data-hm-num="${k}"]`), '۰');
  assert.equal(await page.textContent('[data-hm-num="progress"]'), '۰٪');
  for (const k of ['totalCost', 'income', 'cost', 'profit']) assert.equal(await page.textContent(`[data-hm-money="${k}"]`), '۰');
  assert.equal(await page.locator('[data-hm-projects] li').count(), 0);
  assert.ok(await page.locator('[data-hm-projects-empty]').isVisible()); ok('every figure is ۰, no project cards, empty state shown');
  assert.equal(await page.locator('[data-hm-dot]').isVisible(), false); ok('no unread notification → no yellow dot');
  await page.click('[data-hm-bell]');
  assert.ok(await page.locator('[data-hm-notes-empty]').isVisible());
  assert.match(await page.textContent('#hm-pop'), /فعلاً اعلان جدیدی ندارید\./); ok('bell opens the panel with «فعلاً اعلان جدیدی ندارید.»');
  await page.keyboard.press('Escape');
  await page.screenshot({ path: `${SHOTS}/ui-1-empty.png`, fullPage: true });

  console.log('reminders');
  assert.ok(await page.locator('[data-hm-rems-empty]').isVisible()); ok('«هنوز یادآوری ثبت نکرده‌اید.» shown');
  const dlg = page.locator('#hm-rem-dlg');
  await page.click('[data-hm-add]');
  await dlg.waitFor({ state: 'visible' });
  await page.click('.hm-save');
  assert.match(await page.textContent('#hm-dlg-msg'), /عنوان یادآوری را وارد کنید/); ok('empty title refused in the form');
  // 30 Esfand of a common year does not exist: the day list must stop at 29
  await page.selectOption('[name="m"]', '12');
  await page.selectOption('[name="y"]', '1406');
  assert.equal(await page.locator('[name="d"] option').count(), 29);
  await page.selectOption('[name="y"]', '1408');
  assert.equal(await page.locator('[name="d"] option').count(), 30); ok('Esfand has 29 days in 1406 and 30 in the leap year 1408');
  await page.fill('[name="title"]', 'پرداخت مرحله دوم پیمانکار');
  await page.fill('[name="project"]', 'مجتمع سپهر');
  await page.selectOption('[name="y"]', '1405'); await page.selectOption('[name="m"]', '11'); await page.selectOption('[name="d"]', '22');
  await page.fill('[name="time"]', '10:00');
  await page.click('.hm-save');
  await dlg.waitFor({ state: 'hidden' });
  const row = sql("SELECT CONCAT(title,'|',project,'|',due_date,'|',IFNULL(due_time,''),'|',color) FROM mt_reminders ORDER BY id DESC LIMIT 1");
  assert.equal(row, 'پرداخت مرحله دوم پیمانکار|مجتمع سپهر|2027-02-11|10:00:00|0'); ok('saved: ۲۲ بهمن ۱۴۰۵ stored as 2027-02-11 10:00, colour blue');
  assert.equal(await page.locator('.hm-rem').count(), 1);
  assert.match(await page.textContent('.hm-rem'), /۲۲ بهمن ۱۴۰۵/); ok('shown at once with its Persian date');
  for (const t of ['بازدید از کارگاه', 'جلسه با مشاور', 'تمدید پروانه', 'پنجمی']) {
    await page.click('[data-hm-add]'); await dlg.waitFor({ state: 'visible' });
    await page.fill('[name="title"]', t); await page.click('.hm-save'); await dlg.waitFor({ state: 'hidden' });
  }
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.hm[data-phase="user"]:not([data-loading])').waitFor();
  assert.equal(await page.textContent('[data-hm-name]'), 'امیرحسین'); ok('reload: session kept, no new code asked');
  assert.equal(await page.locator('.hm-rem').count(), 3);
  await page.click('[data-hm-all]');
  assert.equal(await page.locator('.hm-rem').count(), 5); ok('three shown, «مشاهده همه» shows all five');
  const srcs = await page.$$eval('.hm-rem', (bs) => bs.map((b) => [b.querySelector('.hm-rem__title').textContent, b.querySelector('img').getAttribute('src')]));
  const cal = Object.fromEntries(srcs);
  assert.deepEqual([cal['پرداخت مرحله دوم پیمانکار'], cal['بازدید از کارگاه'], cal['جلسه با مشاور'], cal['تمدید پروانه'], cal['پنجمی']].map((s) => s.slice(11, 15)),
    ['3232', '41ec', '02a9', 'f27e', '3232']); ok('calendar colours by creation: blue, green, orange, red, blue');

  // edit
  await page.locator('.hm-rem', { hasText: 'بازدید از کارگاه' }).click();
  await dlg.waitFor({ state: 'visible' });
  assert.equal(await page.textContent('[data-hm-dlg-title]'), 'ویرایش یادآوری');
  await page.fill('[name="title"]', 'بازدید از کارگاه سپهر');
  await page.click('.hm-save'); await dlg.waitFor({ state: 'hidden' });
  assert.ok(await page.locator('.hm-rem', { hasText: 'بازدید از کارگاه سپهر' }).count()); ok('edit saved');
  // done
  await page.locator('.hm-rem', { hasText: 'جلسه با مشاور' }).click(); await dlg.waitFor({ state: 'visible' });
  await page.click('[data-hm-done]'); await dlg.waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.hm-rem[data-done]', { hasText: 'جلسه با مشاور' }).count(), 1);
  assert.equal(sql("SELECT done FROM mt_reminders WHERE title='جلسه با مشاور'"), '1'); ok('marked done (struck through, stored)');
  // delete: two taps
  await page.locator('.hm-rem', { hasText: 'تمدید پروانه' }).click(); await dlg.waitFor({ state: 'visible' });
  await page.click('[data-hm-delete]');
  assert.equal(await dlg.isVisible(), true);
  assert.equal(await page.textContent('[data-hm-delete] span'), 'تأیید حذف');
  await page.click('[data-hm-delete]'); await dlg.waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.hm-rem', { hasText: 'تمدید پروانه' }).count(), 0);
  assert.equal(sql("SELECT COUNT(*) FROM mt_reminders WHERE title='تمدید پروانه'"), '0'); ok('deleted after the confirming second tap');
  await page.click('[data-hm-add]'); await dlg.waitFor({ state: 'visible' });
  assert.match(await page.getAttribute('[data-hm-dlg-cal]', 'src'), /41ecd61b0871/); ok('the next new reminder previews green (6th created), not the deleted one’s colour');
  await page.keyboard.press('Escape'); await dlg.waitFor({ state: 'hidden' });

  console.log('notifications');
  const uid = sql(`SELECT id FROM mt_users WHERE phone='${phone}'`);
  sql(`INSERT INTO mt_notifications (user_id, title, body, created_at) VALUES (${uid}, 'تست اعلان', 'متن آزمایشی', UTC_TIMESTAMP())`);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.hm[data-phase="user"]:not([data-loading])').waitFor();
  assert.ok(await page.locator('[data-hm-dot]').isVisible()); ok('an unread notification shows the yellow dot');
  await page.click('[data-hm-bell]');
  assert.match(await page.textContent('[data-hm-notes]'), /تست اعلان/);
  await page.waitForFunction(() => document.querySelector('[data-hm-dot]').hidden);
  assert.notEqual(sql(`SELECT read_at FROM mt_notifications WHERE user_id=${uid}`), 'NULL'); ok('opening the panel marks it read and the dot goes');
  sql(`DELETE FROM mt_notifications WHERE user_id=${uid}`);
  await page.keyboard.press('Escape');

  console.log('navigation');
  await page.click('.hm-banner__cta');
  await page.waitForFunction(() => location.hash === '#/features'); ok('«شروع پروژه جدید» opens «امکانات»');
  await page.click('.m-nav__item[data-route="home"]');
  await page.locator('.hm[data-phase="user"]:not([data-loading])').waitFor();
  assert.equal(await auth.isVisible(), false); ok('back to «خانه» through the nav: still signed in, no panel');
  await page.screenshot({ path: `${SHOTS}/ui-2-reminders.png`, fullPage: true });

  console.log('logout');
  await page.click('.m-nav__item[data-route="account"]');
  await page.click('[data-action="logout"]');
  await page.waitForFunction(() => location.hash === '#/features');
  await page.click('.m-nav__item[data-route="home"]');
  await auth.waitFor({ state: 'visible' });
  assert.equal(await page.locator('.hm').getAttribute('data-phase'), 'guest');
  assert.equal(await page.evaluate(() => fetch('api/index.php/home').then((r) => r.status)), 401); ok('after logout: «خانه» asks to sign in again and the API refuses');

  assert.deepEqual(errors, []); ok('no script errors in the console');
  await browser.close();
  console.log(`\n${n} checks passed`);
})().catch((e) => { console.error(e); process.exit(1); });
