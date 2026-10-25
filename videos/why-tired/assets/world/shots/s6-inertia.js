// SCENE 06 — "دلیل سوم: اینرسی خواب. یعنی مغزت بعد از بیدارشدن هنوز کاملاً
// هوشیار نشده. این حالت معمولاً موقتیه." (38.7 → 48.7)
// Cold mist. A frosted-glass ۳ clears as it turns to us. The extruded words
// «اینرسی» «خواب» drift in with heavy, decelerating (inertial) motion; the
// camera passes between them into a macro of the brain — dim, foggy, soft.
// It dollies out while the fog thins, focus sharpens and the light warms:
// the state is temporary.
import { THREE, seg, ease, lerp, clamp, track, lookFrom, setShadow, smooth, wobble, hash } from "../engine.js";
import { makeBrain, backdrop } from "../brain.js";
import { dust } from "../fx.js";

function mistTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d");
  for (let i = 0; i < 90; i++) {
    const x = 80 + hash(i * 1.7) * 352, y = 80 + hash(i * 2.9) * 352, r = 40 + hash(i * 4.1) * 130;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(255,255,255,${0.05 + 0.06 * hash(i * 7.3)})`);
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 512, 512);
  }
  // soft vignette so sprite edges never show
  const id = g.getImageData(0, 0, 512, 512);
  for (let y = 0; y < 512; y++)
    for (let x = 0; x < 512; x++) {
      const d = Math.hypot(x - 256, y - 256) / 256;
      id.data[(y * 512 + x) * 4 + 3] *= Math.max(0, 1 - d * d);
    }
  g.putImageData(id, 0, 0);
  return new THREE.CanvasTexture(c);
}

export default async function build({ E, M, G }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x03060c);
  const fog = new THREE.FogExp2(0x0b121e, 1.1);
  scene.fog = fog;
  scene.environment = E.studioEnv({
    ambient: 0x04070d,
    panels: [
      { pos: [-3, 4, -3], size: [4, 3], color: 0xdfe8ff, intensity: 2.4 },
      { pos: [4, 1, 3], size: [2, 6], color: 0x7a9cff, intensity: 1.2 },
      { pos: [-4, 0, 4], size: [2, 5], color: 0xffc58a, intensity: 0.8 },
    ],
  });
  scene.environmentIntensity = 0.5;
  const bd = backdrop(0x0e1a2e, 0x020409, 0.8, [5, 8]);
  bd.material.fog = false;
  bd.position.set(0, 0, 1.6);
  bd.rotation.y = Math.PI;
  scene.add(bd);

  const brain = await makeBrain(E);
  brain.tissue = brain.tissue.clone();
  brain.pivot.traverse((o) => o.isMesh && (o.material = brain.tissue));
  scene.add(brain.pivot);

  // frosted glass ۳ that clears
  const threeMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.55, transmission: 1, thickness: 0.06, ior: 1.45, attenuationColor: new THREE.Color(0xbcd4ff), attenuationDistance: 0.25, clearcoat: 1, clearcoatRoughness: 0.4, envMapIntensity: 3.2 });
  threeMat.fog = false;
  const three = new THREE.Mesh(G.n3, threeMat);
  const threePivot = new THREE.Group();
  threePivot.add(three);
  scene.add(threePivot);
  const threeBack = new THREE.SpotLight(0xdfe9ff, 0, 1.5, 0.5, 0.5, 2);
  threeBack.position.set(0.05, 0.12, 0.05);
  threeBack.target = threePivot;
  scene.add(threeBack);
  const threeKey = new THREE.SpotLight(0xffffff, 0, 1.5, 0.4, 0.6, 2);
  threeKey.position.set(-0.35, 0.3, -0.6);
  threeKey.target = threePivot;
  scene.add(threeKey);

  // heavy graphite words
  const wordMat = new THREE.MeshPhysicalMaterial({ color: 0xaab3c2, metalness: 1, roughness: 0.3, normalMap: M.tex.brushedN, normalScale: new THREE.Vector2(0.12, 0.12), clearcoat: 0.5, clearcoatRoughness: 0.2, envMapIntensity: 1.8 });
  const wA = new THREE.Mesh(G.w_inertia, wordMat);
  const wB = new THREE.Mesh(G.w_sleep, wordMat);
  wA.castShadow = wB.castShadow = true;
  const words = new THREE.Group();
  const gA = new THREE.Group(), gB = new THREE.Group();
  gA.add(wA);
  gB.add(wB);
  words.add(gA, gB);
  scene.add(words);
  const wordRim = new THREE.SpotLight(0xbcd2ff, 0, 2, 0.6, 0.6, 2);
  wordRim.position.set(-0.3, 0.25, -0.55);
  wordRim.target = words;
  scene.add(wordRim);

  // mist layers
  const mistTex = mistTexture();
  const mists = [];
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: mistTex, color: 0x41506a, transparent: true, opacity: 0.5, depthWrite: false, fog: false }));
    m.userData = { x: (hash(i * 3.1) - 0.5) * 0.5, y: (hash(i * 5.7) - 0.5) * 0.4, z: -0.05 - hash(i * 7.9) * 0.45, s: 0.7 + hash(i * 9.1) * 0.8, v: 0.01 + 0.012 * hash(i * 2.2) };
    scene.add(m);
    mists.push(m);
  }

  const key = setShadow(new THREE.DirectionalLight(0xc6d4ff, 1.0), 2048, 0.2, 0.1, 4, 3, -0.0002);
  key.position.set(-0.55, 0.75, -0.35);
  scene.add(key, key.target);
  const warm = new THREE.DirectionalLight(0xffc791, 0);
  warm.position.set(-0.7, 0.4, -0.2);
  scene.add(warm, warm.target);
  const rim = new THREE.SpotLight(0x7fa4ff, 2.0, 3, 0.6, 0.6, 2);
  rim.position.set(0.4, 0.3, 0.6);
  scene.add(rim);
  const motes = dust(260, new THREE.Box3(new THREE.Vector3(-0.4, -0.3, -0.7), new THREE.Vector3(0.4, 0.3, 0.2)), { size: 0.0016, opacity: 0.35, color: 0xcfdcff, seed: 21 });
  scene.add(motes);

  const camera = new THREE.PerspectiveCamera(34, 1080 / 1920, 0.005, 20);
  // [t, px,py,pz, tx,ty,tz]
  const keys = [
    [38.7, -0.16, 0.05, -0.62, -0.03, 0.03, -0.22],
    [40.0, -0.12, 0.05, -0.58, -0.03, 0.02, -0.2],
    [41.25, -0.09, 0.03, -0.5, -0.02, 0.012, -0.18],
    [42.1, -0.075, 0.03, -0.155, 0.0, 0.01, 0.0],
    [43.4, -0.15, 0.06, -0.22, 0.0, 0.0, 0.0],
    [45.8, -0.3, 0.1, -0.4, 0.0, 0.0, 0.0],
    [48.7, -0.42, 0.16, -0.52, 0.0, 0.0, 0.0],
  ];

  function update(t) {
    const k = track(keys, t);
    lookFrom(camera, [k[0], k[1], k[2]], [k[3], k[4], k[5]]);
    const wake = seg(t, 45.9, 48.3, ease.inOut); // the inertia lifts
    brain.pivot.rotation.y = -0.25 + 0.02 * (t - 38.7) + 0.015 * wobble(t * 0.25, 2);

    // ۳: frosted → clear as it turns toward us
    const tIn = seg(t, 38.75, 39.6, ease.expoOut);
    const tOut = seg(t, 39.95, 40.4, ease.in);
    threePivot.visible = t < 40.45;
    threePivot.position.set(-0.03 + 0.06 * tOut, 0.03, -0.22 + 0.02 * tOut);
    threePivot.lookAt(camera.position);
    threePivot.rotateY(lerp(-1.1, 0, tIn) + 0.8 * tOut);
    three.scale.setScalar(0.17 * lerp(0.85, 1, tIn));
    threeMat.roughness = lerp(0.6, 0.06, seg(t, 39.0, 39.9));
    threeMat.clearcoatRoughness = lerp(0.5, 0.05, seg(t, 39.0, 39.9));
    threeBack.intensity = 4 * tIn * (1 - tOut);
    threeKey.intensity = 2.5 * tIn * (1 - tOut);

    // «اینرسی خواب»: heavy drift in (long decel), then the camera slips between them
    const aIn = seg(t, 40.1, 41.4, ease.expoOut);
    const bIn = seg(t, 40.85, 41.9, ease.expoOut);
    words.visible = t > 40.05 && t < 42.3;
    words.position.set(-0.025, 0.016, -0.2);
    words.lookAt(camera.position);
    gA.position.set(lerp(0.32, 0, aIn), 0.034, 0);
    gB.position.set(lerp(-0.3, 0, bIn), -0.032, 0);
    gA.rotation.set(0, lerp(0.7, 0, aIn), 0);
    gB.rotation.set(0, lerp(-0.7, 0, bIn), 0);
    wA.scale.setScalar(0.06);
    wB.scale.setScalar(0.06);
    wordRim.intensity = 5.0 * Math.max(aIn, bIn);

    // tissue reads cold and dull while drowsy, warmer and livelier as it clears
    brain.tissue.color.setRGB(lerp(0.62, 0.92, wake), lerp(0.62, 0.78, wake), lerp(0.7, 0.72, wake));
    brain.tissue.roughness = lerp(0.62, 0.48, wake);
    key.intensity = lerp(0.9, 2.6, wake);
    key.color.setRGB(lerp(0.78, 1.0, wake), lerp(0.83, 0.94, wake), 1.0 - 0.1 * wake);
    warm.intensity = 1.6 * wake;
    fog.density = lerp(1.15, 0.25, wake);
    fog.color.setRGB(lerp(0.045, 0.06, wake), lerp(0.065, 0.05, wake), lerp(0.1, 0.045, wake));
    for (const m of mists) {
      const u = m.userData;
      m.position.set(u.x + u.v * (t - 38.7), u.y + 0.004 * Math.sin(t * 0.3 + u.z * 9), u.z);
      m.scale.setScalar(u.s);
      m.quaternion.copy(camera.quaternion);
      m.material.opacity = 0.22 * (1 - wake) * (t < 42.0 ? 0.4 : 1);
      m.visible = m.material.opacity > 0.01;
    }
    motes.userData.update(t);
    const drowsy = seg(t, 41.9, 42.6) * (1 - wake);
    const focusTarget = t < 40.5 ? threePivot.position : t < 42.0 ? words.position : new THREE.Vector3(0, 0, 0);
    return {
      exposure: lerp(1.0, 1.15, wake),
      wb: [lerp(0.9, 1.04, wake), lerp(0.96, 1.0, wake), lerp(1.12, 0.94, wake)],
      sat: lerp(0.62, 1.0, wake),
      contrast: lerp(1.04, 1.1, wake),
      vig: lerp(0.75, 0.55, wake),
      blur: 3.2 * drowsy,
      bloom: { strength: 0.45, radius: 0.6, threshold: 1.5 },
      dof: { focus: camera.position.distanceTo(focusTarget) * (t > 42.0 ? lerp(1.0 + 0.6 * (1 - wake), 1, wake) : 1), aperture: lerp(12, 5, wake), maxR: 12 },
    };
  }
  return { id: "s6", t0: 38.7, t1: 48.7, scene, camera, update, transition: { mode: 3, blur: 4, ease: ease.inOut } };
}
