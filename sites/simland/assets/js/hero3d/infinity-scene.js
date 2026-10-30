// The home hero: a white flat twin-core cable laid out as an infinity sign,
// carrying a small world on two grass hills — industry on the left (factory,
// chimneys, wind turbines), home and grid on the right (villa, transmission
// tower, solar array). The front end of the cable is cut open: green and
// white cores, 37-strand copper. The brand is printed on the sheath itself.
//
// Everything is procedural (no model files). Units ≈ metres of the
// miniature; the cable stands on its edge, 1.75 high, on the floor y = 0.
import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  ClampToEdgeWrapping,
  Color,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Fog,
  Group,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  PCFShadowMap,
  PlaneGeometry,
  PointLight,
  RepeatWrapping,
  SRGBColorSpace,
  Scene,
  ShadowMaterial,
  Sprite,
  SpriteMaterial,
  Vector2,
  Vector3,
} from 'three';
import { GeometryBuilder, addLathe, hash, smoothstep } from './geometry.js';
import { QUALITY, conductor, insulatedCore } from './cable-geometry.js';
import { canvas, copperMaterial, insulationMaterial, pvcGrainNormal, skyEnvironment } from './materials.js';

const TAU = Math.PI * 2;
const rnd = (i) => hash(i * 1.618 + 0.31);

// ---------------------------------------------------------------- cable path

const LEM_A = 10.4;
const LEM_Z = 1.45;
const CW = 0.95; // thickness of the flat cable
const CH = 1.75; // height (it stands on its edge)
const CORNER = 0.3;
const T_START = Math.PI + 0.3;
const T_END = T_START + TAU - 0.62; // ends under the grass on the far left

function wrapPi(a) {
  return ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
}

// Centre line: Bernoulli lemniscate, the strand from the cut end rises over
// the other at the crossing; the first stretch is pulled forward so the cut
// end stands proud of the loop it closes.
function cablePoint(t, out = new Vector3()) {
  const s = Math.sin(t);
  const c = Math.cos(t);
  const d = 1 + s * s;
  const lift = (CH + 0.12) * Math.exp(-((wrapPi(t - 1.5 * Math.PI) / 0.52) ** 2)) * (t < 2 * Math.PI ? 1 : 0);
  const k = 1 - smoothstep(T_START, T_START + 1.15, t);
  return out.set((LEM_A * c) / d - 0.5 * k, CH / 2 + lift, ((LEM_A * s * c) / d) * LEM_Z + 1.45 * k);
}

// Rounded-rectangle profile, parameterised by arc length; starts at the
// bottom of the +B face and goes up it first (the printed face).
function profile(count, inset = 0) {
  const w2 = CW / 2 - inset;
  const h2 = CH / 2 - inset;
  const r = Math.max(0.02, CORNER - inset);
  const segs = [
    { type: 'line', a: [w2, -h2 + r], b: [w2, h2 - r] },
    { type: 'arc', c: [w2 - r, h2 - r], a0: 0, a1: Math.PI / 2 },
    { type: 'line', a: [w2 - r, h2], b: [-w2 + r, h2] },
    { type: 'arc', c: [-w2 + r, h2 - r], a0: Math.PI / 2, a1: Math.PI },
    { type: 'line', a: [-w2, h2 - r], b: [-w2, -h2 + r] },
    { type: 'arc', c: [-w2 + r, -h2 + r], a0: Math.PI, a1: Math.PI * 1.5 },
    { type: 'line', a: [-w2 + r, -h2], b: [w2 - r, -h2] },
    { type: 'arc', c: [w2 - r, -h2 + r], a0: Math.PI * 1.5, a1: TAU },
  ];
  const len = segs.map((s) => (s.type === 'line' ? Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) : r * (s.a1 - s.a0)));
  const total = len.reduce((a, b) => a + b, 0);
  const pts = [];
  for (let i = 0; i <= count; i++) {
    let d = (i / count) * total;
    let k = 0;
    while (k < segs.length - 1 && d > len[k]) d -= len[k++];
    const s = segs[k];
    const f = Math.min(1, d / len[k]);
    if (s.type === 'line') {
      const nx = s.b[1] - s.a[1];
      const ny = -(s.b[0] - s.a[0]);
      const nl = Math.hypot(nx, ny);
      pts.push({ b: s.a[0] + (s.b[0] - s.a[0]) * f, n: s.a[1] + (s.b[1] - s.a[1]) * f, nb: nx / nl, nn: ny / nl, v: i / count });
    } else {
      const a = s.a0 + (s.a1 - s.a0) * f;
      pts.push({ b: s.c[0] + Math.cos(a) * r, n: s.c[1] + Math.sin(a) * r, nb: Math.cos(a), nn: Math.sin(a), v: i / count });
    }
  }
  return { pts, faceV: len[0] / total, total };
}

function printTexture(length, faceHeight) {
  // The brand printed on the sheath, as cable makers do: ink on the jacket.
  const W = 2048;
  const H = Math.round((W * faceHeight) / length);
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#f4f6f8';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#0d2350';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.direction = 'rtl';
  ctx.font = `900 ${Math.round(H * 0.74)}px Estedad, sans-serif`;
  ctx.fillText('سیم‌لند', W / 2, H * 0.54);
  // a thin copper rule either side, like a printed legend mark
  ctx.fillStyle = '#b9703f';
  const rw = W * 0.09;
  ctx.fillRect(W * 0.08, H * 0.48, rw, H * 0.06);
  ctx.fillRect(W * 0.92 - rw, H * 0.48, rw, H * 0.06);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = ClampToEdgeWrapping;
  t.anisotropy = 8;
  return t;
}

function buildCable(Q, quality) {
  const group = new Group();
  const steps = quality === 'low' ? 520 : 1100;
  const prof = profile(quality === 'low' ? 36 : 64);
  const ts = Array.from({ length: steps + 1 }, (_, i) => T_START + ((T_END - T_START) * i) / steps);
  const pts = ts.map((t) => cablePoint(t));
  // frames that keep the profile upright: N = world up minus its tangent part
  const T = [];
  const N = [];
  const B = [];
  const up = new Vector3(0, 1, 0);
  for (let i = 0; i < pts.length; i++) {
    const t = new Vector3().subVectors(pts[Math.min(pts.length - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize();
    const n = up.clone().addScaledVector(t, -up.dot(t)).normalize();
    T.push(t);
    N.push(n);
    B.push(new Vector3().crossVectors(t, n));
  }
  const arc = [0];
  for (let i = 1; i < pts.length; i++) arc.push(arc[i - 1] + pts[i].distanceTo(pts[i - 1]));

  const sheath = new GeometryBuilder();
  const p = new Vector3();
  const n = new Vector3();
  const grey = (s) => ({ r: s, g: s, b: s });
  for (let i = 0; i < pts.length; i++) {
    for (const q of prof.pts) {
      p.copy(pts[i]).addScaledVector(B[i], q.b).addScaledVector(N[i], q.n);
      n.copy(B[i]).multiplyScalar(q.nb).addScaledVector(N[i], q.nn).normalize();
      // soft occlusion where the jacket meets the floor
      const floor = 0.62 + 0.38 * smoothstep(0.0, 0.5, p.y);
      sheath.vertex(p, n, grey(floor * (0.86 + 0.14 * (n.y * 0.5 + 0.5))), arc[i], q.v);
    }
  }
  const ring = prof.pts.length;
  for (let i = 0; i < pts.length - 1; i++) {
    for (let j = 0; j < ring - 1; j++) {
      const a = i * ring + j;
      const b = a + ring;
      sheath.indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  // cut face at the open end: the jacket wall, then the dark inside
  const cut = new GeometryBuilder();
  const inner = profile(prof.pts.length - 1, 0.11);
  const p0 = pts[0];
  const back = T[0].clone().negate();
  const base = cut.vertexCount;
  for (let j = 0; j < ring; j++) {
    const o = prof.pts[j];
    const q = inner.pts[j];
    cut.vertex(p.copy(p0).addScaledVector(B[0], o.b).addScaledVector(N[0], o.n), back, grey(1), 0, 0);
    cut.vertex(p.copy(p0).addScaledVector(B[0], q.b).addScaledVector(N[0], q.n).addScaledVector(T[0], 0.012), back, grey(0.97), 0, 0);
  }
  for (let j = 0; j < ring - 1; j++) {
    const a = base + j * 2;
    cut.indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const wall = cut.vertexCount;
  for (let j = 0; j < ring; j++) {
    const q = inner.pts[j];
    const inward = new Vector3().copy(B[0]).multiplyScalar(-q.nb).addScaledVector(N[0], -q.nn);
    for (const depth of [0.012, 0.6]) {
      cut.vertex(p.copy(p0).addScaledVector(B[0], q.b).addScaledVector(N[0], q.n).addScaledVector(T[0], depth), inward, grey(depth > 0.1 ? 0.25 : 0.9), 0, 0);
    }
  }
  for (let j = 0; j < ring - 1; j++) {
    const a = wall + j * 2;
    cut.indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  // end cap at the hidden far end
  const last = pts.length - 1;
  const capC = cut.vertexCount;
  cut.vertex(pts[last], T[last], grey(0.5), 0, 0);
  for (const q of prof.pts) cut.vertex(p.copy(pts[last]).addScaledVector(B[last], q.b).addScaledVector(N[last], q.n), T[last], grey(0.5), 0, 0);
  for (let j = 0; j < ring - 1; j++) cut.indices.push(capC, capC + 1 + j, capC + 2 + j);

  // print: placed on the front stretch between the cut end and the crossing
  const iA = ts.findIndex((t) => t >= T_START + 0.42);
  const iB = ts.findIndex((t) => t >= 1.5 * Math.PI - 0.16);
  const faceH = CH - 2 * CORNER;
  const printLen = Math.min(6.4, (arc[iB] - arc[iA]) * 0.96);
  const u0 = (arc[iA] + arc[iB]) / 2 - printLen / 2;
  const print = printTexture(printLen, faceH);
  print.repeat.set(1 / printLen, 1 / prof.faceV);
  print.offset.set(-u0 / printLen, 0);
  const grain = pvcGrainNormal().clone();
  grain.wrapS = grain.wrapT = RepeatWrapping;
  grain.repeat.set(2.5, 6);
  grain.needsUpdate = true;
  const sheathMat = new MeshPhysicalMaterial({
    color: '#ffffff',
    map: print,
    roughness: 0.36,
    clearcoat: 0.5,
    clearcoatRoughness: 0.3,
    sheen: 0.25,
    sheenColor: new Color('#dfe9f5'),
    normalMap: grain,
    normalScale: new Vector2(0.08, 0.08),
    vertexColors: true,
  });
  const sheathMesh = new Mesh(sheath.build(), sheathMat);
  const cutMesh = new Mesh(cut.build(), new MeshStandardMaterial({ color: '#eef1f4', roughness: 0.55, vertexColors: true }));
  for (const m of [sheathMesh, cutMesh]) {
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }

  // cores out of the cut end: green over white, copper beyond
  const basis = new Matrix4().makeBasis(B[0], back, N[0].clone().negate()).setPosition(p0);
  const coreSpec = [
    { key: '#2fa257', z: -0.4, top: 1.75, seed: 1 },
    { key: '#f1f2f0', z: 0.4, top: 1.5, seed: 2 },
  ];
  const copper = new GeometryBuilder();
  const insGeo = [];
  for (const core of coreSpec) {
    const centre = (y, o = new Vector3()) => o.set(0.02 * y, y, core.z * (1 + 0.1 * smoothstep(0.2, 2.2, y)));
    const ys = Array.from({ length: Q.coreSteps + 1 }, (_, i) => -0.6 + ((core.top - 0.03 + 0.6) * i) / Q.coreSteps);
    const b = new GeometryBuilder();
    insulatedCore(b, ys.map((y) => centre(y)), 0.36, 0.27, Q, (i) => 0.55 + 0.45 * smoothstep(-0.05, 0.4, ys[i]));
    insGeo.push([core.key, b]);
    conductor(copper, centre, { radius: 0.27, layers: [1, 6, 12, 18], yStart: core.top - 0.24, top: core.top + 1.45, seed: core.seed, lays: [1, 5, 6.5, 8], Q });
  }
  for (const [hex, b] of insGeo) {
    const m = new Mesh(b.build().applyMatrix4(basis), insulationMaterial(hex, quality));
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  }
  const cu = new Mesh(copper.build().applyMatrix4(basis), copperMaterial(quality));
  cu.castShadow = cu.receiveShadow = true;
  group.add(cu);

  const tipLocal = new Vector3(0, 2.6, 0).applyMatrix4(basis);
  return { group, tip: tipLocal };
}

// ---------------------------------------------------------------- terrain

const MOUNDS = [
  { cx: -5.7, cz: -3.0, rx: 5.9, rz: 3.9, h: 3.0, seed: 1 },
  { cx: 5.6, cz: -2.9, rx: 5.6, rz: 3.8, h: 2.7, seed: 2 },
  { cx: 6.2, cz: 2.6, rx: 2.3, rz: 1.45, h: 0.5, seed: 3 },
  { cx: -9.9, cz: 0.0, rx: 2.9, rz: 3.1, h: 2.75, seed: 4 }, // grass skirt over the far-left bend
  { cx: -5.3, cz: 1.1, rx: 4.1, rz: 2.3, h: 0.55, seed: 5 }, // lawns filling the loops
  { cx: 5.1, cz: 1.0, rx: 4.3, rz: 2.3, h: 0.5, seed: 6 },
];

function rawMound(m, x, z) {
  const dx = (x - m.cx) / m.rx;
  const dz = (z - m.cz) / m.rz;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d >= 1) return -1;
  const body = m.h * Math.pow(1 - d * d, 1.25);
  const ripple = (Math.sin(x * 1.1 + m.seed) * Math.cos(z * 1.3 - m.seed) * 0.5 + Math.sin(x * 2.3 - z * 1.7 + m.seed * 2) * 0.25) * m.h * 0.09;
  return body + ripple * (1 - d);
}

// Flat pads where buildings stand, blended into the slope.
const PADS = [];
function terrain(x, z) {
  let y = -1;
  for (const m of MOUNDS) y = Math.max(y, rawMound(m, x, z));
  for (const p of PADS) {
    const ex = Math.max(0, Math.abs(x - p.x) - p.w / 2);
    const ez = Math.max(0, Math.abs(z - p.z) - p.d / 2);
    const k = 1 - smoothstep(0, p.feather, Math.hypot(ex, ez));
    if (k > 0 && y > -0.5) y = y + (p.y - y) * k;
  }
  return y;
}

function pad(x, z, w, d, feather = 0.9) {
  const p = { x, z, w, d, feather, y: 0 };
  let s = 0;
  let n = 0;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    let y = -1;
    for (const m of MOUNDS) y = Math.max(y, rawMound(m, x + (i * w) / 2, z + (j * d) / 2));
    if (y > 0) {
      s += y;
      n++;
    }
  }
  p.y = n ? s / n : 0;
  PADS.push(p);
  return p.y;
}

function buildTerrain(quality) {
  const b = new GeometryBuilder();
  const rings = quality === 'low' ? 26 : 44;
  const segs = quality === 'low' ? 64 : 120;
  const col = new Color();
  for (const m of MOUNDS) {
    const base = b.vertexCount;
    for (let i = 0; i <= rings; i++) {
      const rho = (i / rings) * 1.04;
      for (let j = 0; j <= segs; j++) {
        const a = (j / segs) * TAU;
        const x = m.cx + Math.cos(a) * m.rx * rho;
        const z = m.cz + Math.sin(a) * m.rz * rho;
        let y = terrain(x, z);
        if (rho >= 1) y = -0.06;
        const v = 0.8 + 0.3 * hash(x * 3.1 + z * 7.7);
        col.setRGB(0.14 * v, 0.3 * v, 0.07 * v);
        b.vertex(new Vector3(x, y, z), new Vector3(0, 1, 0), col, x * 0.4, z * 0.4);
      }
    }
    for (let i = 0; i < rings; i++) {
      for (let j = 0; j < segs; j++) {
        const a = base + i * (segs + 1) + j;
        const c = a + segs + 1;
        b.indices.push(a, c, a + 1, c, c + 1, a + 1);
      }
    }
  }
  const geo = b.build();
  geo.computeVertexNormals();
  const mesh = new Mesh(geo, new MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  mesh.receiveShadow = true;
  return mesh;
}

function sampleGround(i) {
  const weights = MOUNDS.map((m) => m.rx * m.rz);
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rnd(i * 3 + 1) * total;
  let k = 0;
  while (r > weights[k]) r -= weights[k++];
  const m = MOUNDS[k];
  const rho = Math.sqrt(rnd(i * 3 + 2)) * 0.97;
  const a = rnd(i * 3 + 3) * TAU;
  const x = m.cx + Math.cos(a) * m.rx * rho;
  const z = m.cz + Math.sin(a) * m.rz * rho;
  return [x, terrain(x, z), z];
}

function onPad(x, z) {
  return PADS.some((p) => Math.abs(x - p.x) < p.w / 2 + 0.15 && Math.abs(z - p.z) < p.d / 2 + 0.15);
}

// ---------------------------------------------------------------- grass

function buildGrass(count, uniforms) {
  const blade = new BufferGeometry();
  const segs = 4;
  const pos = [];
  const col = [];
  const nrm = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const w = 0.045 * (1 - t * 0.92);
    const bend = t * t * 0.12;
    pos.push(-w, t, bend, w, t, bend);
    const shade = 0.45 + 0.55 * t;
    col.push(shade, shade, shade, shade, shade, shade);
    nrm.push(0, 0.3, 1, 0, 0.3, 1);
  }
  const idx = [];
  for (let i = 0; i < segs; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  blade.setAttribute('position', new Float32BufferAttribute(pos, 3));
  blade.setAttribute('color', new Float32BufferAttribute(col, 3));
  blade.setAttribute('normal', new Float32BufferAttribute(nrm, 3));
  blade.setIndex(idx);

  const mat = new MeshLambertMaterial({ vertexColors: true, side: DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec3 root = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float sway = sin(uTime * 1.7 + root.x * 0.8 + root.z * 0.6) * 0.07 + sin(uTime * 2.9 + root.x * 2.1) * 0.03;
        transformed.x += sway * position.y * position.y;
        transformed.z += sway * 0.5 * position.y * position.y;`,
      );
  };
  const mesh = new InstancedMesh(blade, mat, count);
  const o = new Object3D();
  const c = new Color();
  let placed = 0;
  for (let i = 0; placed < count && i < count * 3; i++) {
    const [x, y, z] = sampleGround(i);
    if (y < 0.04 || onPad(x, z)) continue;
    o.position.set(x, y - 0.02, z);
    o.rotation.set((rnd(i * 5) - 0.5) * 0.5, rnd(i * 7) * TAU, (rnd(i * 11) - 0.5) * 0.5);
    const h = 0.13 + rnd(i * 13) * 0.17;
    o.scale.set(0.6 + rnd(i * 17) * 0.5, h, 1);
    o.updateMatrix();
    mesh.setMatrixAt(placed, o.matrix);
    const g = 0.7 + rnd(i * 19) * 0.5;
    const dry = rnd(i * 31) < 0.12 ? 0.08 : 0;
    c.setRGB((0.2 + dry) * g, (0.4 + rnd(i * 23) * 0.1) * g, (0.09 + rnd(i * 29) * 0.05) * g);
    mesh.setColorAt(placed, c);
    placed++;
  }
  mesh.count = placed;
  mesh.receiveShadow = true;
  return mesh;
}

// ---------------------------------------------------------------- shared blocks

const grey = (s) => ({ r: s, g: s, b: s });

// Axis-aligned box with world-scale UVs (u along the face width, v up).
function addBox(b, cx, cy, cz, sx, sy, sz, shade = 1, rotY = 0) {
  const hx = sx / 2;
  const hy = sy / 2;
  const hz = sz / 2;
  const cr = Math.cos(rotY);
  const sr = Math.sin(rotY);
  const tr = (x, y, z) => new Vector3(cx + x * cr + z * sr, cy + y, cz - x * sr + z * cr);
  const tn = (x, y, z) => new Vector3(x * cr + z * sr, y, -x * sr + z * cr);
  const faces = [
    [[1, 0, 0], [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]], sz, sy],
    [[-1, 0, 0], [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]], sz, sy],
    [[0, 0, 1], [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]], sx, sy],
    [[0, 0, -1], [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]], sx, sy],
    [[0, 1, 0], [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]], sx, sz],
    [[0, -1, 0], [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]], sx, sz],
  ];
  for (const [nn, quad, w, h] of faces) {
    const base = b.vertexCount;
    const n = tn(...nn);
    const uv = [[0, 0], [w, 0], [w, h], [0, h]];
    const s = nn[1] < 0 ? shade * 0.6 : shade;
    quad.forEach((q, k) => b.vertex(tr(...q), n, grey(s), uv[k][0], uv[k][1]));
    b.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

// Thin square beam between two points (lattice towers, frames).
function addBeam(b, p0, p1, t, shade = 1) {
  const axis = new Vector3().subVectors(p1, p0);
  const len = axis.length();
  axis.normalize();
  const ref = Math.abs(axis.y) < 0.95 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
  const u = new Vector3().crossVectors(axis, ref).normalize().multiplyScalar(t / 2);
  const v = new Vector3().crossVectors(axis, u).normalize().multiplyScalar(t / 2);
  const corners = [u.clone().add(v), u.clone().sub(v), u.clone().negate().sub(v), u.clone().negate().add(v)];
  for (let k = 0; k < 4; k++) {
    const a = corners[k];
    const c = corners[(k + 1) % 4];
    const n = a.clone().add(c).normalize();
    const base = b.vertexCount;
    b.vertex(p0.clone().add(a), n, grey(shade), 0, 0);
    b.vertex(p0.clone().add(c), n, grey(shade), 1, 0);
    b.vertex(p1.clone().add(c), n, grey(shade), 1, len);
    b.vertex(p1.clone().add(a), n, grey(shade), 0, len);
    b.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

// Gable roof prism over a footprint, ridge along X.
function addGable(b, cx, cy, cz, sx, sz, h, overhang = 0.15) {
  const hx = sx / 2 + overhang;
  const hz = sz / 2 + overhang;
  const ridge = [new Vector3(cx - hx, cy + h, cz), new Vector3(cx + hx, cy + h, cz)];
  const eaveF = [new Vector3(cx - hx, cy, cz + hz), new Vector3(cx + hx, cy, cz + hz)];
  const eaveB = [new Vector3(cx - hx, cy, cz - hz), new Vector3(cx + hx, cy, cz - hz)];
  const quad = (a, bq, c, d) => {
    const n = new Vector3().subVectors(bq, a).cross(new Vector3().subVectors(d, a)).normalize();
    const base = b.vertexCount;
    [a, bq, c, d].forEach((p, k) => b.vertex(p, n, grey(1), [0, sx, sx, 0][k], [0, 0, h, h][k]));
    b.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  quad(eaveF[0], eaveF[1], ridge[1], ridge[0]);
  quad(eaveB[1], eaveB[0], ridge[0], ridge[1]);
  for (const [e1, e2, r] of [[eaveB[0], eaveF[0], ridge[0]], [eaveF[1], eaveB[1], ridge[1]]]) {
    const n = new Vector3().subVectors(e2, e1).cross(new Vector3().subVectors(r, e1)).normalize();
    const base = b.vertexCount;
    b.vertex(e1, n, grey(0.9), 0, 0);
    b.vertex(e2, n, grey(0.9), 1, 0);
    b.vertex(r, n, grey(0.9), 0.5, 1);
    b.indices.push(base, base + 1, base + 2);
  }
}

function facadeTexture(kind) {
  const [c, ctx] = canvas(512);
  if (kind === 'glass') {
    // blue curtain wall with sky reflection and light mullions
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, '#9cc6f2');
    g.addColorStop(0.55, '#3f78bf');
    g.addColorStop(1, '#1d3f73');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 4; j++) {
        ctx.fillStyle = `rgba(255,255,255,${0.04 + hash(i * 7 + j) * 0.1})`;
        ctx.fillRect(i * 64 + 3, j * 128 + 3, 58, 122);
      }
    }
    ctx.fillStyle = '#d9e1ea';
    for (let i = 0; i <= 8; i++) ctx.fillRect(i * 64 - 2, 0, 4, 512);
    for (let j = 0; j <= 4; j++) ctx.fillRect(0, j * 128 - 3, 512, 6);
  } else if (kind === 'warm') {
    // villa glazing: warm interior light behind dark frames
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, '#ffe4b8');
    g.addColorStop(1, '#f0a660');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 512);
    ctx.fillStyle = 'rgba(80, 50, 30, 0.25)';
    for (let i = 0; i < 6; i++) ctx.fillRect(40 + i * 80, 300 + hash(i) * 80, 30, 212);
    ctx.fillStyle = '#2b2f36';
    for (let i = 0; i <= 4; i++) ctx.fillRect(i * 128 - 5, 0, 10, 512);
    ctx.fillRect(0, 250, 512, 8);
    ctx.fillRect(0, 0, 512, 10);
    ctx.fillRect(0, 502, 512, 10);
  } else if (kind === 'solar') {
    ctx.fillStyle = '#16346e';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        const g = ctx.createLinearGradient(i * 64, j * 64, i * 64 + 64, j * 64 + 64);
        g.addColorStop(0, '#1e4a9a');
        g.addColorStop(1, '#122a5c');
        ctx.fillStyle = g;
        ctx.fillRect(i * 64 + 2, j * 64 + 2, 60, 60);
      }
    }
    ctx.strokeStyle = 'rgba(200,215,235,0.55)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      for (let k = 1; k < 4; k++) {
        ctx.beginPath();
        ctx.moveTo(i * 64 + 2, i * 0 + k * 16);
        ctx.stroke();
      }
    }
    ctx.strokeStyle = '#c9d2dd';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, 508, 508);
  } else if (kind === 'wood') {
    ctx.fillStyle = '#9a6640';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 16; i++) {
      ctx.fillStyle = `rgba(${60 + hash(i) * 40}, ${35 + hash(i * 3) * 20}, 20, 0.35)`;
      ctx.fillRect(0, i * 32, 512, 2);
      ctx.fillStyle = `rgba(255,220,180,${0.05 + hash(i * 5) * 0.08})`;
      ctx.fillRect(0, i * 32 + 4, 512, 24);
    }
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

// ---------------------------------------------------------------- left: industry

function buildFactory(materials) {
  const g = new Group();
  const concrete = new GeometryBuilder();
  const glass = new GeometryBuilder();
  const metal = new GeometryBuilder();
  const dark = new GeometryBuilder();

  const fx = -6.6;
  const fz = -3.3;
  const y0 = pad(fx, fz, 5.6, 3.4, 1.0);
  // production hall
  addBox(concrete, fx + 0.6, y0 + 1.25, fz - 0.2, 4.6, 2.5, 2.8);
  addBox(glass, fx + 0.6, y0 + 1.35, fz + 1.21, 4.3, 2.0, 0.04);
  addBox(dark, fx + 0.6, y0 + 2.56, fz - 0.2, 4.7, 0.12, 2.9);
  // office tower with full glazing
  addBox(concrete, fx - 1.9, y0 + 2.1, fz + 0.1, 2.0, 4.2, 2.1);
  addBox(glass, fx - 1.9, y0 + 2.2, fz + 1.16, 1.84, 3.9, 0.04);
  addBox(glass, fx - 2.91, y0 + 2.2, fz + 0.1, 0.04, 3.9, 1.9);
  addBox(dark, fx - 1.9, y0 + 4.25, fz + 0.1, 2.1, 0.1, 2.2);
  // roof plant
  for (let i = 0; i < 3; i++) addBox(metal, fx - 0.4 + i * 1.1, y0 + 2.78, fz - 0.6, 0.6, 0.32, 0.7, 0.9);
  // loading doors
  for (let i = 0; i < 2; i++) addBox(dark, fx + 1.4 + i * 1.1, y0 + 0.55, fz + 1.23, 0.8, 1.1, 0.03, 0.8);

  // two chimneys behind the hall
  for (const [x, z, h, r] of [[fx + 1.4, fz - 1.7, 7.4, 0.3], [fx + 2.4, fz - 1.3, 6.6, 0.27]]) {
    const y = terrain(x, z) - 0.1;
    addLathe(
      metal,
      new Vector3(x, y, z),
      new Vector3(0, 1, 0),
      new Vector3(1, 0, 0),
      new Vector3(0, 0, -1),
      [
        [r * 1.25, 0],
        [r * 1.12, 0.5],
        [r, 1.2],
        [r, h * 0.62],
        [r * 1.06, h * 0.62],
        [r * 1.06, h * 0.68],
        [r * 0.97, h * 0.68],
        [r * 0.95, h - 0.4],
        [r * 1.08, h - 0.4],
        [r * 1.08, h],
        [r * 0.85, h],
        [r * 0.85, h - 0.3],
      ],
      40,
      { shade: (k) => (k === 4 || k === 8 ? 0.7 : 1) },
    );
  }
  g.add(mesh(concrete, materials.concrete, true));
  g.add(mesh(glass, materials.curtain, true));
  g.add(mesh(metal, materials.steel, true));
  g.add(mesh(dark, materials.darkMetal, true));
  return g;
}

function buildTurbine(materials, x, z, h, scale, yaw) {
  const g = new Group();
  const y = terrain(x, z) - 0.05;
  const tower = new GeometryBuilder();
  addLathe(tower, new Vector3(0, 0, 0), new Vector3(0, 1, 0), new Vector3(1, 0, 0), new Vector3(0, 0, -1), [
    [0.26, 0],
    [0.24, 0.15],
    [0.16, h * 0.4],
    [0.1, h],
    [0.001, h],
  ], 24);
  const nacelle = new GeometryBuilder();
  addBox(nacelle, 0, h + 0.16, -0.12, 0.34, 0.34, 0.95);
  g.add(mesh(tower, materials.turbine, true));
  g.add(mesh(nacelle, materials.turbine, true));
  const rotor = new Group();
  rotor.position.set(0, h + 0.16, 0.38);
  const hub = new GeometryBuilder();
  addLathe(hub, new Vector3(0, 0, -0.05), new Vector3(0, 0, 1), new Vector3(1, 0, 0), new Vector3(0, 1, 0), [
    [0.18, 0],
    [0.17, 0.12],
    [0.1, 0.3],
    [0.001, 0.38],
  ], 20);
  rotor.add(mesh(hub, materials.turbine, true));
  const blade = new GeometryBuilder();
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU;
    const L = 3.3;
    const steps = 10;
    const base = blade.vertexCount;
    for (let i = 0; i <= steps; i++) {
      const s = i / steps;
      const chord = 0.34 * Math.pow(1 - s, 0.8) + 0.05;
      const twist = 0.5 - s * 0.45;
      const r = 0.12 + s * L;
      for (const side of [-1, 1]) {
        const cx = Math.cos(a) * r;
        const cy = Math.sin(a) * r;
        const ox = -Math.sin(a) * chord * 0.5 * side * Math.cos(twist);
        const oy = Math.cos(a) * chord * 0.5 * side * Math.cos(twist);
        const oz = chord * 0.5 * side * Math.sin(twist);
        blade.vertex(new Vector3(cx + ox, cy + oy, oz), new Vector3(0, 0, 1), grey(1), s, side);
      }
    }
    for (let i = 0; i < steps; i++) {
      const p = base + i * 2;
      blade.indices.push(p, p + 1, p + 2, p + 1, p + 3, p + 2);
    }
  }
  const bladeMesh = mesh(blade, materials.blade, true);
  rotor.add(bladeMesh);
  g.add(rotor);
  g.position.set(x, y, z);
  g.rotation.y = yaw;
  g.scale.setScalar(scale);
  return { group: g, rotor };
}

// ---------------------------------------------------------------- right: home and grid

function buildVilla(materials) {
  const g = new Group();
  const walls = new GeometryBuilder();
  const windows = new GeometryBuilder();
  const roof = new GeometryBuilder();
  const wood = new GeometryBuilder();
  const dark = new GeometryBuilder();
  const vx = 4.9;
  const vz = -3.0;
  const y0 = pad(vx, vz, 4.9, 3.0, 1.0);
  const yaw = -0.18;
  const R = (x, z) => [vx + x * Math.cos(yaw) + z * Math.sin(yaw), vz - x * Math.sin(yaw) + z * Math.cos(yaw)];
  // ground floor (wide), upper floor (set back), garage wing
  let [x, z] = R(0, 0);
  addBox(walls, x, y0 + 0.85, z, 4.4, 1.7, 2.6, 1, yaw);
  [x, z] = R(-0.5, -0.1);
  addBox(walls, x, y0 + 2.45, z, 3.0, 1.5, 2.2, 1, yaw);
  [x, z] = R(2.6, -0.2);
  addBox(wood, x, y0 + 0.7, z, 1.3, 1.4, 2.2, 1, yaw);
  // glazing: big ground-floor windows, upper windows
  [x, z] = R(-0.6, 1.31);
  addBox(windows, x, y0 + 0.8, z, 2.8, 1.25, 0.04, 1, yaw);
  [x, z] = R(1.5, 1.31);
  addBox(windows, x, y0 + 0.85, z, 0.9, 1.0, 0.04, 1, yaw);
  [x, z] = R(-0.5, 1.01);
  addBox(windows, x, y0 + 2.45, z, 2.2, 0.95, 0.04, 1, yaw);
  // wood cladding strip and balcony slab
  [x, z] = R(1.0, 1.02);
  addBox(wood, x, y0 + 2.45, z, 0.7, 1.4, 0.06, 1, yaw);
  [x, z] = R(-0.5, 1.25);
  addBox(dark, x, y0 + 1.75, z, 3.4, 0.1, 0.55, 1, yaw);
  // roofs
  [x, z] = R(-0.5, -0.1);
  const roofGroup = new GeometryBuilder();
  addGable(roofGroup, 0, 0, 0, 3.0, 2.2, 0.85, 0.2);
  const roofGeo = roofGroup.build();
  roofGeo.rotateY(yaw).translate(x, y0 + 3.2, z);
  [x, z] = R(1.6, 0.1);
  const roof2 = new GeometryBuilder();
  addGable(roof2, 0, 0, 0, 1.8, 2.6, 0.55, 0.18);
  const roof2Geo = roof2.build();
  roof2Geo.rotateY(yaw + Math.PI / 2).translate(x, y0 + 1.7, z);
  g.add(mesh(walls, materials.render, true));
  g.add(mesh(windows, materials.warmGlass, true));
  g.add(mesh(wood, materials.wood, true));
  g.add(mesh(dark, materials.darkMetal, true));
  for (const geo of [roofGeo, roof2Geo]) {
    const m = new Mesh(geo, materials.roof);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
  }
  // small solar panels on the upper roof
  const pv = new GeometryBuilder();
  [x, z] = R(-0.6, 0.45);
  addBox(pv, x, y0 + 3.62, z, 1.6, 0.04, 0.6, 1, yaw);
  const pvGeo = pv.build();
  pvGeo.translate(-x, -(y0 + 3.62), -z).rotateX(-0.6).rotateY(yaw).translate(x, y0 + 3.6, z);
  const pvMesh = new Mesh(pvGeo, materials.solar);
  pvMesh.castShadow = true;
  g.add(pvMesh);
  return g;
}

function buildPylon(materials) {
  const b = new GeometryBuilder();
  const px = 9.9;
  const pz = -4.6;
  const y = Math.max(0, terrain(px, pz));
  const H = 10.6;
  const leg = (s, h) => {
    const w = 0.85 - (h / H) * 0.62;
    return new Vector3(px + s[0] * w, y + h, pz + s[1] * w);
  };
  const corners = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
  const levels = [0, 1.6, 3.1, 4.5, 5.8, 7.0, 8.0, 9.0, 9.8, H];
  for (const c of corners) for (let i = 0; i < levels.length - 1; i++) addBeam(b, leg(c, levels[i]), leg(c, levels[i + 1]), 0.07);
  for (let i = 0; i < levels.length - 1; i++) {
    for (let k = 0; k < 4; k++) {
      const c0 = corners[k];
      const c1 = corners[(k + 1) % 4];
      addBeam(b, leg(c0, levels[i]), leg(c1, levels[i + 1]), 0.035);
      addBeam(b, leg(c1, levels[i]), leg(c0, levels[i + 1]), 0.035);
      addBeam(b, leg(c0, levels[i + 1]), leg(c1, levels[i + 1]), 0.04);
    }
  }
  // cross arms with insulators
  const arms = [];
  for (const [h, w] of [[7.0, 2.4], [8.6, 1.9], [H, 1.2]]) {
    const yy = y + h;
    for (const s of [-1, 1]) {
      const tip = new Vector3(px + s * w, yy, pz);
      addBeam(b, new Vector3(px + s * 0.25, yy, pz + 0.22), tip, 0.06);
      addBeam(b, new Vector3(px + s * 0.25, yy, pz - 0.22), tip, 0.06);
      addBeam(b, new Vector3(px + s * 0.25, yy - 0.6, pz), tip, 0.05);
      arms.push(tip);
    }
  }
  const g = new Group();
  g.add(mesh(b, materials.steel, true));
  // insulators and conductors swinging off to the right
  const ins = new GeometryBuilder();
  const wires = new GeometryBuilder();
  for (const tip of arms) {
    addBeam(ins, tip, tip.clone().add(new Vector3(0, -0.55, 0)), 0.09, 0.9);
    const a = tip.clone().add(new Vector3(0, -0.55, 0));
    const end = new Vector3(26, a.y + 1.5, a.z + 6);
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const p = new Vector3().lerpVectors(a, end, t);
      p.y -= Math.sin(t * Math.PI) * 1.4;
      pts.push(p);
    }
    for (let i = 0; i < pts.length - 1; i++) addBeam(wires, pts[i], pts[i + 1], 0.025, 0.8);
  }
  g.add(mesh(ins, materials.insulator, true));
  g.add(mesh(wires, materials.darkMetal, false));
  return g;
}

function buildSolarArray(materials) {
  const g = new Group();
  const frame = new GeometryBuilder();
  const sx = 6.25;
  const sz = 2.75;
  const y = pad(sx, sz, 3.0, 1.6, 0.6);
  const w = 3.0;
  const d = 1.55;
  const tilt = 0.5;
  // legs
  for (const [ox, oz, h] of [[-1.3, -0.5, 1.15], [1.3, -0.5, 1.15], [-1.3, 0.45, 0.55], [1.3, 0.45, 0.55]]) {
    addBeam(frame, new Vector3(sx + ox, y - 0.05, sz + oz), new Vector3(sx + ox, y + h, sz + oz), 0.07);
  }
  const panelB = new GeometryBuilder();
  addBox(panelB, 0, 0, 0, w, 0.05, d);
  const geo = panelB.build();
  geo.rotateX(tilt).translate(sx, y + 0.9, sz - 0.02);
  const p = new Mesh(geo, materials.solar);
  p.castShadow = p.receiveShadow = true;
  g.add(p);
  g.add(mesh(frame, materials.steel, true));
  return g;
}

// ---------------------------------------------------------------- trees

function leafTexture() {
  const [c, ctx] = canvas(256);
  for (let i = 0; i < 90; i++) {
    const x = 128 + (hash(i * 3.1) - 0.5) * 200;
    const y = 128 + (hash(i * 5.7) - 0.5) * 200;
    if (Math.hypot(x - 128, y - 128) > 112) continue;
    const g = 0.6 + hash(i * 9.3) * 0.5;
    ctx.fillStyle = `rgb(${Math.round(60 * g)}, ${Math.round(130 * g)}, ${Math.round(45 * g)})`;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(hash(i * 2.2) * TAU);
    ctx.beginPath();
    ctx.ellipse(0, 0, 13 + hash(i) * 7, 6 + hash(i * 4) * 3, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

const TREES = [
  [-9.4, -1.6, 1.25], [-8.6, -4.6, 1.05], [-3.4, -1.0, 0.95], [-2.7, -3.9, 1.1], [-7.9, -0.4, 0.8], [-4.1, -5.2, 0.9],
  [2.4, -2.0, 1.0], [3.0, -4.8, 1.15], [7.9, -1.2, 1.05], [8.5, -3.6, 0.85], [7.4, 1.3, 0.7], [2.3, -0.6, 0.7],
];

function buildTrees(materials, quality) {
  const trunks = new GeometryBuilder();
  const cards = [];
  TREES.forEach(([x, z, s], ti) => {
    const y = terrain(x, z) - 0.05;
    const h = 1.5 * s;
    addLathe(trunks, new Vector3(x, y, z), new Vector3(0, 1, 0), new Vector3(1, 0, 0), new Vector3(0, 0, -1), [
      [0.09 * s, 0],
      [0.06 * s, h * 0.7],
      [0.03 * s, h * 1.1],
      [0.001, h * 1.1],
    ], 10);
    const crown = new Vector3(x, y + h + 0.55 * s, z);
    const clusters = quality === 'low' ? 7 : 12;
    for (let c = 0; c < clusters; c++) {
      const a = rnd(ti * 50 + c) * TAU;
      const e = (rnd(ti * 50 + c + 7) - 0.3) * 1.2;
      const r = 0.55 * s * Math.sqrt(rnd(ti * 50 + c + 13));
      const cc = crown.clone().add(new Vector3(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r * 0.8, Math.sin(a) * Math.cos(e) * r));
      const per = quality === 'low' ? 7 : 12;
      for (let k = 0; k < per; k++) {
        const id = ti * 1000 + c * 40 + k;
        const off = new Vector3(rnd(id) - 0.5, rnd(id + 1) - 0.5, rnd(id + 2) - 0.5).multiplyScalar(0.55 * s);
        const pos = cc.clone().add(off);
        const up = (pos.y - crown.y) / (0.9 * s) + 0.5;
        const front = (pos.z - z) / (0.8 * s) * 0.5 + 0.5;
        cards.push({ pos, size: (0.55 + rnd(id + 3) * 0.35) * s, rot: [rnd(id + 4) * TAU, rnd(id + 5) * TAU, rnd(id + 6) * TAU], light: 0.55 + 0.35 * Math.min(1, Math.max(0, up)) + 0.15 * front });
      }
    }
  });
  const g = new Group();
  g.add(mesh(trunks, materials.bark, true));
  const leaves = new InstancedMesh(new PlaneGeometry(1, 1), materials.leaves, cards.length);
  const o = new Object3D();
  const col = new Color();
  cards.forEach((c, i) => {
    o.position.copy(c.pos);
    o.rotation.set(...c.rot);
    o.scale.setScalar(c.size);
    o.updateMatrix();
    leaves.setMatrixAt(i, o.matrix);
    col.setRGB(c.light * (0.85 + rnd(i) * 0.25), c.light, c.light * (0.8 + rnd(i * 2) * 0.2));
    leaves.setColorAt(i, col);
  });
  leaves.castShadow = true;
  leaves.receiveShadow = true;
  g.add(leaves);
  return g;
}

// ---------------------------------------------------------------- assembly

function mesh(builder, material, cast) {
  const m = new Mesh(builder.build(), material);
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
}

// ---------------------------------------------------------------- current pulse

function buildPulse() {
  const [c, g] = canvas(128);
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.16, 'rgba(180,228,255,0.95)');
  grad.addColorStop(0.45, 'rgba(70,150,255,0.35)');
  grad.addColorStop(1, 'rgba(40,110,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  const glow = new Sprite(new SpriteMaterial({ map: tex, blending: AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
  const light = new PointLight('#7cc4ff', 0, 5.5, 1.8);
  const p = new Vector3();
  return {
    light,
    glow,
    update(time) {
      // one lap every 9 s along the visible length, fading in and out at the ends
      const u = (time / 9) % 1;
      cablePoint(T_START + 0.5 + (T_END - T_START - 1.1) * u, p);
      const fade = smoothstep(0, 0.08, u) * (1 - smoothstep(0.9, 1, u));
      p.y += CH / 2 + 0.08;
      light.position.copy(p);
      light.intensity = 14 * fade;
      glow.position.copy(p);
      glow.scale.setScalar(1.5 * fade + 0.001);
    },
  };
}

export function createInfinityScene(renderer, quality = 'high') {
  PADS.length = 0;
  const Q = QUALITY[quality === 'low' ? 'low' : 'high'];
  const scene = new Scene();
  scene.environment = skyEnvironment(renderer);
  scene.environmentIntensity = 0.9;
  scene.fog = new Fog('#e7f1fd', 46, 120);

  const glassTex = facadeTexture('glass');
  glassTex.repeat.set(0.45, 0.32);
  const warmTex = facadeTexture('warm');
  warmTex.repeat.set(0.5, 0.75);
  const solarTex = facadeTexture('solar');
  solarTex.repeat.set(0.5, 0.9);
  const woodTex = facadeTexture('wood');
  woodTex.repeat.set(0.6, 0.6);
  const materials = {
    concrete: new MeshStandardMaterial({ color: '#dfe3e8', roughness: 0.82, vertexColors: true }),
    curtain: new MeshPhysicalMaterial({ map: glassTex, roughness: 0.08, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05, vertexColors: true }),
    steel: new MeshStandardMaterial({ color: '#b6bdc6', metalness: 0.75, roughness: 0.38, vertexColors: true }),
    darkMetal: new MeshStandardMaterial({ color: '#3a414b', metalness: 0.5, roughness: 0.45, vertexColors: true }),
    turbine: new MeshStandardMaterial({ color: '#f5f7f9', roughness: 0.38, vertexColors: true }),
    blade: new MeshStandardMaterial({ color: '#f7f8fa', roughness: 0.36, side: DoubleSide, vertexColors: true }),
    render: new MeshStandardMaterial({ color: '#f3f1ec', roughness: 0.78, vertexColors: true }),
    warmGlass: new MeshStandardMaterial({ map: warmTex, emissiveMap: warmTex, emissive: '#ffffff', emissiveIntensity: 0.55, roughness: 0.15, metalness: 0.1, vertexColors: true }),
    wood: new MeshStandardMaterial({ map: woodTex, roughness: 0.62, vertexColors: true }),
    roof: new MeshStandardMaterial({ color: '#3e444d', roughness: 0.62, metalness: 0.2 }),
    solar: new MeshPhysicalMaterial({ map: solarTex, roughness: 0.18, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.04 }),
    insulator: new MeshStandardMaterial({ color: '#5c6f86', roughness: 0.2, metalness: 0.1, vertexColors: true }),
    bark: new MeshStandardMaterial({ color: '#5a4636', roughness: 0.9, vertexColors: true }),
    leaves: new MeshLambertMaterial({ map: leafTexture(), alphaTest: 0.5, side: DoubleSide }),
  };

  const world = new Group();
  scene.add(world);
  const cable = buildCable(Q, quality);
  world.add(cable.group);

  // buildings first: they register the flat pads the terrain blends into
  const factory = buildFactory(materials);
  const villa = buildVilla(materials);
  const solar = buildSolarArray(materials);
  const turbines = [
    buildTurbine(materials, -9.0, -4.4, 8.4, 1, 0.35),
    buildTurbine(materials, -3.6, -5.6, 7.6, 0.92, 0.25),
    buildTurbine(materials, -10.6, -2.2, 6.6, 0.85, 0.45),
  ];
  world.add(buildTerrain(quality));
  world.add(factory, villa, solar, buildPylon(materials), buildTrees(materials, quality));
  for (const t of turbines) world.add(t.group);

  const uniforms = { uTime: { value: 0 } };
  world.add(buildGrass(quality === 'low' ? 14000 : 42000, uniforms));

  const floor = new Mesh(new PlaneGeometry(90, 90), new ShadowMaterial({ opacity: 0.26 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.001;
  floor.receiveShadow = true;
  world.add(floor);

  const sun = new DirectionalLight('#fff1dc', 3.2);
  sun.position.set(-15, 17, 6);
  sun.target.position.set(0, 0, -1.5);
  // contact shadows ground every building and the cable on every device; phones get a smaller map
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(quality === 'low' ? 1024 : 2048);
  sun.shadow.camera.left = -15;
  sun.shadow.camera.right = 15;
  sun.shadow.camera.top = 12;
  sun.shadow.camera.bottom = -10;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 60;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  scene.add(new HemisphereLight('#d6e8ff', '#6f8a55', 0.42));
  renderer.shadowMap.enabled = sun.castShadow;
  renderer.shadowMap.type = PCFShadowMap;

  // a pulse of current running along the cable: a soft blue light and its glow
  const pulse = buildPulse();
  world.add(pulse.light, pulse.glow);
  const sunHome = sun.position.clone();

  return {
    scene,
    world,
    sun,
    // focus points for the camera rig, world space
    focus: { centre: new Vector3(0, 2.6, -0.9), tip: cable.tip },
    bounds: { width: 24.5, height: 11.5 },
    update(time) {
      uniforms.uTime.value = time;
      // the sun drifts a little, so light and shadow are never quite still
      sun.position.set(sunHome.x + Math.sin(time * 0.11) * 2.2, sunHome.y, sunHome.z + Math.cos(time * 0.11) * 1.6);
      pulse.update(time);
      turbines.forEach((t, i) => {
        t.rotor.rotation.z = time * (0.9 + i * 0.13) + i;
      });
    },
  };
}
