// Procedural neurons for the nocebo film: soma, tapered dendrite trees and a
// myelinated axon, all grown from a seed so every render builds the same cell.
// Signals are a shader term driven by a time uniform: no clock, no state.
import * as THREE from "three";
import { mergeGeometries } from "../vendor/jsm/utils/BufferGeometryUtils.js";

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A tube whose radius follows `radii`, with a per-vertex arc coordinate
// (attribute `arc`, in world units from the path start) for travelling signals.
export function taperedTube(points, radii, radial = 8, arcOffset = 0) {
  const curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
  const steps = Math.max(4, Math.round(curve.getLength() / 0.035));
  const frames = curve.computeFrenetFrames(steps, false);
  const pos = [];
  const nor = [];
  const arc = [];
  const idx = [];
  const len = curve.getLength();
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    curve.getPointAt(u, p);
    const f = u * (radii.length - 1);
    const k = Math.min(radii.length - 2, Math.floor(f));
    const r = THREE.MathUtils.lerp(radii[k], radii[k + 1], f - k);
    const N = frames.normals[i];
    const B = frames.binormals[i];
    for (let j = 0; j <= radial; j++) {
      const v = (j / radial) * Math.PI * 2;
      n.set(0, 0, 0).addScaledVector(N, Math.cos(v)).addScaledVector(B, Math.sin(v)).normalize();
      pos.push(p.x + r * n.x, p.y + r * n.y, p.z + r * n.z);
      nor.push(n.x, n.y, n.z);
      arc.push(arcOffset + u * len);
    }
  }
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = a + radial + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("arc", new THREE.Float32BufferAttribute(arc, 1));
  g.setIndex(idx);
  return { geometry: g, curve, length: len };
}

function walk(rand, start, dir, segLen, count, wobble) {
  const pts = [start.clone()];
  const d = dir.clone().normalize();
  const p = start.clone();
  for (let i = 0; i < count; i++) {
    d.x += (rand() - 0.5) * wobble;
    d.y += (rand() - 0.5) * wobble;
    d.z += (rand() - 0.5) * wobble;
    d.normalize();
    p.addScaledVector(d, segLen * (0.75 + rand() * 0.5));
    pts.push(p.clone());
  }
  return { pts, dir: d };
}

function randomDir(rand) {
  const u = rand() * 2 - 1;
  const th = rand() * Math.PI * 2;
  const s = Math.sqrt(1 - u * u);
  return new THREE.Vector3(s * Math.cos(th), u, s * Math.sin(th));
}

// One dendrite tree: a primary branch that forks as it thins. Arc runs
// negative from the tip toward the soma, so dendritic signals flow inward.
function dendrite(rand, out, start, dir, r0, depth, reach, arc0 = 0, flare = 0) {
  const count = 6 + Math.floor(rand() * 5);
  const { pts, dir: endDir } = walk(rand, start, dir, reach / count, count, 0.7);
  const r1 = r0 * (0.5 + rand() * 0.12);
  const radii = [];
  for (let i = 0; i <= 6; i++) {
    const u = i / 6;
    radii.push((r0 + (r1 - r0) * Math.pow(u, 0.8)) * (0.92 + rand() * 0.16));
  }
  if (depth <= 0) radii[6] = r1 * 0.15;
  if (flare) {
    // a primary branch leaves the soma as a cone, not a pipe stuck into it
    radii[0] = flare;
    radii[1] = Math.max(r0 * 1.25, flare * 0.42);
  }
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += pts[i].distanceTo(pts[i - 1]);
  const tube = taperedTube(pts, radii, r0 > 0.03 ? 8 : r0 > 0.012 ? 6 : 4, 0);
  const a = tube.geometry.attributes.arc;
  for (let i = 0; i < a.count; i++) a.setX(i, arc0 - a.getX(i));
  out.push(tube.geometry);
  if (depth <= 0 || r1 < 0.0045) return;
  const forks = depth > 2 ? 2 + (rand() < 0.45 ? 1 : 0) : 2;
  for (let i = 0; i < forks; i++) {
    const k = Math.max(2, pts.length - 1 - Math.floor(rand() * 4));
    const nd = endDir.clone().add(randomDir(rand).multiplyScalar(1.0)).normalize();
    dendrite(rand, out, pts[k], nd, r1 * (0.85 + rand() * 0.2), depth - 1, reach * (0.5 + rand() * 0.25), arc0 - len * (k / (pts.length - 1)));
  }
}

function soma(rand, radius) {
  const g = new THREE.SphereGeometry(radius, 48, 32);
  g.deleteAttribute("uv");
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  const lobes = [randomDir(rand), randomDir(rand), randomDir(rand), randomDir(rand)];
  const apex = randomDir(rand);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = v.clone().normalize();
    let s = 1;
    for (const l of lobes) s += 0.22 * Math.pow(Math.max(0, n.dot(l)), 4);
    s += 0.45 * Math.pow(Math.max(0, n.dot(apex)), 6);
    s += 0.03 * Math.sin(n.x * 11 + n.y * 7) * Math.sin(n.z * 9 + n.x * 3);
    v.copy(n).multiplyScalar(radius * s);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  g.setAttribute("arc", new THREE.Float32BufferAttribute(new Float32Array(p.count).fill(-1000), 1));
  return g;
}

// Myelin sheath segments with nodes of Ranvier along an axon curve.
function myelin(curve, length, r, gap = 0.06, seg = 0.34) {
  const parts = [];
  for (let s = 0.25; s + seg < length - 0.25; s += seg + gap) {
    const pts = [];
    const radii = [];
    for (let k = 0; k <= 6; k++) {
      const u = (s + (k / 6) * seg) / length;
      pts.push(curve.getPointAt(Math.min(1, u)));
      const e = Math.sin((k / 6) * Math.PI);
      radii.push(r * (0.9 + 1.35 * Math.pow(e, 0.35)));
    }
    parts.push(taperedTube(pts, radii, 10, s).geometry);
  }
  return parts;
}

/**
 * Grow one neuron. Returns { group-ready geometries, axonCurve, axonLength }.
 * opts: seed, center, somaR, dendrites, reach, axonTo (Vector3|null), myelin
 */
export function growNeuron(opts) {
  const rand = rng(opts.seed);
  const center = opts.center.clone();
  const body = [soma(rand, opts.somaR).translate(center.x, center.y, center.z)];
  const tree = [];
  const n = opts.dendrites ?? 7;
  for (let i = 0; i < n; i++) {
    const d = randomDir(rand);
    if (opts.axonTo && d.dot(opts.axonTo.clone().sub(center).normalize()) > 0.6) d.negate();
    const start = center.clone().addScaledVector(d, opts.somaR * 0.45);
    dendrite(rand, tree, start, d, opts.somaR * (opts.dendriteR ?? 0.17), opts.depth ?? 4, opts.reach ?? 1.6, -(i * 1.37) % 3, opts.somaR * 0.55);
  }
  let axon = null;
  let sheath = [];
  if (opts.axonTo) {
    const dir = opts.axonTo.clone().sub(center);
    const dist = dir.length();
    dir.normalize();
    const side = new THREE.Vector3(0, 1, 0).cross(dir).normalize();
    const up = dir.clone().cross(side).normalize();
    const pts = [];
    const steps = Math.max(6, Math.round(dist / 0.5));
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const bend = Math.sin(u * Math.PI) * (opts.bend ?? 0.35);
      const p = center
        .clone()
        .addScaledVector(dir, dist * u)
        .addScaledVector(side, bend * Math.sin(opts.seed * 1.7 + u * 3.1))
        .addScaledVector(up, bend * 0.6 * Math.cos(opts.seed * 2.3 + u * 2.4));
      pts.push(p);
    }
    const r = opts.somaR * 0.13;
    axon = taperedTube(pts, [r * 3.4, r * 1.3, r, r, r, r * 0.8], 9);
    if (opts.myelin !== false) sheath = myelin(axon.curve, axon.length, r);
    // terminal branches with boutons
    const end = pts[pts.length - 1];
    for (let i = 0; i < 4; i++) {
      const d = dir.clone().add(randomDir(rand).multiplyScalar(0.8)).normalize();
      const w = walk(rand, end, d, 0.12, 4, 0.6);
      const off = axon.length;
      tree.push(taperedTube(w.pts, [r * 0.8, r * 0.5, r * 0.4], 6, off).geometry);
      const b = new THREE.SphereGeometry(r * 1.4, 12, 8);
      b.deleteAttribute("uv");
      const last = w.pts[w.pts.length - 1];
      b.translate(last.x, last.y, last.z);
      b.setAttribute("arc", new THREE.Float32BufferAttribute(new Float32Array(b.attributes.position.count).fill(off + 0.5), 1));
      tree.push(b);
    }
  }
  for (const g of tree) if (!g.attributes.arc) g.setAttribute("arc", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(-1000), 1));
  const cell = mergeGeometries([...body, ...tree], false);
  const fibre = axon ? mergeGeometries([axon.geometry, ...sheath], false) : null;
  return { cell, fibre, axonCurve: axon?.curve ?? null, axonLength: axon?.length ?? 0 };
}

/**
 * Tissue material with a travelling-signal term. uniforms.uTime (s),
 * uActivity (0..1) set how many pulses run and how warm they are. Axon
 * pulses run outward (arc >= 0), dendritic ones inward (arc < 0). The pulse
 * is a narrow warm band, not a glow: emissive stays below 1.
 */
export function tissueMaterial(params = {}) {
  const uniforms = {
    uTime: { value: 0 },
    uActivity: { value: 0.3 },
    uSpeed: { value: params.speed ?? 2.2 },
    uPulseColor: { value: new THREE.Color(params.pulse ?? 0xffa955) },
    uPhase: { value: params.phase ?? 0 },
    uBump: { value: params.bump ?? 0.35 },
  };
  const m = new THREE.MeshPhysicalMaterial({
    color: params.color ?? 0xb3aa9c,
    roughness: params.roughness ?? 0.55,
    metalness: 0,
    clearcoat: params.clearcoat ?? 0.28,
    clearcoatRoughness: 0.45,
    sheen: params.sheen ?? 0.12,
    sheenColor: new THREE.Color(params.sheenColor ?? 0xd8d4cc),
    sheenRoughness: 0.6,
  });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float arc;\nvarying float vArc;\nvarying vec3 vWPos;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvArc = arc;\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying float vArc;
        varying vec3 vWPos;
        uniform float uTime, uActivity, uSpeed, uPhase, uBump;
        uniform vec3 uPulseColor;
        float hash3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float vnoise(vec3 x){
          vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);
        }
        float pulseAt(float arc){
          if (arc < -500.0) return 0.0;
          float dend = arc < 0.0 ? 1.0 : 0.0;
          float spacing = mix(8.0, 1.5, uActivity) * (1.0 + dend * 0.6);
          float x = arc - uTime * uSpeed * (1.0 - 0.35 * dend) + uPhase + dend * 3.7;
          float d = mod(x, spacing) - spacing * 0.5;
          float band = exp(-d * d / mix(0.02, 0.035, uActivity));
          return band * mix(0.22, 0.7, uActivity) * (1.0 - 0.45 * dend);
        }`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
        {
          vec3 q = vWPos * 34.0;
          float e = 0.35;
          float n0 = vnoise(q);
          vec3 g = vec3(vnoise(q + vec3(e,0,0)) - n0, vnoise(q + vec3(0,e,0)) - n0, vnoise(q + vec3(0,0,e)) - n0) / e;
          vec3 q2 = vWPos * 140.0;
          float m0 = vnoise(q2);
          g += 0.5 * vec3(vnoise(q2 + vec3(e,0,0)) - m0, vnoise(q2 + vec3(0,e,0)) - m0, vnoise(q2 + vec3(0,0,e)) - m0) / e;
          normal = normalize(normal - uBump * 0.25 * (viewMatrix * vec4(g, 0.0)).xyz);
        }`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        float pz = pulseAt(vArc);
        float mott = vnoise(vWPos * 9.0);
        diffuseColor.rgb *= mix(0.82, 1.08, mott);
        totalEmissiveRadiance += uPulseColor * pz;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.15, 0.96, 0.82), pz * 0.5);`,
      );
  };
  m.userData.uniforms = uniforms;
  return m;
}

/**
 * A chain of neurons whose axons reach the next cell: the pathway the camera
 * travels along. Returns { meshes, centers }.
 */
export function buildPathway(opts) {
  const rand = rng(opts.seed);
  const centers = [];
  for (let i = 0; i < opts.count; i++) {
    const c = opts.start.clone().addScaledVector(opts.step, i);
    c.x += (rand() - 0.5) * opts.jitter;
    c.y += (rand() - 0.5) * opts.jitter;
    c.z += (rand() - 0.5) * opts.jitter * 0.5;
    centers.push(c);
  }
  const cells = [];
  for (let i = 0; i < opts.count; i++) {
    const to = i < opts.count - 1 ? centers[i + 1].clone().add(new THREE.Vector3((rand() - 0.5) * 0.6, (rand() - 0.5) * 0.6, 0)) : null;
    cells.push(growNeuron({ seed: opts.seed * 31 + i * 7, center: centers[i], somaR: opts.somaR * (0.85 + rand() * 0.3), dendrites: opts.dendrites ?? 8, depth: opts.depth ?? 4, reach: opts.reach ?? 1.7, axonTo: to, bend: 0.5 }));
  }
  return { cells, centers };
}
