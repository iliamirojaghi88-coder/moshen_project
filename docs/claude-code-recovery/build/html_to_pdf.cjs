// HTML → PDF with the Chromium that Playwright drives (links stay clickable, fonts embedded).
//   node build/html_to_pdf.cjs <in.html> <out.pdf>
// Uses PLAYWRIGHT_CHROMIUM if set (e.g. /opt/pw-browsers/chromium in Claude cloud containers).
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [src, dst] = process.argv.slice(2);
  if (!src || !dst) { console.error('usage: html_to_pdf.cjs <in.html> <out.pdf>'); process.exit(2); }
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
  const page = await browser.newPage();
  await page.goto('file://' + path.resolve(src), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({
    path: dst, format: 'A4', landscape: true, printBackground: true, preferCSSPageSize: true,
    displayHeaderFooter: true, headerTemplate: '<span></span>',
    footerTemplate: '<div style="width:100%;font-size:7px;color:#667085;text-align:center;font-family:sans-serif">Claude Code recovery kit · <span class="pageNumber"></span> / <span class="totalPages"></span></div>',
  });
  await browser.close();
  console.log('wrote ' + dst);
})().catch((e) => { console.error(e); process.exit(1); });
