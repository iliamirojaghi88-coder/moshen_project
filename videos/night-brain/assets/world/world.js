// The 3D layer of "night-brain": one renderer, one scene, every state a pure
// function of root-timeline time t (seconds). Beats are keyed to the measured
// voiceover (see SPEC.md). Framing is portrait-first (1080×1920).
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { FXAAShader } from "three/addons/shaders/FXAAShader.js";
import { patchBrainMaterial, SKY_VERT, SKY_FRAG, FINISH_SHADER, POINTS_VERT, POINTS_FRAG, FLOW_VERT, FLOW_FRAG } from "./shaders.js";
import * as T from "./textures.js";
import * as O from "./objects.js";

const W = 1080,
  H = 1920,
  FPS = 30;

// Voiceover anchors (seconds), measured from the speech regions.
export const B = {
  reveal: 6.35,
  mistakes: 6.79,
  tomorrow: 8.46,
  endless: 9.92,
  why: 13.15,
  attention: 14.63,
  work: 16.04,
  sounds: 17.39,
  events: 18.0,
  night: 20.07,
  thoughts: 22.67,
  focus: 25.38,
  clock: 27.31,
  alert: 30.27,
  alertPeak: 32.0,
  solution: 34.08,
  toJournal: 35.35,
  lamp: 40.6,
  dim: 40.95,
  toJournal2: 44.05,
  calm: 46.65,
  busy: 51.77,
  end: 53.6,
  total: 60,
};

// Where footage covers the canvas completely: skip drawing.
const HIDDEN = [
  [-1, 6.28],
  [35.82, 40.42],
  [44.42, 46.37],
];

// ---------- time helpers ----------
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (x) => x * x * (3 - 2 * x);
const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeOutExpo = (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
const easeOutBack = (x) => {
  const c1 = 1.4,
    c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};
const ramp = (t, a, b, f = smooth) => f(clamp01((t - a) / (b - a)));
const lerp = (a, b, k) => a + (b - a) * k;

// Keyframed scalar: [[t, v], ...], smoothstep between keys, held outside.
function track(keys) {
  return (t) => {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 0; i < keys.length - 1; i++) {
      const [t0, v0] = keys[i],
        [t1, v1] = keys[i + 1];
      if (t < t1) return lerp(v0, v1, smooth((t - t0) / (t1 - t0)));
    }
    return keys[keys.length - 1][1];
  };
}
// Keyframed colour (hex), mixed in linear space.
function colorTrack(keys) {
  const cols = keys.map(([t, hex]) => [t, new THREE.Color(hex)]);
  const out = new THREE.Color();
  return (t) => {
    if (t <= cols[0][0]) return out.copy(cols[0][1]);
    for (let i = 0; i < cols.length - 1; i++) {
      const [t0, c0] = cols[i],
        [t1, c1] = cols[i + 1];
      if (t < t1) return out.copy(c0).lerp(c1, smooth((t - t0) / (t1 - t0)));
    }
    return out.copy(cols[cols.length - 1][1]);
  };
}
// Integral of a keyframed rate from t0 to t (fixed step, deterministic).
function integrate(rate, t, t0 = 6.0, dt = 1 / 60) {
  let a = 0;
  for (let x = t0; x < t; x += dt) a += rate(Math.min(x + dt / 2, t)) * Math.min(dt, t - x);
  return a;
}
function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Camera shots: keys {t, p, l, fov, e}; Catmull-Rom through positions, each
// segment eased by e (0 = constant speed, 1 = settle on the key).
const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
function shot(keys) {
  const ks = keys.map((k) => ({ ...k, P: V(k.p), L: V(k.l) }));
  const cr = (a, b, c, d, u) => {
    const u2 = u * u,
      u3 = u2 * u;
    return 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
  };
  const crV = (A, Bv, C, D, u, out) => out.set(cr(A.x, Bv.x, C.x, D.x, u), cr(A.y, Bv.y, C.y, D.y, u), cr(A.z, Bv.z, C.z, D.z, u));
  return {
    t0: ks[0].t,
    t1: ks[ks.length - 1].t,
    at(t, pos, look) {
      let i = 0;
      while (i < ks.length - 2 && t >= ks[i + 1].t) i++;
      const a = ks[Math.max(0, i - 1)],
        b = ks[i],
        c = ks[i + 1],
        d = ks[Math.min(ks.length - 1, i + 2)];
      let u = clamp01((t - b.t) / (c.t - b.t));
      const e = c.e ?? 0.6;
      u = lerp(u, c.ease ? c.ease(u) : easeInOut(u), e);
      crV(a.P, b.P, c.P, d.P, u, pos);
      crV(a.L, b.L, c.L, d.L, u, look);
      return lerp(b.fov ?? 32, c.fov ?? b.fov ?? 32, u);
    },
  };
}

// ---------- day layout (portrait: everything stacks vertically) ----------
const DAY = {
  laptop: [0.0, -0.215, 0.075],
  phone: [0.07, 0.17, 0.05],
  cards: [
    [0.074, 0.02, 0.13],
    [-0.076, 0.075, 0.12],
    [0.078, -0.07, 0.12],
    [-0.074, -0.04, 0.13],
  ],
};

export async function createWorld(canvas, opts = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = opts.shadows ?? true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, W / H, 0.01, 60);
  scene.fog = new THREE.FogExp2(0x000000, 0.5);

  await T.loadFonts();

  // ---------- environment ----------
  const pmrem = new THREE.PMREMGenerator(renderer);
  const hdr = await new HDRLoader().loadAsync("assets/hdri/studio_small_09_1k.hdr");
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = pmrem.fromEquirectangular(hdr).texture; // props (standard PBR)

  const skyU = {
    uTop: { value: new THREE.Color() },
    uMid: { value: new THREE.Color() },
    uBot: { value: new THREE.Color() },
    uGlow: { value: new THREE.Color() },
    uGlowAmt: { value: 0 },
    uGlowDir: { value: new THREE.Vector3(0, 0, -1) },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(30, 48, 24),
    new THREE.ShaderMaterial({ uniforms: skyU, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false }),
  );
  sky.renderOrder = -10;
  scene.add(sky);

  const floorMat = new THREE.MeshStandardMaterial({ color: 0xdfe3e8, roughness: 0.6, metalness: 0 });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(6, 96), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.3;
  floor.receiveShadow = true;
  scene.add(floor);

  // ---------- lights ----------
  const key = new THREE.DirectionalLight(0xffffff, 1);
  key.position.set(-0.6, 1.1, 0.8);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -0.45, right: 0.45, top: 0.45, bottom: -0.45, near: 0.1, far: 4 });
  key.shadow.radius = 6;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.002;
  scene.add(key);
  const rimBlue = new THREE.DirectionalLight(0x4fa4ff, 1);
  rimBlue.position.set(-0.9, 0.5, -1.0);
  scene.add(rimBlue);
  const rimOrange = new THREE.PointLight(0xff7a32, 1, 0, 2);
  rimOrange.position.set(0.45, 0.12, -0.35);
  scene.add(rimOrange);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x8890a0, 0);
  scene.add(hemi);
  const lampLight = new THREE.PointLight(0xffb066, 0, 0, 2);
  scene.add(lampLight);

  // ---------- brain ----------
  const brainU = {
    uTime: { value: 0 },
    uAct: { value: 0 },
    uOrange: { value: 0 },
    uGold: { value: 0 },
    uPulse: { value: 0 },
    uRim: { value: 0 },
    uSpark: { value: 0 },
    uBlue: { value: new THREE.Color(0x3d9dff) },
    uAmber: { value: new THREE.Color(0xff6a24) },
    uWarm: { value: new THREE.Color(0xffc66e) },
  };
  // Phong-based tissue: the brain fills a third of the frame, and a physical
  // material with PMREM sampling cost ~2 s a frame in software GL. No env
  // reflection: HDR softboxes glint on every gyrus and read as glitter.
  const brainMat = new THREE.MeshPhongMaterial({
    vertexColors: true,
    shininess: 42,
    specular: new THREE.Color(0x4a3c3a),
    emissive: 0x000000,
  });
  if (opts.patch ?? true) patchBrainMaterial(brainMat, brainU);
  const gltf = await new GLTFLoader().loadAsync(opts.brainFile ?? "assets/models/brain.glb");
  const brain = new THREE.Group();
  const brainModel = gltf.scene;
  brainModel.traverse((o) => {
    if (o.isMesh) {
      o.material = brainMat;
      o.castShadow = true;
    }
  });
  brainModel.position.set(0, -0.008, 0.018); // centre of mass at the origin
  brain.add(brainModel);
  scene.add(brain);

  // ---------- particles ----------
  const sprite = T.softSprite();
  function cloud(n, seed, rMin, rMax, sizeMin, sizeMax, palette) {
    const rnd = mulberry32(seed);
    const pos = new Float32Array(n * 3),
      col = new Float32Array(n * 3),
      size = new Float32Array(n),
      sd = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = rnd() * 2 - 1,
        th = rnd() * Math.PI * 2,
        r = lerp(rMin, rMax, Math.pow(rnd(), 0.7));
      const s = Math.sqrt(1 - u * u);
      pos.set([Math.cos(th) * s * r, u * r * 0.75, Math.sin(th) * s * r], i * 3);
      const c = new THREE.Color(palette[Math.floor(rnd() * palette.length)]);
      col.set([c.r, c.g, c.b], i * 3);
      size[i] = lerp(sizeMin, sizeMax, Math.pow(rnd(), 3));
      sd[i] = rnd();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    g.setAttribute("aSeed", new THREE.BufferAttribute(sd, 1));
    const u = { uSprite: { value: sprite }, uScale: { value: 1 }, uTime: { value: 0 }, uOpacity: { value: 1 }, uBurst: { value: 0 } };
    const m = new THREE.ShaderMaterial({
      uniforms: u,
      vertexShader: POINTS_VERT,
      fragmentShader: POINTS_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const p = new THREE.Points(g, m);
    p.frustumCulled = false;
    return { points: p, u };
  }
  const thoughts = cloud(900, 7, 0.2, 0.75, 4, 13, [0x4f9dff, 0x6fb6ff, 0x4f9dff, 0xff8a45, 0x9fc9ff]);
  const dust = cloud(500, 11, 0.6, 2.2, 3, 9, [0xd8e4ff, 0xffffff, 0xffd9b0]);
  if (opts.points ?? true) scene.add(thoughts.points, dust.points);

  // ---------- night thoughts: memories, tomorrow, the clock ----------
  const photos = await O.makePhotos();
  const calendar = O.makeCalendar();
  const clock = O.makeClock();
  const thoughtItems = [
    ...photos.map((p, i) => ({ obj: p.group, mat: p.mat, kind: "photo", i })),
    { obj: calendar.group, kind: "calendar" },
    { obj: clock.group, kind: "clock" },
  ];
  const rndT = mulberry32(42);
  const ringTilt = new THREE.Euler(0.32, 0, -0.18);
  thoughtItems.forEach((it, k) => {
    it.r = 0.17 + 0.07 * rndT();
    it.phase = (k / thoughtItems.length) * Math.PI * 2 + rndT() * 0.4;
    it.y = (rndT() - 0.5) * 0.2;
    it.spin = (rndT() - 0.5) * 0.9;
    it.tilt = (rndT() - 0.5) * 0.6;
    it.size = it.kind === "photo" ? 0.82 : 0.85;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: sprite, color: 0x4fa4ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
    halo.scale.setScalar(0.2);
    it.halo = halo;
    scene.add(it.obj);
    if (opts.halos ?? true) scene.add(halo);
  });

  // Orbit trails for the thoughts that never end.
  const trails = [0.2, 0.25, 0.3].map((r, i) => {
    const u = { uColor: { value: new THREE.Color(i === 1 ? 0xff8c4a : 0x6bb6ff) }, uOpacity: { value: 0 }, uOffset: { value: 0 }, uReveal: { value: 1 }, uDash: { value: 5 + i * 2 } };
    const m = new THREE.Mesh(
      new THREE.TorusGeometry(r, 0.0006, 8, 360),
      new THREE.ShaderMaterial({ uniforms: u, vertexShader: FLOW_VERT, fragmentShader: FLOW_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    );
    m.rotation.set(Math.PI / 2 + ringTilt.x + (i - 1) * 0.22, (i - 1) * 0.35, ringTilt.z * (i - 1));
    scene.add(m);
    return u;
  });

  // ---------- day: laptop, phone, notifications ----------
  const laptop = await O.makeLaptop();
  laptop.group.rotation.set(0.42, 0.0, 0.0);
  laptop.group.scale.setScalar(0.8);
  scene.add(laptop.group);
  const phone = O.makePhone();
  phone.group.rotation.set(0.04, -0.32, -0.1);
  scene.add(phone.group);
  const cards = await O.makeCards();
  cards.forEach((c, i) => {
    c.group.rotation.set(0, [-0.12, 0.18, -0.2, 0.12][i], [0.03, -0.04, 0.03, -0.02][i]);
    scene.add(c.group);
  });
  const rings = [0, 1, 2].map(() => {
    const m = new THREE.Mesh(
      new THREE.TorusGeometry(0.05, 0.0008, 8, 96),
      new THREE.MeshBasicMaterial({ color: 0x2f7dff, transparent: true, opacity: 0, depthWrite: false }),
    );
    scene.add(m);
    return m;
  });

  // Attention filaments: brain → each daily thing.
  function filament(to, color) {
    const from = to.clone().normalize().multiplyScalar(0.07);
    const mid = from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, 0.02, 0.04));
    const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
    const u = { uColor: { value: new THREE.Color(color) }, uOpacity: { value: 0 }, uOffset: { value: 0 }, uReveal: { value: 0 }, uDash: { value: 6 } };
    const m = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 96, 0.0008, 8, false),
      new THREE.ShaderMaterial({ uniforms: u, vertexShader: FLOW_VERT, fragmentShader: FLOW_FRAG, transparent: true, depthWrite: false }),
    );
    scene.add(m);
    return u;
  }
  const fil = [
    filament(V(add(DAY.laptop, [0, 0.06, -0.02])), 0x1f6fff),
    filament(V(DAY.phone), 0x1f6fff),
    ...DAY.cards.map((p) => filament(V(p), 0xf26a1f)),
  ];

  // ---------- bedside vignette, far from the mind set ----------
  const tl = new THREE.TextureLoader();
  const wood = {
    map: await tl.loadAsync("assets/tex/walnut_veneer_diff_1k.jpg"),
    normal: await tl.loadAsync("assets/tex/walnut_veneer_nor_gl_1k.jpg"),
    rough: await tl.loadAsync("assets/tex/walnut_veneer_rough_1k.jpg"),
  };
  wood.map.colorSpace = THREE.SRGBColorSpace;
  for (const k of ["map", "normal", "rough"]) {
    wood[k].wrapS = wood[k].wrapT = THREE.RepeatWrapping;
    wood[k].repeat.set(1.6, 1);
    wood[k].anisotropy = 8;
  }
  const bedside = O.makeBedside(wood);
  const BS = new THREE.Vector3(4, 0, 0);
  bedside.group.position.copy(BS);
  scene.add(bedside.group);
  const bsPhone = O.makePhone();
  bsPhone.group.rotation.set(Math.PI / 2, 0, 0.5); // face down
  bsPhone.group.position.copy(BS).add(new THREE.Vector3(0.13, 0.0042, -0.04));
  bsPhone.screenMat.emissiveIntensity = 0;
  scene.add(bsPhone.group);
  const bsClock = O.makeClock();
  bsClock.group.scale.setScalar(0.62);
  bsClock.group.position.copy(BS).add(new THREE.Vector3(0.02, 0.031, -0.12));
  bsClock.group.rotation.y = -0.15;
  bsClock.setTime(1.0 + 23 / 60);
  scene.add(bsClock.group);
  lampLight.position.copy(BS).add(bedside.lampPos);
  // A dark bedroom wall far behind, catching the lamp's spill.
  // ...with the lamp's warm pool of light painted into it (centred above the lamp).
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x2a1d15, roughness: 0.95, emissive: 0xffa060, emissiveMap: T.lightPool(768, 512, 343, 300, 230), emissiveIntensity: 0 });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(3, 2), wallMat);
  wall.position.copy(BS).add(new THREE.Vector3(0, 0.4, -0.7));
  scene.add(wall);

  // ---------- post ----------
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: opts.samples ?? 0 });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(1);
  composer.setSize(W, H);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.8, 0.5, 0.85);
  if (opts.bloom ?? true) composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const fxaa = new ShaderPass(FXAAShader);
  fxaa.uniforms.resolution.value.set(1 / W, 1 / H);
  composer.addPass(fxaa);
  const finish = new ShaderPass(FINISH_SHADER);
  finish.uniforms.uFlashColor.value = new THREE.Color(1, 1, 1);
  composer.addPass(finish);

  // ---------- the score ----------
  const k = (...a) => track(a);
  const c = (...a) => colorTrack(a);
  const L = {
    exposure: k([6, 1.0], [13.1, 1.0], [13.6, 0.8], [19.9, 0.8], [22, 1.0], [34, 1.0], [35, 1.0], [40.6, 0.95], [46.6, 1.0], [60, 1.0]),
    env: k([6, 0.15], [13.1, 0.15], [13.6, 0.8], [20.1, 0.8], [22.2, 0.15], [33.9, 0.15], [35.2, 0.25], [40.6, 0.18], [46.6, 0.25], [53.6, 0.15]),
    keyI: k([6, 0.6], [13.1, 0.6], [13.6, 2.4], [20.1, 2.4], [22.2, 0.55], [33.9, 0.55], [35.2, 1.2], [40.6, 0.0], [44.4, 0.0], [46.6, 1.4], [53.6, 0.9], [60, 0.85]),
    keyC: c([6, 0x9fb8ff], [13.1, 0x9fb8ff], [13.6, 0xfff4e8], [20.1, 0xfff4e8], [22.2, 0x8fb0ff], [33.9, 0x8fb0ff], [35.2, 0xffc277], [46.6, 0xffc982], [53.6, 0xa9c3ff]),
    blueI: k([6, 2.6], [13.1, 2.6], [13.6, 0.6], [20.1, 0.6], [22.2, 2.8], [27.3, 2.6], [33.9, 2.4], [35.2, 1.0], [40.6, 0.0], [44.4, 0.0], [46.6, 0.9], [53.6, 3.2]),
    orangeI: k([6, 0.0], [7.4, 0.25], [13.1, 0.25], [13.6, 0.0], [22.2, 0.0], [25.4, 0.22], [30.2, 0.3], [32.0, 0.8], [33.9, 0.6], [34.9, 0.04], [46.6, 0.04], [53.6, 0.1]),
    hemiI: k([6, 0.06], [13.1, 0.06], [13.6, 0.85], [20.1, 0.85], [22.2, 0.06], [46.6, 0.12], [53.6, 0.06]),
    lamp: k([40.5, 0.2], [40.95, 0.2], [41.25, 0.12], [42.3, 0.075], [44.2, 0.065]),
    skyTop: c([6, 0x010206], [13.1, 0x010206], [13.6, 0xf1f3f6], [20.1, 0xf1f3f6], [22.2, 0x010206], [34, 0x010206], [35.3, 0x050407], [40.6, 0x030201], [44, 0x030201], [46.6, 0x040408], [53.6, 0x010207]),
    skyMid: c([6, 0x040a16], [13.1, 0x040a16], [13.6, 0xe2e6eb], [20.1, 0xe2e6eb], [22.2, 0x040a16], [29, 0x070812], [34, 0x0b0709], [35.3, 0x0e0a0a], [40.6, 0x120b06], [44, 0x0d0805], [46.6, 0x0b0a0e], [53.6, 0x040914]),
    skyBot: c([6, 0x010103], [13.1, 0x010103], [13.6, 0xcfd5dc], [20.1, 0xcfd5dc], [22.2, 0x010103], [40.6, 0x020101], [46.6, 0x030304], [53.6, 0x010103]),
    glowC: c([6, 0x123c78], [13.1, 0x123c78], [13.6, 0xffffff], [22.2, 0x123c78], [30, 0x4a1f10], [33.9, 0x4a1f10], [35.2, 0x5a3a16], [40.6, 0x5a3a16], [46.6, 0x4a3418], [53.6, 0x0f2c58]),
    glowA: k([6, 0.0], [7.4, 0.35], [13.1, 0.35], [13.6, 0.0], [20.1, 0.0], [22.2, 0.45], [33.9, 0.5], [35.2, 0.35], [40.6, 0.3], [46.6, 0.4], [53.6, 0.5]),
    fog: k([6, 0.9], [13.1, 0.9], [13.6, 0.04], [20.1, 0.04], [22.2, 0.8], [40.6, 0.5], [46.6, 0.8]),
    bloomS: k([6, 0.75], [13.1, 0.75], [13.6, 0.15], [20.1, 0.15], [22.2, 0.7], [30.2, 0.8], [32.0, 1.0], [34.0, 0.75], [35.2, 0.7], [40.6, 0.5], [46.6, 0.7], [51.7, 0.7], [52.2, 0.95], [53.0, 0.7]),
    bloomT: k([6, 0.75], [13.1, 0.75], [13.6, 2.0], [20.1, 2.0], [22.2, 0.75], [40.6, 0.85], [44.4, 0.85], [46.6, 0.75]),
    // brain
    act: k([6.3, 0.12], [7.4, 0.55], [9.9, 0.7], [13.1, 0.7], [13.5, 0.15], [14.6, 0.25], [20.1, 0.25], [22.6, 0.35], [25.4, 0.75], [27.3, 0.6], [30.2, 0.7], [32.0, 1.05], [33.6, 0.85], [34.6, 0.3], [35.3, 0.18], [46.6, 0.25], [50.8, 0.1], [51.7, 0.12], [52.1, 0.6], [53.2, 0.18], [54.5, 0.4], [60, 0.45]),
    orange: k([6, 0.3], [13.1, 0.3], [13.5, 0.0], [22.2, 0.12], [25.4, 0.35], [30.2, 0.5], [32.0, 0.95], [34.0, 0.65], [34.8, 0.0], [53.6, 0.0], [56, 0.12]),
    gold: k([34.2, 0.0], [35.0, 0.7], [40.6, 0.7], [46.6, 0.9], [53.2, 0.9], [54.2, 0.2]),
    rim: k([6, 0.1], [13.1, 0.1], [13.5, 0.0], [20.1, 0.0], [22.2, 0.12], [27.3, 0.15], [32.0, 0.3], [34.5, 0.15], [46.6, 0.15], [53.6, 0.38]),
    spark: k([6.3, 0.0], [7.4, 0.35], [13.1, 0.35], [13.5, 0.0], [22.2, 0.1], [25.4, 0.3], [30.2, 0.45], [32.0, 0.7], [34.4, 0.05], [46.6, 0.08], [51.7, 0.06], [52.0, 0.6], [53.2, 0.06]),
    brainScale: k([6, 1], [53.6, 1], [55.2, 0.8]),
    // particles
    pOp: k([6.3, 0.0], [7.0, 0.7], [13.1, 0.7], [13.5, 0.0], [20.1, 0.0], [22.2, 0.55], [25.4, 0.75], [30.2, 0.85], [34.0, 0.85], [35.3, 0.45], [46.6, 0.45], [51.4, 0.18], [51.8, 0.85], [53.2, 0.3], [55, 0.6], [60, 0.6]),
    pBurst: k([51.6, 0.0], [52.0, 1.0], [53.0, 0.0]),
    dOp: k([6.3, 0.0], [6.9, 0.55], [13.1, 0.5], [13.5, 0.0], [20.1, 0.0], [22.2, 0.5], [40.6, 0.45], [46.6, 0.45]),
    orbitRate: k([6.3, 0.0], [7.4, 0.12], [9.9, 0.2], [12.6, 0.3], [13.1, 0.3], [22.6, 0.12], [26.8, 0.22], [30.2, 0.5], [32.6, 1.4], [33.7, 1.6], [34.1, 0.9], [34.9, 0.0], [46.6, 0.05], [60, 0.05]),
    trailsOp: k([9.8, 0.0], [10.6, 0.7], [12.9, 0.7], [13.3, 0.0], [30.1, 0.0], [30.9, 0.8], [34.0, 0.8], [34.9, 0.0]),
    flash: k([13.0, 0.0], [13.22, 0.8], [13.75, 0.0]),
    fade: k([59.2, 0.0], [60, 1.0]),
    clockHours: k([6.3, 1.2], [13.1, 1.27], [22.6, 1.82], [27.3, 1.95], [30.1, 3.12], [34.1, 3.22], [60, 3.28]),
  };
  // Heartbeat pulses on the measured onsets of the heartbeat sound
  // (sfx/heartbeat placed at 30.30 s from 8.2 s into the file).
  const HB_AT = 30.3,
    HB_FROM = 8.2;
  const beats = [8.32, 8.57, 9.17, 9.44, 10.01, 10.26, 10.83, 11.11, 11.6, 11.86].map((o) => HB_AT + o - HB_FROM);
  const pulse = (t) => {
    let p = 0;
    for (const b of beats) p += Math.exp(-Math.pow((t - b) / 0.07, 2)) * (b > B.solution ? 0.3 : 1);
    return Math.min(p, 1.2);
  };

  // ---------- camera ----------
  const lapScreen = add(DAY.laptop, [0, 0.055, -0.035]);
  const shots = [
    shot([
      { t: 6.3, p: [0.0, 0.03, 2.3], l: [0, 0.0, 0], fov: 30 },
      { t: 7.5, p: [0.02, 0.035, 0.66], l: [0, 0.005, 0], fov: 32, e: 1, ease: easeOutExpo },
      { t: 9.9, p: [0.16, 0.06, 0.6], l: [0.02, -0.01, 0.02], fov: 32, e: 0.4 },
      { t: 13.1, p: [0.42, 0.25, 0.38], l: [0.0, 0.0, 0.0], fov: 33, e: 0.5 },
    ]),
    shot([
      { t: 13.1, p: [0.42, 0.25, 0.38], l: [0, 0, 0], fov: 33 },
      { t: 14.6, p: [0.0, 0.025, 1.0], l: [0, -0.005, 0], fov: 32, e: 0.8 },
      { t: 15.9, p: [-0.02, 0.0, 0.86], l: [0, -0.03, 0], fov: 32, e: 0.4 },
      { t: 17.15, p: add(lapScreen, [0.035, 0.07, 0.3]), l: lapScreen, fov: 32, e: 0.75 },
      { t: 17.85, p: add(DAY.phone, [0.09, 0.03, 0.46]), l: add(DAY.phone, [0.004, 0.04, 0]), fov: 32, e: 0.9 },
      { t: 19.6, p: [0.02, 0.03, 1.02], l: [0, -0.005, 0], fov: 32, e: 0.8 },
      { t: 22.4, p: [0.0, 0.03, 0.74], l: [0, 0.0, 0], fov: 32, e: 0.5 },
      { t: 26.9, p: [-0.4, 0.18, 0.52], l: [0, 0.0, 0], fov: 32, e: 0.4 },
      { t: 28.4, p: [-0.34, 0.1, 0.6], l: [-0.05, 0.02, 0.05], fov: 31, e: 0.8 },
      { t: 30.1, p: [-0.3, 0.09, 0.62], l: [-0.05, 0.02, 0.05], fov: 31, e: 0.6 },
      { t: 32.2, p: [0.2, 0.46, 0.66], l: [0, -0.07, 0], fov: 33, e: 0.7 },
      { t: 34.1, p: [0.42, 0.37, 0.62], l: [0, 0.045, 0], fov: 33, e: 0.4 },
      { t: 35.8, p: [0.18, 0.16, 0.74], l: [0, 0.04, 0], fov: 32, e: 0.8 },
    ]),
    shot([
      { t: 40.5, p: [4.05, 0.24, 1.02], l: [3.9, 0.11, -0.05], fov: 30 },
      { t: 44.4, p: [4.01, 0.21, 0.84], l: [3.89, 0.115, -0.05], fov: 30, e: 0.6 },
    ]),
    shot([
      { t: 46.5, p: [-0.12, 0.05, 0.7], l: [0, 0.0, 0], fov: 32 },
      { t: 51.7, p: [0.16, 0.08, 0.6], l: [0, 0.0, 0], fov: 32, e: 0.5 },
      { t: 53.4, p: [0.2, 0.09, 0.52], l: [0, 0.0, 0], fov: 32, e: 0.6 },
      { t: 56.0, p: [0.0, -0.02, 1.0], l: [0, -0.14, 0], fov: 32, e: 0.8 },
      { t: 60.0, p: [-0.04, -0.03, 0.96], l: [0, -0.14, 0], fov: 32, e: 0.4 },
    ]),
  ];
  const camPos = new THREE.Vector3(),
    camLook = new THREE.Vector3();
  const fwd = new THREE.Vector3(),
    right = new THREE.Vector3(),
    up = new THREE.Vector3();
  // A point in front of the lens: d metres ahead, x/y as a fraction of the
  // half-frame at that depth (so hero props are framed, never cropped).
  const inFrame = (d, x, y, out) => {
    const hh = d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    return out.copy(camera.position).addScaledVector(fwd, d).addScaledVector(right, x * hh * camera.aspect).addScaledVector(up, y * hh);
  };

  // ---------- per-frame ----------
  const tmp = new THREE.Vector3(),
    tmp2 = new THREE.Vector3();
  function renderAt(t) {
    if (HIDDEN.some(([a, b]) => t > a && t < b)) return;
    const s = shots.find((x) => t <= x.t1) || shots[shots.length - 1];
    camera.fov = s.at(Math.max(t, s.t0), camPos, camLook);
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    camera.getWorldDirection(fwd);
    right.crossVectors(fwd, camera.up).normalize();
    up.crossVectors(right, fwd).normalize();

    renderer.toneMappingExposure = L.exposure(t);
    scene.environmentIntensity = L.env(t);
    scene.environmentRotation.y = 0.6 + t * 0.05;
    key.intensity = L.keyI(t);
    key.color.copy(L.keyC(t));
    rimBlue.intensity = L.blueI(t);
    const pz = pulse(t);
    rimOrange.intensity = L.orangeI(t) * (1 + 0.8 * pz);
    hemi.intensity = L.hemiI(t);
    const inLamp = t > 40 && t < 45;
    lampLight.intensity = inLamp ? L.lamp(t) : 0;
    skyU.uTop.value.copy(L.skyTop(t));
    skyU.uMid.value.copy(L.skyMid(t));
    skyU.uBot.value.copy(L.skyBot(t));
    skyU.uGlow.value.copy(L.glowC(t));
    skyU.uGlowAmt.value = L.glowA(t) * (1 + 0.4 * pz);
    skyU.uGlowDir.value.copy(fwd);
    scene.fog.color.copy(L.skyMid(t));
    scene.fog.density = L.fog(t);
    bloom.strength = L.bloomS(t);
    bloom.threshold = L.bloomT(t);
    finish.uniforms.uFrame.value = Math.round(t * FPS);
    finish.uniforms.uFlash.value = L.flash(t);
    finish.uniforms.uFade.value = L.fade(t);

    // brain
    brainU.uTime.value = t;
    brainU.uAct.value = L.act(t);
    brainU.uOrange.value = L.orange(t);
    brainU.uGold.value = L.gold(t);
    brainU.uPulse.value = pz;
    brainU.uRim.value = L.rim(t);
    brainU.uSpark.value = L.spark(t);
    brain.rotation.set(0.05 * Math.sin(t * 0.21), -0.35 + t * 0.028, 0.02 * Math.sin(t * 0.17));
    brain.scale.setScalar(L.brainScale(t) * (1 + 0.012 * pz));
    brain.position.y = 0.004 * Math.sin(t * 0.6);
    brain.visible = !inLamp;

    // particles
    const orbit = integrate(L.orbitRate, t);
    thoughts.u.uTime.value = t;
    thoughts.u.uOpacity.value = L.pOp(t);
    thoughts.u.uBurst.value = L.pBurst(t);
    thoughts.points.rotation.y = orbit * 0.45 + t * 0.01;
    thoughts.points.visible = !inLamp;
    dust.u.uTime.value = t;
    dust.u.uOpacity.value = L.dOp(t);
    dust.points.rotation.y = t * 0.012;
    dust.points.position.copy(inLamp ? BS : tmp.set(0, 0, 0));

    // thoughts orbiting the brain
    const present =
      ramp(t, B.mistakes - 0.1, B.mistakes + 0.7) * (1 - ramp(t, B.why - 0.05, B.why + 0.35)) +
      ramp(t, B.thoughts - 0.2, B.thoughts + 1.4) * (1 - ramp(t, B.solution + 0.4, B.toJournal));
    const approach = lerp(1.6, 1.0, ramp(t, B.thoughts, B.focus + 0.6));
    const calHero = ramp(t, B.tomorrow - 0.1, B.tomorrow + 0.7) * (1 - ramp(t, B.endless + 0.2, B.endless + 1.0));
    const clockHero = ramp(t, B.clock - 0.3, B.clock + 0.9) * (1 - ramp(t, B.alert - 0.1, B.alert + 1.2));
    thoughtItems.forEach((it, k2) => {
      let pres = present;
      if (t < B.why && it.kind === "calendar") pres *= ramp(t, B.tomorrow - 0.25, B.tomorrow + 0.35);
      if (t < B.why && it.kind === "clock") pres *= ramp(t, B.endless - 0.1, B.endless + 0.5);
      // calm: each thought dims and goes out, one by one
      const ext = t > B.calm - 1 ? ramp(t, B.calm + 0.8 + k2 * 0.6, B.calm + 1.7 + k2 * 0.6) : 0;
      if (t > B.calm - 1) pres = ramp(t, B.calm - 0.2, B.calm + 0.6) * (1 - ext);
      const a = it.phase + orbit;
      const r = it.r * (t < B.why ? lerp(1.2, 1, ramp(t, B.mistakes, B.endless)) : approach) * (t > B.calm - 1 ? 1.3 : 1);
      tmp.set(Math.cos(a) * r, it.y + 0.012 * Math.sin(t * 0.9 + k2), Math.sin(a) * r).applyEuler(ringTilt);
      // keep clear of the lens; during a hero moment the others step back
      const heroOn = it.kind === "calendar" || it.kind === "clock" ? 0 : Math.max(calHero, clockHero);
      const clear = lerp(0.47, 0.62, heroOn);
      tmp2.subVectors(tmp, camera.position);
      if (tmp2.length() < clear) tmp.copy(camera.position).addScaledVector(tmp2.normalize(), clear);
      it.obj.position.copy(tmp);
      it.obj.lookAt(camera.position);
      it.obj.rotateY(0.35 * Math.sin(t * 0.3 + k2) + it.spin * 0.3);
      it.obj.rotateX(it.tilt * 0.5);
      let sc = easeOutBack(clamp01(pres)) * it.size * (it.kind === "calendar" || it.kind === "clock" ? 1 : lerp(1, 0.75, Math.max(calHero, clockHero)));
      // the calendar's moment: it swings into frame on "tomorrow"
      if (it.kind === "calendar") {
        const hero = calHero;
        it.obj.position.lerp(inFrame(0.52, 0.12, -0.42, tmp), hero);
        it.obj.lookAt(camera.position);
        it.obj.rotateY(-0.25 * hero);
        sc = lerp(sc, 0.95, hero);
      }
      // the clock's moment: front and centre on "why you can't sleep"
      if (it.kind === "clock") {
        const hero = clockHero;
        it.obj.position.lerp(inFrame(0.46, 0.0, -0.2, tmp), hero);
        if (hero > 0) {
          it.obj.lookAt(camera.position);
          it.obj.rotateY(0.18 * hero);
        }
        sc = lerp(sc, 1.0, hero);
        clock.handMat.emissiveIntensity = 0.2 * hero;
      }
      if (it.mat) it.mat.emissiveIntensity = 0.06 + 0.18 * L.pOp(t);
      it.obj.scale.setScalar(Math.max(0.0001, sc));
      it.obj.visible = sc > 0.002 && !inLamp;
      it.halo.position.copy(it.obj.position).addScaledVector(tmp2.subVectors(it.obj.position, camera.position).normalize(), 0.07);
      it.halo.scale.setScalar(0.2 * sc);
      it.halo.material.color.setHex(it.kind === "clock" || (it.kind === "photo" && it.i % 2) ? 0xff7a32 : 0x3d8dff);
      it.halo.material.opacity = 0.28 * clamp01(pres) * (1 + 0.5 * pz);
      it.halo.visible = it.obj.visible;
    });
    clock.setTime(L.clockHours(t));
    trails.forEach((u, i) => {
      u.uOpacity.value = L.trailsOp(t);
      u.uOffset.value = orbit * (1.2 + i * 0.3);
    });

    // day things
    const dayIn = ramp(t, B.why + 0.35, B.why + 1.2) * (1 - ramp(t, B.night + 1.0, B.night + 2.6));
    const sinkDay = ramp(t, B.night + 1.2, B.thoughts + 0.6);
    laptop.group.visible = phone.group.visible = t > B.why && t < B.thoughts + 1;
    laptop.group.scale.setScalar(Math.max(0.0001, 0.8 * easeOutBack(ramp(t, B.why + 0.35, B.why + 1.0, (x) => x))));
    phone.group.scale.setScalar(Math.max(0.0001, easeOutBack(ramp(t, B.why + 0.5, B.why + 1.15, (x) => x))));
    laptop.group.position.copy(V(DAY.laptop)).add(tmp.set(0, -0.3 * sinkDay + 0.002 * Math.sin(t), 0));
    phone.group.position.copy(V(DAY.phone)).add(tmp.set(0, -0.45 * sinkDay + 0.002 * Math.sin(t * 1.1 + 1), 0));
    laptop.setOpen(1 - ramp(t, B.night + 0.3, B.night + 1.5));
    laptop.screenMat.emissiveIntensity = 0.9 * (1 - ramp(t, B.night + 0.2, B.night + 1.2));
    // the phone buzzes on "sounds"
    const tb = t - B.sounds;
    const buzz = tb > -0.05 && tb < 0.6 ? 0.012 * Math.sin(tb * 120) * (1 - tb / 0.65) : 0;
    phone.group.rotation.set(0.04, -0.32 + buzz, -0.1 + buzz * 0.5);
    phone.screenMat.emissiveIntensity = 0.95 * (1 - ramp(t, B.night + 0.8, B.night + 1.1)) + 0.2 * ramp(t, B.sounds - 0.05, B.sounds + 0.1) * (1 - ramp(t, B.sounds + 0.4, B.sounds + 1.2));
    rings.forEach((m, i) => {
      const tt = t - (B.sounds + i * 0.28);
      const on = tt > 0 && tt < 1.1;
      m.visible = on;
      if (!on) return;
      const kk = tt / 1.1;
      m.position.copy(phone.group.position);
      m.quaternion.copy(phone.group.quaternion);
      m.scale.setScalar(0.9 + 2.2 * kk);
      m.material.opacity = 0.55 * (1 - kk) * smooth(clamp01(tt / 0.1));
    });
    cards.forEach((cd, i) => {
      const tIn = i === 0 ? B.sounds + 0.05 : B.events + 0.08 + (i - 1) * 0.22;
      const kIn = ramp(t, tIn, tIn + 0.55, (x) => x);
      const out = ramp(t, B.night + 0.1 + i * 0.12, B.night + 0.9 + i * 0.12);
      const home = V(DAY.cards[i]);
      if (i === 0) home.lerp(phone.group.position, 1 - easeOutExpo(kIn)); // pops out of the phone
      cd.group.position.copy(home);
      cd.group.position.y += 0.003 * Math.sin(t * 1.3 + i);
      cd.group.scale.setScalar(Math.max(0.0001, 0.8 * easeOutBack(kIn) * (1 - 0.25 * out)));
      cd.mat.opacity = clamp01(kIn * 1.5) * (1 - out);
      cd.group.visible = kIn > 0 && out < 1;
    });
    fil.forEach((u, i) => {
      const tIn = i < 2 ? B.attention + 0.1 + i * 0.3 : i === 2 ? B.sounds + 0.4 : B.events + 0.3 + (i - 3) * 0.2;
      u.uReveal.value = ramp(t, tIn, tIn + 0.9) * (1 - ramp(t, B.night, B.night + 0.9));
      u.uOpacity.value = 0.85 * dayIn;
      u.uOffset.value = t * 1.6;
    });
    floor.visible = t > B.why && t < B.thoughts; // daylight studio only
    floorMat.color.setHex(0xdfe3e8).multiplyScalar(lerp(1, 0.05, ramp(t, B.night, B.night + 2.2)));

    // bedside
    const lampK = L.lamp(t) / 0.2;
    bedside.shadeMat.emissiveIntensity = 2.4 * lampK;
    bedside.bulbMat.color.setRGB(1.0, 0.85, 0.6).multiplyScalar(0.6 + 1.4 * lampK);
    bedside.group.visible = bsPhone.group.visible = bsClock.group.visible = wall.visible = inLamp;
    wallMat.emissiveIntensity = 0.42 * lampK;

    if (opts.direct) renderer.render(scene, camera);
    else composer.render();
  }

  // Compile everything once while building so the first seek is not slow.
  renderer.compile(scene, camera);
  return { renderAt, renderer, scene, camera };
}
