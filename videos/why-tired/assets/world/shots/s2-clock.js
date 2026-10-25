// SCENE 02 — "هشت ساعت خوابیدی … مگه هشت ساعت خواب کافی نیست؟" (3.0 → 12.6)
// The bedside clock at night. It opens as a match cut on Arman's iris (the
// sunray dial), pulls back while the hands sweep 23:00 → 07:00 and a brushed
// steel ۸ rises; the alarm rattles the clock; the light drains on
// "اصلاً نخوابیدی"; an extruded «چرا؟» holds the pause; then a slow push
// into the dial carries us to the brain.
import { THREE, seg, ease, lerp, clamp, track, lookFrom, setShadow, wobble, smooth } from "../engine.js";
import { makeClock, setClockTime } from "../props.js";
import { makeBedroom } from "../bedroom.js";
import { dust, ghosts } from "../fx.js";

export default async function build({ E, M, G }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020306);
  const room = await makeBedroom(E, M);
  scene.add(room.root);
  for (const n of ["lamp_l_base", "lamp_l_shade", "lamp_l_bulb"]) room.byName[n].visible = false;
  scene.environment = E.studioEnv({
    ambient: 0x05070c,
    panels: [
      { pos: [-6, 3, 4], size: [3, 5], color: 0x9fb7ff, intensity: 2.2 },
      { pos: [5, 2, -3], size: [2, 4], color: 0x6f86c0, intensity: 0.8 },
      { pos: [0, 8, 0], size: [6, 2], color: 0x8aa0d0, intensity: 0.6 },
    ],
  });
  scene.environmentIntensity = 0.45;

  // clock on the left nightstand, leaning back a touch
  const clock = makeClock(E, M);
  clock.position.set(-1.18, 0.595, -1.62);
  clock.rotation.set(-0.06, 0.32, 0);
  scene.add(clock);
  const minuteMesh = clock.userData.hands.minute.children[0];
  const mGhost = ghosts(minuteMesh, 7, 0.3);
  mGhost.position.z = 0.0012;
  clock.userData.body.add(mGhost);

  // the big ۸ — brushed steel with a polished bevel catch
  const eightMat = new THREE.MeshPhysicalMaterial({ color: 0xd9dde3, metalness: 1, roughness: 0.24, clearcoat: 0.4, clearcoatRoughness: 0.15, envMapIntensity: 1.8 });
  const eight = new THREE.Mesh(G.n8, eightMat);
  eight.castShadow = true;
  const eightPivot = new THREE.Group();
  eightPivot.add(eight);
  eightPivot.position.set(-1.215, 0.74, -1.71);
  eightPivot.rotation.y = 0.32;
  scene.add(eightPivot);

  // extruded «چرا؟»
  const whyMat = new THREE.MeshPhysicalMaterial({ color: 0xd9d4ca, metalness: 0.0, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.1 });
  const why = new THREE.Mesh(G.w_why, whyMat);
  why.castShadow = true;
  const whyPivot = new THREE.Group();
  whyPivot.add(why);
  scene.add(whyPivot);

  // lights
  const moon = setShadow(new THREE.DirectionalLight(0xa9bfff, 2.6), 2048, 0.45, 0.5, 12, 3);
  moon.position.set(-4.2, 3.4, 2.4);
  moon.target.position.set(-1.2, 0.6, -1.62);
  scene.add(moon, moon.target);
  const rim = new THREE.SpotLight(0xffc690, 0, 3, 0.45, 0.8, 2);
  rim.position.set(-0.9, 1.25, -2.0);
  rim.target = eightPivot;
  scene.add(rim);
  const alarmGlow = new THREE.PointLight(0xff5a2a, 0, 0.5, 2);
  alarmGlow.position.set(-1.12, 0.62, -1.5);
  scene.add(alarmGlow);
  const dawn = new THREE.DirectionalLight(0xc8d6ff, 0);
  dawn.position.set(-3, 2, 1);
  dawn.target.position.set(-1.2, 0.6, -1.6);
  scene.add(dawn, dawn.target);
  const key = new THREE.SpotLight(0xffffff, 0, 2.5, 0.35, 0.7, 2);
  key.position.set(-0.85, 1.05, -1.1);
  key.target = whyPivot;
  scene.add(key);

  const motes = dust(260, new THREE.Box3(new THREE.Vector3(-1.7, 0.45, -1.95), new THREE.Vector3(-0.6, 1.2, -1.0)), { size: 0.0035, opacity: 0.35 });
  scene.add(motes);

  const camera = new THREE.PerspectiveCamera(36, 1080 / 1920, 0.005, 30);
  const C = clock.position;
  // camera keys: [t, px, py, pz, tx, ty, tz, fov]
  const keys = [
    [3.0, -1.105, 0.6, -1.39, -1.18, 0.595, -1.62, 30],
    [3.7, -1.09, 0.63, -1.34, -1.19, 0.61, -1.62, 34],
    [4.7, -1.02, 0.71, -1.13, -1.2, 0.665, -1.64, 38],
    [5.6, -1.05, 0.7, -1.22, -1.19, 0.655, -1.63, 36],
    [7.1, -1.02, 0.71, -1.14, -1.2, 0.665, -1.64, 38],
    [9.2, -1.04, 0.67, -1.2, -1.19, 0.65, -1.63, 36],
    [10.2, -1.05, 0.665, -1.22, -1.19, 0.645, -1.63, 35],
    [12.6, -1.155, 0.603, -1.535, -1.18, 0.596, -1.62, 30],
  ];

  function update(t) {
    // clock time: 23:00 → 07:00 between 3.3 and 4.75, then real-time-ish creep
    const sweep = seg(t, 3.3, 4.75, ease.inOut);
    const hours = 23 + 8 * sweep + Math.max(0, t - 4.75) / 60;
    setClockTime(clock, hours, 7);
    const spin = Math.abs(seg(t + 0.02, 3.3, 4.75, ease.inOut) - sweep) * 8 * Math.PI * 2;
    const angles = [];
    for (let i = 0; i < 7; i++) {
      const hh = 23 + 8 * seg(t - (i + 1) * 0.012, 3.3, 4.75, ease.inOut);
      angles.push(-(hh % 1) * Math.PI * 2);
    }
    mGhost.userData.set(angles, clamp(spin * 2.5));

    // alarm: 4.84 → 6.1 rattle
    const ring = t >= 4.84 && t < 6.15 ? 1 - smooth(5.95, 6.15, t) : 0;
    const b = clock.userData.body;
    b.rotation.z = ring * 0.022 * Math.sin(t * 2 * Math.PI * 13.3) * (0.7 + 0.3 * Math.sin(t * 9));
    b.position.x = ring * 0.0012 * Math.sin(t * 2 * Math.PI * 11.1 + 1);
    b.position.y = ring * 0.0006 * Math.abs(Math.sin(t * 2 * Math.PI * 7.3));
    alarmGlow.intensity = ring * (0.025 + 0.03 * (Math.sin(t * 2 * Math.PI * 4) > 0 ? 1 : 0.2));
    clock.userData.mats.alarm.emissive.setRGB(1, 0.3, 0.1).multiplyScalar(ring * 0.35);

    // the ۸ rises from below the clock and settles; drains + sinks on "نخوابیدی"
    const rise = seg(t, 3.55, 4.65, ease.expoOut);
    const sink = seg(t, 8.3, 9.3, ease.in);
    eightPivot.position.y = lerp(0.6, 0.74, rise) - 0.2 * sink;
    eightPivot.rotation.x = -0.35 * sink;
    eightPivot.rotation.y = 0.32 + lerp(-0.9, 0, rise) + 0.04 * wobble(t * 0.5, 2);
    eight.scale.setScalar(0.25 * lerp(0.6, 1, rise));
    eightPivot.visible = t > 3.5 && t < 9.4;
    const drain = seg(t, 7.2, 8.6, ease.inOut);
    eightMat.roughness = lerp(0.26, 0.55, drain);
    eightMat.color.setRGB(lerp(0.85, 0.36, drain), lerp(0.87, 0.39, drain), lerp(0.89, 0.44, drain));
    rim.intensity = 3.2 * rise * (1 - drain);

    // «چرا؟» comes forward out of the dark at 9.3, recedes at 10.3
    const wIn = seg(t, 9.28, 9.75, ease.expoOut);
    const wOut = seg(t, 10.15, 10.9, ease.in);
    whyPivot.visible = t > 9.25 && t < 10.95;
    whyPivot.position.set(-1.17, 0.705 + 0.012 * (1 - wIn) - 0.02 * wOut, -1.555 + 0.04 * (1 - wIn) - 0.12 * wOut);
    whyPivot.rotation.set(-0.05, 0.32 + 0.5 * (1 - wIn) - 0.25 * wOut, 0);
    why.scale.setScalar(0.07 * lerp(0.85, 1, wIn));
    key.intensity = 0.9 * wIn * (1 - wOut);

    // light story: moon → dim pre-dawn on "بیدار شدی" → drained on "نخوابیدی" → isolated on "چرا؟"
    const wake = seg(t, 6.2, 6.9);
    const isolate = seg(t, 9.2, 9.55) * (1 - seg(t, 10.2, 11.0));
    moon.intensity = 2.6 * (1 - 0.35 * drain) * (1 - 0.75 * isolate);
    dawn.intensity = 0.9 * wake * (1 - 0.6 * drain);
    scene.environmentIntensity = 0.45 * (1 - 0.5 * isolate);
    room.practicals({ led: 1, phone: 0 });
    motes.userData.update(t);

    const k = track(keys, t);
    // a short jolt when the alarm hits
    const jolt = seg(t, 4.84, 4.9) * (1 - seg(t, 4.9, 5.3, ease.out));
    camera.fov = k[6] - 2.5 * jolt;
    // match cut: the dial centre starts where Arman's iris sits on screen (583, 690)
    const off = 1 - seg(t, 3.25, 3.95, ease.inOut);
    camera.setViewOffset(1080, 1920, -43 * off, 270 * off, 1080, 1920);
    camera.updateProjectionMatrix();
    lookFrom(camera, [k[0] + 0.0015 * ring * Math.sin(t * 61), k[1] + 0.0015 * ring * Math.sin(t * 47), k[2]], [k[3], k[4], k[5]]);

    const camDist = camera.position.distanceTo(C);
    const focusOnWhy = isolate > 0.5;
    return {
      exposure: lerp(1.15, 0.95, drain) * (1 - 0.15 * isolate) + 0.1 * wake,
      wb: [lerp(0.92, 0.88, drain), lerp(0.97, 0.95, drain), 1.1],
      sat: lerp(0.95, 0.62, drain),
      contrast: 1.08,
      vig: 0.6 + 0.25 * isolate,
      bloom: { strength: 0.28 + 0.15 * ring, radius: 0.5, threshold: 2.2 },
      dof: { focus: focusOnWhy ? camera.position.distanceTo(whyPivot.position) : camDist, aperture: lerp(14, 8, seg(t, 3.0, 4.6)) + 6 * isolate, maxR: 12 },
    };
  }
  return { id: "s2", t0: 3.0, t1: 12.62, scene, camera, update };
}
