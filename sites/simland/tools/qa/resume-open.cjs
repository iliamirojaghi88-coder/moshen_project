// node resume-open.cjs <label> <url> [phone]
// Clicks «مشاهده رزومه شرکت» like a visitor and checks that the résumé really opens:
// a new tab with the real PDF (bytes and SHA-256 of the client's file, or its public
// Google Drive copy showing that file), a screenshot of what the tab shows, and no
// console errors or failed requests on the page. Full Chromium (it has a PDF viewer).
const { chromium, devices } = require('playwright');
const crypto = require('crypto');
const [label, url, phone] = process.argv.slice(2);
const SHA = 'b26c8ccd9463aec32bf254849867a8ef5af4913a3c57698912f7498fa20701b8';
const DRIVE = '1zZXTXUpC6BnKY_6NMEwkFnAvOT-duKoO';
(async () => {
  const b = await chromium.launch({ channel: 'chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext(phone ? { ...devices['Pixel 7'], reducedMotion: 'reduce' } : { viewport: { width: 1366, height: 768 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const problems = [];
  page.on('console', (m) => m.type() === 'error' && problems.push('console: ' + m.text().slice(0, 140)));
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('response', (r) => r.status() >= 400 && problems.push(`HTTP ${r.status()} ${r.url().slice(-60)}`));
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; document.getElementById('resume').scrollIntoView({ block: 'center' }); });
  await page.waitForTimeout(1500); // the one-time check of the file on a web server
  const before = await page.evaluate(() => { const a = document.querySelector('a.resume-cta'); return { route: a.dataset.route, href: a.href.slice(0, 90), text: a.querySelector('span').textContent }; });
  const [tab] = await Promise.all([page.waitForEvent('popup', { timeout: 30000 }), page.locator('a.resume-cta').click()]);
  const result = { label, phone: !!phone, ...before, tab: '', kind: '', ok: false };
  // what arrived in the new tab
  const a = await page.evaluate(() => document.querySelector('a.resume-cta').href);
  if (a.startsWith('blob:')) {
    const info = await page.evaluate(async (h) => { const buf = await (await fetch(h)).arrayBuffer(); const d = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map((x) => x.toString(16).padStart(2, '0')).join(''); return { bytes: buf.byteLength, sha: d }; }, a);
    result.kind = 'embedded PDF'; result.ok = info.sha === SHA; result.bytes = info.bytes;
  } else if (a.includes('drive.google.com')) {
    await tab.waitForLoadState('load', { timeout: 60000 }).catch(() => {});
    await tab.waitForTimeout(6000);
    result.kind = 'public copy (Google Drive)'; result.tabTitle = await tab.title(); result.ok = tab.url().includes(DRIVE) && /pdf/i.test(result.tabTitle);
  } else {
    // over HTTP as the browser gets it; a file:// address straight from the disk
    const body = a.startsWith('file:')
      ? require('fs').readFileSync(require('url').fileURLToPath(a))
      : await ctx.request.get(a).then((r) => r.body()).catch(() => Buffer.alloc(0));
    result.kind = 'PDF next to the page'; result.bytes = body.length;
    result.ok = crypto.createHash('sha256').update(body).digest('hex') === SHA;
  }
  result.tab = tab.url().slice(0, 90);
  await tab.waitForTimeout(a.includes('drive.google.com') ? 1000 : 9000); // let the viewer draw the first page
  await tab.screenshot({ path: `${process.env.SHOT || '/tmp'}/${label}.png` }).catch((e) => problems.push('screenshot: ' + e.message));
  // a web server without the PDF: the one 404 is the page's own check of it, after which it used the public copy
  result.problems = a.includes('drive.google.com') && result.route === 'file-then-check' ? problems.filter((x) => !/404|File not found/.test(x)) : problems;
  if (result.problems.length !== problems.length) result.note = 'the missing PDF was checked once (404) and the public copy opened';
  console.log(`${result.ok && !result.problems.length ? 'PASS' : 'FAIL'} ${JSON.stringify(result)}`);
  await b.close();
  process.exitCode = result.ok && !result.problems.length ? 0 : 1;
})();
