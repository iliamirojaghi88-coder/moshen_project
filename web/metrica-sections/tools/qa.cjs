// QA for both sections. Usage: NODE_PATH=$(npm root -g) node tools/qa.cjs <outDir> [file]
// 1) reference-scale renders (390px viewport at the DPR that makes each section as wide as its reference)
// 2) responsive checks + screenshots at 320…1920
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const OUT = process.argv[2] || 'qa-out', FILE = path.resolve(__dirname, '..', process.argv[3] || 'index.html');
fs.mkdirSync(OUT, { recursive: true });

const audit = () => {
  const out = { scrollX: document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth, problems: [] };
  const R = e => e.getBoundingClientRect();
  const hit = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
  document.querySelectorAll('.mt-card').forEach(card => {
    const c = R(card), name = (card.querySelector('h2,h3')?.textContent || card.className).trim().slice(0, 18);
    const texts = [...card.querySelectorAll('h2,h3,p,.mt-pill,button span')];
    const ink = t => { const g = document.createRange(); g.selectNodeContents(t); return [...g.getClientRects()]; }; // real text boxes, not the block box
    texts.forEach(t => {
      const r = R(t);
      if (r.left < c.left - 1 || r.right > c.right + 1 || r.bottom > c.bottom + 1) out.problems.push(`${name}: text outside card`);
      if (t.scrollWidth > t.clientWidth + 1) out.problems.push(`${name}: text overflows its box`);
    });
    const arts = [...card.querySelectorAll(':scope > .mt-art, .mt-feat__div')], btns = [...card.querySelectorAll('button')];
    // glyphs sit inside the text box: trim the line box to the ink band; trim the soft glow baked into the art edges
    const tight = (r, f) => ({ left: r.left, right: r.right, top: r.top + f * .3, bottom: r.bottom - f * .22 });
    const isArt = a => a.classList.contains('mt-art');
    const artBox = a => { const r = R(a); return isArt(a) ? { left: r.left + r.width * .04, right: r.right - r.width * .04, top: r.top, bottom: r.bottom - r.height * .06 } : r; };
    texts.filter(t => t.tagName !== 'SPAN').forEach(t => ink(t).map(r => tight(r, parseFloat(getComputedStyle(t).fontSize))).forEach(r => {
      arts.forEach(a => hit(r, artBox(a)) && out.problems.push(`${name}: text overlaps ${isArt(a) ? 'art' : 'divider'}`));
      btns.filter(b => !b.contains(t)).forEach(b => hit(r, R(b)) && out.problems.push(`${name}: text overlaps a button`)); }));
    card.querySelectorAll('img').forEach(i => { const r = R(i); if (i.naturalWidth && Math.abs(r.width / r.height - i.naturalWidth / i.naturalHeight) > 0.01) out.problems.push(`${name}: image stretched`); });
    const s = card.querySelector(':scope > .mt-skin');
    if (s) { const vb = s.viewBox.baseVal, sr = R(s); if (Math.abs(sr.width / sr.height - vb.width / vb.height) > 0.002) out.problems.push(`${name}: skin stretched`);
      if ([...s.querySelectorAll('[data-g]')].some(p => /NaN/.test(p.getAttribute('d') || 'NaN'))) out.problems.push(`${name}: bad geometry`); }
  });
  document.querySelectorAll('button').forEach(b => { const r = R(b), pad = Math.max(0, -parseFloat(getComputedStyle(b, '::before').top) || 0);
    const w = r.width + 2 * pad, h = r.height + 2 * pad; // touch area includes the invisible ::before ring
    if (w < 43.5 || h < 43.5) out.problems.push(`touch target too small ${w.toFixed(0)}x${h.toFixed(0)}`); });
  out.font = document.fonts.check('800 16px Estedad', 'متریکا');
  out.minFont = Math.min(...[...document.querySelectorAll('.mt-page h2,.mt-page h3,.mt-page p,.mt-page .mt-pill,.mt-page button span')].map(e => parseFloat(getComputedStyle(e).fontSize)));
  return out;
};

(async () => {
  const b = await chromium.launch(), net = [];
  const page = async (opt) => {
    const ctx = await b.newContext(opt); const p = await ctx.newPage();
    await p.route('**/*', r => { const u = r.request().url(); if (u.startsWith('file:') || u.startsWith('data:')) return r.continue(); net.push(u); return r.abort(); });
    await p.goto('file://' + FILE, { waitUntil: 'load' });
    await p.evaluate(async () => { await document.fonts.ready; document.querySelectorAll('img').forEach(i => i.loading = 'eager'); await Promise.all([...document.images].map(i => i.decode().catch(() => {}))); });
    await p.addStyleTag({ content: '.mt-wave svg{animation:none!important}' });
    await p.waitForTimeout(250); return { p, ctx };
  };
  for (const [sel, refW, name] of [['.mt-s1', 839, 'ref-s1'], ['.mt-s2', 788, 'ref-s2']]) {
    const { p, ctx } = await page({ viewport: { width: 390, height: 900 }, deviceScaleFactor: refW / 390 });
    await (await p.$(sel)).screenshot({ path: path.join(OUT, name + '.png') }); await ctx.close();
  }
  const report = {};
  for (const w of [320, 360, 390, 430, 768, 1024, 1440, 1920]) {
    const { p, ctx } = await page({ viewport: { width: w, height: 1000 }, deviceScaleFactor: 1 });
    report[w] = await p.evaluate(audit);
    await p.screenshot({ path: path.join(OUT, `w${w}.png`), fullPage: true }); await ctx.close();
  }
  report.network = net;
  fs.writeFileSync(path.join(OUT, 'qa.json'), JSON.stringify(report, null, 1));
  for (const [k, v] of Object.entries(report)) console.log(k, JSON.stringify(v));
  await b.close();
})();
