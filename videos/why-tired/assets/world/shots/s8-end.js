// SCENE 08b — "چون خواب خوب، فقط هشت ساعت چشم‌بستن نیست." (65.1 → 69.49)
// Navy and gold in balance. The clock stands on a dark stone pedestal; the
// steel ۸ hovers before it, and on «هشت» it flies into the dial and becomes
// the dial's own ۸ — eight hours are one mark on a whole circle. The film's
// four ideas orbit the clock: زمان · کیفیت خواب · ساعت زیستی · نور طبیعی.
import { THREE, seg, ease, lerp, track, lookFrom, setShadow, wobble } from "../engine.js";
import { makeClock, setClockTime, CLOCK } from "../props.js";
import { backdrop } from "../brain.js";
import { dust } from "../fx.js";

export default async function build({ E, M, G }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x03050b);
  scene.fog = new THREE.Fog(0x04070e, 1.0, 3.6);
  scene.environment = E.studioEnv({
    ambient: 0x05070d,
    panels: [
      { pos: [-3, 3, 3], size: [3, 3], color: 0xffd6a0, intensity: 2.6 },
      { pos: [3, 2, 1], size: [2, 4], color: 0x9fb7ff, intensity: 1.6 },
      { pos: [0, 4, -4], size: [6, 1.5], color: 0xffffff, intensity: 0.9 },
    ],
  });
  scene.environmentIntensity = 0.6;
  const bd = backdrop(0x0b1630, 0x020409, 0.6, [8, 7], { cy: 0.62, floorFade: 1 });
  bd.material.fog = false;
  bd.position.set(0, 0.7, -3.2);
  scene.add(bd);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(8, 96), new THREE.MeshPhysicalMaterial({ color: 0x07080b, roughness: 0.5, clearcoat: 0.6, clearcoatRoughness: 0.3 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const stone = new THREE.MeshPhysicalMaterial({ color: 0x15171c, roughness: 0.38, clearcoat: 0.7, clearcoatRoughness: 0.2, normalMap: M.tex.plasterN, normalScale: new THREE.Vector2(0.3, 0.3) });
  const ped = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.13, 0], [0.134, 0.005], [0.135, 0.05], [0.131, 0.056], [0, 0.056]].map(([r, y]) => new THREE.Vector2(r, y)), 160), stone);
  ped.castShadow = ped.receiveShadow = true;
  scene.add(ped);

  const clock = makeClock(E, M, { omit8: true });
  clock.position.set(0, 0.056 + 0.053, 0);
  clock.rotation.x = -0.06;
  scene.add(clock);

  const eightMat = new THREE.MeshPhysicalMaterial({ color: 0xdadde2, metalness: 1, roughness: 0.24, clearcoat: 0.4, envMapIntensity: 1.6 });
  const eight = new THREE.Mesh(G.n8, eightMat);
  eight.castShadow = true;
  scene.add(eight);
  // where the dial's own ۸ sits (8 o'clock, numeral ring r = 0.71 R)
  const a8 = (8 / 12) * Math.PI * 2;
  const dialSpot = new THREE.Vector3(Math.sin(a8) * CLOCK.R * 0.71, Math.cos(a8) * CLOCK.R * 0.71, 0.0012);
  const ink = new THREE.Color(0xebe5d6);

  // the four ideas
  // RTL reading order: top-right, top-left, bottom-right, bottom-left
  const ideas = [
    ["زمان", "#e9edf3", 0.048, 0.076],
    ["کیفیت خواب", "#7ff3e8", -0.046, 0.076],
    ["ساعت زیستی", "#ffc77a", 0.047, -0.078],
    ["نور طبیعی", "#ffe0a8", -0.047, -0.078],
  ].map(([txt, col, x, y], i) => {
    const l = E.label(txt, { height: 0.0135, intensity: 1.35, color: col, weight: 700 });
    l.userData = { x, y, i };
    scene.add(l);
    return l;
  });

  const key = setShadow(new THREE.SpotLight(0xffd7a8, 7, 3, 0.45, 0.7, 2), 2048, 1, 0.1, 5, 6, -0.0004);
  key.position.set(-0.6, 0.9, 0.9);
  key.target = clock;
  scene.add(key);
  const cool = new THREE.SpotLight(0x8fa9ff, 4, 3, 0.5, 0.7, 2);
  cool.position.set(0.7, 0.4, -0.5);
  cool.target = clock;
  scene.add(cool);
  const glint = new THREE.PointLight(0xffffff, 0, 0.5, 2);
  scene.add(glint);
  const motes = dust(260, new THREE.Box3(new THREE.Vector3(-0.4, 0.0, -0.4), new THREE.Vector3(0.4, 0.6, 0.4)), { size: 0.0022, opacity: 0.35, color: 0xffe2b8, seed: 41 });
  scene.add(motes);

  const camera = new THREE.PerspectiveCamera(32, 1080 / 1920, 0.01, 20);
  const keys = [
    [65.1, 0.05, 0.17, 0.42, 0, 0.14, 0],
    [66.6, 0.01, 0.17, 0.56, 0, 0.154, 0],
    [68.0, -0.025, 0.172, 0.6, 0, 0.154, 0],
    [69.6, -0.06, 0.2, 0.68, 0, 0.158, 0],
  ];

  function update(t) {
    const k = track(keys, t);
    lookFrom(camera, [k[0], k[1], k[2]], [k[3], k[4], k[5]]);
    setClockTime(clock, 7.0 + (t - 65) / 120, 7);

    // ۸: hovers, then on «هشت» (67.08) flies into the dial and turns to ink
    const hover = seg(t, 65.2, 65.9, ease.expoOut);
    const fly = seg(t, 67.0, 67.75, ease.inOut);
    clock.updateMatrixWorld();
    const target = dialSpot.clone().applyMatrix4(clock.matrixWorld);
    const start = new THREE.Vector3(0.0, 0.198 + 0.004 * Math.sin(t * 1.3), 0.05);
    eight.position.lerpVectors(start, target, fly);
    eight.position.y += 0.03 * Math.sin(Math.PI * fly);
    const q0 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.05 * wobble(t * 0.5, 2), lerp(-0.8, 0.1, hover) + 0.06 * Math.sin(t * 0.7), 0));
    const q1 = new THREE.Quaternion().setFromEuler(clock.rotation);
    eight.quaternion.slerpQuaternions(q0, q1, fly);
    const sizeHover = 0.105 * lerp(0.7, 1, hover);
    const sizeDial = (0.085 * 2 * CLOCK.R) / 0.467; // printed numeral height / glyph height
    eight.scale.set(lerp(sizeHover, sizeDial, ease.in(fly)), lerp(sizeHover, sizeDial, ease.in(fly)), lerp(sizeHover, 0.004, fly));
    eightMat.color.copy(new THREE.Color(0xdadde2).lerp(ink, seg(t, 67.55, 67.8)));
    eightMat.metalness = lerp(1, 0, seg(t, 67.55, 67.8));
    eightMat.roughness = lerp(0.24, 0.6, seg(t, 67.55, 67.8));
    eight.visible = t > 65.15;

    // the ideas settle on an arc around the dial, right to left, after the ۸ lands
    const cc = new THREE.Vector3(0, 0.115, 0);
    for (const l of ideas) {
      const { i } = l.userData;
      const th = [0.95, 0.33, -0.33, -0.95][i];
      const a = seg(t, 67.7 + i * 0.22, 68.15 + i * 0.22, ease.out);
      const R = 0.088 + 0.012 * (1 - a);
      l.position.set(cc.x + Math.sin(th) * R, cc.y + Math.cos(th) * R * 0.95, 0.03);
      l.quaternion.copy(camera.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -th * 0.55));
      l.material.opacity = a;
      l.visible = a > 0.01;
    }
    // a soft glint across the crystal on the last word «نیست»
    const g = seg(t, 68.85, 69.45, ease.inOut);
    glint.position.set(lerp(-0.09, 0.09, g), 0.16, 0.06);
    glint.intensity = 0.25 * Math.sin(Math.PI * g);
    motes.userData.update(t);
    return {
      exposure: 1.1,
      wb: [1.02, 1.0, 1.0],
      sat: 1.02,
      contrast: 1.08,
      vig: 0.6,
      bloom: { strength: 0.42, radius: 0.55, threshold: 1.5 },
      dof: { focus: camera.position.distanceTo(clock.position), aperture: 7, maxR: 10 },
    };
  }
  return { id: "s8b", t0: 65.1, t1: 69.6, scene, camera, update, transition: { mode: 2, zoomA: 1.6, zoomB: 0.85, blur: 6, ease: ease.inOut } };
}
