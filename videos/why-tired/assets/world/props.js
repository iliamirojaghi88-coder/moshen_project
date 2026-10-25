// Hero props built for this film: the bedside clock, 3D numerals, shared PBR
// materials. Real-world scale in metres.
import { THREE, hash } from "./engine.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
export const fa = (n) => String(n).replace(/[0-9]/g, (d) => FA_DIGITS[+d]);

export async function materials(E) {
  const [brushedN, linenN, woolN, plasterN, walnutA, walnutN, oakA, oakN, oakR] = await Promise.all([
    E.texture("assets/tex/brushed_n.png", { repeat: [6, 1] }),
    E.texture("assets/tex/linen_n.png", { repeat: [7, 7] }),
    E.texture("assets/tex/wool_n.png", { repeat: [3, 3] }),
    E.texture("assets/tex/plaster_n.png", { repeat: [1.2, 1.2] }),
    E.texture("assets/tex/walnut_a.png", { srgb: true, repeat: [1.6, 1.6] }),
    E.texture("assets/tex/walnut_n.png", { repeat: [1.6, 1.6] }),
    E.texture("assets/tex/oak_a.png", { srgb: true, repeat: [0.5, 0.5] }),
    E.texture("assets/tex/oak_n.png", { repeat: [0.5, 0.5] }),
    E.texture("assets/tex/oak_r.png", { repeat: [0.5, 0.5] }),
  ]);
  const P = (o) => new THREE.MeshPhysicalMaterial(o);
  return {
    tex: { brushedN, linenN, woolN, plasterN, walnutA, walnutN, oakA, oakN, oakR },
    steel: P({ color: 0xc9ccd1, metalness: 1, roughness: 0.3, normalMap: brushedN, normalScale: new THREE.Vector2(0.25, 0.25), anisotropy: 0.7 }),
    polished: P({ color: 0xe4e6ea, metalness: 1, roughness: 0.14, envMapIntensity: 0.7 }),
    graphite: P({ color: 0x3a3e45, metalness: 1, roughness: 0.38, normalMap: brushedN, normalScale: new THREE.Vector2(0.2, 0.2), anisotropy: 0.6 }),
    rubber: P({ color: 0x111214, roughness: 0.75 }),
    // crystal = reflections only, added on top (everything behind stays visible, incl. transparent parts)
    glass: P({ color: 0x000000, metalness: 0, roughness: 0.03, specularIntensity: 1, clearcoat: 1, clearcoatRoughness: 0.02, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, envMapIntensity: 1.4 }),
    alarm: P({ color: 0xe0612b, metalness: 0.6, roughness: 0.35 }),
    seconds: P({ color: 0xd8432a, metalness: 0.3, roughness: 0.4 }),
    lume: P({ color: 0xcfe9df, roughness: 0.6, emissive: 0x8fe3c7, emissiveIntensity: 0.0 }),
  };
}

// ---------------------------------------------------------------- dial art
function dialCanvas({ size = 2048, omit8 = false, base = ["#1d2d4e", "#0c162c"], ink = "#ebe5d6" } = {}) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  const R = size / 2;
  const grad = g.createRadialGradient(R, R * 0.92, R * 0.05, R, R, R);
  grad.addColorStop(0, base[0]);
  grad.addColorStop(1, base[1]);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  // sunray brushing
  g.save();
  g.translate(R, R);
  for (let i = 0; i < 1440; i++) {
    const a = (i / 1440) * Math.PI * 2;
    const k = hash(i * 1.37);
    g.strokeStyle = k > 0.5 ? `rgba(255,255,255,${0.012 + 0.03 * (k - 0.5)})` : `rgba(0,0,0,${0.02 + 0.05 * k})`;
    g.lineWidth = 1 + 2 * hash(i * 7.1);
    g.beginPath();
    g.moveTo(Math.cos(a) * R * 0.04, Math.sin(a) * R * 0.04);
    g.lineTo(Math.cos(a) * R, Math.sin(a) * R);
    g.stroke();
  }
  // minute track
  g.strokeStyle = ink;
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
    const five = i % 5 === 0;
    g.lineWidth = five ? 9 : 4;
    g.globalAlpha = five ? 0.95 : 0.7;
    g.beginPath();
    g.moveTo(Math.cos(a) * R * 0.955, Math.sin(a) * R * 0.955);
    g.lineTo(Math.cos(a) * R * (five ? 0.88 : 0.91), Math.sin(a) * R * (five ? 0.88 : 0.91));
    g.stroke();
  }
  g.globalAlpha = 1;
  g.beginPath();
  g.lineWidth = 3;
  g.arc(0, 0, R * 0.965, 0, Math.PI * 2);
  g.stroke();
  // Persian numerals
  g.fillStyle = ink;
  g.font = `700 ${Math.round(size * 0.085)}px Vazirmatn`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  for (let h = 1; h <= 12; h++) {
    if (omit8 && h === 8) continue;
    const a = (h / 12) * Math.PI * 2 - Math.PI / 2;
    g.fillText(fa(h), Math.cos(a) * R * 0.71, Math.sin(a) * R * 0.71 + size * 0.006);
  }
  g.restore();
  return c;
}

function dialTexture(opts) {
  const t = new THREE.CanvasTexture(dialCanvas(opts));
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// ---------------------------------------------------------------- hands
function handGeometry(len, width, tail, depth = 0.0007) {
  const s = new THREE.Shape();
  s.moveTo(0, -tail);
  s.lineTo(width, 0);
  s.lineTo(width * 0.35, len * 0.92);
  s.lineTo(0, len);
  s.lineTo(-width * 0.35, len * 0.92);
  s.lineTo(-width, 0);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.0004, bevelSize: 0.0005, bevelSegments: 2, curveSegments: 4 });
  return g;
}

function stickGeometry(len, width, tail, tipW = 0, tipL = 0, depth = 0.0004) {
  const s = new THREE.Shape();
  s.moveTo(-width / 2, -tail);
  s.lineTo(width / 2, -tail);
  s.lineTo(width / 2, len - tipL);
  if (tipL) {
    s.lineTo(tipW / 2, len - tipL);
    s.lineTo(0, len);
    s.lineTo(-tipW / 2, len - tipL);
  } else s.lineTo(0, len);
  s.lineTo(-width / 2, len - tipL);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.0002, bevelSize: 0.0002, bevelSegments: 1 });
}

// ---------------------------------------------------------------- clock
export const CLOCK = { R: 0.0445, front: 0.0085, back: -0.03 };

export function makeClock(E, Mshared, { omit8 = false } = {}) {
  // per-instance material clones: shots animate these, and frames may render in any order
  const M = {};
  for (const k of ["steel", "polished", "graphite", "glass", "alarm", "seconds", "lume"]) M[k] = Mshared[k].clone();
  const root = new THREE.Group(); // origin = dial centre, +Z out of the dial, +Y up
  const body = new THREE.Group(); // shakes when the alarm rings
  root.add(body);
  const lathe = (pts, mat, seg = 160) => {
    const g = new THREE.LatheGeometry(pts.map(([r, z]) => new THREE.Vector2(r, z)), seg);
    const m = new THREE.Mesh(g, mat);
    m.rotation.x = Math.PI / 2;
    m.castShadow = m.receiveShadow = true;
    return m;
  };
  body.add(lathe([[0, -0.03], [0.044, -0.03], [0.048, -0.0287], [0.0507, -0.025], [0.0521, -0.019], [0.0523, 0.0], [0.052, 0.004], [0.0515, 0.0056]], M.steel));
  body.add(lathe([[0.0515, 0.0056], [0.0505, 0.0072], [0.049, 0.0083], [0.0472, 0.0087], [0.0458, 0.0083], [0.0449, 0.0065], [0.0446, 0.001], [0.0438, 0.0]], M.polished));
  // dial
  const dialMat = new THREE.MeshPhysicalMaterial({ map: dialTexture({ omit8 }), roughness: 0.42, metalness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.18 });
  const dial = new THREE.Mesh(new THREE.CircleGeometry(CLOCK.R, 128), dialMat);
  dial.receiveShadow = true;
  body.add(dial);
  // applied hour batons (polished) — the minute ring lifts off in the film's transition
  const baton = new RoundedBoxGeometry(0.0022, 0.0062, 0.0012, 2, 0.0005);
  const batons = new THREE.InstancedMesh(baton, M.polished, 12);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -a);
    const p = new THREE.Vector3(Math.sin(a) * CLOCK.R * 0.84, Math.cos(a) * CLOCK.R * 0.84, 0.0006);
    m4.compose(p, q, new THREE.Vector3(1, 1, 1));
    batons.setMatrixAt(i, m4);
  }
  batons.castShadow = true;
  body.add(batons);
  // hands
  const hands = new THREE.Group();
  hands.position.z = 0.0012;
  body.add(hands);
  const mk = (geo, mat, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.z = z;
    m.castShadow = true;
    const pivot = new THREE.Group();
    pivot.add(m);
    hands.add(pivot);
    return pivot;
  };
  const alarm = mk(stickGeometry(0.03, 0.0008, 0.004, 0.0034, 0.005), M.alarm, 0.0);
  const hour = mk(handGeometry(0.0255, 0.0026, 0.005), M.polished, 0.0012);
  const minute = mk(handGeometry(0.0385, 0.0021, 0.006), M.polished, 0.0026);
  const lumeH = new THREE.Mesh(stickGeometry(0.014, 0.0011, -0.008, 0, 0, 0.0002), M.lume);
  lumeH.position.z = 0.0023;
  hour.add(lumeH);
  const lumeM = new THREE.Mesh(stickGeometry(0.026, 0.0009, -0.009, 0, 0, 0.0002), M.lume);
  lumeM.position.z = 0.0037;
  minute.add(lumeM);
  const second = mk(stickGeometry(0.041, 0.0005, 0.012), M.seconds, 0.0041);
  const cw = new THREE.Mesh(new THREE.CylinderGeometry(0.0024, 0.0024, 0.0005, 32), M.seconds);
  cw.rotation.x = Math.PI / 2;
  cw.position.set(0, -0.009, 0.0044);
  second.add(cw);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0021, 0.0024, 0.0016, 40), M.polished);
  cap.rotation.x = Math.PI / 2;
  cap.position.z = 0.0058;
  hands.add(cap);
  // domed crystal
  const R = 0.2;
  const th = Math.asin((CLOCK.R + 0.0008) / R);
  const glass = new THREE.Mesh(new THREE.SphereGeometry(R, 128, 24, 0, Math.PI * 2, 0, th), M.glass);
  glass.rotation.x = Math.PI / 2;
  glass.position.z = 0.0083 - R * Math.cos(th);
  glass.renderOrder = 20;
  body.add(glass);
  // snooze bar + feet
  const bar = new THREE.Mesh(new RoundedBoxGeometry(0.046, 0.007, 0.016, 3, 0.0025), M.graphite);
  bar.position.set(0, 0.0545, -0.011);
  bar.castShadow = true;
  body.add(bar);
  for (const sx of [-1, 1]) {
    const foot = new THREE.Mesh(new RoundedBoxGeometry(0.012, 0.012, 0.03, 3, 0.004), M.graphite);
    foot.position.set(sx * 0.03, -0.047, -0.012);
    foot.rotation.z = sx * 0.5;
    foot.castShadow = true;
    body.add(foot);
  }
  root.userData = { body, hands: { hour, minute, second, alarm }, dial, dialMat, batons, mats: M };
  return root;
}

// hours: float clock time (e.g. 23.5); secondsAngle optional override
export function setClockTime(clock, hours, alarmAt = 7) {
  const H = clock.userData.hands;
  const h12 = ((hours % 12) + 12) % 12;
  H.hour.rotation.z = -(h12 / 12) * Math.PI * 2;
  H.minute.rotation.z = -(hours % 1) * Math.PI * 2;
  H.second.rotation.z = -(((hours * 60) % 1) * Math.PI * 2);
  H.alarm.rotation.z = -((alarmAt % 12) / 12) * Math.PI * 2;
}

// ---------------------------------------------------------------- numerals / words
export async function glyphs(E) {
  const [num, words] = await Promise.all([E.load("assets/models/numerals.glb"), E.load("assets/models/words.glb")]);
  const out = {};
  for (const g of [num, words])
    g.scene.traverse((o) => {
      if (o.isMesh) out[o.name] = o.geometry;
    });
  return out;
}

export function glyphMesh(geometry, material) {
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = m.receiveShadow = true;
  return m;
}
