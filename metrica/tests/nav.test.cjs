const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://127.0.0.1:8765/index.html';
const assert = (c, m) => { if (!c) throw new Error('FAIL: ' + m); console.log('ok  ' + m); };
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto(BASE); await p.waitForLoadState('networkidle');
  assert(await p.evaluate(() => location.hash) === '#/features', 'empty hash opens امکانات');
  await p.evaluate(() => { window.__h = document.getElementById('m-hdr'); window.__n = document.getElementById('m-nav'); });
  const order = ['home', 'features', 'projects', 'account'];
  for (const r of ['account', 'home', 'projects', 'features', 'account']) {
    await p.click(`.m-nav__item[data-route="${r}"]`); await p.waitForTimeout(650);
    const st = await p.evaluate(() => ({
      hash: location.hash, idx: document.getElementById('m-nav').style.getPropertyValue('--idx'),
      cur: [...document.querySelectorAll('[aria-current="page"]')].map(a => a.dataset.route),
      same: window.__h === document.getElementById('m-hdr') && window.__n === document.getElementById('m-nav'),
      selX: document.querySelector('.m-nav__sel').getBoundingClientRect().x,
      itemX: document.querySelector('.m-nav__item[aria-current="page"]').getBoundingClientRect().x,
      selW: document.querySelector('.m-nav__sel').getBoundingClientRect().width,
      title: document.title, top: scrollY,
    }));
    assert(st.hash === '#/' + r && st.idx == order.indexOf(r) && st.cur.join() === r, `route ${r}: hash, --idx, aria-current`);
    assert(st.same, `route ${r}: header and nav are the same DOM nodes (not rebuilt)`);
    assert(Math.abs(st.selX - st.itemX) < 1.5, `route ${r}: selector sits on the active item (Δ=${(st.selX - st.itemX).toFixed(2)}px)`);
  }
  // selector box identical in all four states
  const sizes = [];
  for (const r of order) { await p.click(`.m-nav__item[data-route="${r}"]`); await p.waitForTimeout(650);
    sizes.push(await p.evaluate(() => { const s = getComputedStyle(document.querySelector('.m-nav__sel'), '::before'); const r = document.querySelector('.m-nav__sel').getBoundingClientRect(); return [r.width.toFixed(2), r.height.toFixed(2), s.borderRadius, s.borderTopWidth].join('|'); })); }
  assert(new Set(sizes).size === 1, 'selector size/radius/border identical on all 4 items: ' + sizes[0]);
  await p.goBack(); await p.waitForTimeout(500);
  assert(await p.evaluate(() => location.hash) === '#/projects', 'browser back returns to previous page');
  await p.goto(BASE + '#/nope'); await p.waitForTimeout(300);
  assert(await p.evaluate(() => location.hash) === '#/features', 'unknown route falls back to امکانات');
  // account data binding
  await p.goto(BASE + '#/account'); await p.waitForTimeout(400);
  assert(!(await p.evaluate(() => /\d{3}|۰۹|09/.test(document.querySelector('.acc-profile').textContent))), 'no phone number in profile card');
  for (const [plan, label] of [['plus', 'پلاس'], ['pro', 'پرو'], ['normal', 'عادی']]) {
    await p.evaluate((pl) => Metrica.setUser({ plan: pl, name: 'نام آزمایشی' }), plan);
    const t = await p.evaluate(() => [document.querySelector('.acc-plan').dataset.plan, document.querySelector('.acc-plan b').textContent, document.querySelector('.acc-profile__name').textContent]);
    assert(t[0] === plan && t[1] === label && t[2] === 'نام آزمایشی', `plan ${plan} → «${label}», name bound from data`);
  }
  // actions announce intent
  const got = await p.evaluate(() => new Promise(res => { document.addEventListener('metrica:action', e => res(e.detail.action), { once: true }); document.querySelector('[data-action="settings"]').click(); }));
  assert(got === 'settings', 'menu card dispatches metrica:action');
  // keyboard: tab reaches nav links
  await p.keyboard.press('Tab'); 
  assert(errs.length === 0, 'no console/page errors ' + errs.join(';'));
  await b.close();
})().catch(e => { console.error(e.message); process.exit(1); });
