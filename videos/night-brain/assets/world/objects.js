// Procedural products built from real proportions and physical materials.
// Units are metres. Each builder returns a group plus the handles the
// timeline animates.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import * as T from "./textures.js";

function roundedRectShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2,
    y = -h / 2;
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

// Slab with rounded corners in XY, depth along Z, centred.
function slab(w, h, d, r, bevel = 0.0006) {
  const g = new THREE.ExtrudeGeometry(roundedRectShape(w - 2 * bevel, h - 2 * bevel, r), {
    depth: d - 2 * bevel,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 4,
    curveSegments: 18,
  });
  g.translate(0, 0, -(d - 2 * bevel) / 2);
  g.computeVertexNormals();
  return g;
}

// Flat panel with UVs 0..1 across its bounds.
function panel(w, h, r) {
  const g = new THREE.ShapeGeometry(roundedRectShape(w, h, r), 18);
  const uv = g.attributes.uv;
  const pos = g.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / h + 0.5);
  return g;
}

const metal = (color, rough = 0.3) => new THREE.MeshStandardMaterial({ color, metalness: 1, roughness: rough });

export function makeClock() {
  const g = new THREE.Group();
  const R = 0.05;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.016, 128, 1), metal(0xc6c9ce, 0.34));
  body.rotation.x = Math.PI / 2;
  g.add(body);
  const back = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.96, R * 0.9, 0.006, 96), metal(0x8d9097, 0.5));
  back.rotation.x = Math.PI / 2;
  back.position.z = -0.01;
  g.add(back);
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(R * 0.985, 0.0026, 24, 160), metal(0xe3e5e8, 0.18));
  bezel.position.z = 0.008;
  g.add(bezel);
  const dial = new THREE.Mesh(
    new THREE.CircleGeometry(R * 0.94, 128),
    new THREE.MeshStandardMaterial({ map: T.clockDial(), roughness: 0.62, metalness: 0 }),
  );
  dial.position.z = 0.0081;
  g.add(dial);
  const handMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f2, roughness: 0.3, metalness: 0.2, emissive: 0x9ab8ff, emissiveIntensity: 0 });
  const mkHand = (len, w, z, mat) => {
    const pivot = new THREE.Group();
    const m = new THREE.Mesh(new RoundedBoxGeometry(w, len, 0.0012, 2, w * 0.45), mat);
    m.position.y = len / 2 - len * 0.12;
    pivot.add(m);
    pivot.position.z = z;
    g.add(pivot);
    return pivot;
  };
  const hour = mkHand(0.028, 0.0042, 0.0092, handMat);
  const minute = mkHand(0.041, 0.003, 0.0102, handMat);
  const secMat = new THREE.MeshStandardMaterial({ color: 0xff6a2a, roughness: 0.35, emissive: 0xff5a1a, emissiveIntensity: 0.6 });
  const second = mkHand(0.046, 0.0011, 0.0112, secMat);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.002, 32), metal(0xff6a2a, 0.3));
  cap.rotation.x = Math.PI / 2;
  cap.position.z = 0.0118;
  g.add(cap);
  const glass = new THREE.Mesh(
    new THREE.CircleGeometry(R * 0.95, 96),
    new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, roughness: 0.04, metalness: 0, envMapIntensity: 2.4 }),
  );
  glass.position.z = 0.0128;
  g.add(glass);
  g.traverse((o) => o.isMesh && (o.castShadow = true));
  // hh:mm:ss as hours (float)
  const setTime = (hours) => {
    const h = hours % 12;
    hour.rotation.z = -(h / 12) * Math.PI * 2;
    minute.rotation.z = -((hours * 60) % 60) / 60 * Math.PI * 2;
    second.rotation.z = -((hours * 3600) % 60) / 60 * Math.PI * 2;
  };
  return { group: g, setTime, handMat };
}

export function makePhone() {
  const g = new THREE.Group();
  const W = 0.0715,
    H = 0.1505,
    D = 0.0078;
  const frame = new THREE.Mesh(slab(W, H, D, 0.0105, 0.0011), metal(0x2e3138, 0.28));
  g.add(frame);
  const backGlass = new THREE.Mesh(panel(W - 0.0012, H - 0.0012, 0.0099), new THREE.MeshStandardMaterial({ color: 0x23262d, roughness: 0.35 }));
  backGlass.rotation.y = Math.PI;
  backGlass.position.z = -D / 2 - 0.0002;
  g.add(backGlass);
  const bump = new THREE.Mesh(slab(0.03, 0.03, 0.0018, 0.007, 0.0005), metal(0x2a2d33, 0.3));
  bump.position.set(-0.016, 0.054, -D / 2 - 0.0009);
  g.add(bump);
  const on = T.phoneScreen();
  const off = T.phoneScreenOff();
  const screenMat = new THREE.MeshStandardMaterial({
    color: 0x000000,
    emissive: 0xffffff,
    emissiveMap: on,
    emissiveIntensity: 1,
    roughness: 0.05,
    metalness: 0,
  });
  const screen = new THREE.Mesh(panel(W - 0.0024, H - 0.0024, 0.0094), screenMat);
  screen.position.z = D / 2 + 0.00015;
  g.add(screen);
  const island = new THREE.Mesh(panel(0.019, 0.0055, 0.00275), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  island.position.set(0, H / 2 - 0.0095, D / 2 + 0.0003);
  g.add(island);
  g.traverse((o) => o.isMesh && (o.castShadow = true));
  return { group: g, screenMat, texOn: on, texOff: off };
}

export async function makeLaptop() {
  const g = new THREE.Group();
  const W = 0.2,
    Dp = 0.14,
    t = 0.0072;
  const alu = metal(0xc8cbd1, 0.36);
  const base = new THREE.Mesh(slab(W, Dp, t, 0.008, 0.0012), alu);
  base.rotation.x = -Math.PI / 2;
  base.position.y = t / 2;
  g.add(base);
  const deck = new THREE.Mesh(
    new THREE.PlaneGeometry(W - 0.006, Dp - 0.006),
    new THREE.MeshStandardMaterial({ map: T.keyboardDeck(), roughness: 0.5, metalness: 0.6 }),
  );
  deck.rotation.x = -Math.PI / 2;
  deck.position.y = t + 0.0002;
  g.add(deck);
  const hinge = new THREE.Group();
  hinge.position.set(0, t, -Dp / 2 + 0.002);
  g.add(hinge);
  const lidH = 0.132;
  const lid = new THREE.Mesh(slab(W, lidH, 0.0045, 0.008, 0.001), alu);
  lid.position.set(0, lidH / 2, -0.00225);
  hinge.add(lid);
  const bezel = new THREE.Mesh(panel(W - 0.003, lidH - 0.003, 0.007), new THREE.MeshStandardMaterial({ color: 0x0a0b0d, roughness: 0.12 }));
  bezel.position.set(0, lidH / 2, 0.0001);
  hinge.add(bezel);
  const screenMat = new THREE.MeshStandardMaterial({
    color: 0x000000,
    emissive: 0xffffff,
    emissiveMap: await T.laptopScreen(),
    emissiveIntensity: 1,
    roughness: 0.1,
  });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.012, (W - 0.012) * 0.625), screenMat);
  screen.position.set(0, lidH / 2 + 0.002, 0.0003);
  hinge.add(screen);
  g.traverse((o) => o.isMesh && (o.castShadow = true));
  // open: 0 = lid flat over the keys (screen down), 1 = tilted 22° past vertical
  const setOpen = (k) => {
    hinge.rotation.x = THREE.MathUtils.lerp(Math.PI / 2 - 0.03, THREE.MathUtils.degToRad(-22), k);
  };
  return { group: g, setOpen, screenMat };
}

export function makeCalendar() {
  const g = new THREE.Group();
  const W = 0.1,
    H = 0.1;
  const tilt = THREE.MathUtils.degToRad(17);
  const page = T.calendarPage();
  const paper = new THREE.MeshStandardMaterial({ map: page, roughness: 0.78 });
  const backMat = new THREE.MeshStandardMaterial({ map: T.calendarBack(), roughness: 0.7 });
  const card = (mat) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.0012), [backMat, backMat, backMat, backMat, mat, backMat]);
    return m;
  };
  const front = card(paper);
  front.position.set(0, (H / 2) * Math.cos(tilt), (H / 2) * Math.sin(tilt));
  front.rotation.x = -tilt;
  g.add(front);
  // the block of pages behind the front sheet
  const block = new THREE.Mesh(new THREE.BoxGeometry(W - 0.001, H - 0.001, 0.005), new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.85 }));
  block.position.set(0, (H / 2) * Math.cos(tilt), (H / 2) * Math.sin(tilt) - 0.0032);
  block.rotation.x = -tilt;
  g.add(block);
  const stand = card(backMat);
  stand.position.set(0, (H / 2) * Math.cos(tilt), -(H / 2) * Math.sin(tilt));
  stand.rotation.x = tilt;
  g.add(stand);
  const ringMat = metal(0xd9dbe0, 0.22);
  for (let i = 0; i < 13; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.0034, 0.0006, 10, 28), ringMat);
    r.rotation.y = Math.PI / 2;
    r.position.set(-W / 2 + 0.008 + i * ((W - 0.016) / 12), H * Math.cos(tilt) + 0.001, 0);
    g.add(r);
  }
  g.traverse((o) => o.isMesh && (o.castShadow = true));
  g.position.y = -0.05;
  const wrap = new THREE.Group();
  wrap.add(g);
  return { group: wrap };
}

export async function makePhotos() {
  const out = [];
  const paper = new THREE.MeshStandardMaterial({ color: 0xf3efe6, roughness: 0.55 });
  for (let i = 1; i <= 5; i++) {
    const g = new THREE.Group();
    const W = 0.07,
      H = 0.086;
    const card = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.0009), paper);
    g.add(card);
    const img = await T.photo(`assets/tex/memory${i}.jpg`);
    const mat = new THREE.MeshStandardMaterial({ map: img, roughness: 0.18, emissive: 0xffffff, emissiveMap: img, emissiveIntensity: 0.0 });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.007, (W - 0.007) * 1.25), mat);
    face.position.set(0, 0.0045, 0.0008); // clear of the card face: no depth fighting
    g.add(face);
    g.traverse((o) => o.isMesh && (o.castShadow = true));
    out.push({ group: g, mat });
  }
  return out;
}

export async function makeCards() {
  const specs = [
    { icon: "message-circle", accent: "#2f80ed", title: "سارا", body: "فایل‌ها رو فرستادی؟", time: "now" },
    { icon: "calendar-event", accent: "#e0672b", title: "یادآوری", body: "جلسهٔ تیم — ساعت ۱۱", time: "2m" },
    { icon: "mail", accent: "#5b6b82", title: "ایمیل", body: "۱۲ پیام خوانده‌نشده", time: "5m" },
    { icon: "phone-call", accent: "#2fa36b", title: "تماس از دست رفته", body: "مامان", time: "9m" },
  ];
  const out = [];
  for (const s of specs) {
    const map = await T.notificationCard(s);
    const mat = new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, toneMapped: false, opacity: 1 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.135, 0.039), mat);
    const g = new THREE.Group();
    g.add(m);
    out.push({ group: g, mat });
  }
  return out;
}

// Bedside vignette: walnut top, ceramic lamp with linen shade, the closed
// notebook and pen, the phone face down, the small clock.
export function makeBedside(wood) {
  const g = new THREE.Group();
  const top = new THREE.Mesh(
    new RoundedBoxGeometry(0.62, 0.03, 0.4, 3, 0.006),
    new THREE.MeshPhysicalMaterial({ map: wood.map, normalMap: wood.normal, roughnessMap: wood.rough, roughness: 1, clearcoat: 0.25, clearcoatRoughness: 0.4 }),
  );
  top.position.y = -0.015;
  top.receiveShadow = true;
  g.add(top);
  const lamp = new THREE.Group();
  const ceramic = new THREE.MeshPhysicalMaterial({ color: 0xe9e3d8, roughness: 0.55, clearcoat: 0.4, sheen: 0.3 });
  const base = new THREE.Mesh(new THREE.SphereGeometry(0.045, 64, 48), ceramic);
  base.scale.y = 0.9;
  base.position.y = 0.04;
  lamp.add(base);
  const brass = metal(0xb48a52, 0.28);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.1, 24), brass);
  stem.position.y = 0.125;
  lamp.add(stem);
  const shadeMat = new THREE.MeshPhysicalMaterial({
    color: 0xf2e6d0,
    roughness: 0.9,
    side: THREE.DoubleSide,
    emissive: 0xffb15c,
    emissiveIntensity: 0,
    sheen: 0.6,
    sheenColor: new THREE.Color(0xfff1d6),
  });
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 0.085, 96, 1, true), shadeMat);
  shade.position.y = 0.19;
  lamp.add(shade);
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: true });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.014, 24, 16), bulbMat);
  bulb.position.y = 0.175;
  lamp.add(bulb);
  lamp.position.set(-0.16, 0, -0.06);
  lamp.traverse((o) => o.isMesh && (o.castShadow = true));
  g.add(lamp);
  const nb = new THREE.Mesh(new RoundedBoxGeometry(0.105, 0.012, 0.145, 2, 0.003), [
    new THREE.MeshPhysicalMaterial({ color: 0xf1ede4, roughness: 0.8 }),
    new THREE.MeshPhysicalMaterial({ color: 0xf1ede4, roughness: 0.8 }),
    new THREE.MeshPhysicalMaterial({ map: T.notebookCover(), roughness: 0.55, clearcoat: 0.2 }),
    new THREE.MeshPhysicalMaterial({ color: 0x1b2a44, roughness: 0.6 }),
    new THREE.MeshPhysicalMaterial({ color: 0xf1ede4, roughness: 0.8 }),
    new THREE.MeshPhysicalMaterial({ color: 0xf1ede4, roughness: 0.8 }),
  ]);
  nb.position.set(0.07, 0.006, 0.05);
  nb.rotation.y = -0.32;
  nb.castShadow = true;
  g.add(nb);
  const pen = new THREE.Mesh(new THREE.CylinderGeometry(0.0042, 0.0042, 0.135, 32), metal(0x9aa0a8, 0.25));
  pen.rotation.z = Math.PI / 2;
  pen.rotation.y = -0.55;
  pen.position.set(0.085, 0.017, 0.05);
  pen.castShadow = true;
  g.add(pen);
  return { group: g, shadeMat, bulbMat, lampPos: new THREE.Vector3(-0.16, 0.18, -0.06) };
}
