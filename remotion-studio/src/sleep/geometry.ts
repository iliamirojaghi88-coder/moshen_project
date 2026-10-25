import * as THREE from "three";

// Procedural soft goods: duvet (heightfield that drapes over the mattress edges),
// pillow (puffed box) and pleated curtain. All deterministic.

export type DuvetSpec = {
  width: number; // mattress width (x)
  zTop: number; // head-side edge of the duvet (world z)
  zFoot: number; // foot edge of the mattress (world z)
  top: number; // mattress top (y)
  drop: number; // how far it hangs down the sides
  /** Bump of the sleeper under the duvet: returns extra height at (x, z). */
  body?: (x: number, z: number) => number;
};

const bend = (d: number, r: number) => {
  // arc-length param over a rounded edge: returns [outward, down]
  if (d <= 0) return [d, 0];
  const arc = (r * Math.PI) / 2;
  if (d <= arc) return [r * Math.sin(d / r), r * (1 - Math.cos(d / r))];
  return [r, r + (d - arc)];
};

export const duvetGeometry = (s: DuvetSpec, segU = 140, segV = 120) => {
  const half = s.width / 2 + 0.03;
  const r = 0.07;
  const sideLen = half + s.drop;
  const len = s.zFoot - s.zTop;
  const vLen = len + s.drop * 0.9;
  const g = new THREE.PlaneGeometry(1, 1, segU, segV);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const body = s.body ?? (() => 0);
  for (let i = 0; i < pos.count; i++) {
    const pu = pos.getX(i) + 0.5; // 0..1
    const pv = 0.5 - pos.getY(i); // 0..1 (head → foot)
    const su = (pu * 2 - 1) * sideLen; // signed arc length across
    const sv = pv * vLen; // arc length from head edge
    const dx = Math.abs(su) - half;
    const dz = sv - len;
    const [ox, dyx] = bend(dx, r);
    const [oz, dyz] = bend(dz, r);
    const xIn = Math.sign(su) * Math.min(Math.abs(su), half);
    const zIn = s.zTop + Math.min(sv, len);
    // sleeper bump fades to zero toward the edges so the drape stays clean
    const edgeFade = Math.min(1, Math.max(0, (half - Math.abs(xIn)) / 0.12)) * Math.min(1, Math.max(0, (len - sv) / 0.1));
    const wr =
      0.006 * Math.sin(xIn * 9 + zIn * 4) +
      0.004 * Math.sin(xIn * 17 - zIn * 11 + 1.3) +
      0.008 * Math.sin(zIn * 6.5 + Math.sin(xIn * 3) * 1.5) * edgeFade;
    const yTop = s.top + 0.04 + body(xIn, zIn) * edgeFade + wr;
    // hanging folds on the drapes
    const hang = Math.max(dyx, dyz);
    const fold = hang > r ? 0.018 * Math.sin((dx > 0 ? zIn : xIn) * 22) * Math.min(1, (hang - r) / 0.12) : 0;
    const x = Math.sign(su) * (dx > 0 ? half + ox + (dx > 0 && Math.abs(su) > 0 ? fold : 0) : Math.abs(xIn));
    const z = dz > 0 ? s.zFoot + 0.03 + oz + (dz > 0 ? fold : 0) : zIn;
    const y = yTop - dyx - dyz;
    pos.setXYZ(i, x, y, z);
    uv.setXY(i, su * 1.4, sv * 1.4);
  }
  g.computeVertexNormals();
  return g;
};

/** A puffed pillow: centre thick, seams thin. Size in metres. */
export const pillowGeometry = (w: number, h: number, d: number, seed = 0) => {
  const g = new THREE.BoxGeometry(1, 1, 1, 36, 6, 24);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) * 2;
    const y = pos.getY(i) * 2;
    const z = pos.getZ(i) * 2;
    const e = Math.max(Math.abs(x), Math.abs(z));
    const puff = Math.cos((Math.min(1, Math.hypot(x * 0.8, z)) * Math.PI) / 2);
    const thick = 0.18 + 0.82 * Math.pow(Math.max(0, 1 - Math.pow(e, 4)), 0.6) * (0.75 + 0.25 * puff);
    const dent = 0.05 * Math.sin(x * 3 + seed) * Math.sin(z * 2.5 + seed * 2);
    pos.setXYZ(i, (x * w) / 2, ((y * h) / 2) * thick + dent * h, (z * d) / 2 * (1 - 0.04 * Math.abs(y)));
  }
  g.computeVertexNormals();
  return g;
};

/** Pleated curtain hanging from y=0 down to -h, spanning width w (gathered by `gather` 0..1). */
export const curtainGeometry = (w: number, h: number, pleats = 9) => {
  const g = new THREE.PlaneGeometry(1, 1, 160, 30);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) + 0.5;
    const v = 0.5 - pos.getY(i);
    const z = 0.035 * Math.sin(u * pleats * Math.PI * 2) + 0.01 * Math.sin(u * 37 + v * 3);
    pos.setXYZ(i, u * w, -v * h, z * (0.85 + 0.3 * v));
    uv.setXY(i, u * w * 2.5, v * h * 2.5);
  }
  g.computeVertexNormals();
  return g;
};
