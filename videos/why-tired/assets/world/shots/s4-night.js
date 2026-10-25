// SCENE 04 — "دلیل اول: ممکنه شب چند بار خوابت قطع شده باشه، حتی بدون اینکه
// یادت بمونه. این اتفاق می‌تونه کیفیت استراحتت رو پایین بیاره." (19.0 → 29.25)
// The bedroom at night, moonlight through the window. A brushed-steel ۱
// hovers flat over the empty bed; the camera descends past it to an oblique
// view. A glass-and-light hypnogram draws across the bed, right (bedtime) to
// left (waking), its height above the duvet = alertness. Three wake spikes
// flash red exactly on «چند / بار / قطع», each with a light flicker in the
// room; on «یادت بمونه» they fade away. A glass capsule of luminous liquid
// ("rest quality") then drains from 95% to 38%.
import { THREE, seg, ease, lerp, clamp, track, lookFrom, setShadow, smooth } from "../engine.js";
import { makeBedroom } from "../bedroom.js";
import { makeClock, setClockTime } from "../props.js";
import { dust } from "../fx.js";
import { TEAL } from "./s3-brain.js";

const DRAW0 = 20.75;
const DRAW1 = 23.2;
// sleep architecture over 8 h: [hour, level] with 1 = awake, 0.75 REM, 0.42 N2, 0.12 N3
const STEPS = [
  [0, 1], [0.15, 0.62], [0.32, 0.42], [0.55, 0.12], [1.05, 0.42], [1.25, 0.75], [1.4, 1.0], [1.5, 0.42],
  [1.95, 0.12], [2.25, 0.42], [2.4, 1.0], [2.5, 0.62], [2.75, 0.42], [3.1, 0.75], [3.45, 0.42],
  [3.8, 0.12], [4.2, 0.42], [4.6, 0.75], [5.0, 1.0], [5.1, 0.42], [5.6, 0.75], [6.1, 0.42],
  [6.55, 0.75], [7.0, 0.42], [7.4, 0.75], [7.85, 1.0], [8.0, 1.0],
];
const WAKES = [1.4, 2.4, 5.0]; // hours of the interruptions
const levelAt = (h) => {
  let v = STEPS[0][1];
  for (let i = 1; i < STEPS.length; i++) {
    const [hh, l] = STEPS[i];
    const w = Math.abs(l - STEPS[i - 1][1]) > 0.5 ? 0.035 : 0.06;
    v = lerp(v, l, smooth(hh - w, hh + w, h));
  }
  return v;
};
const X0 = 0.3, X1 = -0.3, ZL = -0.7;
const pos = (h) => new THREE.Vector3(lerp(X0, X1, h / 8), 0.79 + 0.23 * levelAt(h), ZL + 0.012 * Math.sin(h * 1.3));
const tOfHour = (h) => lerp(DRAW0, DRAW1, h / 8);

export default async function build({ E, M, G }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x010204);
  const room = await makeBedroom(E, M);
  scene.add(room.root);
  scene.environment = E.studioEnv({
    ambient: 0x020409,
    panels: [
      { pos: [-6, 3, 1], size: [3, 4], color: 0x9fb7ff, intensity: 1.6 },
      { pos: [0, 8, 0], size: [5, 3], color: 0x6f86c0, intensity: 0.5 },
    ],
  });
  scene.environmentIntensity = 0.16;
  const clock = makeClock(E, M);
  clock.position.set(-1.2, 0.595, -1.6);
  clock.rotation.set(-0.06, 0.32, 0);
  setClockTime(clock, 3.2);
  scene.add(clock);

  // moonlight through the window: real shadows of the frame and the wall
  const moon = setShadow(new THREE.DirectionalLight(0xaec3ff, 1.7), 2048, 2.6, 0.5, 14, 9, -0.0006);
  moon.position.set(-6.5, 4.6, 1.6);
  moon.target.position.set(-0.2, 0.4, -0.6);
  scene.add(moon, moon.target);
  const fill = new THREE.HemisphereLight(0x2a3b5c, 0x07080b, 0.5);
  scene.add(fill);

  // the ۱ — brushed steel, lying flat above the bed
  const oneMat = new THREE.MeshPhysicalMaterial({ color: 0xd5d9df, metalness: 1, roughness: 0.27, normalMap: M.tex.brushedN, normalScale: new THREE.Vector2(0.15, 0.15), envMapIntensity: 2.2 });
  const one = new THREE.Mesh(G.n1, oneMat);
  one.castShadow = true;
  const onePivot = new THREE.Group();
  onePivot.add(one);
  scene.add(onePivot);
  const oneKey = new THREE.SpotLight(0xdfe8ff, 0, 5, 0.35, 0.6, 2);
  oneKey.position.set(0.9, 3.0, 0.2);
  oneKey.target = onePivot;
  scene.add(oneKey);

  // hypnogram: luminous core in a faint glass sleeve
  const pts = [];
  for (let i = 0; i <= 900; i++) pts.push(pos((i / 900) * 8));
  const curve = new THREE.CatmullRomCurve3(pts);
  const core = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 1800, 0.0036, 8, false),
    new THREE.MeshStandardMaterial({ color: 0x041513, emissive: TEAL, emissiveIntensity: 1.5, roughness: 0.4 }),
  );
  const sleeve = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 1800, 0.0085, 16, false),
    new THREE.MeshPhysicalMaterial({ color: 0xcff7f2, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.16, clearcoat: 1, depthWrite: false }),
  );
  scene.add(core, sleeve);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.009, 24, 12), new THREE.MeshStandardMaterial({ color: 0x041513, emissive: TEAL, emissiveIntensity: 4 }));
  scene.add(head);
  const headLight = new THREE.PointLight(0x40e8d8, 0, 0.9, 2);
  head.add(headLight);
  // red overlays on each wake spike + a drop line to the duvet
  const spikes = WAKES.map((h) => {
    const sp = [];
    for (let i = 0; i <= 60; i++) sp.push(pos(h - 0.16 + (i / 60) * 0.32));
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(sp), 120, 0.0052, 8, false);
    const mat = new THREE.MeshStandardMaterial({ color: 0x1a0402, emissive: new THREE.Color(1.0, 0.18, 0.08), emissiveIntensity: 0, transparent: true, opacity: 1 });
    const m = new THREE.Mesh(g, mat);
    const top = pos(h);
    const drop = new THREE.Mesh(new THREE.CylinderGeometry(0.0009, 0.0009, top.y - 0.64, 6), mat);
    drop.position.set(top.x, (top.y + 0.64) / 2, top.z);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.0012, 8, 48), mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(top.x, 0.645, top.z);
    scene.add(m, drop, ring);
    return { h, mat, ring, parts: [m, drop, ring] };
  });
  // time labels at the ends (RTL: bedtime on the right)
  const lblStart = E.label("۲۳:۰۰", { height: 0.024, intensity: 1.1, color: "#bfe9e4", weight: 500 });
  const lblEnd = E.label("۰۷:۰۰", { height: 0.024, intensity: 1.1, color: "#bfe9e4", weight: 500 });
  lblStart.position.copy(pos(0)).add(new THREE.Vector3(0.0, 0.035, 0));
  lblEnd.position.copy(pos(8)).add(new THREE.Vector3(0.0, 0.035, 0));
  scene.add(lblStart, lblEnd);

  // rest-quality capsule
  const cap = new THREE.Group();
  cap.position.set(0, 0.98, -0.12);
  scene.add(cap);
  const capGlass = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.034, 0.24, 12, 48),
    new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.09, metalness: 0, transmission: 1, thickness: 0.006, ior: 1.48, clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 3.5, specularIntensity: 0.8 }),
  );
  cap.add(capGlass);
  const clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
  const liquidMat = new THREE.MeshPhysicalMaterial({ color: 0x1fb3a6, emissive: TEAL, emissiveIntensity: 0.22, roughness: 0.04, transmission: 0.55, thickness: 0.05, ior: 1.33, attenuationColor: new THREE.Color(0x0a6b62), attenuationDistance: 0.05, clearcoat: 1, clippingPlanes: [clipPlane], side: THREE.DoubleSide, envMapIntensity: 2.5 });
  const liquid = new THREE.Mesh(new THREE.CapsuleGeometry(0.0285, 0.24, 12, 48), liquidMat);
  cap.add(liquid);
  const meniscus = new THREE.Mesh(new THREE.CircleGeometry(0.0283, 48), new THREE.MeshPhysicalMaterial({ color: 0x0b5a54, emissive: TEAL, emissiveIntensity: 0.9, roughness: 0.1 }));
  meniscus.rotation.x = -Math.PI / 2;
  cap.add(meniscus);
  const tickMat = new THREE.MeshStandardMaterial({ color: 0xe8ecef, roughness: 0.4, metalness: 0.6 });
  for (let i = 0; i <= 10; i++) {
    const tk = new THREE.Mesh(new THREE.BoxGeometry(i % 5 === 0 ? 0.016 : 0.009, 0.0012, 0.0012), tickMat);
    tk.position.set(0.034 * Math.sin(-0.5) + (i % 5 === 0 ? 0 : 0.003), -0.12 + (i / 10) * 0.24, 0.034 * Math.cos(-0.5));
    tk.rotation.y = -0.5;
    cap.add(tk);
  }
  const capLight = new THREE.PointLight(0x40e8d8, 0, 0.8, 2);
  cap.add(capLight);
  const capRim = new THREE.SpotLight(0xcfe0ff, 0, 3, 0.25, 0.7, 2);
  capRim.position.set(0.5, 1.5, -1.0);
  capRim.target = cap;
  scene.add(capRim);
  const capRim2 = new THREE.SpotLight(0xffffff, 0, 3, 0.25, 0.7, 2);
  capRim2.position.set(-0.6, 1.3, -0.9);
  capRim2.target = cap;
  scene.add(capRim2);
  const pctLbl = E.label("۹۵ درصد", { height: 0.03, intensity: 1.3, color: "#c9f6f1", weight: 700 });
  scene.add(pctLbl);

  const motes = dust(400, new THREE.Box3(new THREE.Vector3(-1.6, 0.6, -1.4), new THREE.Vector3(0.4, 2.2, 0.6)), { size: 0.006, opacity: 0.3, seed: 9 });
  scene.add(motes);

  const camera = new THREE.PerspectiveCamera(45, 1080 / 1920, 0.02, 30);
  const keys = [
    [19.0, 0.0, 3.25, -0.9, 0, 0.5, -0.9],
    [20.2, 0.0, 3.05, -0.85, 0, 0.5, -0.9],
    [21.3, 0.26, 1.58, 1.02, 0, 0.88, -0.7],
    [23.3, 0.14, 1.52, 1.08, 0, 0.88, -0.7],
    [25.3, -0.12, 1.46, 1.1, 0, 0.9, -0.62],
    [26.6, 0.04, 1.2, 0.92, 0, 0.97, -0.25],
    [29.25, 0.08, 1.13, 0.8, 0, 0.96, -0.18],
  ];

  function update(t) {
    const k = track(keys, t);
    const tilt = seg(t, 20.25, 21.3, ease.inOut);
    const up = new THREE.Vector3(0, 0, -1).lerp(new THREE.Vector3(0, 1, 0), tilt).normalize();
    camera.fov = lerp(45, 41, tilt);
    camera.updateProjectionMatrix();
    lookFrom(camera, [k[0], k[1], k[2]], [k[3], k[4], k[5]], 0, [up.x, up.y, up.z]);

    // ۱: rises into place on "دلیل اول", the camera then descends past it
    const oIn = seg(t, 19.35, 20.0, ease.expoOut);
    onePivot.visible = t < 21.4;
    onePivot.position.set(0.0, lerp(1.3, 1.85, oIn), lerp(-0.95, -1.0, oIn));
    onePivot.rotation.set(-Math.PI / 2, 0, lerp(-0.5, 0, oIn) + 0.04 * (t - 19.4));
    one.scale.setScalar(0.8 * lerp(0.7, 1, oIn));
    oneKey.intensity = 9 * oIn;

    // hypnogram drawing
    const p = clamp((t - DRAW0) / (DRAW1 - DRAW0));
    const n = core.geometry.index.count;
    const cut = Math.floor((n * p) / 6) * 6;
    core.geometry.setDrawRange(0, cut);
    sleeve.geometry.setDrawRange(0, Math.floor((sleeve.geometry.index.count * p) / 6) * 6);
    core.visible = sleeve.visible = p > 0;
    head.visible = p > 0 && p < 1;
    head.position.copy(pos(p * 8));
    headLight.intensity = 0.4 * (p > 0 && p < 1 ? 1 : 0);
    const fadeLine = 1 - 0.35 * seg(t, 25.5, 26.6);
    core.material.emissiveIntensity = 1.5 * fadeLine;
    lblStart.visible = p > 0.01;
    lblStart.material.opacity = seg(t, DRAW0, DRAW0 + 0.4) * fadeLine;
    lblEnd.visible = p > 0.97;
    lblEnd.material.opacity = seg(t, DRAW1 - 0.05, DRAW1 + 0.35) * fadeLine;

    // wake spikes flash, then are "forgotten" on «یادت بمونه»
    let flicker = 0;
    for (const s of spikes) {
      const ts = tOfHour(s.h);
      const on = seg(t, ts - 0.03, ts + 0.08, ease.out);
      const forget = seg(t, 23.95 + s.h * 0.08, 24.9 + s.h * 0.08, ease.inOut);
      s.mat.emissiveIntensity = 3.2 * on * (1 - forget) + 1.4 * on * Math.exp(-Math.max(0, t - ts) * 4) * (1 - forget);
      s.mat.opacity = 1 - forget;
      s.ring.scale.setScalar(1 + 1.4 * seg(t, ts, ts + 0.6, ease.out));
      s.parts.forEach((o) => (o.visible = t >= ts - 0.03 && forget < 0.995));
      flicker = Math.max(flicker, on * Math.exp(-Math.max(0, t - ts) * 5));
    }
    room.practicals({ phone: flicker, led: 1, door: 0.18 + 0.5 * flicker });

    // capsule: appears on «این اتفاق», drains on «کیفیت استراحتت رو پایین بیاره»
    const cIn = seg(t, 25.45, 26.1, ease.expoOut);
    cap.visible = cIn > 0.001;
    cap.position.y = lerp(0.9, 0.98, cIn);
    cap.rotation.set(0, lerp(0.9, 0.0, cIn) + 0.03 * (t - 26), 0);
    cap.scale.setScalar(lerp(0.8, 1, cIn));
    const level = lerp(0.95, 0.38, seg(t, 26.75, 28.75, ease.inOut));
    const yCut = -0.149 + level * 0.298;
    cap.updateMatrixWorld();
    const pt = new THREE.Vector3(0, yCut, 0).applyMatrix4(cap.matrixWorld);
    clipPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, -1, 0), pt);
    meniscus.position.y = yCut;
    const rr = Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, Math.abs(yCut) - 0.12) / 0.0285, 2)));
    meniscus.scale.setScalar(Math.max(0.01, rr));
    const bad = seg(t, 27.4, 28.8);
    const col = TEAL.clone().lerp(new THREE.Color(1.0, 0.38, 0.16), bad);
    liquidMat.emissive.copy(col);
    meniscus.material.emissive.copy(col);
    liquidMat.color.setRGB(lerp(0.04, 0.3, bad), lerp(0.35, 0.09, bad), lerp(0.33, 0.04, bad));
    capLight.color.copy(col);
    capLight.intensity = 0.12 * cIn;
    capRim.intensity = 1.6 * cIn;
    capRim2.intensity = 1.0 * cIn;
    const pct = Math.round(level * 100);
    if (pctLbl.userData.pct !== pct) {
      pctLbl.userData.pct = pct;
      const fresh = E.textTexture(String(pct).replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[+d]) + " درصد", { size: 160, weight: 700, color: "#ffffff" });
      pctLbl.material.map.dispose();
      pctLbl.material.map = fresh.texture;
      pctLbl.geometry.dispose();
      pctLbl.geometry = new THREE.PlaneGeometry(0.03 * fresh.aspect, 0.03);
    }
    pctLbl.visible = cIn > 0.01;
    pctLbl.material.opacity = cIn;
    pctLbl.material.color.copy(new THREE.Color(1.3, 1.3, 1.3).lerp(new THREE.Color(1.6, 0.8, 0.5), bad));
    pctLbl.position.set(cap.position.x + 0.13, cap.position.y + yCut, cap.position.z);
    pctLbl.quaternion.copy(camera.quaternion);

    motes.userData.update(t);
    const night = 1 - 0.3 * seg(t, 26.8, 28.8);
    moon.intensity = 3.2 * night;
    const capFocus = cIn > 0.5;
    return {
      exposure: 1.0 * (1 + 0.1 * flicker),
      wb: [0.9, 0.97, 1.12],
      sat: lerp(0.92, 0.75, seg(t, 27, 28.8)),
      contrast: 1.14,
      vig: 0.66,
      bloom: { strength: 0.5, radius: 0.5, threshold: 1.4 },
      dof: { focus: camera.position.distanceTo(capFocus ? cap.position : new THREE.Vector3(0, 0.78, ZL)), aperture: tilt < 0.5 ? 4 : 9, maxR: 10 },
    };
  }
  return { id: "s4", t0: 19.0, t1: 29.25, scene, camera, update, transition: { mode: 1, blur: 5, ease: ease.inOut } };
}
