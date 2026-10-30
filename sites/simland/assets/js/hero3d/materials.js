// Shared PBR materials and the small procedural textures they use.
// Everything is generated at load time (no image files), deterministic.
import {
  BackSide,
  CanvasTexture,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PMREMGenerator,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  Scene,
  SphereGeometry,
  Vector2,
} from 'three';
import { hash } from './geometry.js';

export function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, { srgb = false, repeat = true } = {}) {
  const t = new CanvasTexture(c);
  if (srgb) t.colorSpace = SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

// Height field → tangent-space normal map.
function normalFromHeight(h, S, strength) {
  const [c, ctx] = canvas(S);
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const dx = (h[y * S + ((x + 1) % S)] - h[y * S + ((x - 1 + S) % S)]) * strength;
      const dy = (h[((y + 1) % S) * S + x] - h[((y - 1 + S) % S) * S + x]) * strength;
      const len = Math.hypot(dx, dy, 1);
      img.data[i * 4] = ((-dx / len) * 0.5 + 0.5) * 255;
      img.data[i * 4 + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      img.data[i * 4 + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      img.data[i * 4 + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return tex(c);
}

let drawnWire = null;
// Fine scratches running along a drawn wire (texture v = along the wire).
export function drawnWireNormal() {
  if (drawnWire) return drawnWire;
  const S = 256;
  const h = new Float32Array(S * S);
  const col = new Float32Array(S);
  for (let x = 0; x < S; x++) {
    col[x] = (hash(x * 1.7) - 0.5) * 0.7 + (hash(Math.floor(x / 3) * 2.3) - 0.5) * 0.5 + (hash(Math.floor(x / 9) * 3.1) - 0.5) * 0.4;
  }
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) h[y * S + x] = col[x] + (hash(x * 13.1 + Math.floor(y / 24) * 7.7) - 0.5) * 0.15;
  }
  drawnWire = normalFromHeight(h, S, 1.6);
  return drawnWire;
}

let grainTex = null;
// Orange-peel grain of extruded PVC.
export function pvcGrainNormal() {
  if (grainTex) return grainTex;
  const S = 256;
  const raw = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) raw[i] = hash(i * 0.731);
  const h = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let s = 0;
      for (let k = -1; k <= 1; k++) for (let l = -1; l <= 1; l++) s += raw[((y + k + S) % S) * S + ((x + l + S) % S)];
      h[y * S + x] = s / 9;
    }
  }
  grainTex = normalFromHeight(h, S, 2.4);
  return grainTex;
}

const cache = new Map();
const once = (key, make) => {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
};

export function copperMaterial(quality = 'high') {
  return once(`copper:${quality}`, () => {
    const m = new MeshPhysicalMaterial({
      color: '#f2a676',
      metalness: 1,
      roughness: 0.26,
      vertexColors: true,
    });
    if (quality !== 'low') {
      m.normalMap = drawnWireNormal().clone();
      m.normalMap.repeat.set(1, 3);
      m.normalMap.needsUpdate = true;
      m.normalScale = new Vector2(0.45, 0.45);
      m.anisotropy = 0.65;
      m.anisotropyRotation = Math.PI / 2;
    }
    return m;
  });
}

export function tinnedMaterial(quality = 'high') {
  return once(`tinned:${quality}`, () => {
    const m = copperMaterial(quality).clone();
    m.color = new Color('#d3d7dc');
    m.roughness = 0.3;
    return m;
  });
}

export function insulationMaterial(hex, quality = 'high') {
  return once(`ins:${hex}:${quality}`, () => {
    if (quality === 'low') return new MeshStandardMaterial({ color: hex, roughness: 0.36, vertexColors: true });
    const m = new MeshPhysicalMaterial({
      color: hex,
      roughness: 0.38,
      clearcoat: 0.6,
      clearcoatRoughness: 0.24,
      vertexColors: true,
      normalMap: pvcGrainNormal(),
      normalScale: new Vector2(0.06, 0.06),
    });
    return m;
  });
}

export function metalMaterial(hex, rough = 0.32, quality = 'high') {
  return once(`metal:${hex}:${rough}:${quality}`, () => {
    const m = new MeshStandardMaterial({ color: hex, metalness: 1, roughness: rough, vertexColors: true });
    if (quality !== 'low') {
      m.normalMap = drawnWireNormal();
      m.normalScale = new Vector2(0.25, 0.25);
    }
    return m;
  });
}

export function foilMaterial() {
  return once('foil', () => new MeshStandardMaterial({ color: '#e6e9ec', metalness: 1, roughness: 0.18, side: DoubleSide, vertexColors: true }));
}

// ---------------------------------------------------------------- environments

function bake(renderer, scene) {
  const pmrem = new PMREMGenerator(renderer);
  const target = pmrem.fromScene(scene, 0.03);
  pmrem.dispose();
  scene.traverse((o) => {
    if (o.isMesh) {
      o.geometry.dispose();
      o.material.dispose();
    }
  });
  return target.texture;
}

function panel(scene, w, h, colour, intensity, position, rotation) {
  const m = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ color: new Color(colour).multiplyScalar(intensity), side: DoubleSide }));
  m.position.set(...position);
  m.rotation.set(...rotation);
  scene.add(m);
}

function dome(scene, stops) {
  const geo = new SphereGeometry(40, 48, 24);
  const pos = geo.attributes.position;
  const col = [];
  const c = new Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 40;
    let k = 0;
    while (k < stops.length - 2 && y > stops[k + 1][0]) k++;
    const [y0, c0, i0] = stops[k];
    const [y1, c1, i1] = stops[k + 1];
    const t = Math.min(1, Math.max(0, (y - y0) / (y1 - y0)));
    c.set(c0).multiplyScalar(i0).lerp(new Color(c1).multiplyScalar(i1), t);
    col.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new Float32BufferAttribute(col, 3));
  scene.add(new Mesh(geo, new MeshBasicMaterial({ vertexColors: true, side: BackSide })));
}

// Bright product studio with cobalt and sky accents (the cable pages).
export function studioEnvironment(renderer) {
  const s = new Scene();
  dome(s, [
    [-1, '#3a4252', 0.6],
    [0, '#a3afc0', 0.8],
    [1, '#e2e9f3', 0.9],
  ]);
  panel(s, 12, 7, '#ffffff', 4.5, [0, 12, 3], [Math.PI / 2, 0, 0]);
  panel(s, 2.2, 16, '#fff3e8', 9, [12, 1, 2], [0, -Math.PI / 2, 0]);
  panel(s, 1.8, 14, '#3f74ff', 7, [-12, 2, -2], [0, Math.PI / 2, 0]);
  panel(s, 9, 2.4, '#8fd6ff', 6, [0, 5, -13], [0, 0, 0]);
  panel(s, 16, 4, '#f4f7fb', 1.4, [0, -2, 13], [0, Math.PI, 0]);
  panel(s, 0.35, 14, '#ffffff', 16, [7, 3, 10], [0, -Math.PI * 0.8, 0]);
  return bake(renderer, s);
}

// Open sky for the outdoor infinity scene: blue zenith, bright haze at the
// horizon, a warm sun and a few soft bright clouds for glossy reflections.
export function skyEnvironment(renderer) {
  const s = new Scene();
  dome(s, [
    [-1, '#7f9a74', 0.55],
    [-0.02, '#c9d6c6', 0.85],
    [0.05, '#f3f8ff', 1.25],
    [0.45, '#a9cdfa', 1.0],
    [1, '#5d97ec', 0.9],
  ]);
  const sun = new Mesh(new SphereGeometry(1.6, 16, 8), new MeshBasicMaterial({ color: new Color('#fff2dc').multiplyScalar(40) }));
  sun.position.set(-18, 26, 16);
  s.add(sun);
  panel(s, 18, 6, '#ffffff', 2.2, [0, 18, -24], [0.4, 0, 0]);
  panel(s, 10, 4, '#ffffff', 1.8, [24, 14, 6], [0, -Math.PI / 2, 0]);
  panel(s, 0.5, 18, '#ffffff', 9, [10, 6, 22], [0, -Math.PI * 0.85, 0]);
  return bake(renderer, s);
}
