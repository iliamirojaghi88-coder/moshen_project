// Small deterministic helpers shared by the world modules.
import * as THREE from "three";

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, k) => a + (b - a) * k;
// progress of t through [a, b], clamped to 0..1
export const prog = (t, a, b) => clamp((t - a) / (b - a));
export const smooth = (x) => {
  x = clamp(x);
  return x * x * (3 - 2 * x);
};
export const easeInOut = (x) => {
  x = clamp(x);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
export const easeOut = (x, p = 3) => 1 - Math.pow(1 - clamp(x), p);
export const easeIn = (x, p = 3) => Math.pow(clamp(x), p);
export const expoOut = (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp(x)));
export const expoInOut = (x) => {
  x = clamp(x);
  if (x === 0 || x === 1) return x;
  return x < 0.5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2;
};
// closed-form damped spring, 0 -> 1, damping ratio z
export const spring = (x, z = 0.75, w = 14) => {
  if (x <= 0) return 0;
  const wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * x) * (Math.cos(wd * x) + ((z * w) / wd) * Math.sin(wd * x));
};

export function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// hash of an integer index -> 0..1, stable across frames
export const hash1 = (i) => {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

// Rounded rectangle shape centred on the origin.
export function roundedRectShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2,
    y = -h / 2;
  r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

// Superellipse-ish rounded rect with smooth (continuous) corners, more like
// modern device outlines than plain arcs.
export function squircleShape(w, h, r, seg = 12) {
  const s = new THREE.Shape();
  const pts = [];
  const corners = [
    [w / 2 - r, h / 2 - r, 0],
    [-w / 2 + r, h / 2 - r, Math.PI / 2],
    [-w / 2 + r, -h / 2 + r, Math.PI],
    [w / 2 - r, -h / 2 + r, (3 * Math.PI) / 2],
  ];
  for (const [cx, cy, a0] of corners) {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      const c = Math.cos(a),
        sn = Math.sin(a);
      // exponent < 2 bulges the corner like a squircle
      const e = 0.82;
      const px = cx + r * Math.sign(c) * Math.pow(Math.abs(c), e);
      const py = cy + r * Math.sign(sn) * Math.pow(Math.abs(sn), e);
      pts.push(new THREE.Vector2(px, py));
    }
  }
  s.setFromPoints(pts);
  return s;
}

// Shape geometry with UVs spanning its bounding box (0..1), for screens.
export function shapeGeometryUV(shape, curveSegments = 24) {
  const g = new THREE.ShapeGeometry(shape, curveSegments);
  g.computeBoundingBox();
  const bb = g.boundingBox;
  const pos = g.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) - bb.min.x) / (bb.max.x - bb.min.x);
    uv[i * 2 + 1] = (pos.getY(i) - bb.min.y) / (bb.max.y - bb.min.y);
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return g;
}

// Catmull-Rom through camera keys: keys = [[u, [x,y,z], [tx,ty,tz], fov], ...]
export function cameraPath(keys) {
  const pos = new THREE.CatmullRomCurve3(keys.map((k) => new THREE.Vector3(...k[1])), false, "centripetal");
  const tgt = new THREE.CatmullRomCurve3(keys.map((k) => new THREE.Vector3(...k[2])), false, "centripetal");
  const us = keys.map((k) => k[0]);
  const fovs = keys.map((k) => k[3] ?? 35);
  // map global u to curve parameter so key i sits at curve param i/(n-1)
  const toCurve = (u) => {
    u = clamp(u);
    let i = 0;
    while (i < us.length - 2 && u > us[i + 1]) i++;
    const k = (u - us[i]) / (us[i + 1] - us[i] || 1);
    return { c: (i + clamp(k)) / (us.length - 1), i, k: clamp(k) };
  };
  return (u, cam) => {
    const { c, i, k } = toCurve(u);
    cam.position.copy(pos.getPoint(c));
    cam.lookAt(tgt.getPoint(c));
    cam.fov = lerp(fovs[i], fovs[Math.min(i + 1, fovs.length - 1)], smooth(k));
    cam.updateProjectionMatrix();
  };
}

// Canvas texture with Persian text (fonts must be loaded first).
export function textTexture(lines, opts = {}) {
  const { w = 1024, h = 256, font = "700 96px Peyda", color = "#ffffff", align = "center", bg = null, lineGap = 1.25 } = opts;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (bg) {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
  }
  g.direction = "rtl";
  g.textAlign = align;
  g.textBaseline = "middle";
  const list = Array.isArray(lines) ? lines : [lines];
  list.forEach((ln, i) => {
    const spec = typeof ln === "string" ? { text: ln } : ln;
    g.font = spec.font || font;
    g.fillStyle = spec.color || color;
    const y = h / 2 + (i - (list.length - 1) / 2) * parseFloat(g.font.match(/(\d+)px/)[1]) * lineGap;
    const x = align === "center" ? w / 2 : align === "right" ? w - 24 : 24;
    g.fillText(spec.text, x, y);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Camera keys at absolute times, eased per segment so each move lands and holds.
// keys = [[t, [x,y,z], [tx,ty,tz], fov], ...]
export function timedPath(keys, ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)) {
  const n = keys.length;
  const path = cameraPath(keys.map((k, i) => [i / (n - 1), k[1], k[2], k[3]]));
  return (t, cam) => {
    let i = 0;
    while (i < n - 2 && t > keys[i + 1][0]) i++;
    const seg = clamp((t - keys[i][0]) / (keys[i + 1][0] - keys[i][0]));
    path((i + ease(seg)) / (n - 1), cam);
  };
}
