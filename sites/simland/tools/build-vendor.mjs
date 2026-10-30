// Builds assets/vendor/three.min.js: a tree-shaken, minified ES module that
// exports only the parts of three.js the cable stage imports. The page maps
// the bare specifier "three" to this file with an import map.
//
//   node tools/build-vendor.mjs     (re-run after importing new names from 'three')
import { build } from 'esbuild';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const srcDir = path.join(root, 'assets/js/hero3d');
const names = new Set();
for (const file of await readdir(srcDir)) {
  if (!file.endsWith('.js')) continue;
  const src = await readFile(path.join(srcDir, file), 'utf8');
  for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*'three'/g)) {
    m[1].split(',').map((s) => s.trim()).filter(Boolean).forEach((n) => names.add(n));
  }
}
const entry = path.join(root, 'tools/.three-entry.js');
await writeFile(entry, `export { ${[...names].sort().join(', ')} } from 'three';\n`);
await mkdir(path.join(root, 'assets/vendor'), { recursive: true });
await build({
  entryPoints: [entry],
  bundle: true,
  minify: true,
  format: 'esm',
  target: 'es2020',
  outfile: path.join(root, 'assets/vendor/three.min.js'),
  legalComments: 'inline',
  nodePaths: [path.join(root, '../../node_modules')],
  logLevel: 'info',
});
console.log(`three.js exports: ${[...names].sort().join(', ')}`);
