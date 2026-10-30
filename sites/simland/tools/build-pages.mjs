// Builds the site from src/ (templates + partials) and source/mapping.json.
//
//   dist/index.html   the deliverable: ONE self-contained file. CSS in <style>,
//                     all JavaScript (three.js included) in one <script>, fonts
//                     and images embedded as data URIs. Opens from disk or any
//                     web server, no other files needed.
//   index.html        the same page for development: links the files in
//                     assets/ so they can be edited without rebuilding.
//
//   node tools/build-pages.mjs
import { build, transform } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const at = (...p) => path.join(root, ...p);
const { products, categories } = JSON.parse(await readFile(at('source/mapping.json'), 'utf8'));

const fa = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
const MIME = { webp: 'image/webp', svg: 'image/svg+xml', woff2: 'font/woff2', jpg: 'image/jpeg', png: 'image/png' };

async function dataUri(file) {
  const ext = path.extname(file).slice(1);
  return `data:${MIME[ext]};base64,${(await readFile(file)).toString('base64')}`;
}

// ---------------------------------------------------------------- product grids

const catName = Object.fromEntries(categories.map((c) => [c.key, c.name]));
const catIcon = { building: 'i-building', industrial: 'i-factory', special: 'i-chip' };

// Image attributes: linked files in development; in the single file each
// image is embedded once (home grid) and other places copy it at runtime.
async function imageAttrs(slug, embed, sizes) {
  const file = (w) => `assets/images/products/${slug}-${w}.webp`;
  if (embed === 'link') return `src="${file(660)}" srcset="${file(440)} 440w, ${file(660)} 660w, ${file(880)} 880w" sizes="${sizes}"`;
  if (embed === 'inline') return `src="${await dataUri(at(file(880)))}"`;
  return `data-src-ref="${slug}"`;
}

async function productGrid(view, single) {
  const sizes = '(min-width: 1320px) 250px, (min-width: 1100px) 23vw, (min-width: 640px) 30vw, 46vw';
  const embed = !single ? 'link' : view === 'home' ? 'inline' : 'ref';
  const items = [];
  for (const [i, p] of products.entries()) {
    items.push(`      <li class="pitem" style="--i:${i}" data-cat="${p.category}">
        <a class="pcard" href="#/products/${p.slug}" data-product="${p.slug}" data-cat-name="${catName[p.category]}">
          <span class="pcard-stage">
            <span class="pcard-glow" aria-hidden="true"></span>
            <span class="pcard-floor" aria-hidden="true"></span>
            <img class="pcard-img" ${await imageAttrs(p.slug, embed, sizes)} width="880" height="1100" alt="" loading="lazy" decoding="async">
          </span>
          <span class="pcard-body">
            <span class="pcard-cat"><svg aria-hidden="true"><use href="#${catIcon[p.category]}"/></svg>${catName[p.category]}</span>
            <span class="pcard-name">${p.name}</span>
            <span class="pcard-more"><span>مشاهده جزئیات</span><svg aria-hidden="true"><use href="#i-arrow"/></svg></span>
          </span>
        </a>
      </li>`);
  }
  return `    <ul class="pgrid" data-product-grid data-view-grid="${view}" aria-label="${fa(products.length)} محصول">\n${items.join('\n')}\n    </ul>`;
}

async function categoryTiles(single) {
  const tiles = [];
  for (const c of categories) {
    const members = products.filter((p) => p.category === c.key);
    const thumbs = [];
    for (const p of members.slice(0, 4)) {
      thumbs.push(`<img ${await imageAttrs(p.slug, single ? 'ref' : 'link', '120px')} width="880" height="1100" alt="" loading="lazy" decoding="async">`);
    }
    tiles.push(`      <button class="cat" type="button" data-filter-jump="${c.key}">
        <span class="cat-thumbs" aria-hidden="true">${thumbs.join('')}</span>
        <span class="cat-icon" aria-hidden="true"><svg><use href="#${catIcon[c.key]}"/></svg></span>
        <span class="cat-name">${c.name}</span>
        <span class="cat-text">${c.text}</span>
        <span class="cat-count">${fa(members.length)} محصول</span>
      </button>`);
  }
  return `    <div class="cats-grid">\n${tiles.join('\n')}\n    </div>`;
}

// ---------------------------------------------------------------- inlined CSS and JS

async function inlineCss() {
  let css = (await readFile(at('assets/css/style.css'), 'utf8')) + '\n' + (await readFile(at('assets/css/responsive.css'), 'utf8'));
  for (const m of [...css.matchAll(/url\('\.\.\/([^']+)'\)/g)]) {
    css = css.replaceAll(m[0], `url('${await dataUri(at('assets', m[1]))}')`);
  }
  const { code } = await transform(css, { loader: 'css', minify: true, target: ['chrome111', 'safari16.4', 'firefox115'] });
  return code;
}

async function inlineJs() {
  const result = await build({
    entryPoints: [at('assets/js/main.js')],
    bundle: true,
    format: 'esm',
    minify: true,
    target: 'es2020',
    write: false,
    legalComments: 'inline',
    logLevel: 'warning',
  });
  // keep the bundle from ending the <script> element early
  return result.outputFiles[0].text.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
}

// ---------------------------------------------------------------- page

async function page(single) {
  let html = await readFile(at('src/index.html'), 'utf8');
  for (const m of [...html.matchAll(/<!-- include: (\w+) -->/g)]) {
    html = html.replace(m[0], (await readFile(at(`src/partials/${m[1]}.html`), 'utf8')).trimEnd());
  }
  html = html
    .replace('<!-- products: home -->', await productGrid('home', single))
    .replace('<!-- products: catalog -->', await productGrid('products', single))
    .replace('<!-- categories -->', await categoryTiles(single));
  for (const m of [...html.matchAll(/\{\{asset:([^}]+)\}\}/g)]) {
    html = html.replace(m[0], single ? await dataUri(at('assets', m[1])) : `assets/${m[1]}`);
  }

  const headAssets = single
    ? `  <link rel="icon" href="${await dataUri(at('assets/images/favicon.svg'))}" type="image/svg+xml">
  <style>${await inlineCss()}</style>`
    : `  <link rel="icon" href="assets/images/favicon.svg" type="image/svg+xml">
  <link rel="preload" href="assets/fonts/estedad-arabic-wght.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="assets/css/style.css">
  <link rel="stylesheet" href="assets/css/responsive.css">
  <script type="importmap">{ "imports": { "three": "./assets/vendor/three.min.js" } }</script>
  <link rel="modulepreload" href="assets/js/main.js">
  <link rel="modulepreload" href="assets/vendor/three.min.js">`;
  const bodyScripts = single
    ? `<script type="module">${await inlineJs()}</script>`
    : '<script type="module" src="assets/js/main.js"></script>';

  // function replacements: the inlined code may contain "$&"-style sequences
  return html.replace('<!-- head-assets -->', () => headAssets).replace('<!-- body-scripts -->', () => bodyScripts);
}

await writeFile(at('index.html'), await page(false));
console.log('wrote index.html (development, links assets/)');

await mkdir(at('dist'), { recursive: true });
const single = await page(true);
await writeFile(at('dist/index.html'), single);
console.log(`wrote dist/index.html (single file, ${(Buffer.byteLength(single) / 1024 / 1024).toFixed(2)} MB)`);
