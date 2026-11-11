// Build: src/index.html -> index.html (linked assets) + dist/metrica-sections.html (single offline file).
// Both outputs carry every skin path pre-filled at its reference size, so cards render even with JavaScript off.
// Usage (from web/metrica-sections): node tools/build.cjs
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
require(path.join(ROOT, 'js/geometry.js'));
const G = globalThis.MetricaGeometry;
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

let html = read('src/index.html').replace('<!--@econ-skin-->', read('src/_econ-skin.svg'));

// pre-fill: each chunk after data-skin="key" fills its own data-g paths from that skin's templates
const parts = html.split(/(?=data-skin=")/);
html = parts.map(chunk => {
  const m = chunk.match(/^data-skin="(\w+)"/);
  if (!m) return chunk;
  const s = G.SKINS[m[1]];
  if (!s) throw new Error('unknown skin ' + m[1]);
  return chunk.replace(/data-g="(\w+)"/g, (all, g) => {
    if (!s.g[g]) throw new Error(`skin ${m[1]} has no path ${g}`);
    return `${all} d="${G.geo(s.g[g], s.w, s.h, s.w, s.h)}"`;
  });
}).join('');
if (/data-g="\w+"(?! d=)/.test(html)) throw new Error('a data-g path outside any data-skin card');
if (/\bNaN\b/.test(html)) throw new Error('NaN in geometry');
fs.writeFileSync(path.join(ROOT, 'index.html'), html);

// single file: inline css/js, embed font + images
const b64 = (p, mime) => `data:${mime};base64,${fs.readFileSync(path.join(ROOT, p)).toString('base64')}`;
let css = read('css/metrica.css').replace('url(../assets/fonts/estedad-wght.woff2)', `url(${b64('assets/fonts/estedad-wght.woff2', 'font/woff2')})`);
const ofl = read('assets/fonts/OFL.txt').replace(/--/g, '—');
let one = html
  .replace(/<link rel="preload"[^>]*>\n/, '')
  .replace('<link rel="stylesheet" href="css/metrica.css">', `<!--\nFont: Estedad (github.com/aminabedi68/Estedad), embedded.\n${ofl}\n-->\n<style>\n${css}\n</style>`)
  .replace('<script src="js/geometry.js"></script>', () => `<script>\n${read('js/geometry.js')}\n</script>`)
  .replace('<script src="js/metrica.js" defer></script>', () => `<script>\n${read('js/metrica.js')}\n</script>`)
  .replace(/src="(assets\/img\/[\w-]+\.(webp|png))"/g, (_, p, ext) => `src="${b64(p, 'image/' + ext)}"`);
if (/(src|href)="(?!data:|#)[^"]+"/.test(one.replace(/<a [^>]*>/g, ''))) throw new Error('external reference left in the single file');
fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'dist/metrica-sections.html'), one);
console.log(`index.html ${(html.length / 1024).toFixed(0)} KB · dist/metrica-sections.html ${(one.length / 1024).toFixed(0)} KB`);
