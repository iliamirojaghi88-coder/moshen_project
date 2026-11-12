// Header geometry: every item sits inside the one curved surface, nothing overlaps, no label wraps,
// and the header is the same DOM node across all four routes.
// usage: node tests/header.test.cjs [base-url]   (serve metrica/ first: python3 -m http.server 8765)
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://127.0.0.1:8765/index.html';
const WIDTHS = [320, 360, 390, 430, 768, 1024, 1440];
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) fails++; };

(async () => {
  const b = await chromium.launch();
  for (const w of WIDTHS) {
    const p = await b.newPage({ viewport: { width: w, height: 800 } });
    await p.goto(BASE + '#/features'); await p.waitForLoadState('networkidle'); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
    const r = await p.evaluate(() => {
      const svg = document.querySelector('.m-hdr__skin'), shape = svg.querySelector('path[data-d="tray"]:not([filter])');
      const o = svg.getBoundingClientRect(), pt = svg.createSVGPoint();
      const inside = (x, y) => { pt.x = x - o.left; pt.y = y - o.top; return shape.isPointInFill(pt); };
      const items = ['.m-hdr__brand span', '.m-hdr__brand img', '.m-hdr__sep', '.m-hdr__sub', '.m-hdr__login'].map((s) => [s, document.querySelector(s).getBoundingClientRect()]);
      // probe the outline of each item 3px outside its box (pill ends are round, so probe their arc too)
      const outside = [];
      for (const [s, q] of items) {
        const rad = s === '.m-hdr__sub' || s === '.m-hdr__login' ? q.height / 2 : 0, m = 3;
        const probes = [[q.left - m, q.top + q.height / 2], [q.right + m, q.top + q.height / 2], [q.left + q.width / 2, q.top - m], [q.left + q.width / 2, q.bottom + m]];
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
          const cx = sx < 0 ? q.left + rad : q.right - rad, cy = sy < 0 ? q.top + rad : q.bottom - rad, k = (rad + m) * Math.SQRT1_2;
          probes.push(rad ? [cx + sx * k, cy + sy * k] : [cx + sx * m, cy + sy * m]);
        }
        probes.forEach(([x, y]) => { if (!inside(x, y)) outside.push(`${s}@${x.toFixed(0)},${y.toFixed(0)}`); });
      }
      const overlaps = [];
      for (let i = 0; i < items.length - 1; i++) { const a = items[i][1], c = items[i + 1][1]; if (!(a.left >= c.right + 3 || c.left >= a.right + 3)) overlaps.push(`${items[i][0]}~${items[i + 1][0]}`); }
      const wrapped = ['.m-hdr__brand span', '.m-hdr__sub span', '.m-hdr__login span'].filter((s) => {
        const el = document.querySelector(s); return el.getClientRects().length > 1 || el.scrollWidth > el.clientWidth + 1; });
      const row = document.querySelector('.m-hdr__row').getBoundingClientRect();
      if (items.some(([, q]) => q.left < row.left - .5 || q.right > row.right + .5)) overlaps.push('content wider than the row');
      const sub = items[3][1], login = items[4][1], sep = items[2][1], brand = items[1][1];
      return { outside, overlaps, wrapped, btnGap: sub.left - login.right, sepL: sep.left - sub.right, sepR: brand.left - sep.right,
        h: document.querySelector('.m-hdr__tray').getBoundingClientRect().height, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth };
    });
    check(!r.outside.length, `${w}px: all items inside the curved surface ${r.outside.join(' ')}`);
    check(!r.overlaps.length && !r.wrapped.length, `${w}px: no overlap, no wrapped label ${r.overlaps} ${r.wrapped}`);
    check(r.btnGap <= 12, `${w}px: «خرید اشتراک» next to «ورود / ثبت‌نام» (gap ${r.btnGap.toFixed(1)}px)`);
    check(Math.abs(r.sepL - r.sepR) <= 1.5, `${w}px: separator centred between buttons and brand (${r.sepL.toFixed(1)} / ${r.sepR.toFixed(1)}px)`);
    check(r.sw <= r.cw, `${w}px: no horizontal scroll; header height ${r.h}px`);
    await p.close();
  }
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  await p.goto(BASE + '#/features'); await p.waitForLoadState('networkidle');
  await p.evaluate(() => { window.__h = document.getElementById('m-hdr'); });
  for (const route of ['home', 'projects', 'account', 'features']) {
    await p.click(`.m-nav__item[data-route="${route}"]`); await p.waitForTimeout(300);
    check(await p.evaluate(() => window.__h === document.getElementById('m-hdr')), `route ${route}: header not rebuilt`);
  }
  await b.close();
  process.exit(fails ? 1 : 0);
})();
