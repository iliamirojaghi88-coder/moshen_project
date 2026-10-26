// The film's own data objects: cost stack, capital vessel, profit steps,
// dimension lines and growth ribbons. No numbers are shown on any of them.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { clamp, spring, easeOut, smooth } from "./util.js";

const rbox = (w, h, d, r = 0.04, s = 2) => new RoundedBoxGeometry(w, h, d, s, r);

// Four material layers dropping onto each other: concrete, steel, glass, gold.
export function costStack(M, S = 1) {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x3a3f46, metalness: 1, roughness: 0.32, normalMap: M.aluminium.normalMap, normalScale: new THREE.Vector2(0.4, 0.4) });
  const layers = [
    [M.concreteFresh, 0.62],
    [steel, 0.34],
    [M.teal, 0.3],
    [M.gold, 0.26],
  ];
  let y = 0;
  const items = [];
  for (const [mat, h] of layers) {
    const m = new THREE.Mesh(rbox(2.4 * S, h * S, 1.6 * S, 0.05 * S), mat);
    m.castShadow = m.receiveShadow = true;
    m.userData.rest = y + (h * S) / 2;
    y += h * S + 0.02 * S;
    g.add(m);
    items.push(m);
  }
  const base = new THREE.Mesh(rbox(2.9 * S, 0.08 * S, 2.1 * S, 0.03 * S), M.darkSteel);
  base.position.y = -0.04 * S;
  g.add(base);
  g.userData.height = y;
  g.userData.set = (k) => {
    items.forEach((m, i) => {
      const p = clamp(k * 4 - i);
      const s = spring(p * 0.9, 0.72, 11);
      m.position.y = m.userData.rest + (1 - s) * 3.0 * S;
      m.visible = p > 0;
      m.rotation.y = (1 - s) * 0.35 * (i % 2 ? 1 : -1);
    });
  };
  g.userData.set(0);
  return g;
}

// Glass vessel filling with molten gold, engraved scale on the glass.
export function capitalVessel(M, S = 1) {
  const g = new THREE.Group();
  const H = 3.4 * S, R = 0.85 * S;
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 64, 1, true), M.clearGlass);
  tube.position.y = H / 2;
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.97, R * 0.97, H, 64, 1, true), M.clearGlass);
  inner.position.y = H / 2;
  const ringGeo = new THREE.TorusGeometry(R * 1.01, 0.035 * S, 12, 96).rotateX(Math.PI / 2);
  const r1 = new THREE.Mesh(ringGeo, M.gold), r2 = r1.clone();
  r1.position.y = 0.02 * S;
  r2.position.y = H;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.25, R * 1.32, 0.22 * S, 64), M.darkSteel);
  base.position.y = -0.11 * S;
  const ticks = [];
  for (let i = 1; i < 12; i++) {
    const long = i % 3 === 0;
    ticks.push(new THREE.BoxGeometry((long ? 0.32 : 0.18) * S, 0.018 * S, 0.01 * S).translate(-R * 0.62, (i / 12) * H, R * 0.79));
  }
  const tk = new THREE.Mesh(mergeGeometries(ticks), M.goldGlow);
  tk.rotation.y = 0.5;
  const liquid = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.95, R * 0.95, 1, 64), new THREE.MeshPhysicalMaterial({ color: 0xc98a26, metalness: 0.65, roughness: 0.3, clearcoat: 0.6, emissive: 0x7a4208, emissiveIntensity: 0.55 }));
  const surf = new THREE.Mesh(new THREE.CircleGeometry(R * 0.95, 64).rotateX(-Math.PI / 2), M.goldGlow);
  g.add(tube, inner, r1, r2, base, tk, liquid, surf);
  tube.renderOrder = 2;
  g.userData.height = H;
  g.userData.set = (fill) => {
    const h = Math.max(0.001, fill * H * 0.92);
    liquid.scale.y = h;
    liquid.position.y = h / 2;
    surf.position.y = h + 0.003;
    surf.visible = fill > 0.01;
  };
  g.userData.set(0);
  return g;
}

// Ascending brushed-gold bars with a teal growth ribbon riding over them.
export function profitSteps(M, S = 1) {
  const g = new THREE.Group();
  const bars = [];
  const n = 5;
  for (let i = 0; i < n; i++) {
    const h = (0.8 + i * 0.6) * S;
    const geo = rbox(0.5 * S, 1, 0.5 * S, 0.04 * S).translate(0, 0.5, 0);
    const m = new THREE.Mesh(geo, M.gold);
    m.position.x = (i - (n - 1) / 2) * 0.72 * S;
    m.userData.h = h;
    m.castShadow = true;
    g.add(m);
    bars.push(m);
  }
  const pts = bars.map((b, i) => new THREE.Vector3(b.position.x, b.userData.h + 0.35 * S + i * 0.05 * S, 0.0));
  pts.unshift(new THREE.Vector3(pts[0].x - 0.6 * S, pts[0].y - 0.5 * S, 0));
  pts.push(new THREE.Vector3(pts.at(-1).x + 0.7 * S, pts.at(-1).y + 0.9 * S, 0));
  const curve = new THREE.CatmullRomCurve3(pts);
  const ribbonGeo = new THREE.TubeGeometry(curve, 160, 0.045 * S, 10, false);
  const ribbon = new THREE.Mesh(ribbonGeo, M.tealGlow);
  g.add(ribbon);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.1 * S, 20, 12), M.tealGlow);
  g.add(head);
  const base = new THREE.Mesh(rbox(4.2 * S, 0.08 * S, 1.0 * S, 0.03 * S), M.darkSteel);
  base.position.y = -0.04 * S;
  g.add(base);
  const total = ribbonGeo.index.count;
  g.userData.height = pts.at(-1).y;
  g.userData.set = (k) => {
    bars.forEach((b, i) => {
      const p = clamp(k * 2.2 - i * 0.25);
      b.scale.y = Math.max(0.001, easeOut(p, 4) * b.userData.h);
      b.visible = p > 0;
    });
    const r = clamp((k - 0.35) / 0.65);
    ribbonGeo.setDrawRange(0, Math.floor((total * smooth(r)) / 3) * 3);
    ribbon.visible = head.visible = r > 0.001;
    head.position.copy(curve.getPoint(smooth(r)));
  };
  g.userData.set(0);
  return g;
}

// Architectural dimension line with end ticks (gold, emissive), grows from centre.
export function dimensionLine(M, a, b, tick = 0.6) {
  const g = new THREE.Group();
  const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b);
  const len = A.distanceTo(Bv);
  const line = new THREE.Mesh(new THREE.BoxGeometry(len, 0.05, 0.05), M.goldGlow);
  const t1 = new THREE.Mesh(new THREE.BoxGeometry(0.05, tick, 0.05), M.goldGlow);
  const t2 = t1.clone();
  t1.position.x = -len / 2;
  t2.position.x = len / 2;
  const inner = new THREE.Group();
  inner.add(line, t1, t2);
  g.add(inner);
  g.position.copy(A).add(Bv).multiplyScalar(0.5);
  g.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), Bv.clone().sub(A).normalize());
  g.userData.set = (k) => {
    line.scale.x = Math.max(0.001, k);
    t1.position.x = (-len / 2) * k;
    t2.position.x = (len / 2) * k;
    g.visible = k > 0.001;
  };
  g.userData.set(0);
  return g;
}

// Glowing outline drawn progressively along a polyline (blueprint lines).
export function drawnPath(points, material, width = 0.08, y = 0.03) {
  const segs = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = new THREE.Vector3(points[i][0], y, points[i][1]);
    const b = new THREE.Vector3(points[i + 1][0], y, points[i + 1][1]);
    const l = a.distanceTo(b);
    segs.push({ a, b, l, s0: total });
    total += l;
  }
  const g = new THREE.Group();
  const meshes = segs.map((s) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, width * 0.5, width), material);
    g.add(m);
    return m;
  });
  g.userData.set = (k) => {
    const d = k * total;
    segs.forEach((s, i) => {
      const m = meshes[i];
      const p = clamp((d - s.s0) / s.l);
      m.visible = p > 0;
      const end = s.a.clone().lerp(s.b, p);
      m.position.copy(s.a).add(end).multiplyScalar(0.5);
      m.scale.x = Math.max(0.001, s.l * p);
      m.rotation.y = -Math.atan2(s.b.z - s.a.z, s.b.x - s.a.x);
    });
  };
  g.userData.set(0);
  return g;
}
