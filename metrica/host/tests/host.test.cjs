/* METRICA — the hosting package (dist/METRICA_HOST_READY.zip) on a real stack: Apache + mod_php + MariaDB,
   in the DirectAdmin layout domains/<site>/{public_html, metrica_private, database}. Needs root, apache2, mariadb:
     python3 metrica/panels/build.py && python3 metrica/host/build_host.py && node metrica/host/tests/host.test.cjs
   The Faraz SMS gateway is replaced by a local fake (127.0.0.1:18090) only in the "live" phase; it checks the exact request. */
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { run: otpScenarios, livePage } = require('../../panels/tests/otp-scenarios.cjs');

const ROOT = path.resolve(__dirname, '../..');
const ZIP = path.join(ROOT, 'dist/METRICA_HOST_READY.zip');
const TREE = path.join(ROOT, 'dist/host');
const STANDALONE = `file://${ROOT}/dist/index.html`;
const BASE = 'http://localhost:8080';
const SITE = '/srv/da/domains/metrica.test';
const API = `${BASE}/api/index.php`;
let pass = 0, fail = 0;
const ok = (cond, name, extra) => { if (cond) pass++; else { fail++; console.log(`  ✗ ${name}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 600)}` : ''}`); } };
const stack = (mode) => execSync(`bash ${path.join(__dirname, 'local-stack.sh')} ${mode}`, { stdio: 'pipe' });
const sql = (q) => execSync('mysql -N --default-character-set=utf8mb4 metrica_test', { input: q }).toString().trim();
const get = (u, opts = {}) => fetch(u.startsWith('http') ? u : BASE + u, { redirect: 'manual', ...opts });
const post = (p, body, headers = {}) => get(`${API}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Metrica-Client': 'web', ...headers }, body: JSON.stringify(body) });

function fakeFaraz() {
  const f = { requests: [], outbox: [], status: 200 };
  f.server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      let body = null;
      try { body = JSON.parse(raw); } catch (e) { /* recorded as null */ }
      f.requests.push({ method: req.method, url: req.url, headers: req.headers, body });
      if (f.status === 200 && body) f.outbox.push({ phone: body.recipient, code: body.attributes && body.attributes.code });
      res.writeHead(f.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(f.status === 200 ? { status: 'success', code: 200, message: 'sent', data: { message_outbox_ids: [f.requests.length] } } : { status: 'error', code: f.status, message: 'invalid api key' }));
    });
  });
  return new Promise((r) => f.server.listen(18090, '127.0.0.1', () => r(f)));
}

async function browserPage(browser, url, { w = 390, h = 844, reduced = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/status of 503/.test(m.text())) page.errors.push(m.text()); });
  await page.goto(url);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  return page;
}
const pixelDiff = (a, b) => Number(execSync(`python3 -c "
from PIL import Image, ImageChops
a=Image.open('${a}').convert('RGB'); b=Image.open('${b}').convert('RGB')
d=ImageChops.difference(a,b).convert('L').point(lambda v: 255 if v>24 else 0)
print(sum(1 for v in d.getdata() if v) if a.size==b.size else 10**9)"`).toString());

(async () => {
  console.log('H1. the ZIP');
  {
    ok(execSync(`unzip -tq ${ZIP}`).toString().includes('No errors'), 'archive is intact');
    const names = execSync(`unzip -Z1 ${ZIP}`).toString().trim().split('\n');
    const roots = [...new Set(names.map((n) => n.split('/')[0]))].sort();
    ok(JSON.stringify(roots) === JSON.stringify(['README-FA.md', 'database', 'metrica_private', 'public_html']), 'extracts straight into domains/<site>/', roots);
    ok(['public_html/index.html', 'public_html/.htaccess', 'public_html/api/index.php', 'metrica_private/config.php', 'metrica_private/.htaccess', 'database/schema.sql'].every((n) => names.includes(n)), 'all parts present');
    ok(names.filter((n) => n.startsWith('public_html/assets/')).length >= 50 && names.some((n) => /assets\/fonts\/.+\.woff2$/.test(n)), 'assets: css, js, images, Estedad font');
    ok(!names.some((n) => /^public_html\/.*(config\.php|schema\.sql|README|\.md$)/.test(n)), 'nothing private inside public_html');
    const pub = execSync(`grep -rlE "PASTE_YOUR|Api-Key|iranpayamak|APP_SECRET|DB_PASS" ${TREE}/public_html || true`).toString().trim();
    ok(pub === '', 'no key, secret or gateway detail in any public file', pub);
    const cfg = fs.readFileSync(path.join(TREE, 'metrica_private/config.php'), 'utf8');
    ok(cfg.includes('API_KEY = "PASTE_YOUR_API_KEY_HERE"') && cfg.includes('PATTERN_UID = "PASTE_YOUR_PATTERN_UID_HERE"'), 'the two placeholders, exactly as asked');
    ok(cfg.includes('SMS_API_URL = "https://api.iranpayamak.com/ws/v1/sms/pattern"') && cfg.includes('SMS_SENDER = "90008361"') && cfg.includes('SMS_PATTERN_VARIABLE = "code"'), 'gateway URL, sender and pattern variable preset');
    ok(/APP_SECRET = "[0-9a-f]{64}"/.test(cfg), 'a fresh secret generated for this package');
    const lint = execSync(`find ${TREE} -name '*.php' -exec php -l {} \\;`).toString();
    ok(!/Errors parsing|Parse error/.test(lint), 'PHP files parse');
    const hard = execSync(`grep -rlE "metrica\\.test|api\\.metrica|:8080|/srv/|/home/" ${TREE}/public_html || true`).toString().trim();
    const config = fs.readdirSync(path.join(TREE, 'public_html/assets/js')).find((f) => f.startsWith('00-config'));
    ok(hard === '' && /apiBase: 'api\/index\.php'/.test(fs.readFileSync(path.join(TREE, 'public_html/assets/js', config), 'utf8')), 'no test domain or server path hard-coded; the API address is relative', hard);
  }

  console.log('H2. deployed (keys not entered yet): what the web server shows and hides');
  stack('placeholders');
  const faraz = await fakeFaraz();
  {
    const home = await get('/');
    ok(home.status === 200 && /text\/html/.test(home.headers.get('content-type')), 'index.html served');
    const csp = home.headers.get('content-security-policy') || '';
    ok(csp.includes("script-src 'self'") && !csp.includes("script-src 'self' 'unsafe") && home.headers.get('x-frame-options') === 'DENY' && home.headers.get('x-content-type-options') === 'nosniff', 'CSP (no inline script), frame and sniffing protection', csp);
    ok(/no-cache/.test(home.headers.get('cache-control')), 'the page is always revalidated');
    const html = await home.text();
    const css = html.match(/href="(assets\/css\/[^"]+)"/)[1];
    const refs = [...html.matchAll(/(?:src|href)="(assets\/[^"]+)"/g)].map((m) => m[1]);
    const sheet = await (await get(`/${css}`)).text();
    refs.push(...[...sheet.matchAll(/url\("?\.\.\/([^")]+)"?\)/g)].map((m) => `assets/${m[1]}`));
    const bad = [];
    for (const r of [...new Set(refs)]) {
      const res = await get(`/${r}`);
      const type = res.headers.get('content-type') || '';
      const want = { css: 'text/css', js: 'javascript', webp: 'image/webp', png: 'image/png', woff2: 'font/woff2', ttf: 'font/ttf' }[r.split('.').pop()];
      if (res.status !== 200 || !type.includes(want) || !/immutable/.test(res.headers.get('cache-control') || '')) bad.push(`${r} ${res.status} ${type}`);
    }
    ok(refs.length >= 50 && bad.length === 0, `all ${new Set(refs).size} assets load with the right type and a long cache`, bad);
    for (const [p, want] of [['/metrica_private/config.php', [404]], ['/database/schema.sql', [403, 404]], ['/README-FA.md', [403, 404]], ['/schema.sql', [403, 404]], ['/.htaccess', [403]], ['/.user.ini', [403, 404]], ['/assets/', [403]], ['/api/index.php/nope', [404]]]) {
      const st = (await get(p)).status;
      ok(want.includes(st), `${p} → ${want.join(' or ')}`, st);
    }
    const climb = execSync(`curl -s -o /dev/null -w "%{http_code}" --path-as-is ${BASE}/../metrica_private/config.php`).toString();
    ok(climb === '400' || climb === '404', 'no path climbing out of public_html', climb);
    // the private folder, extracted into public_html by mistake, still answers nothing
    execSync(`cp -a ${SITE}/metrica_private ${SITE}/public_html/metrica_private`);
    const leaked = await get('/metrica_private/config.php');
    ok(leaked.status === 403 && (await leaked.text()).indexOf('PASTE_') < 0, 'a misplaced private folder is refused (403)');
    execSync(`rm -rf ${SITE}/public_html/metrica_private`);

    const health = await (await get('/api/index.php/health')).json();
    ok(health.database === 'ok' && health.schema === 'ok' && health.sms === 'not-configured' && health.otp === 'inactive', 'health: database ok, SMS not configured, OTP inactive', health);
    ok((await post('/auth/otp/request', { phone: '09121112233' }, { 'X-Metrica-Client': '' })).status === 403, 'CSRF: POST without the client header refused');
    ok((await post('/auth/otp/request', { phone: '09121112233' }, { Origin: 'https://evil.example' })).status === 403, 'CSRF: POST from another origin refused');
    const r = await post('/auth/otp/request', { phone: '09121112233' }, { Origin: BASE });
    ok(r.status === 503 && (await r.json()).error === 'SERVICE_UNAVAILABLE', 'without real keys: SERVICE_UNAVAILABLE');
    ok(faraz.requests.length === 0 && sql('SELECT COUNT(*) FROM mt_otp_requests') === '0', 'no SMS sent, no code created');
  }

  const browser = await chromium.launch();
  console.log('H3. the page on the host: identical to the approved app, strict CSP, sign-in closed');
  {
    const page = await browserPage(browser, `${BASE}/#/features`);
    for (const r of ['#/home', '#/projects', '#/account', '#/account/settings', '#/features/analysis', '#/features']) {
      await page.evaluate((h) => { location.hash = h; }, r);
      await page.waitForTimeout(700);
      ok(await page.evaluate(() => document.querySelector('#view').children.length > 0), `route ${r} renders`);
    }
    ok(page.errors.length === 0, 'no errors or CSP refusals (analysis animation included)', page.errors);
    await page.click('.m-hdr__login'); await page.waitForTimeout(350);
    await page.fill('#mp-phone', '09121112233'); await page.check('#mp-consent');
    const req = page.waitForResponse((res) => res.url().endsWith('/auth/otp/request'));
    await page.click('[data-mp-form="phone"] .mp-cta');
    ok((await req).status() === 503, 'the panel asks the PHP API, which refuses without keys');
    await page.waitForTimeout(300);
    ok((await page.textContent('#mp-phone-msg')).trim() === 'ارسال کد تأیید پس از فعال‌سازی سرویس پیامک در دسترس خواهد بود.' && await page.$eval('#mp-auth', (e) => e.dataset.step) === 'phone', 'SMS-not-active notice; the code step stays closed');
    ok(faraz.requests.length === 0, 'still no SMS');
    await page.context().close();

    // pixel comparison with the standalone single file (the approved build)
    const views = [['features', null], ['home', null], ['account', null], ['account/settings', null], ['features', '.m-hdr__login'], ['features', '.m-hdr__sub']];
    for (const [w, h] of [[390, 844], [1440, 900]]) {
      for (const [route, panel] of views) {
        const shots = [];
        for (const url of [STANDALONE, BASE + '/']) {
          const p = await browserPage(browser, `${url}#/${route}`, { w, h, reduced: true });
          if (panel) { await p.click(panel); await p.waitForTimeout(400); await p.evaluate(() => document.activeElement && document.activeElement.blur()); }
          const file = `/tmp/claude-0/parity-${shots.length}.png`;
          await p.screenshot({ path: file });
          shots.push(file);
          await p.context().close();
        }
        const d = pixelDiff(shots[0], shots[1]);
        ok(d < 50, `${w}px ${route}${panel ? ` + ${panel}` : ''}: same pixels as the approved single file`, d);
      }
    }
  }

  console.log('H4. no database configured yet');
  {
    stack('nodb');
    const health = await (await get('/api/index.php/health')).json();
    ok(health.database === 'not-configured' && health.otp === 'inactive', 'health says what is missing', health);
    const s = await get('/api/index.php/auth/session');
    ok(s.status === 200 && JSON.stringify(await s.json()) === '{"user":null,"pendingOtp":null}', 'the page still loads its session quietly');
    ok((await post('/auth/otp/request', { phone: '09121112233' })).status === 503, 'sign-in refuses with SERVICE_UNAVAILABLE');
  }

  console.log('H5. live: real keys entered (Faraz replaced by the local fake gateway)');
  stack('live');
  {
    const health = await (await get('/api/index.php/health')).json();
    ok(health.otp === 'active' && health.sms === 'ready', 'health: OTP active', health);
    const r = await post('/auth/otp/request', { phone: '09125550001' });
    ok(r.status === 200, 'code requested', r.status);
    const fr = faraz.requests[0] || {};
    ok(fr.method === 'POST' && fr.url === '/ws/v1/sms/pattern', 'POST to /ws/v1/sms/pattern');
    ok(fr.headers && fr.headers['api-key'] === 'test-api-key-123' && /^application\/json/.test(fr.headers['content-type']), 'Api-Key header and JSON body', fr.headers);
    ok(fr.body && JSON.stringify(Object.keys(fr.body).sort()) === JSON.stringify(['attributes', 'code', 'line_number', 'number_format', 'recipient'])
      && fr.body.code === 'test-pattern-uid' && /^\d{4}$/.test(fr.body.attributes.code) && Object.keys(fr.body.attributes).join() === 'code'
      && fr.body.recipient === '09125550001' && fr.body.line_number === '90008361' && fr.body.number_format === 'english', 'body: code, attributes.code, recipient, line_number, number_format=english; no schedule', fr.body);
    ok(sql("SELECT COUNT(*) FROM mt_otp_requests WHERE phone='09125550001'") === '1' && sql(`SELECT COUNT(*) FROM mt_otp_requests WHERE code_hash LIKE '%${fr.body.attributes.code}%' AND LENGTH(code_hash)=64`) !== '1', 'only an HMAC of the code is stored');

    faraz.status = 401; // the gateway refuses (e.g. a wrong key)
    const refused = await post('/auth/otp/request', { phone: '09125550002' });
    ok(refused.status === 502 && (await refused.json()).error === 'SMS_FAILED', 'a gateway refusal → SMS_FAILED');
    ok(sql("SELECT COUNT(*) FROM mt_otp_requests WHERE phone='09125550002'") === '0', 'no code left behind when the SMS was not sent');
    const log = fs.readFileSync(`${SITE}/metrica_private/logs/app.log`, 'utf8');
    ok(/Faraz SMS refused \(HTTP 401\)/.test(log) && !log.includes('test-api-key-123') && !log.includes('09125550002'), 'the failure is logged privately, without the key or the full number', log.slice(-300));
    ok((await get('/metrica_private/logs/app.log')).status === 404, 'the log is not on the web');
    faraz.status = 200;

    // parallel verifies over HTTP (Apache workers, one database): limits hold
    const dev = 'a'.repeat(32), cookie = { Cookie: `mdev=${dev}` };
    const q = await (await post('/auth/otp/request', { phone: '09125550003' }, cookie)).json();
    const code = faraz.outbox[faraz.outbox.length - 1].code;
    const wrong = (k) => String((Number(code) + k) % 10000).padStart(4, '0');
    const burst = await Promise.all(Array.from({ length: 20 }, (_, i) => post('/auth/otp/verify', { requestId: q.requestId, code: wrong(i + 1) }, cookie).then((x) => x.json())));
    const tally = burst.reduce((t, x) => ({ ...t, [x.error]: (t[x.error] || 0) + 1 }), {});
    ok(tally.INVALID_CODE === 4 && tally.CODE_LOCKED === 16, '20 parallel wrong codes: 4 refused, 16 locked out', tally);

    // the same browser scenarios as the reference server, now on PHP + MySQL
    const php = {
      label: 'PHP + MySQL package on Apache', base: BASE, apiBase: null, outbox: faraz.outbox,
      shift: async (s) => { const ms = s * 1000; sql(`UPDATE mt_otp_events SET at = at - ${ms}; UPDATE mt_otp_requests SET created_at = created_at - ${ms}, expires_at = expires_at - ${ms}; UPDATE mt_sessions SET created_at = created_at - ${ms}, expires_at = expires_at - ${ms};`); },
      prefill: async (phone, n) => { const now = Date.now(); sql(Array.from({ length: n }, () => `INSERT INTO mt_otp_events (k, at) VALUES ('req:p:${phone}', ${now});`).join('\n')); },
    };
    await otpScenarios(browser, php, { ok });

    const users = sql("SELECT CONCAT(phone, ':', first_name, ' ', last_name) FROM mt_users WHERE first_name <> '' ORDER BY phone").split('\n');
    ok(users.includes('09121110001:سارا محمدی') && users.includes('09121110006:علی رضایی'), 'accounts stored in MySQL', users);
    ok(/^[0-9a-f]{64}$/.test(sql('SELECT token_hash FROM mt_sessions LIMIT 1')), 'sessions stored as token hashes');
    const p = await livePage(browser, php);
    await p.click('.m-hdr__login'); await p.waitForTimeout(300);
    await p.fill('#mp-phone', '09125550009'); await p.check('#mp-consent');
    await p.click('[data-mp-form="phone"] .mp-cta'); await p.waitForTimeout(400);
    await p.keyboard.type(faraz.outbox[faraz.outbox.length - 1].code); await p.waitForTimeout(400);
    await p.fill('#mp-first', 'مریم'); await p.fill('#mp-last', 'کریمی');
    await p.click('[data-mp-form="profile"] .mp-cta'); await p.waitForTimeout(400);
    const jar = await p.context().cookies();
    ok(['msid', 'mdev'].every((n) => (jar.find((c) => c.name === n) || {}).httpOnly) && await p.evaluate(() => document.cookie === ''), 'session and device cookies are HttpOnly (invisible to scripts)');
    await p.reload(); await p.waitForTimeout(600);
    ok(await p.evaluate(() => window.Metrica.user.name) === 'مریم کریمی' && await p.evaluate(() => window.MetricaPanels.signedIn), 'a reload keeps the user signed in (server session)');
    await p.context().close();
  }

  await browser.close();
  faraz.server.close();
  stack('placeholders'); // leave the test site as shipped
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
