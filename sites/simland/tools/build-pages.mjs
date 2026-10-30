// Assembles index.html and products.html from src/ templates.
// Shared blocks live in src/partials; the product grid (order, names, images)
// is generated from source/mapping.json so both pages always match.
//
//   node tools/build-pages.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = (p) => path.join(root, 'src', p);
const { products } = JSON.parse(await readFile(path.join(root, 'source/mapping.json'), 'utf8'));

const fa = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);

function productGrid(page) {
  const sizes = '(min-width: 1320px) 250px, (min-width: 1100px) 23vw, (min-width: 640px) 30vw, 46vw';
  const items = products.map((p, i) => {
    const img = (w) => `assets/images/products/${p.slug}-${w}.webp`;
    return `      <li class="product-item" style="--i:${i}">
        <a class="product-card" id="p-${p.slug}" href="products.html#p-${p.slug}" data-product="${p.slug}" data-index="${i}">
          <span class="product-media">
            <img src="${img(660)}" srcset="${img(440)} 440w, ${img(660)} 660w, ${img(880)} 880w" sizes="${sizes}" width="880" height="1100" alt="" loading="lazy" decoding="async">
            <span class="product-sheen" aria-hidden="true"></span>
          </span>
          <span class="product-meta">
            <span class="product-name">${p.name}</span>
            <span class="product-go" aria-hidden="true"><svg><use href="#i-arrow"/></svg></span>
          </span>
        </a>
      </li>`;
  });
  return `    <ul class="product-grid" data-product-grid aria-label="${fa(products.length)} محصول">\n${items.join('\n')}\n    </ul>`;
}

for (const page of ['index', 'products']) {
  let html = await readFile(src(`${page}.html`), 'utf8');
  for (const m of [...html.matchAll(/<!-- include: (\w+) -->/g)]) {
    html = html.replace(m[0], (await readFile(src(`partials/${m[1]}.html`), 'utf8')).trimEnd());
  }
  const key = page === 'index' ? 'home' : 'products';
  html = html
    .replace('<!-- products -->', productGrid(key))
    .replaceAll('{{current:home}}', key === 'home' ? ' aria-current="page"' : '')
    .replaceAll('{{current:products}}', key === 'products' ? ' aria-current="page"' : '');
  await writeFile(path.join(root, `${page}.html`), html);
  console.log(`wrote ${page}.html`);
}
