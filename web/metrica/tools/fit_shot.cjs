// Screenshot every text element in a distinct hue (everything else hidden) at the mobile layout.
// usage: node tools/fit_shot.js <index.html> <out.png> <out.json>
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const [html, png, json] = process.argv.slice(2);
  const spec = JSON.parse(fs.readFileSync(__dirname + '/layout_spec.json', 'utf8'));
  const ids = Object.keys(spec.texts);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 560, height: 2800 }, deviceScaleFactor: 2 });
  await p.goto('file://' + html);
  await p.evaluate(() => document.fonts.ready);
  const css = ids.map((id, i) => {
    const h = Math.round(i * 360 / ids.length);
    return `#${id},#${id} *{color:hsl(${h} 100% 45%)!important;-webkit-text-fill-color:hsl(${h} 100% 45%)!important}`;
  }).join('\n');
  await p.addStyleTag({ content: `
    .mtr-skin,.mtr-bg,.mtr-art,.mtr-arrow,.mtr-ico{visibility:hidden!important}
    .mtr,.mtr-sec,body{background:#fff!important}
    .mtr-btn,.mtr-pill{background:none!important;box-shadow:none!important}
    .mtr-btn::before{display:none!important}
    .mtr-gold{background:none!important;filter:none!important}
    .mtr *{animation:none!important}
    ${css}` });
  await p.waitForTimeout(300);
  const info = await p.evaluate((ids) => ids.map((id, i) => {
    const el = document.getElementById(id); const c = el.closest('.mtr-c'); const r = c.getBoundingClientRect();
    const e = el.getBoundingClientRect();
    return { id, hue: Math.round(i * 360 / ids.length), comp: { x: r.left + scrollX, y: r.top + scrollY, w: r.width },
             cw: parseFloat(getComputedStyle(c).getPropertyValue('--cw')),
             el: { x: e.left + scrollX, y: e.top + scrollY, w: e.width, h: e.height },
             fspx: parseFloat(getComputedStyle(el).fontSize) };
  }), ids);
  await p.screenshot({ path: png, fullPage: true });
  fs.writeFileSync(json, JSON.stringify(info));
  await b.close();
})();
