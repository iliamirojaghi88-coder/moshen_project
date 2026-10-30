// Cable meshes for the studio scenes (products and contact heroes):
// geometry from cable-geometry.js, materials from materials.js.
import { CanvasTexture, Color, Group, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, Vector2 } from 'three';
import { buildCableGeometry } from './cable-geometry.js';
import { canvas, copperMaterial, foilMaterial, insulationMaterial, metalMaterial, pvcGrainNormal, tinnedMaterial } from './materials.js';

// Printed sheath legend, as on a real cable: brand name only, no ratings.
function legendTexture(background, ink, radius) {
  const W = 1024;
  const H = 1152;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = ink;
  ctx.textBaseline = 'middle';
  ctx.save();
  ctx.translate(W * 0.25, H);
  ctx.rotate(-Math.PI / 2);
  ctx.font = '700 40px Estedad, sans-serif';
  ctx.direction = 'ltr';
  ctx.fillText('SIMLAND', 160, 0);
  ctx.direction = 'rtl';
  ctx.fillText('سیم‌لند', 600, 0);
  ctx.restore();
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(1, 1 / (Math.PI * 2 * radius * (H / W)));
  t.anisotropy = 8;
  return t;
}

function sheathMaterial(kind, quality) {
  const blue = kind === 'sheath:blue';
  const legend = blue ? legendTexture('#2a6fd0', 'rgba(240, 246, 255, 0.92)', 1.5) : legendTexture('#16171a', 'rgba(160, 166, 175, 0.9)', 2.0);
  if (quality === 'low') return new MeshStandardMaterial({ color: '#ffffff', map: legend, roughness: 0.5, vertexColors: true });
  return new MeshPhysicalMaterial({
    color: '#ffffff',
    map: legend,
    roughness: blue ? 0.44 : 0.56,
    clearcoat: blue ? 0.4 : 0.25,
    clearcoatRoughness: 0.4,
    normalMap: pvcGrainNormal(),
    normalScale: new Vector2(0.12, 0.12),
    vertexColors: true,
  });
}

function materialFor(key, quality) {
  if (key.startsWith('sheath:')) return sheathMaterial(key, quality);
  if (key === 'copper') return copperMaterial(quality);
  if (key === 'tinned') return tinnedMaterial(quality);
  if (key === 'armour') return metalMaterial('#d3d8de', 0.33, quality);
  if (key === 'foil') return foilMaterial();
  if (key === 'bedding') return new MeshStandardMaterial({ color: '#1c1e22', roughness: 0.62, vertexColors: true });
  if (key.startsWith('ins:')) return insulationMaterial(key.slice(4), quality);
  return new MeshStandardMaterial({ color: new Color('#888') });
}

export function buildCable(kind, quality = 'high') {
  const { parts, focus, anchors } = buildCableGeometry(kind, quality);
  const group = new Group();
  for (const { key, geometry } of parts) {
    const m = new Mesh(geometry, materialFor(key, quality));
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }
  return { group, focus, anchors };
}
