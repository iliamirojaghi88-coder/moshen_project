// SCENE 03 — "نکته اینجاست که فقط مدت خواب مهم نیست؛ کیفیت و زمان خواب هم اهمیت دارن." (12.0 → 19.45)
// The anatomical brain in a deep-blue studio. Three orbital systems arrive
// in step with the words: a steel ring of 60 ticks (مدت — the clock's minute
// track, carried over), a glass ring with a luminous five-cycle wave
// (کیفیت), and a brass 24-hour ring with an orbiting bead (زمان). On
// "مهم نیست" the duration ring drains; at the end the quality wave unrolls
// into the straight night timeline of the next scene.
import { THREE, seg, ease, lerp, clamp, track, lookFrom, setShadow, smooth, wobble } from "../engine.js";
import { makeBrain, backdrop } from "../brain.js";
import { dust } from "../fx.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

export const TEAL = new THREE.Color(0.18, 1.0, 0.9);
export const AMBER = new THREE.Color(1.0, 0.62, 0.22);

export default async function build({ E, M }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x01030a);
  scene.environment = E.studioEnv({
    ambient: 0x02050c,
    panels: [
      { pos: [-3, 4, -3], size: [4, 3], color: 0xfff2e6, intensity: 3.0 },
      { pos: [5, 1, 3], size: [2, 6], color: 0x2fd6c8, intensity: 1.0 },
      { pos: [-4, 0, 4], size: [2, 6], color: 0x3a64ff, intensity: 1.2 },
    ],
  });
  scene.environmentIntensity = 0.6;
  const bd = backdrop(0x0a2a55, 0x010309, 0.9, [4, 7]);
  bd.position.set(0, 0, -1.4);
  scene.add(bd);

  const brain = await makeBrain(E);
  scene.add(brain.pivot);

  // ---- ring A: 60 steel ticks (duration)
  const tickGeo = new RoundedBoxGeometry(0.0034, 0.0125, 0.0024, 2, 0.0008);
  const tickMat = new THREE.MeshPhysicalMaterial({ color: 0xdfe3e8, metalness: 1, roughness: 0.22, emissive: 0xffffff, emissiveIntensity: 0 });
  const ticks = new THREE.InstancedMesh(tickGeo, tickMat, 60);
  ticks.castShadow = true;
  const ringA = new THREE.Group();
  ringA.add(ticks);
  ringA.rotation.set(1.18, 0.15, 0.32);
  scene.add(ringA);
  const RA = 0.135;

  // ---- ring B: glass guide ring + luminous wave tube (quality)
  const RB = 0.152;
  const glassRing = new THREE.Mesh(
    new THREE.TorusGeometry(RB, 0.0042, 24, 240),
    new THREE.MeshPhysicalMaterial({ color: 0xbfeeea, metalness: 0, roughness: 0.08, transmission: 0.0, transparent: true, opacity: 0.22, clearcoat: 1, envMapIntensity: 1.5 }),
  );
  const ringB = new THREE.Group();
  ringB.add(glassRing);
  ringB.rotation.set(1.42, -0.55, -0.42);
  scene.add(ringB);
  const waveMat = new THREE.MeshStandardMaterial({ color: 0x062421, emissive: TEAL, emissiveIntensity: 2.2, roughness: 0.4 });
  const wave = new THREE.Mesh(new THREE.BufferGeometry(), waveMat);
  scene.add(wave);
  const waveLight = new THREE.PointLight(0x39e6d6, 0, 0.5, 2);
  scene.add(waveLight);

  // ---- ring C: brass 24h ring + bead (timing)
  const RC = 0.172;
  const brass = new THREE.MeshPhysicalMaterial({ color: 0xc8975a, metalness: 1, roughness: 0.3, normalMap: M.tex.brushedN, normalScale: new THREE.Vector2(0.2, 0.2) });
  const ringC = new THREE.Group();
  const torusC = new THREE.Mesh(new THREE.TorusGeometry(RC, 0.0018, 16, 260), brass);
  ringC.add(torusC);
  const hourGeo = new THREE.BoxGeometry(0.0016, 0.0016, 0.007);
  const hours = new THREE.InstancedMesh(hourGeo, brass, 24);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const len = i % 6 === 0 ? 1.8 : 1;
    m4.compose(new THREE.Vector3(Math.cos(a) * RC, Math.sin(a) * RC, 0), new THREE.Quaternion(), new THREE.Vector3(1, 1, len));
    hours.setMatrixAt(i, m4);
  }
  ringC.add(hours);
  const bead = new THREE.Mesh(new THREE.SphereGeometry(0.0058, 32, 16), new THREE.MeshStandardMaterial({ color: 0x1a0d02, emissive: AMBER, emissiveIntensity: 3.2 }));
  ringC.add(bead);
  const beadLight = new THREE.PointLight(0xffa040, 0, 0.35, 2);
  bead.add(beadLight);
  ringC.rotation.set(1.95, 0.5, 0.2);
  scene.add(ringC);

  // ---- labels
  const lblA = E.label("مدت", { height: 0.03, intensity: 1.35, color: "#e8ecf2" });
  const lblB = E.label("کیفیت", { height: 0.034, intensity: 1.45, color: "#7ff3e8" });
  const lblC = E.label("زمان", { height: 0.03, intensity: 1.4, color: "#ffc77a" });
  // the colour-coded words live in the HTML type layer (t3); the rings stay unlabelled
  lblA.visible = lblB.visible = lblC.visible = false;

  // ---- lights
  const key = setShadow(new THREE.DirectionalLight(0xffeedd, 3.4), 2048, 0.2, 0.1, 4, 2, -0.0002);
  key.position.set(-0.55, 0.75, -0.35);
  scene.add(key, key.target);
  const rimT = new THREE.SpotLight(0x2fe0d0, 2.6, 3, 0.6, 0.6, 2);
  rimT.position.set(0.45, 0.35, 0.55);
  scene.add(rimT);
  const rimB = new THREE.SpotLight(0x4a6dff, 2.8, 3, 0.6, 0.6, 2);
  rimB.position.set(-0.35, -0.2, 0.6);
  scene.add(rimB);
  const motes = dust(320, new THREE.Box3(new THREE.Vector3(-0.35, -0.5, -0.4), new THREE.Vector3(0.35, 0.5, 0.2)), { size: 0.0018, color: 0x9fe8ff, opacity: 0.4, seed: 4 });
  scene.add(motes);

  const camera = new THREE.PerspectiveCamera(32, 1080 / 1920, 0.01, 20);
  // [t, px,py,pz, tx,ty,tz, fov]
  const keys = [
    [12.0, -0.22, 0.12, -0.27, 0, 0.0, 0, 34],
    [13.6, -0.55, 0.22, -0.45, 0, -0.005, 0, 32],
    [15.0, -0.66, 0.2, -0.3, 0.0, 0.0, 0, 32],
    [16.4, -0.74, 0.16, -0.12, 0, 0.0, 0, 32],
    [17.9, -0.78, 0.2, 0.05, 0, 0.0, 0, 32],
    [19.0, -0.85, 0.1, 0.12, 0, 0.0, 0, 32],
    [19.45, -0.86, 0.06, 0.14, 0, 0.0, 0, 32],
  ];

  const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion();
  const camRight = new THREE.Vector3(), camUp = new THREE.Vector3();
  function wavePoints(t, grow, unroll) {
    const pts = [];
    const N = 260;
    camRight.setFromMatrixColumn(camera.matrixWorld, 0);
    camUp.setFromMatrixColumn(camera.matrixWorld, 1);
    ringB.updateMatrixWorld();
    const L = 0.36;
    for (let i = 0; i <= N; i++) {
      const s = i / N;
      const a = s * Math.PI * 2 - Math.PI / 2 + t * 0.15;
      const amp = 0.011 * Math.sin(s * Math.PI * 2 * 5);
      _v.set(Math.cos(a) * (RB + amp * 0.3), Math.sin(a) * (RB + amp * 0.3), amp);
      ringB.localToWorld(_v);
      // straight timeline in camera space: right→left (RTL: bedtime on the right)
      _w.set(0, 0, 0).addScaledVector(camRight, (0.5 - s) * L).addScaledVector(camUp, -0.075 + 0.012 * Math.sin(s * Math.PI * 2 * 5));
      _v.lerp(_w, unroll);
      pts.push(_v.clone());
    }
    return pts;
  }
  let lastKey = "";
  function rebuildWave(t, grow, unroll) {
    const k = `${grow.toFixed(3)}|${unroll.toFixed(3)}|${t.toFixed(2)}`;
    if (k === lastKey) return;
    lastKey = k;
    const curve = new THREE.CatmullRomCurve3(wavePoints(t, grow, unroll), unroll < 0.01);
    const g = new THREE.TubeGeometry(curve, 520, 0.0016 + 0.0008 * unroll, 8, unroll < 0.01);
    g.setDrawRange(0, Math.floor(g.index.count * clamp(grow) / 6) * 6);
    wave.geometry.dispose();
    wave.geometry = g;
  }

  function update(t) {
    const k = track(keys, t);
    camera.fov = k[6];
    camera.updateProjectionMatrix();
    lookFrom(camera, [k[0], k[1], k[2]], [k[3], k[4], k[5]]);
    brain.pivot.rotation.y = 0.05 * (t - 12) + 0.02 * wobble(t * 0.4, 1);
    brain.pivot.rotation.x = 0.04 * wobble(t * 0.3, 3);

    // ring A assembles 12.15 → 13.5, highlights on "مدت", drains on "مهم نیست", returns on "اهمیت"
    ringA.rotation.z = 0.32 + 0.12 * (t - 12);
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      const p = seg(t, 12.15 + (i % 12) * 0.05 + Math.floor(i / 12) * 0.03, 13.4 + (i % 12) * 0.02, ease.expoOut);
      const r = lerp(0.5 + 0.2 * Math.sin(i * 1.7), RA, p);
      const big = i % 5 === 0 ? 1.45 : 1;
      _q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), a - Math.PI / 2);
      m4.compose(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0), _q, new THREE.Vector3(1, big, 1).multiplyScalar(lerp(0.4, 1, p)));
      ticks.setMatrixAt(i, m4);
    }
    ticks.instanceMatrix.needsUpdate = true;
    const hiA = seg(t, 13.9, 14.25) * (1 - seg(t, 14.9, 15.6));
    const drainA = seg(t, 14.95, 15.7) * (1 - seg(t, 17.95, 18.6));
    tickMat.emissiveIntensity = 0.45 * hiA + 0.3 * seg(t, 17.95, 18.6) * (1 - seg(t, 18.8, 19.3));
    tickMat.color.setScalar(lerp(0.87, 0.3, drainA));
    tickMat.roughness = lerp(0.22, 0.6, drainA);

    // ring B draws on "کیفیت", unrolls at the end
    ringB.rotation.z = -0.42 - 0.1 * (t - 12);
    const growB = seg(t, 15.92, 16.7, ease.inOut);
    const unroll = seg(t, 18.85, 19.4, ease.inOut);
    glassRing.material.opacity = 0.22 * seg(t, 15.85, 16.3) * (1 - unroll);
    wave.visible = growB > 0.001;
    if (wave.visible) rebuildWave(t, growB, unroll);
    waveMat.emissiveIntensity = 1.5 + 1.2 * seg(t, 15.95, 16.3) * (1 - seg(t, 16.4, 17.0)) + 0.8 * seg(t, 17.95, 18.5);
    waveLight.intensity = 0.25 * growB;
    waveLight.position.set(0, 0, 0);

    // ring C on "زمان"
    const growC = seg(t, 16.6, 17.25, ease.expoOut);
    ringC.visible = growC > 0.001;
    ringC.scale.setScalar(lerp(0.75, 1, growC));
    torusC.material.opacity = 1;
    ringC.rotation.z = 0.2 + 0.08 * (t - 12);
    const ba = -Math.PI / 2 + (t - 16.6) * 0.9;
    bead.position.set(Math.cos(ba) * RC, Math.sin(ba) * RC, 0);
    bead.material.emissiveIntensity = 3.2 * growC;
    beadLight.intensity = 0.06 * growC;
    ringC.visible = ringC.visible && unroll < 0.98;
    ringA.visible = unroll < 0.98;
    const fadeRings = 1 - unroll;
    ringC.scale.multiplyScalar(lerp(1, 1.25, unroll));
    ringA.scale.setScalar(lerp(1, 1.3, unroll));

    // labels: float near their rings, always facing the camera
    const place = () => {};
    camRight.setFromMatrixColumn(camera.matrixWorld, 0);
    camUp.setFromMatrixColumn(camera.matrixWorld, 1);
    const at = (dx, dy) => new THREE.Vector3().addScaledVector(camRight, dx).addScaledVector(camUp, dy);
    const aA = seg(t, 13.92, 14.3, ease.out) * fadeRings;
    const pA = at(0.07, 0.115 + 0.01 * (1 - aA));
    place(lblA, pA.x, pA.y, pA.z, aA * lerp(1, 0.35, drainA), lerp(1, 0.86, drainA));
    lblA.material.color.setScalar(lerp(2.0, 0.9, drainA));
    const aB = seg(t, 15.95, 16.35, ease.out) * fadeRings;
    const pB = at(-0.072 + 0.02 * (1 - aB), 0.07);
    place(lblB, pB.x, pB.y, pB.z, aB, 1 + 0.12 * (1 - seg(t, 16.0, 16.6)));
    const aC = seg(t, 16.62, 17.0, ease.out) * fadeRings;
    const pC = at(0.06, -0.115 - 0.012 * (1 - aC));
    place(lblC, pC.x, pC.y, pC.z, aC);

    motes.userData.update(t);
    return {
      exposure: 1.05,
      wb: [0.94, 1.0, 1.08],
      sat: 1.0,
      contrast: 1.06,
      vig: 0.6,
      bloom: { strength: 0.4, radius: 0.45, threshold: 1.6 },
      dof: { focus: camera.position.length(), aperture: 10, maxR: 10 },
    };
  }
  return {
    id: "s3", t0: 12.0, t1: 19.45, scene, camera, update,
    transition: { mode: 3, blur: 6, ease: ease.inOut },
  };
}
