import * as THREE from "three";

// Deterministic helpers: everything is a pure function of time (seconds).

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (t: number) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};
export const easeInOut = (t: number) => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
export const easeOut = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
export const easeIn = (t: number) => Math.pow(clamp01(t), 3);
export const expoInOut = (t: number) => {
  const x = clamp01(t);
  if (x === 0 || x === 1) return x;
  return x < 0.5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2;
};
/** 0→1 between a and b (seconds), eased. */
export const span = (t: number, a: number, b: number, ease = smooth) => ease((t - a) / (b - a));
/** Rises over [a, a+fi], holds, falls over [b-fo, b]. */
export const window01 = (t: number, a: number, b: number, fi = 0.25, fo = 0.25) =>
  Math.min(span(t, a, a + fi), 1 - span(t, b - fo, b));

export type V3 = [number, number, number];
export const v3lerp = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/** Catmull-Rom through points, u in 0..1. */
export const pathAt = (pts: V3[], u: number): V3 => {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, "centripetal");
  const p = curve.getPoint(clamp01(u));
  return [p.x, p.y, p.z];
};

// Seeded PRNG (mulberry32) — never Math.random().
export const rng = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** Smooth deterministic wobble (sum of sines), amplitude ~1. */
export const wobble = (t: number, seed = 0) =>
  Math.sin(t * 1.7 + seed) * 0.5 + Math.sin(t * 2.9 + seed * 2.1) * 0.3 + Math.sin(t * 5.3 + seed * 3.7) * 0.2;

export const FA_DIGITS = (s: string | number) => String(s).replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[+d]);
