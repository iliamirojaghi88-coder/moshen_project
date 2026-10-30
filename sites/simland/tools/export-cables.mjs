// Writes the procedural cables (assets/js/hero3d/cable-geometry.js) to OBJ so
// Blender renders the exact same models the live 3D scenes use.
//
//   node tools/export-cables.mjs <out-dir> [quality]
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildCableGeometry } from '../assets/js/hero3d/cable-geometry.js';

const outDir = process.argv[2] ?? 'build/cables';
const quality = process.argv[3] ?? 'ultra';
await mkdir(outDir, { recursive: true });

for (const kind of ['armoured', 'instrument', 'single']) {
  const { parts, focus } = buildCableGeometry(kind, quality);
  const lines = [`# SIMLAND ${kind} cable (${quality}); units 1 = 10 mm, axis +Y`];
  let offset = 1;
  for (const { key, geometry } of parts) {
    const name = key.replace(/[:#]/g, '_');
    const pos = geometry.attributes.position.array;
    const nrm = geometry.attributes.normal.array;
    const uv = geometry.attributes.uv.array;
    const idx = geometry.index.array;
    lines.push(`o ${name}`, `usemtl ${name}`);
    for (let i = 0; i < pos.length; i += 3) lines.push(`v ${pos[i].toFixed(5)} ${pos[i + 1].toFixed(5)} ${pos[i + 2].toFixed(5)}`);
    for (let i = 0; i < uv.length; i += 2) lines.push(`vt ${uv[i].toFixed(5)} ${uv[i + 1].toFixed(5)}`);
    for (let i = 0; i < nrm.length; i += 3) lines.push(`vn ${nrm[i].toFixed(4)} ${nrm[i + 1].toFixed(4)} ${nrm[i + 2].toFixed(4)}`);
    for (let i = 0; i < idx.length; i += 3) {
      const [a, b, c] = [idx[i] + offset, idx[i + 1] + offset, idx[i + 2] + offset];
      lines.push(`f ${a}/${a}/${a} ${b}/${b}/${b} ${c}/${c}/${c}`);
    }
    offset += pos.length / 3;
  }
  await writeFile(path.join(outDir, `${kind}.obj`), lines.join('\n') + '\n');
  await writeFile(path.join(outDir, `${kind}.json`), JSON.stringify({ focus: { cut: focus.cut.toArray(), tips: focus.tips.toArray() } }));
  console.log(`${kind}: ${parts.length} parts, ${offset - 1} vertices`);
}
