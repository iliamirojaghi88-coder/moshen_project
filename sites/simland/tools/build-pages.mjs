// Builds the home page from src/index.html, assets/ and the hero layers.
//
//   dist/index.html   the deliverable: ONE self-contained file. CSS in <style>,
//                     JavaScript in one <script>, fonts and images embedded as
//                     data URIs. Opens from disk or any web server.
//   index.html        the same page for development: links the files in
//                     assets/ (serve the folder: python3 -m http.server 8765)
//
//   python3 tools/build-hero-layers.py   (when the hero picture changes)
//   node tools/build-pages.mjs
import { build, transform } from 'esbuild';
import sharp from 'sharp';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
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
  const cards = [];
  for (const p of products) {
    const file = at('assets/images/products', `${p.slug}.webp`);
    const { width, height } = await sharp(file).metadata();
    const src = single ? await dataUri(file) : `assets/images/products/${p.slug}.webp`;
    cards.push(`        <li class="pcard" data-tone="${p.tone}">
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
              <a class="pcard-cta" role="link" aria-disabled="true" title="به‌زودی">
                <span>مشاهده محصولات</span>
                <span class="pcard-go" aria-hidden="true"><svg><use href="#i-arrow"/></svg></span>
              </a>
            </div>
          </article>
        </li>`);
  }
  return `      <ul class="pgrid" role="list">
${cards.join('\n')}
      </ul>`;
}

async function heroData(single) {
  const src = async (f) => (single ? dataUri(at('assets/hero', f)) : `assets/hero/${f}`);
  const json = JSON.stringify({ scene, masks: await src('masks.png') });
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
await writeFile(at('dist/index.html'), single);
console.log(`wrote dist/index.html (single file, ${(Buffer.byteLength(single) / 1024 / 1024).toFixed(2)} MB)`);
