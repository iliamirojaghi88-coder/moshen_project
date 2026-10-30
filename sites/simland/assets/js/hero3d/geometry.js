// Small geometry kit for the cable: swept tubes with parallel-transport frames,
// lathes around an arbitrary frame, and a builder that packs many parts into a
// single indexed BufferGeometry (one draw call per material).
import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';

export class GeometryBuilder {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.colors = [];
    this.uvs = [];
    this.indices = [];
  }

  get vertexCount() {
    return this.positions.length / 3;
  }

  vertex(p, n, shade, u, v) {
    this.positions.push(p.x, p.y, p.z);
    this.normals.push(n.x, n.y, n.z);
    this.colors.push(shade.r, shade.g, shade.b);
    this.uvs.push(u, v);
  }

  build() {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.positions, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.normals, 3));
    g.setAttribute('color', new Float32BufferAttribute(this.colors, 3));
    g.setAttribute('uv', new Float32BufferAttribute(this.uvs, 2));
    g.setIndex(this.indices);
    g.computeBoundingSphere();
    return g;
  }
}

const grey = (s) => ({ r: s, g: s, b: s });

// Rotation-minimising frames along a polyline.
export function frames(points) {
  const n = points.length;
  const T = [];
  const N = [];
  const B = [];
  for (let i = 0; i < n; i++) {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(n - 1, i + 1)];
    T.push(new Vector3().subVectors(b, a).normalize());
  }
  const ref = Math.abs(T[0].x) < 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 0, 1);
  N.push(ref.clone().addScaledVector(T[0], -ref.dot(T[0])).normalize());
  for (let i = 1; i < n; i++) {
    const prev = N[i - 1];
    N.push(prev.clone().addScaledVector(T[i], -prev.dot(T[i])).normalize());
  }
  for (let i = 0; i < n; i++) B.push(new Vector3().crossVectors(T[i], N[i]));
  return { T, N, B };
}

// Tube swept along `points`. `shade(i, dir)` returns a 0..1 occlusion term per
// vertex (baked into vertex colours). Optional flat cap at the far end.
export function addTube(builder, points, radius, radial, { shade = () => 1, tint = 1, capEnd = false, capShade = 1, vScale = 1 } = {}) {
  const { T, N, B } = frames(points);
  const n = points.length;
  const base = builder.vertexCount;
  const dir = new Vector3();
  const pos = new Vector3();
  const ring = radial + 1;
  let v = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) v += points[i].distanceTo(points[i - 1]) * vScale;
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      dir.copy(N[i]).multiplyScalar(Math.cos(a)).addScaledVector(B[i], Math.sin(a));
      pos.copy(points[i]).addScaledVector(dir, radius);
      builder.vertex(pos, dir, grey(shade(i, dir) * tint), j / radial, v);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = base + i * ring + j;
      const b = a + ring;
      const c = b + 1;
      const d = a + 1;
      builder.indices.push(a, d, b, b, d, c);
    }
  }
  if (capEnd) {
    const last = n - 1;
    const centre = builder.vertexCount;
    const s = grey(capShade * tint);
    builder.vertex(points[last], T[last], s, 0.5, 0.5);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      dir.copy(N[last]).multiplyScalar(Math.cos(a)).addScaledVector(B[last], Math.sin(a));
      pos.copy(points[last]).addScaledVector(dir, radius);
      builder.vertex(pos, T[last], s, 0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a));
    }
    for (let j = 0; j < radial; j++) builder.indices.push(centre, centre + 1 + j, centre + 2 + j);
  }
  return { T, N, B };
}

// Revolve a (radius, height) profile around the axis T through `centre`.
// Each profile segment gets its own flat normal so cut edges stay crisp.
export function addLathe(builder, centre, T, N, B, profile, radial, { shade = () => 1, tint = 1, vFromHeight = false } = {}) {
  const dir = new Vector3();
  const pos = new Vector3();
  const nrm = new Vector3();
  const ring = radial + 1;
  for (let s = 0; s < profile.length - 1; s++) {
    const [r0, h0] = profile[s];
    const [r1, h1] = profile[s + 1];
    const dr = r1 - r0;
    const dh = h1 - h0;
    const len = Math.hypot(dr, dh) || 1;
    const nr = dh / len;
    const nh = -dr / len;
    const base = builder.vertexCount;
    for (const [r, h, k] of [[r0, h0, s], [r1, h1, s + 1]]) {
      for (let j = 0; j <= radial; j++) {
        const a = (j / radial) * Math.PI * 2;
        dir.copy(N).multiplyScalar(Math.cos(a)).addScaledVector(B, Math.sin(a));
        pos.copy(centre).addScaledVector(T, h).addScaledVector(dir, r);
        nrm.copy(dir).multiplyScalar(nr).addScaledVector(T, nh).normalize();
        builder.vertex(pos, nrm, grey(shade(k, r, h, nrm) * tint), j / radial, vFromHeight ? h : k / (profile.length - 1));
      }
    }
    for (let j = 0; j < radial; j++) {
      const a = base + j;
      const b = a + ring;
      const c = b + 1;
      const d = a + 1;
      builder.indices.push(a, d, b, b, d, c);
    }
  }
}

export const smoothstep = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

// Deterministic hash so every load (and every poster render) is identical.
export const hash = (n) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
