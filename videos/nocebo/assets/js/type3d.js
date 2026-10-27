// Extruded Persian words from HarfBuzz-shaped Estedad outlines
// (assets/data/glyphs.js, written by tools/shape_text.py).
// Each glyph becomes its own mesh centred on its own pivot, so bodies and
// dots can be animated separately and still lock into the joined word.
import * as THREE from "three";
import { SVGLoader } from "../vendor/jsm/loaders/SVGLoader.js";


const loader = new SVGLoader();

/**
 * word: one entry of glyphs.json. opts: { height (world units per em), depth (em),
 * bevel (em), bodyMat, dotMat, curveSegments }
 * Returns { group, glyphs: [{ mesh, rest: Vector3, isDot, index }], width, height }.
 */
export function buildWord(word, opts) {
  const em = word.unitsPerEm;
  const s = opts.height / em;
  const depth = (opts.depth ?? 0.16) * em;
  const bevel = (opts.bevel ?? 0.012) * em;
  const group = new THREE.Group();
  const glyphs = [];
  const width = word.width * s;
  word.glyphs.forEach((g, index) => {
    const data = loader.parse(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${g.d}"/></svg>`);
    const shapes = data.paths.flatMap((p) => SVGLoader.createShapes(p));
    const geo = new THREE.ExtrudeGeometry(shapes, {
      depth,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel * 0.8,
      bevelSegments: 3,
      curveSegments: opts.curveSegments ?? 10,
    });
    geo.translate(g.x, g.y, -depth / 2);
    geo.scale(s, s, s);
    geo.computeBoundingBox();
    const c = new THREE.Vector3();
    geo.boundingBox.getCenter(c);
    geo.translate(-c.x, -c.y, -c.z);
    const isDot = /dot/i.test(g.name);
    const mesh = new THREE.Mesh(geo, isDot ? opts.dotMat ?? opts.bodyMat : opts.bodyMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const rest = new THREE.Vector3(c.x - width / 2, c.y, c.z);
    mesh.position.copy(rest);
    group.add(mesh);
    glyphs.push({ mesh, rest, isDot, index, name: g.name });
  });
  return { group, glyphs, width, height: opts.height };
}

// Closed-form ease used by the scenes (no tween state; any frame alone).
export const ease = {
  expoOut: (k) => (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k)),
  cubicInOut: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  quartOut: (k) => 1 - Math.pow(1 - k, 4),
  cubicIn: (k) => k * k * k,
  // critically-damped-ish spring settle for small landings (damping ~0.8)
  settle: (k) => {
    if (k >= 1) return 1;
    const w = 11;
    return 1 - Math.exp(-w * k * 0.8) * Math.cos(w * k * 0.6);
  },
};
export const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const span = (t, a, b) => clamp01((t - a) / (b - a));
