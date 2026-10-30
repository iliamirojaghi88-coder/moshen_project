// Procedural model of a 4-core armoured low-voltage power cable, cut back in
// steps the way a cable is prepared for termination:
//   outer PVC sheath → galvanised steel wire armour → inner bedding →
//   four PVC-insulated cores (IEC brown / black / grey / blue) →
//   19-strand class-2 copper conductors (1 + 6 + 12, alternating lay).
// Units: 1 = 10 mm. The cable axis is +Y; the sheath is cut at y = 0.
import {
  CanvasTexture,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { GeometryBuilder, addLathe, addTube, hash, smoothstep } from './geometry.js';

const SHEATH_R = 2.0;
const SHEATH_IN = 1.745;
const SHEATH_LEN = 34;
const ARMOUR_RING = 1.665;
const ARMOUR_WIRE = 0.072;
const ARMOUR_TOP = 0.52;
const BEDDING_R = 1.588;
const BEDDING_IN = 1.4;
const BEDDING_TOP = 1.25;
const CORE_OFFSET = 0.81;
const INSULATION_R = 0.57;
const CONDUCTOR_R = 0.41;
const STRAND_R = 0.08;

const AXIS = new Vector3(0, 1, 0);
const AXIS_N = new Vector3(1, 0, 0);
const AXIS_B = new Vector3(0, 0, -1);

const CORES = [
  { colour: '#6b4631', insulationTop: 2.55 }, // brown  L1
  { colour: '#1f2124', insulationTop: 2.66 }, // black  L2
  { colour: '#8e949c', insulationTop: 2.6 }, //  grey   L3
  { colour: '#1d55c8', insulationTop: 2.72 }, // blue   N
];
const COPPER_EXPOSED = 1.25;

// Fixed-quality presets; 'low' is used on phones and weak GPUs.
const QUALITY = {
  high: { sheathRadial: 128, coreRadial: 48, coreSteps: 40, strandRadial: 12, strandSteps: 22, wireRadial: 8 },
  low: { sheathRadial: 72, coreRadial: 30, coreSteps: 22, strandRadial: 8, strandSteps: 12, wireRadial: 6 },
};

function coreCentre(k, y, out = new Vector3()) {
  const phi = (k * Math.PI) / 2 + Math.PI / 4 + y * 0.05;
  const d = CORE_OFFSET + 0.2 * smoothstep(BEDDING_TOP, 4.4, y);
  return out.set(Math.cos(phi) * d, y, Math.sin(phi) * d);
}

function range(y0, y1, steps) {
  const out = [];
  for (let i = 0; i <= steps; i++) out.push(y0 + ((y1 - y0) * i) / steps);
  return out;
}

function makeLegendTexture() {
  // Printed sheath legend, as on a real cable: brand name only, no ratings.
  const W = 1024;
  const H = 1152;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#16171a';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(150, 156, 165, 0.9)';
  ctx.textBaseline = 'middle';
  ctx.save();
  ctx.translate(W * 0.25, H);
  ctx.rotate(-Math.PI / 2);
  ctx.font = '600 34px Estedad, sans-serif';
  ctx.direction = 'ltr';
  ctx.fillText('SIMLAND', 170, 0);
  ctx.direction = 'rtl';
  ctx.fillText('سیم‌لند', 560, 0);
  ctx.restore();
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  const circumference = Math.PI * 2 * SHEATH_R;
  tex.repeat.set(1, 1 / (circumference * (H / W)));
  tex.anisotropy = 8;
  return tex;
}

function makeGrainTexture() {
  // Fine extrusion grain for the PVC sheath (seeded, so it never changes).
  const S = 256;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(S, S);
  for (let i = 0; i < S * S; i++) {
    const v = 128 + (hash(i * 0.37) - 0.5) * 70 + (hash(Math.floor(i / 3) * 1.7) - 0.5) * 40;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  ctx.filter = 'blur(0.6px)';
  ctx.drawImage(canvas, 0, 0);
  const tex = new CanvasTexture(canvas);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.repeat.set(10, 3);
  return tex;
}

export function buildCable(quality = 'high') {
  const Q = QUALITY[quality] ?? QUALITY.high;
  const physical = quality === 'high';
  const group = new Group();
  const origin = new Vector3();

  // ---- Outer sheath ---------------------------------------------------------
  const sheath = new GeometryBuilder();
  addLathe(
    sheath,
    origin,
    AXIS,
    AXIS_N,
    AXIS_B,
    [
      [SHEATH_R, -SHEATH_LEN],
      [SHEATH_R, -0.035],
      [SHEATH_R - 0.014, -0.007],
      [SHEATH_R - 0.035, 0],
      [SHEATH_IN + 0.02, 0],
      [SHEATH_IN, -0.014],
      [SHEATH_IN, -0.9],
    ],
    Q.sheathRadial,
    { shade: (k) => (k >= 5 ? 0.25 : 1), vFromHeight: true },
  );
  const legend = makeLegendTexture();
  const grain = makeGrainTexture();
  const sheathMat = physical
    ? new MeshPhysicalMaterial({
        color: '#ffffff',
        map: legend,
        bumpMap: grain,
        bumpScale: 0.35,
        roughness: 0.6,
        clearcoat: 0.22,
        clearcoatRoughness: 0.45,
        vertexColors: true,
      })
    : new MeshStandardMaterial({ color: '#ffffff', map: legend, roughness: 0.55, vertexColors: true });
  group.add(new Mesh(sheath.build(), sheathMat));

  // ---- Galvanised steel wire armour ---------------------------------------
  const armour = new GeometryBuilder();
  const wireCount = Math.round((Math.PI * 2 * ARMOUR_RING) / (ARMOUR_WIRE * 2.06));
  const lay = (Math.PI * 2) / 18;
  for (let w = 0; w < wireCount; w++) {
    const a0 = (w / wireCount) * Math.PI * 2;
    const top = ARMOUR_TOP + (hash(w + 11) - 0.5) * 0.03;
    const pts = range(-0.4, top, 8).map((y) => {
      const a = a0 + y * lay;
      return new Vector3(Math.cos(a) * ARMOUR_RING, y, Math.sin(a) * ARMOUR_RING);
    });
    const out = new Vector3();
    addTube(armour, pts, ARMOUR_WIRE, Q.wireRadial, {
      shade: (i, dir) => {
        const p = pts[i];
        out.set(p.x, 0, p.z).normalize();
        const facing = Math.pow(dir.dot(out) * 0.5 + 0.5, 1.2);
        return (0.32 + 0.68 * facing) * (0.45 + 0.55 * smoothstep(-0.05, 0.22, p.y));
      },
      tint: 0.9 + 0.12 * hash(w * 3.1),
      capEnd: true,
      capShade: 0.95,
    });
  }
  const armourMat = new MeshStandardMaterial({ color: '#d3d8de', metalness: 1, roughness: 0.33, vertexColors: true });
  group.add(new Mesh(armour.build(), armourMat));

  // ---- Inner bedding + filler ------------------------------------------------
  const bedding = new GeometryBuilder();
  addLathe(
    bedding,
    origin,
    AXIS,
    AXIS_N,
    AXIS_B,
    [
      [BEDDING_R, -0.4],
      [BEDDING_R, BEDDING_TOP - 0.025],
      [BEDDING_R - 0.02, BEDDING_TOP],
      [BEDDING_IN + 0.015, BEDDING_TOP],
      [BEDDING_IN, BEDDING_TOP - 0.012],
      [BEDDING_IN, BEDDING_TOP - 0.06],
    ],
    Q.sheathRadial,
    { shade: (k, r, h) => (k === 0 ? 0.35 + 0.65 * smoothstep(ARMOUR_TOP, ARMOUR_TOP + 0.35, h) : k >= 4 ? 0.35 : 1) },
  );
  addLathe(bedding, new Vector3(0, BEDDING_TOP - 0.06, 0), AXIS, AXIS_N, AXIS_B, [[BEDDING_IN, 0], [0, 0]], 48, {
    shade: () => 0.18,
  });
  const beddingMat = new MeshStandardMaterial({ color: '#1c1e22', roughness: 0.62, vertexColors: true });
  group.add(new Mesh(bedding.build(), beddingMat));

  // ---- Cores -----------------------------------------------------------------
  const copper = new GeometryBuilder();
  const copperMat = new MeshPhysicalMaterial({
    color: '#f2a676',
    metalness: 1,
    roughness: 0.24,
    vertexColors: true,
  });

  CORES.forEach((core, k) => {
    const insulation = new GeometryBuilder();
    const yIns = core.insulationTop;
    const yCu = yIns + COPPER_EXPOSED;
    const outward = new Vector3();

    const corePts = range(-0.4, yIns - 0.03, Q.coreSteps).map((y) => coreCentre(k, y));
    const { T } = addTube(insulation, corePts, INSULATION_R, Q.coreRadial, {
      shade: (i, dir) => {
        const p = corePts[i];
        outward.set(p.x, 0, p.z).normalize();
        const facing = dir.dot(outward) * 0.5 + 0.5;
        return (0.55 + 0.45 * facing) * (0.4 + 0.6 * smoothstep(BEDDING_TOP, BEDDING_TOP + 0.55, p.y));
      },
    });

    // Cut face of the insulation: small bevel, flat ring, inner wall.
    const end = coreCentre(k, yIns);
    const tEnd = T[T.length - 1];
    const nEnd = new Vector3(1, 0, 0).addScaledVector(tEnd, -tEnd.x).normalize();
    const bEnd = new Vector3().crossVectors(tEnd, nEnd);
    addLathe(
      insulation,
      end,
      tEnd,
      nEnd,
      bEnd,
      [
        [INSULATION_R, -0.03],
        [INSULATION_R, -0.012],
        [INSULATION_R - 0.013, 0],
        [CONDUCTOR_R, 0],
        [CONDUCTOR_R, -0.3],
      ],
      Q.coreRadial,
      { shade: (s) => (s >= 3 ? 0.18 : 0.95) },
    );
    const insulationMat = physical
      ? new MeshPhysicalMaterial({
          color: core.colour,
          roughness: 0.4,
          clearcoat: 0.6,
          clearcoatRoughness: 0.26,
          vertexColors: true,
        })
      : new MeshStandardMaterial({ color: core.colour, roughness: 0.38, vertexColors: true });
    group.add(new Mesh(insulation.build(), insulationMat));

    // Conductor floor, only visible through the gaps between strands.
    addLathe(copper, coreCentre(k, yIns - 0.28), AXIS, AXIS_N, AXIS_B, [[CONDUCTOR_R, 0], [0, 0]], 24, {
      shade: () => 0.12,
    });

    // 19 strands: 1 centre + 6 (right-hand lay) + 12 (left-hand lay).
    const layers = [
      { count: 1, radius: 0, layLength: 1, dir: 1, base: 0.34 },
      { count: 6, radius: STRAND_R * 2.02, layLength: 7, dir: 1, base: 0.42 },
      { count: 12, radius: STRAND_R * 4.04, layLength: 9.5, dir: -1, base: 0.5 },
    ];
    const coreOut = new Vector3();
    const strandOut = new Vector3();
    const c = new Vector3();
    layers.forEach((layer, li) => {
      for (let s = 0; s < layer.count; s++) {
        const seed = k * 100 + li * 20 + s;
        const top = yCu + (hash(seed) - 0.5) * 0.05 - li * 0.012;
        const theta0 = (s / layer.count) * Math.PI * 2 + k * 0.7;
        const ys = range(yIns - 0.26, top, Q.strandSteps);
        const angles = [];
        const pts = ys.map((y) => {
          coreCentre(k, y, c);
          const theta = theta0 + (layer.dir * Math.PI * 2 * (y - yIns)) / layer.layLength;
          const flare = 1 + 0.14 * smoothstep(top - 0.75, top, y);
          const rho = layer.radius * flare;
          angles.push(theta);
          return new Vector3(c.x + Math.cos(theta) * rho, y, c.z + Math.sin(theta) * rho);
        });
        addTube(copper, pts, STRAND_R * 0.985, Q.strandRadial, {
          shade: (i, dir) => {
            const y = ys[i];
            strandOut.set(Math.cos(angles[i]), 0, Math.sin(angles[i]));
            coreCentre(k, y, c);
            coreOut.set(c.x, 0, c.z).normalize();
            const facing = li === 0 ? 0 : Math.pow(Math.max(0, dir.dot(strandOut) * 0.5 + 0.5), 1.6);
            let ao = layer.base + (1 - layer.base) * facing * (li === 2 ? 1 : 0.45);
            ao = ao + (1 - ao) * 0.55 * smoothstep(top - 0.2, top, y);
            ao *= 0.5 + 0.5 * smoothstep(yIns, yIns + 0.28, y);
            ao *= 0.78 + 0.22 * (dir.dot(coreOut) * 0.5 + 0.5);
            return ao;
          },
          tint: 0.9 + 0.14 * hash(seed * 1.3),
          capEnd: true,
          capShade: li === 2 ? 1.05 : li === 1 ? 0.95 : 0.85,
        });
      }
    });
  });
  group.add(new Mesh(copper.build(), copperMat));

  return {
    group,
    // Points of interest in model space, used by the camera rig.
    focus: {
      cut: new Vector3(0, 2.0, 0),
      tips: new Vector3(0, 3.6, 0),
    },
    dispose() {
      group.traverse((o) => {
        if (o.isMesh) {
          o.geometry.dispose();
          o.material.dispose();
        }
      });
      legend.dispose();
      grain.dispose();
    },
  };
}
