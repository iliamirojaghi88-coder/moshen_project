// Builds the home page from src/index.html, assets/ and the hero layers.
//
//   dist/index.html   the deliverable: ONE self-contained file. CSS in <style>,
//                     JavaScript in one <script>, fonts and images embedded as
//                     data URIs. Opens from disk or any web server. The résumé
//                     PDF it links to is copied next to it (dist/assets/resume/).
//   index.html        the same page for development: links the files in
//                     assets/ (serve the folder: python3 -m http.server 8765)
//
//   python3 tools/build-hero-layers.py   (when the hero picture changes)
//   node tools/build-pages.mjs
import { build, transform } from 'esbuild';
import sharp from 'sharp';
import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const at = (...p) => path.join(root, ...p);
const MIME = { webp: 'image/webp', svg: 'image/svg+xml', woff2: 'font/woff2', png: 'image/png', jpg: 'image/jpeg' };
const scene = JSON.parse(await readFile(at('assets/hero/scene.json'), 'utf8'));

async function dataUri(file) {
  const ext = path.extname(file).slice(1);
  return `data:${MIME[ext]};base64,${(await readFile(file)).toString('base64')}`;
}

const pct = (v, total) => `${((v / total) * 100).toFixed(4)}%`;

// The picture as still layers: the base, each turbine's blades and its hub cap,
// placed in percent of the picture, so together they show it exactly as supplied.
async function heroStill(single) {
  const src = async (f) => (single ? dataUri(at('assets/hero', f)) : `assets/hero/${f}`);
  const { width: W, height: H } = scene;
  const layers = [
    `      <img data-layer="base" src="${await src('base.webp')}" alt="" width="${W}" height="${H}" fetchpriority="high" decoding="async" draggable="false" style="left:0;top:0;width:100%;height:100%">`,
  ];
  for (const kind of ['blades', 'caps']) {
    for (const t of scene.turbines) {
      const [x, y, w, h] = t[kind === 'blades' ? 'blades' : 'cap'];
      layers.push(
        `      <img data-layer="${kind}-${t.id}" src="${await src(`${kind}-${t.id}.webp`)}" alt="" width="${w}" height="${h}" decoding="async" draggable="false" style="left:${pct(x, W)};top:${pct(y, H)};width:${pct(w, W)};height:${pct(h, H)}">`,
      );
    }
  }
  return `    <div class="scene-still" aria-hidden="true">\n${layers.join('\n')}\n    </div>`;
}

// The product cards, in page order (right to left, top to bottom), from
// source/mapping.json: the client's photo, name, short text, icon and tone.
async function productCards(single) {
  const { products } = JSON.parse(await readFile(at('source/mapping.json'), 'utf8'));
  const { categories } = await catalog();
  const cards = [];
  for (const p of products) {
    // a card whose category has its own page links to it (the whole card is the link)
    const category = categories.find((c) => c.homeCard === p.slug);
    const cta = category
      ? `<a class="pcard-cta" href="#/products/${category.id}">
                <span>مشاهده محصولات</span><span class="sr-only"> ${esc(category.name)}</span>
                <span class="pcard-go" aria-hidden="true"><svg><use href="#i-arrow"/></svg></span>
              </a>`
      : `<a class="pcard-cta" role="link" aria-disabled="true" title="به‌زودی">
                <span>مشاهده محصولات</span>
                <span class="pcard-go" aria-hidden="true"><svg><use href="#i-arrow"/></svg></span>
              </a>`;
    const file = at('assets/images/products', `${p.slug}.webp`);
    const { width, height } = await sharp(file).metadata();
    const src = single ? await dataUri(file) : `assets/images/products/${p.slug}.webp`;
    cards.push(`        <li class="pcard${category ? ' is-linked' : ''}" data-tone="${p.tone}" data-reveal="up">
          <article class="pcard-in" aria-labelledby="prod-${p.slug}">
            <div class="pcard-media" aria-hidden="true">
              <svg class="pcard-mark"><use href="#p-${p.icon}"/></svg>
              <img src="${src}" alt="" width="${width}" height="${height}" loading="lazy" decoding="async" draggable="false">
            </div>
            <div class="pcard-body">
              <span class="pcard-icon" aria-hidden="true"><svg><use href="#p-${p.icon}"/></svg></span>
              <span class="pcard-dash" aria-hidden="true"></span>
              <h3 class="pcard-title" id="prod-${p.slug}">${p.name}</h3>
              <p class="pcard-text">${p.text}</p>
              ${cta}
            </div>
          </article>
        </li>`);
  }
  return `      <ul class="pgrid" role="list">
${cards.join('\n')}
      </ul>`;
}

// «چرا سیم‌لند؟»: four cards, each with the client's 3D image (assets/images/why,
// made by tools/build-why-images.py from source/why).
const WHY = [
  { img: 'shield', tone: 'blue', title: 'کیفیت تضمینی', text: 'ارائه محصولات استاندارد و باکیفیت از برندهای معتبر داخلی و خارجی.' },
  { img: 'variety', tone: 'green', title: 'تنوع کامل محصولات', text: 'انواع سیم و کابل برای بخش‌های ساختمانی، صنعتی، انرژی و پروژه‌های تخصصی.' },
  { img: 'headset', tone: 'blue', title: 'مشاوره تخصصی', text: 'راهنمایی دقیق و حرفه‌ای برای انتخاب بهترین محصول متناسب با نیاز شما.' },
  { img: 'box', tone: 'green', title: 'ارسال سریع و رایگان', text: 'ارسال سریع و رایگان سفارش‌ها با بسته‌بندی مناسب و مطمئن.' },
];

async function whyCards(single) {
  const cards = [];
  for (const [i, c] of WHY.entries()) {
    const file = at('assets/images/why', `${c.img}.webp`);
    const { width, height } = await sharp(file).metadata();
    const src = single ? await dataUri(file) : `assets/images/why/${c.img}.webp`;
    const n = String(i + 1).padStart(2, '0');
    cards.push(`        <li class="why-card" data-tone="${c.tone}" data-art="${c.img}" data-reveal="up">
          <article class="why-in" aria-labelledby="why-${n}">
            <div class="why-body">
              <span class="why-num" aria-hidden="true" lang="en">${n}</span>
              <span class="why-dash" aria-hidden="true"></span>
              <h3 class="why-name" id="why-${n}">${c.title}</h3>
              <p class="why-text">${c.text}</p>
            </div>
            <div class="why-art" aria-hidden="true">
              <img src="${src}" alt="" width="${width}" height="${height}" loading="lazy" decoding="async" draggable="false">
            </div>
          </article>
        </li>`);
  }
  return `      <ol class="why-grid" role="list">\n${cards.join('\n')}\n      </ol>`;
}

// «با ما در ارتباط باشید»: the cards come from assets/js/site-config.js. Each
// number is a real tel: link: a group with one number makes the whole card that
// link; a group with several numbers gets one row (one link) per number; a group
// without numbers says «شماره تماس به‌زودی» and is not a link. The address is
// plain text with a copy button, or a link to a map once a verified mapUrl is set.
const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// 09123520415 -> 0912 352 0415 (mobile), 02533551111 -> 025 3355 1111 (landline)
function phoneGroups(digits) {
  if (/^09\d{9}$/.test(digits)) return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  if (/^0\d{10}$/.test(digits)) return `${digits.slice(0, 3)} ${digits.slice(3, 7)} ${digits.slice(7)}`;
  return digits;
}

async function contactCards() {
  const { contact } = await import(pathToFileURL(at('assets/js/site-config.js')).href);
  const icon = (id) => `<span class="ccard-icon" aria-hidden="true"><svg><use href="#${id}"/></svg></span>`;
  const label = (text) => `<span class="ccard-label">${esc(text)}</span>`;
  const number = (digits) => `<span class="ccard-main ccard-number" dir="ltr">${phoneGroups(digits)}</span>`;
  const go = (cls = '') => `<span class="ccard-go${cls}" aria-hidden="true"><svg><use href="#c-chevron"/></svg></span>`;
  const items = contact.groups.map((g) => {
    const nums = (g.numbers || []).map((n) => String(n).replace(/[^\d+]/g, '')).filter(Boolean);
    if (!nums.length) {
      return `          <li data-reveal="right"><div class="ccard is-soon" data-tone="${g.tone}" aria-disabled="true">${icon('c-phone')}<span class="ccard-text">${label(g.label)} <span class="ccard-main ccard-soon">شماره تماس به‌زودی</span></span>${go()}</div></li>`;
    }
    if (nums.length === 1) {
      return `          <li data-reveal="right"><a class="ccard" data-tone="${g.tone}" href="tel:${nums[0]}"><span class="sr-only">تماس: </span>${icon('c-phone')}<span class="ccard-text">${label(g.label)} ${number(nums[0])}</span>${go()}</a></li>`;
    }
    const rows = nums
      .map((n) => `<a class="ccard-line" href="tel:${n}"><span class="sr-only">تماس با ${esc(g.label)}: </span>${number(n)}${go(' ccard-go-sm')}</a>`)
      .join('');
    return `          <li data-reveal="right"><div class="ccard ccard-multi" data-tone="${g.tone}">${icon('c-phone')}<span class="ccard-text">${label(g.label)} <span class="ccard-lines">${rows}</span></span></div></li>`;
  });
  const a = contact.address;
  const action = a.mapUrl
    ? `<a class="ccard-go" href="${esc(a.mapUrl)}" target="_blank" rel="noopener" aria-label="مسیریابی روی نقشه"><svg aria-hidden="true"><use href="#c-map"/></svg></a>`
    : `<button type="button" class="ccard-go ccard-copy" data-copy="${esc(a.text)}" aria-label="کپی آدرس شعبه" title="کپی آدرس"><svg class="i-copy" aria-hidden="true"><use href="#c-copy"/></svg><svg class="i-done" aria-hidden="true"><use href="#c-check"/></svg></button><span class="ccard-status" role="status" aria-live="polite"></span>`;
  items.push(`          <li data-reveal="right"><div class="ccard ccard-address" data-tone="blue">${icon('c-pin')}<span class="ccard-text">${label(a.label)} <span class="ccard-main ccard-addr">${esc(a.text)}</span></span>${action}</div></li>`);
  return `          <ul class="contact-list" role="list">\n${items.join('\n')}\n          </ul>`;
}

async function contactArt(single) {
  const file = at('assets/images/contact/phone.webp');
  const { width, height } = await sharp(file).metadata();
  const src = single ? await dataUri(file) : 'assets/images/contact/phone.webp';
  return `          <img class="contact-phone" src="${src}" alt="گوشی هوشمند با آیکون تماس، روی پایه‌ی شیشه‌ای آبی و سبز" width="${width}" height="${height}" loading="lazy" decoding="async" draggable="false">`;
}

// ---------------------------------------------------------------- catalogue pages
// assets/data/catalog.json: categories and products. Each category gets its page
// (#/products/<category>) with a grid of product cards, each product its page
// (#/products/<category>/<id>). They are <main class="route-view" hidden> blocks
// after the home page; home.js shows the one the address asks for. In the
// one-file page each product photo is embedded once (#media-data) and set on its
// <img data-media> when a page is shown.
async function catalog() {
  return JSON.parse(await readFile(at('assets/data/catalog.json'), 'utf8'));
}

async function catalogPages(single) {
  const { categories, products } = await catalog();
  const media = {};
  const img = async (p, cls, eager) => {
    const file = at('assets/images/catalog', `${p.image}.webp`);
    const { width, height } = await sharp(file).metadata();
    if (single) media[p.image] = await dataUri(file);
    const src = single ? `data-media="${p.image}"` : `src="assets/images/catalog/${p.image}.webp"`;
    return `<img class="${cls}" ${src} alt="${esc(p.imageAlt)}" width="${width}" height="${height}" decoding="async"${eager ? '' : ' loading="lazy"'} draggable="false">`;
  };
  const crumbs = (items) => `      <nav class="rv-crumbs" aria-label="مسیر صفحه">
        ${items.map(([text, href]) => (href ? `<a href="${href}">${esc(text)}</a>` : `<span aria-current="page">${esc(text)}</span>`)).join('<span class="rv-sep" aria-hidden="true">/</span>')}
      </nav>`;
  const inquiry = (p, cls) => `<button type="button" class="${cls}" data-inquiry aria-haspopup="dialog" aria-label="استعلام قیمت ${esc(p.name)}"><svg aria-hidden="true"><use href="#i-tag"/></svg><span>استعلام قیمت</span></button>`;
  const titled = (name, accent) => (accent && name.includes(accent) ? esc(name).replace(esc(accent), `<span class="accent">${esc(accent)}</span>`) : esc(name));
  const pages = [];
  for (const c of categories) {
    const items = products.filter((p) => p.category === c.id);
    const cards = [];
    for (const p of items) {
      cards.push(`          <li class="acard">
            <article class="acard-in" aria-labelledby="acard-${p.id}">
              <a class="acard-link" href="#/products/${c.id}/${p.id}">
                <span class="acard-media">${await img(p, 'acard-img', false)}</span>
                <span class="acard-body"><span class="acard-title" id="acard-${p.id}" role="heading" aria-level="2">${esc(p.name)}</span></span>
              </a>
              ${inquiry(p, 'acard-inquiry')}
            </article>
          </li>`);
    }
    pages.push(`<main class="route-view rv-category" data-route="/products/${c.id}" data-title="${esc(c.name)} | سیم‌لند" aria-labelledby="cat-${c.id}-title" hidden>
    <div class="rv-wrap">
${crumbs([['خانه', '#top'], ['محصولات', '#products'], [c.name]])}
      <header class="rv-head">
        <h1 class="rv-title" id="cat-${c.id}-title" tabindex="-1">${titled(c.name, c.accent)}</h1>
        <p class="rv-lede">${esc(c.description)}</p>
        <a class="rv-back" href="#products"><svg aria-hidden="true"><use href="#i-arrow"/></svg><span>بازگشت به محصولات</span></a>
      </header>
      <div class="agrid-wrap">
        <ul class="agrid" role="list">
${cards.join('\n')}
        </ul>
      </div>
    </div>
  </main>`);
    for (const p of items) {
      pages.push(`<main class="route-view rv-product" data-route="/products/${c.id}/${p.id}" data-title="${esc(p.name)} | سیم‌لند" aria-labelledby="pd-${p.id}" hidden>
    <div class="rv-wrap">
${crumbs([['خانه', '#top'], ['محصولات', '#products'], [c.name, `#/products/${c.id}`], [p.name]])}
      <article class="pdetail">
        <div class="pdetail-info">
          <h1 class="pdetail-title" id="pd-${p.id}" tabindex="-1">${esc(p.name)}</h1>
          <h2 class="pdetail-label" id="pd-${p.id}-codes">کدهای فنی</h2>
          <p class="pdetail-codes" aria-labelledby="pd-${p.id}-codes"><span dir="ltr" lang="en">${esc(p.codesText || p.codes.join(', '))}</span></p>
${p.description ? `          <p class="pdetail-desc">${esc(p.description)}</p>
` : ''}          <section class="pdetail-block" aria-labelledby="pd-${p.id}-use">
            <h2 class="pdetail-h" id="pd-${p.id}-use">کاربرد:</h2>
            <p class="pdetail-text">${esc(p.application)}</p>
          </section>
          <section class="pdetail-block" aria-labelledby="pd-${p.id}-build">
            <h2 class="pdetail-h" id="pd-${p.id}-build">ساختار:</h2>
            <p class="pdetail-structure-line"><span class="pdetail-structure" dir="ltr" lang="en">${esc(p.structure)}</span></p>${p.structureNote ? `\n            <p class="pdetail-note">${esc(p.structureNote)}</p>` : ''}
          </section>
          ${inquiry(p, 'btn btn-primary pdetail-inquiry')}
        </div>
        <div class="pdetail-media">${await img(p, 'pdetail-img', true)}</div>
      </article>
      <a class="rv-back" href="#/products/${c.id}"><svg aria-hidden="true"><use href="#i-arrow"/></svg><span>بازگشت به ${esc(c.name)}</span></a>
    </div>
  </main>`);
    }
  }
  const mediaJson = single ? `\n<script type="application/json" id="media-data">${JSON.stringify(media)}</script>` : '';
  return pages.join('\n\n') + mediaJson;
}

// The contact panel of «استعلام قیمت» (a <dialog>, one for the whole site): the same
// numbers as the contact section (assets/js/site-config.js), one row (one tel: link,
// the whole row) per number; no address.
async function contactPanel() {
  const { contact } = await import(pathToFileURL(at('assets/js/site-config.js')).href);
  const rows = [];
  for (const g of contact.groups) {
    const icon = g.tone === 'green' ? 'c-office' : 'c-phone';
    for (const raw of g.numbers || []) {
      const n = String(raw).replace(/[^\d+]/g, '');
      if (!n) continue;
      rows.push(`        <li><a class="cpanel-row" data-tone="${g.tone}" href="tel:${n}"><span class="sr-only">تماس با </span><span class="cpanel-icon" aria-hidden="true"><svg><use href="#${icon}"/></svg></span><span class="cpanel-text"><span class="cpanel-label">${esc(g.label)}</span><span class="cpanel-number" dir="ltr">${phoneGroups(n)}</span></span><span class="cpanel-go" aria-hidden="true"><svg><use href="#c-chevron"/></svg></span></a></li>`);
    }
  }
  return `<dialog class="cpanel" id="contact-panel" aria-labelledby="cpanel-title" aria-describedby="cpanel-hint">
  <div class="cpanel-in">
    <span class="cpanel-grip" aria-hidden="true"></span>
    <button type="button" class="cpanel-close" data-close aria-label="بستن"><svg aria-hidden="true"><use href="#i-close"/></svg></button>
    <header class="cpanel-head">
      <span class="cpanel-badge" aria-hidden="true"><svg><use href="#c-ring"/></svg></span>
      <h2 class="cpanel-title" id="cpanel-title">تماس با ما</h2>
    </header>
    <p class="cpanel-hint" id="cpanel-hint">برای تماس، روی شماره دلخواه بزنید</p>
    <ul class="cpanel-list" role="list">
${rows.join('\n')}
    </ul>
  </div>
</dialog>`;
}

// the SIMLAND folder of the résumé section (the client's 3D image, tools/build-cutouts.py)
async function resumeArt(single) {
  const file = at('assets/images/resume/folder.webp');
  const { width, height } = await sharp(file).metadata();
  const src = single ? await dataUri(file) : 'assets/images/resume/folder.webp';
  return `          <img class="resume-folder" src="${src}" alt="پوشه‌ی آبی رزومه و کاتالوگ با نشان SIMLAND" width="${width}" height="${height}" loading="lazy" decoding="async" draggable="false">`;
}

async function heroData(single) {
  const src = async (f) => (single ? dataUri(at('assets/hero', f)) : `assets/hero/${f}`);
  // the power lines and copper ends of the picture (tools/build-power-lines.py)
  const power = JSON.parse(await readFile(at('assets/hero/power.json'), 'utf8'));
  power.mask = await src('power.png');
  const json = JSON.stringify({ scene, masks: await src('masks.png'), power });
  return `<script type="application/json" id="hero-data">${json}</script>`;
}

async function inlineCss() {
  let css = await readFile(at('assets/css/home.css'), 'utf8');
  for (const m of [...css.matchAll(/url\('\.\.\/([^']+)'\)/g)]) {
    css = css.replaceAll(m[0], `url('${await dataUri(at('assets', m[1]))}')`);
  }
  const { code } = await transform(css, { loader: 'css', minify: true, target: ['chrome111', 'safari16.4', 'firefox115'] });
  return code;
}

async function inlineJs() {
  const result = await build({
    entryPoints: [at('assets/js/home.js')],
    bundle: true,
    format: 'esm',
    minify: true,
    target: 'es2020',
    write: false,
    logLevel: 'warning',
  });
  // keep the bundle from ending the <script> element early
  return result.outputFiles[0].text.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
}

async function page(single) {
  const html = await readFile(at('src/index.html'), 'utf8');
  const headAssets = single
    ? `  <link rel="icon" href="${await dataUri(at('assets/images/favicon.svg'))}" type="image/svg+xml">
  <style>${await inlineCss()}</style>`
    : `  <link rel="icon" href="assets/images/favicon.svg" type="image/svg+xml">
  <link rel="preload" href="assets/fonts/estedad-arabic-wght.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="assets/css/home.css">`;
  const bodyScripts = single
    ? `<script type="module">${await inlineJs()}</script>`
    : '<script type="module" src="assets/js/home.js"></script>';
  const parts = {
    '<!-- head-assets -->': headAssets,
    '<!-- hero-still -->': await heroStill(single),
    '<!-- hero-data -->': await heroData(single),
    '<!-- products -->': await productCards(single),
    '<!-- why -->': await whyCards(single),
    '<!-- contact -->': await contactCards(),
    '<!-- contact-art -->': await contactArt(single),
    '<!-- resume-art -->': await resumeArt(single),
    '<!-- catalog-pages -->': await catalogPages(single),
    '<!-- contact-panel -->': await contactPanel(),
    '<!-- body-scripts -->': bodyScripts,
  };
  // function replacements: the inlined code may contain "$&"-style sequences
  let out = html;
  for (const [mark, value] of Object.entries(parts)) out = out.replace(mark, () => value);
  return out;
}

await writeFile(at('index.html'), await page(false));
console.log('wrote index.html (development, links assets/)');

await mkdir(at('dist'), { recursive: true });
const single = await page(true);
// written whole, then moved into place: a page loading at that moment never reads half a file
await writeFile(at('dist/index.html.tmp'), single);
await rename(at('dist/index.html.tmp'), at('dist/index.html'));
console.log(`wrote dist/index.html (single file, ${(Buffer.byteLength(single) / 1024 / 1024).toFixed(2)} MB)`);

// The résumé opens as its own file, so it sits next to the page at the address its
// button links to (assets/resume/simland-resume.pdf), byte for byte the client's PDF.
// Deploy dist/ as a folder.
const pdf = 'assets/resume/simland-resume.pdf';
await mkdir(at('dist/assets/resume'), { recursive: true });
await copyFile(at(pdf), at('dist', pdf));
const sha = async (f) => createHash('sha256').update(await readFile(f)).digest('hex');
if ((await sha(at(pdf))) !== (await sha(at('dist', pdf)))) throw new Error('catalogue copy differs');
console.log(`copied ${pdf} to dist/ (unchanged, ${((await readFile(at(pdf))).length / 1024 / 1024).toFixed(1)} MB)`);

// The same page as ONE file that also carries the catalogue, for sending the page on
// its own (a file opened by itself cannot reach a folder next to it): the PDF, byte
// for byte, as base64 in an inert <script type="application/pdf;base64">; home.js
// opens it in a new tab from a blob address.
const pdfData = (await readFile(at(pdf))).toString('base64');
const end = single.lastIndexOf('</body>');
const standalone = `${single.slice(0, end)}<script type="application/pdf;base64" id="catalog-pdf">${pdfData}</script>\n${single.slice(end)}`;
await mkdir(at('dist-standalone'), { recursive: true });
await writeFile(at('dist-standalone/simland-home-standalone.html.tmp'), standalone);
await rename(at('dist-standalone/simland-home-standalone.html.tmp'), at('dist-standalone/simland-home-standalone.html'));
if (Buffer.from(pdfData, 'base64').compare(await readFile(at(pdf))) !== 0) throw new Error('embedded catalogue differs');
console.log(`wrote dist-standalone/simland-home-standalone.html (one file with the catalogue, ${(Buffer.byteLength(standalone) / 1024 / 1024).toFixed(1)} MB)`);
