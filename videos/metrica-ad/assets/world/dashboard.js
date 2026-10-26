// Scene 6: the economic dashboard as four glass panels floating in a navy
// space. Each carries one of the platform's outputs as a 3D chart. Charts are
// illustrative shapes only: no values, currencies or results are shown.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { clamp, easeOut, smooth, spring, textTexture } from "./util.js";

const PW = 1.12, PH = 1.32;

function panel(M, title) {
  const g = new THREE.Group();
  const glass = new THREE.Mesh(new RoundedBoxGeometry(PW, PH, 0.035, 4, 0.06), new THREE.MeshPhysicalMaterial({ color: 0x9cc8ff, metalness: 0, roughness: 0.28, transparent: true, opacity: 0.16, clearcoat: 1, clearcoatRoughness: 0.05, depthWrite: false }));
  glass.renderOrder = 1;
  g.add(glass);
  // thin gold rim
  const shape = new THREE.Shape();
  const r = 0.06, w = PW / 2, h = PH / 2;
  shape.moveTo(-w + r, -h); shape.lineTo(w - r, -h); shape.quadraticCurveTo(w, -h, w, -h + r); shape.lineTo(w, h - r); shape.quadraticCurveTo(w, h, w - r, h); shape.lineTo(-w + r, h); shape.quadraticCurveTo(-w, h, -w, h - r); shape.lineTo(-w, -h + r); shape.quadraticCurveTo(-w, -h, -w + r, -h);
  const pts = shape.getPoints(64).map((p) => new THREE.Vector3(p.x, p.y, 0.019));
  const rim = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: new THREE.Color(1.0, 0.75, 0.4).multiplyScalar(2.2) }));
  g.add(rim);
  const tt = textTexture([{ text: title, font: "800 104px Peyda", color: "#f4efe6" }], { w: 1000, h: 170, align: "right" });
  const label = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.17), new THREE.MeshBasicMaterial({ map: tt, transparent: true, depthWrite: false, toneMapped: false }));
  label.position.set(PW / 2 - 0.06 - 0.5, PH / 2 - 0.14, 0.025);
  g.add(label);
  // faint grid lines on the glass
  const grid = [];
  for (let i = 0; i <= 4; i++) {
    const y = -PH / 2 + 0.14 + i * 0.2;
    grid.push(new THREE.Vector3(-PW / 2 + 0.1, y, 0.02), new THREE.Vector3(PW / 2 - 0.1, y, 0.02));
  }
  const gl = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(grid), new THREE.LineBasicMaterial({ color: 0x6f8fb4, transparent: true, opacity: 0.35 }));
  g.add(gl);
  const content = new THREE.Group();
  content.position.z = 0.02;
  g.add(content);
  g.userData = { content, label, glass, rim };
  return g;
}

export function buildDashboard(M) {
  const root = new THREE.Group();
  root.name = "dashboard";
  const teal = new THREE.MeshPhysicalMaterial({ color: 0x23c9c0, roughness: 0.2, clearcoat: 1, emissive: 0x0b5f5b, emissiveIntensity: 0.8 });
  const blue = new THREE.MeshPhysicalMaterial({ color: 0x2f6fd6, roughness: 0.25, clearcoat: 1, emissive: 0x0d2a66, emissiveIntensity: 0.7 });
  const gold = M.gold;
  const amber = new THREE.MeshPhysicalMaterial({ color: 0xe0913a, roughness: 0.25, clearcoat: 1, emissive: 0x6b3008, emissiveIntensity: 0.7, transparent: true, opacity: 0.85 });

  // 1. construction cost estimate: stacked bars rising out of the glass
  const p1 = panel(M, "برآورد هزینه ساخت");
  const bars = [];
  for (let i = 0; i < 6; i++) {
    const col = new THREE.Group();
    col.position.set(-0.42 + i * 0.168, -PH / 2 + 0.13, 0.06);
    const hs = [0.2 + i * 0.045, 0.12 + i * 0.03, 0.07 + i * 0.02];
    let y = 0;
    [teal, blue, gold].forEach((mat, j) => {
      const m = new THREE.Mesh(new RoundedBoxGeometry(0.115, 1, 0.1, 1, 0.012).translate(0, 0.5, 0), mat);
      m.userData = { y0: y, h: hs[j] };
      y += hs[j] + 0.008;
      col.add(m);
    });
    p1.userData.content.add(col);
    bars.push(col);
  }
  p1.userData.set = (k) => {
    bars.forEach((col, i) => {
      const p = clamp(k * 1.8 - i * 0.12);
      col.children.forEach((m, j) => {
        const q = clamp(p * 3 - j);
        m.scale.y = Math.max(0.0001, easeOut(q, 3) * m.userData.h);
        m.position.y = m.userData.y0 * easeOut(clamp(p * 3 - j + 1), 3);
        m.visible = q > 0;
      });
    });
  };

  // 2. required capital: a thick ring gauge sweeping round
  const p2 = panel(M, "سرمایه موردنیاز");
  const track = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 20, 120), new THREE.MeshStandardMaterial({ color: 0x17263d, roughness: 0.5, metalness: 0.4 }));
  track.position.set(0, 0.02, 0.06);
  p2.userData.content.add(track);
  const arcs = [];
  for (const [mat, a0, a1, r] of [[teal, 0, 0.55, 0.3], [blue, 0.56, 0.8, 0.3], [gold, 0.81, 0.92, 0.3]]) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.062, 20, 120, Math.PI * 2 * (a1 - a0)), mat);
    m.position.copy(track.position);
    m.rotation.z = Math.PI / 2 - Math.PI * 2 * a1;
    m.userData = { a0, a1, r, mat };
    p2.userData.content.add(m);
    arcs.push(m);
  }
  // mini timeline bars to the right of the ring
  const tl = [];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(new RoundedBoxGeometry(1, 0.06, 0.05, 1, 0.01).translate(0.5, 0, 0), i === 2 ? gold : teal);
    m.position.set(-0.42, -0.4 - i * 0.042, 0.05);
    m.scale.y = 0.55;
    m.userData.w = 0.35 + ((i * 37) % 5) * 0.11;
    p2.userData.content.add(m);
    tl.push(m);
  }
  p2.userData.set = (k) => {
    arcs.forEach((m) => {
      const p = clamp((k * 1.15 - m.userData.a0) / (m.userData.a1 - m.userData.a0));
      m.visible = p > 0;
      m.geometry.dispose();
      m.geometry = new THREE.TorusGeometry(m.userData.r, 0.062, 20, 60, Math.max(0.001, Math.PI * 2 * (m.userData.a1 - m.userData.a0) * easeOut(p, 2)));
      m.rotation.z = Math.PI / 2 - Math.PI * 2 * (m.userData.a0 + (m.userData.a1 - m.userData.a0) * easeOut(p, 2));
    });
    tl.forEach((m, i) => {
      const p = clamp(k * 2 - 0.3 - i * 0.12);
      m.scale.x = Math.max(0.001, easeOut(p, 3) * m.userData.w);
      m.visible = p > 0;
    });
  };

  // 3. potential profit and loss: a ribbon above / below a zero plane
  const p3 = panel(M, "سود و زیان احتمالی");
  const zero = new THREE.Mesh(new THREE.BoxGeometry(PW - 0.16, 0.008, 0.008), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.85, 0.6).multiplyScalar(1.5) }));
  zero.position.set(0, -0.12, 0.06);
  zero.scale.x = 0.98;
  p3.userData.content.add(zero);
  const fx = (x) => -0.12 + 0.3 * Math.sin(x * 6.2 + 0.4) * (0.4 + 0.6 * ((x + 0.48) / 0.96)) + 0.16 * ((x + 0.48) / 0.96);
  const mkArea = (sign, mat) => {
    const s = new THREE.Shape();
    const xs = [];
    for (let i = 0; i <= 120; i++) xs.push(-0.48 + (i / 120) * 0.96);
    s.moveTo(xs[0], -0.12);
    xs.forEach((x) => s.lineTo(x, sign > 0 ? Math.max(fx(x), -0.12) : Math.min(fx(x), -0.12)));
    s.lineTo(xs.at(-1), -0.12);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.07, bevelEnabled: false, curveSegments: 4 });
    const m = new THREE.Mesh(geo, mat);
    m.position.z = 0.03;
    return m;
  };
  const up = mkArea(1, new THREE.MeshPhysicalMaterial({ color: 0x23c9c0, roughness: 0.2, clearcoat: 1, emissive: 0x0b5f5b, emissiveIntensity: 0.8, transparent: true, opacity: 0.85 }));
  const dn = mkArea(-1, amber);
  const clip = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
  for (const m of [up, dn]) {
    m.material.clippingPlanes = [clip];
    p3.userData.content.add(m);
  }
  const lineCurve = new THREE.CatmullRomCurve3(Array.from({ length: 60 }, (_, i) => new THREE.Vector3(-0.48 + (i / 59) * 0.96, fx(-0.48 + (i / 59) * 0.96), 0.105)));
  const line = new THREE.Mesh(new THREE.TubeGeometry(lineCurve, 200, 0.008, 6), M.goldGlow);
  line.material = line.material.clone();
  line.material.clippingPlanes = [clip];
  p3.userData.content.add(line);
  p3.userData.set = (k, worldX) => {
    clip.constant = worldX;
    up.visible = dn.visible = line.visible = k > 0.001;
  };
  p3.userData.clip = clip;

  // 4. decision indicators: three dials with gold needles
  const p4 = panel(M, "شاخص‌های تصمیم‌گیری");
  const dials = [];
  for (let i = 0; i < 3; i++) {
    const d = new THREE.Group();
    d.position.set([-0.25, 0.25, 0][i], [0.08, 0.08, -0.36][i], 0.05);
    const arcBg = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.024, 12, 64, Math.PI), new THREE.MeshStandardMaterial({ color: 0x1b2c45, roughness: 0.5 }));
    const arcFg = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.028, 12, 64, Math.PI), i === 1 ? gold : teal);
    const needle = new THREE.Mesh(new RoundedBoxGeometry(0.016, 0.18, 0.02, 1, 0.005).translate(0, 0.09, 0), gold);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.03, 24).rotateX(Math.PI / 2), M.darkSteel);
    d.add(arcBg, arcFg, needle, hub);
    d.userData = { arcFg, needle, target: [0.72, 0.58, 0.81][i] };
    p4.userData.content.add(d);
    dials.push(d);
  }
  p4.userData.set = (k) => {
    dials.forEach((d, i) => {
      const p = clamp(k * 1.6 - i * 0.18);
      const v = spring(p, 0.6, 9) * d.userData.target;
      d.userData.needle.rotation.z = Math.PI / 2 - v * Math.PI;
      d.userData.arcFg.geometry.dispose();
      d.userData.arcFg.geometry = new THREE.TorusGeometry(0.19, 0.028, 12, 48, Math.max(0.001, Math.PI * clamp(v)));
      d.userData.arcFg.rotation.z = Math.PI - Math.PI * clamp(v);
      d.visible = p > 0;
    });
  };

  // vertical stack with depth offsets: reads well in 9:16
  const layout = [
    [p1, [0.06, 2.25, 0.0], -0.07],
    [p2, [-0.1, 0.78, -0.45], 0.06],
    [p3, [0.08, -0.7, -0.15], -0.05],
    [p4, [-0.06, -2.18, -0.55], 0.07],
  ];
  for (const [p, pos, ry] of layout) {
    p.position.set(...pos);
    p.rotation.y = ry;
    root.add(p);
  }
  // drifting dust/particles in the navy space
  const N = 1400, pos = new Float32Array(N * 3);
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (rnd() - 0.5) * 9;
    pos[i * 3 + 1] = (rnd() - 0.5) * 10;
    pos[i * 3 + 2] = -rnd() * 8 + 1.5;
  }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  const pts = new THREE.Points(pg, new THREE.PointsMaterial({ color: new THREE.Color(0.35, 0.95, 0.9).multiplyScalar(1.2), size: 0.012, transparent: true, opacity: 0.8, depthWrite: false }));
  root.add(pts);
  root.userData = { panels: [p1, p2, p3, p4], particles: pts };
  return root;
}
