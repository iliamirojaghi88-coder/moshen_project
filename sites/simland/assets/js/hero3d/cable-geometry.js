// Cable geometry, shared by the live WebGL scenes and the Blender renders
// (tools/export-cables.mjs writes these same meshes to OBJ). Pure geometry:
// no DOM, no materials. Every part carries a material key.
//
// Units: 1 = 10 mm. Cable axis +Y; the outer sheath is cut at y = 0.
//
//   armoured   4-core armoured power cable, stepped cut-back:
//              PVC sheath → galvanised steel wire armour → bedding →
//              4 PVC cores (IEC brown/black/grey/blue) → 37-strand copper
//   instrument screened instrumentation cable, sky-blue sheath:
//              sheath → aluminium foil screen + tinned drain wire →
//              4 twisted pairs (white with blue/orange/green/brown) → 7-strand copper
//   single     single-core cable: sheath → insulation → 61-strand copper
import { Vector3 } from 'three';
import { GeometryBuilder, addLathe, addTube, hash, smoothstep } from './geometry.js';

const Y = new Vector3(0, 1, 0);
const X = new Vector3(1, 0, 0);
const NZ = new Vector3(0, 0, -1);
const ORIGIN = new Vector3();

export const QUALITY = {
  ultra: { sheathRadial: 192, coreRadial: 64, coreSteps: 64, strandRadial: 16, strandSteps: 40, wireRadial: 12 },
  high: { sheathRadial: 128, coreRadial: 44, coreSteps: 44, strandRadial: 10, strandSteps: 20, wireRadial: 8 },
  low: { sheathRadial: 72, coreRadial: 28, coreSteps: 24, strandRadial: 7, strandSteps: 11, wireRadial: 6 },
};

const range = (y0, y1, steps) => Array.from({ length: steps + 1 }, (_, i) => y0 + ((y1 - y0) * i) / steps);

class Parts {
  constructor() {
    this.builders = new Map();
  }
  get(key) {
    if (!this.builders.has(key)) this.builders.set(key, new GeometryBuilder());
    return this.builders.get(key);
  }
  list() {
    return [...this.builders].map(([key, b]) => ({ key, geometry: b.build() }));
  }
}

// ---------------------------------------------------------------- building blocks

// Outer sheath: long tube cut square at y = 0 with a small rounded edge.
function sheath(parts, key, R, Rin, length, Q) {
  addLathe(
    parts.get(key),
    ORIGIN,
    Y,
    X,
    NZ,
    [
      [R, -length],
      [R, -0.035],
      [R - 0.014, -0.007],
      [R - 0.035, 0],
      [Rin + 0.02, 0],
      [Rin, -0.014],
      [Rin, -0.9],
    ],
    Q.sheathRadial,
    { shade: (k) => (k >= 5 ? 0.25 : 1), vFromHeight: true },
  );
}

// Concentric stranded conductor around the centre line `centre(y)`.
// layers: strand count per layer, e.g. [1, 6, 12, 18]; lay alternates.
export function conductor(b, centre, { radius, layers, yStart, top, flare = 0.14, seed = 0, lays, Q, tint = 0.14 }) {
  const rs = radius / (2 * layers.length - 1);
  const c = new Vector3();
  const strandOut = new Vector3();
  const coreOut = new Vector3();
  const last = layers.length - 1;
  layers.forEach((count, li) => {
    const ringR = li === 0 ? 0 : rs * 2 * li * 1.012;
    const dir = li % 2 ? 1 : -1;
    const lay = lays?.[li] ?? 6 + li * 1.8;
    const base = 0.3 + (0.2 * li) / Math.max(1, last);
    for (let s = 0; s < count; s++) {
      const sd = seed * 131 + li * 31 + s;
      const tTop = top + (hash(sd) - 0.5) * 0.05 * (radius / 0.4) - li * 0.01;
      const theta0 = (s / count) * Math.PI * 2 + seed * 0.7 + li * 0.37;
      const ys = range(yStart, tTop, Q.strandSteps);
      const angles = [];
      const pts = ys.map((y) => {
        centre(y, c);
        const theta = theta0 + (dir * Math.PI * 2 * (y - yStart)) / lay;
        const rho = ringR * (1 + flare * smoothstep(tTop - 0.75 * (radius / 0.41), tTop, y));
        angles.push(theta);
        return new Vector3(c.x + Math.cos(theta) * rho, y, c.z + Math.sin(theta) * rho);
      });
      addTube(b, pts, rs * 0.985, Q.strandRadial, {
        shade: (i, n) => {
          const y = ys[i];
          strandOut.set(Math.cos(angles[i]), 0, Math.sin(angles[i]));
          centre(y, c);
          coreOut.set(c.x, 0, c.z);
          if (coreOut.lengthSq() > 1e-6) coreOut.normalize();
          const facing = li === 0 ? 0 : Math.pow(Math.max(0, n.dot(strandOut) * 0.5 + 0.5), 1.6);
          let ao = base + (1 - base) * facing * (li === last ? 1 : 0.45);
          ao += (1 - ao) * 0.55 * smoothstep(tTop - 0.2, tTop, y);
          ao *= 0.5 + 0.5 * smoothstep(yStart + 0.04, yStart + 0.3, y);
          ao *= 0.8 + 0.2 * (n.dot(coreOut) * 0.5 + 0.5);
          return ao;
        },
        tint: 1 - tint / 2 + tint * hash(sd * 1.3),
        capEnd: true,
        capShade: 0.85 + 0.2 * (li / Math.max(1, last)),
        vScale: 1,
      });
    }
  });
  // conductor floor: only seen through gaps between strands
  centre(yStart + 0.02, c);
  addLathe(b, c.clone(), Y, X, NZ, [[radius, 0], [0, 0]], 24, { shade: () => 0.12 });
}

// Insulated core along `pts` with a cut face (bevel, flat ring, inner wall).
export function insulatedCore(b, pts, R, conductorR, Q, shade, { radial = Q.coreRadial } = {}) {
  const { T } = addTube(b, pts, R, radial, { shade });
  const end = pts[pts.length - 1];
  const t = T[T.length - 1];
  const n = new Vector3(1, 0, 0).addScaledVector(t, -t.x).normalize();
  const bn = new Vector3().crossVectors(t, n);
  addLathe(
    b,
    end.clone().addScaledVector(t, 0.03),
    t,
    n,
    bn,
    [
      [R, -0.03],
      [R, -0.012],
      [R - 0.013, 0],
      [conductorR, 0],
      [conductorR, -0.3],
    ],
    radial,
    { shade: (s) => (s >= 3 ? 0.18 : 0.95) },
  );
}

// ---------------------------------------------------------------- armoured power cable

const A = {
  sheathR: 2.0,
  sheathIn: 1.745,
  length: 34,
  armourRing: 1.665,
  armourWire: 0.072,
  armourTop: 0.52,
  beddingR: 1.588,
  beddingIn: 1.4,
  beddingTop: 1.25,
  coreOffset: 0.81,
  insulationR: 0.57,
  conductorR: 0.41,
  copperExposed: 1.25,
  cores: [
    { key: 'ins:#6b4631', top: 2.55 },
    { key: 'ins:#1f2124', top: 2.66 },
    { key: 'ins:#8e949c', top: 2.6 },
    { key: 'ins:#1d55c8', top: 2.72 },
  ],
};

function armouredCoreCentre(k, y, out = new Vector3()) {
  const phi = (k * Math.PI) / 2 + Math.PI / 4 + y * 0.05;
  const d = A.coreOffset + 0.2 * smoothstep(A.beddingTop, 4.4, y);
  return out.set(Math.cos(phi) * d, y, Math.sin(phi) * d);
}

function buildArmoured(Q) {
  const parts = new Parts();
  sheath(parts, 'sheath:black', A.sheathR, A.sheathIn, A.length, Q);

  // galvanised steel wire armour
  const armour = parts.get('armour');
  const wireCount = Math.round((Math.PI * 2 * A.armourRing) / (A.armourWire * 2.06));
  const lay = (Math.PI * 2) / 18;
  const out = new Vector3();
  for (let w = 0; w < wireCount; w++) {
    const a0 = (w / wireCount) * Math.PI * 2;
    const top = A.armourTop + (hash(w + 11) - 0.5) * 0.03;
    const pts = range(-0.4, top, 8).map((y) => {
      const a = a0 + y * lay;
      return new Vector3(Math.cos(a) * A.armourRing, y, Math.sin(a) * A.armourRing);
    });
    addTube(armour, pts, A.armourWire, Q.wireRadial, {
      shade: (i, n) => {
        const p = pts[i];
        out.set(p.x, 0, p.z).normalize();
        const facing = Math.pow(n.dot(out) * 0.5 + 0.5, 1.2);
        return (0.32 + 0.68 * facing) * (0.45 + 0.55 * smoothstep(-0.05, 0.22, p.y));
      },
      tint: 0.9 + 0.12 * hash(w * 3.1),
      capEnd: true,
      capShade: 0.95,
    });
  }

  // inner bedding + filler
  const bedding = parts.get('bedding');
  addLathe(
    bedding,
    ORIGIN,
    Y,
    X,
    NZ,
    [
      [A.beddingR, -0.4],
      [A.beddingR, A.beddingTop - 0.025],
      [A.beddingR - 0.02, A.beddingTop],
      [A.beddingIn + 0.015, A.beddingTop],
      [A.beddingIn, A.beddingTop - 0.012],
      [A.beddingIn, A.beddingTop - 0.06],
    ],
    Q.sheathRadial,
    { shade: (k, r, h) => (k === 0 ? 0.35 + 0.65 * smoothstep(A.armourTop, A.armourTop + 0.35, h) : k >= 4 ? 0.35 : 1) },
  );
  addLathe(bedding, new Vector3(0, A.beddingTop - 0.06, 0), Y, X, NZ, [[A.beddingIn, 0], [0, 0]], 48, { shade: () => 0.18 });

  // cores
  const copper = parts.get('copper');
  A.cores.forEach((core, k) => {
    const outward = new Vector3();
    const pts = range(-0.4, core.top - 0.03, Q.coreSteps).map((y) => armouredCoreCentre(k, y));
    insulatedCore(parts.get(core.key), pts, A.insulationR, A.conductorR, Q, (i, n) => {
      const p = pts[i];
      outward.set(p.x, 0, p.z).normalize();
      return (0.55 + 0.45 * (n.dot(outward) * 0.5 + 0.5)) * (0.4 + 0.6 * smoothstep(A.beddingTop, A.beddingTop + 0.55, p.y));
    });
    conductor(copper, (y, o) => armouredCoreCentre(k, y, o), {
      radius: A.conductorR,
      layers: [1, 6, 12, 18],
      yStart: core.top - 0.26,
      top: core.top + A.copperExposed,
      seed: k,
      lays: [1, 6.5, 8, 9.5],
      Q,
    });
  });

  return {
    parts: parts.list(),
    focus: { cut: new Vector3(0, 2.0, 0), tips: new Vector3(0, 3.6, 0) },
    // label anchors for the hero callouts: point + outward direction, model space
    anchors: {
      copper: { p: armouredCoreCentre(3, 3.55).add(new Vector3(0.2, 0, 0.35)), n: new Vector3(0.3, 0.4, 1).normalize() },
      insulation: { p: armouredCoreCentre(0, 2.0).multiplyScalar(1.45).setY(2.0), n: new Vector3(0.7, 0, 0.7).normalize() },
      armour: { p: new Vector3(A.armourRing * 0.7, 0.3, A.armourRing * 0.72), n: new Vector3(0.7, 0, 0.72).normalize() },
      sheath: { p: new Vector3(A.sheathR * 0.7, -1.4, A.sheathR * 0.72), n: new Vector3(0.7, 0, 0.72).normalize() },
    },
  };
}

// ---------------------------------------------------------------- screened instrumentation cable

const B = {
  sheathR: 1.5,
  sheathIn: 1.33,
  length: 30,
  foilR: 1.305,
  foilTop: 0.42,
  insulationR: 0.26,
  conductorR: 0.15,
  pairs: [
    ['ins:#eef0f2', 'ins:#1f62d6'],
    ['ins:#eef0f2', 'ins:#e8781e'],
    ['ins:#eef0f2', 'ins:#22a35a'],
    ['ins:#eef0f2', 'ins:#7a4b2c'],
  ],
};

function pairCentre(p, y, out = new Vector3()) {
  const phi = (p * Math.PI) / 2 + Math.PI / 4 + y * 0.06;
  const d = 0.6 + 0.42 * smoothstep(0.5, 3.0, y);
  return out.set(Math.cos(phi) * d, y, Math.sin(phi) * d);
}

function instrumentCoreCentre(p, j, y, out = new Vector3()) {
  pairCentre(p, y, out);
  const untwist = 1.35 + p * 0.12;
  const psi = p * 1.3 + j * Math.PI + (Math.PI * 2 * Math.min(y, untwist)) / 3.1;
  const sep = 0.27 + 0.14 * smoothstep(untwist, untwist + 0.9, y);
  return out.set(out.x + Math.cos(psi) * sep, y, out.z + Math.sin(psi) * sep);
}

function buildInstrument(Q) {
  const parts = new Parts();
  sheath(parts, 'sheath:blue', B.sheathR, B.sheathIn, B.length, Q);

  // aluminium foil screen: crinkled, torn unevenly at the cut-back
  const foil = parts.get('foil');
  const cols = Q.sheathRadial;
  const rows = 7;
  const base = foil.vertexCount;
  const p = new Vector3();
  const n = new Vector3();
  for (let i = 0; i <= rows; i++) {
    for (let j = 0; j <= cols; j++) {
      const a = (j / cols) * Math.PI * 2;
      const top = B.foilTop + 0.05 * Math.sin(a * 3 + 1) + 0.03 * Math.sin(a * 11) + (hash(j * 0.7) - 0.5) * 0.015;
      const y = -0.3 + ((top + 0.3) * i) / rows;
      const crinkle = 0.006 * Math.sin(a * 41 + y * 9) + 0.004 * Math.sin(a * 17 - y * 23);
      const r = B.foilR + crinkle;
      // same angular direction as addTube/addLathe (x = cos, z = -sin), so faces point out
      p.set(Math.cos(a) * r, y, -Math.sin(a) * r);
      n.set(Math.cos(a + crinkle * 30), 0, -Math.sin(a + crinkle * 30)).normalize();
      foil.vertex(p, n, { r: 1, g: 1, b: 1 }, j / cols, y);
    }
  }
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const a = base + i * (cols + 1) + j;
      const b2 = a + cols + 1;
      foil.indices.push(a, a + 1, b2, b2, a + 1, b2 + 1);
    }
  }

  // tinned drain wire, bent out of the bundle
  const drainCentre = (y, o = new Vector3()) => {
    const r = 1.14 + 0.5 * smoothstep(0.4, 2.6, y);
    const a = 3.6 + y * 0.05;
    return o.set(Math.cos(a) * r, y, Math.sin(a) * r);
  };
  conductor(parts.get('tinned'), drainCentre, { radius: 0.1, layers: [1, 6], yStart: -0.3, top: 3.05, seed: 9, lays: [1, 2.6], Q, flare: 0.05 });

  // twisted pairs
  const copper = parts.get('copper');
  B.pairs.forEach((pair, pi) => {
    pair.forEach((key, j) => {
      const top = 2.35 + hash(pi * 7 + j) * 0.35;
      const pts = range(-0.3, top - 0.03, Q.coreSteps).map((y) => instrumentCoreCentre(pi, j, y));
      const outward = new Vector3();
      insulatedCore(parts.get(key), pts, B.insulationR, B.conductorR, Q, (i, nn) => {
        const q = pts[i];
        outward.set(q.x, 0, q.z).normalize();
        return (0.55 + 0.45 * (nn.dot(outward) * 0.5 + 0.5)) * (0.45 + 0.55 * smoothstep(B.foilTop, B.foilTop + 0.6, q.y));
      }, { radial: Math.max(16, Math.round(Q.coreRadial * 0.6)) });
      conductor(copper, (y, o) => instrumentCoreCentre(pi, j, y, o), {
        radius: B.conductorR,
        layers: [1, 6],
        yStart: top - 0.24,
        top: top + 0.72,
        seed: pi * 2 + j + 20,
        lays: [1, 2.4],
        Q,
        flare: 0.1,
      });
    });
  });

  return {
    parts: parts.list(),
    focus: { cut: new Vector3(0, 1.5, 0), tips: new Vector3(0, 2.9, 0) },
    anchors: {},
  };
}

// ---------------------------------------------------------------- single-core cable

function buildSingle(Q) {
  const parts = new Parts();
  sheath(parts, 'sheath:black', 1.36, 1.17, 24, Q);
  const insTop = 0.95;
  const pts = range(-0.6, insTop - 0.03, 8).map((y) => new Vector3(0, y, 0));
  insulatedCore(parts.get('ins:#2a2d33'), pts, 1.165, 0.94, Q, (i) => 0.5 + 0.5 * smoothstep(0, 0.4, pts[i].y), {
    radial: Q.sheathRadial,
  });
  conductor(parts.get('copper'), (y, o) => o.set(0, y, 0), {
    radius: 0.94,
    layers: [1, 6, 12, 18, 24],
    yStart: insTop - 0.26,
    top: insTop + 1.75,
    seed: 3,
    lays: [1, 8, 10, 12, 14],
    Q,
    flare: 0.1,
  });
  return { parts: parts.list(), focus: { cut: new Vector3(0, 0.8, 0), tips: new Vector3(0, 2.4, 0) }, anchors: {} };
}

const KINDS = { armoured: buildArmoured, instrument: buildInstrument, single: buildSingle };

export function buildCableGeometry(kind, quality = 'high') {
  return KINDS[kind](QUALITY[quality] ?? QUALITY.high);
}
