// METRICA film: one continuous 3D world, drawn as a pure function of time.
// Times are anchored to the voice track (assets/audio/transcript.json).
import * as THREE from "three";
import { loadTextures, makeMaterials, SCAN, TEX } from "./materials.js";
import { makeSky, skyEnvironment, studioEnvironment, SKY_PRESETS, STUDIO_RIGS } from "./env.js";
import { buildBuilding, buildCrane, levelY, roofY, B } from "./building.js";
import { buildCity, buildLot, LOT } from "./city.js";
import { costStack, capitalVessel, profitSteps, drawnPath, dimensionLine } from "./data.js";
import { buildPhone, buildLaptop, ScreenBank } from "./devices.js";
import { makeBackdrop, makeFloor, buildModel } from "./studio.js";
import { buildDashboard } from "./dashboard.js";
import { makePost } from "./post.js";
import { clamp, lerp, prog, smooth, easeInOut, easeOut, easeIn, expoOut, expoInOut, spring, cameraPath, timedPath, mulberry32 } from "./util.js";

const W = 1080, H = 1920;
const canvas = document.getElementById("gl");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: "high-performance" });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.localClippingEnabled = true;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, W / H, 0.1, 8000);
const post = makePost(renderer, scene, camera, W, H);
const pmrem = new THREE.PMREMGenerator(renderer);
const bank = new ScreenBank(renderer);

const U = { windowGlow: { value: 1.0 } };
const world = {};
const labels = [...document.querySelectorAll("[data-anchor]")];
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- lights
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0x3a4c70, 0x0b0b0d, 0.5);
scene.add(hemi);
// studio accents (teal rim, amber kicker) used by the table scenes
const rimL = new THREE.SpotLight(0x37d6cc, 0, 0, 0.6, 0.8, 2);
const kickL = new THREE.SpotLight(0xffb062, 0, 0, 0.6, 0.8, 2);
scene.add(rimL, rimL.target, kickL, kickL.target);
function aimSun(dir, center, size, dist = 160) {
  const d = new THREE.Vector3(...dir).normalize();
  sun.position.copy(center).addScaledVector(d, dist);
  sun.target.position.copy(center);
  const c = sun.shadow.camera;
  c.left = c.bottom = -size;
  c.right = c.top = size;
  c.near = dist * 0.02;
  c.far = dist * 2.5;
  c.updateProjectionMatrix();
}
function spot(L, pos, target, intensity, color) {
  L.position.set(...pos);
  L.target.position.set(...target);
  L.intensity = intensity;
  if (color !== undefined) L.color.set(color);
  L.distance = 0;
}

// ---------------------------------------------------------------- build
async function build() {
  await document.fonts.ready;
  await Promise.all(["400", "700", "800", "900"].map((w) => document.fonts.load(`${w} 40px Peyda`, "متریکا")));
  await loadTextures("assets/tex/");
  const M = makeMaterials();
  world.M = M;

  world.sky = makeSky();
  world.backdrop = makeBackdrop();
  world.floor = makeFloor();
  scene.add(world.sky, world.backdrop, world.floor);
  world.env = {
    dusk: skyEnvironment(pmrem, SKY_PRESETS.dusk),
    dawn1: skyEnvironment(pmrem, SKY_PRESETS.dusk, SKY_PRESETS.morning, 0.33),
    dawn2: skyEnvironment(pmrem, SKY_PRESETS.dusk, SKY_PRESETS.morning, 0.66),
    morning: skyEnvironment(pmrem, SKY_PRESETS.morning),
    day: skyEnvironment(pmrem, SKY_PRESETS.day),
    navy: studioEnvironment(pmrem, STUDIO_RIGS.navy),
    bright: studioEnvironment(pmrem, STUDIO_RIGS.bright),
  };

  world.city = buildCity(M, TEX, U);
  world.lot = buildLot(M);
  world.bld = buildBuilding(M);
  world.crane = buildCrane(M);
  world.crane.position.set(-6.5, 0, -11.5);
  scene.add(world.city, world.lot, world.bld, world.crane);

  // blueprint: plot boundary, footprint, grid axes, column pads
  const bp = new THREE.Group();
  const P = [[LOT.x0, LOT.z0], [LOT.x1, LOT.z0], [LOT.x1, LOT.z1], [LOT.x0, LOT.z1], [LOT.x0, LOT.z0]];
  const F = [[-10, -7.5], [10, -7.5], [10, 7.5], [-10, 7.5], [-10, -7.5]];
  bp.add(drawnPath(P, M.blueprint, 0.1, 0.06));
  bp.add(drawnPath(F, M.blueprint, 0.14, 0.07));
  for (const x of B.xs) bp.add(drawnPath([[x, LOT.z0 + 1], [x, LOT.z1 - 1]], M.blueprint, 0.05, 0.065));
  for (const z of B.zs) bp.add(drawnPath([[LOT.x0 + 0.5, z], [LOT.x1 - 0.5, z]], M.blueprint, 0.05, 0.065));
  const pads = new THREE.Group();
  for (const x of B.xs) for (const z of B.zs) {
    const pad = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.04, 1.1), M.blueprint);
    pad.position.set(x, 0.07, z);
    pads.add(pad);
  }
  bp.add(pads);
  bp.userData.pads = pads;
  scene.add(bp);
  world.blueprint = bp;

  // gold ghost frame that rises ahead of the concrete
  const ghost = new THREE.Group();
  const gm = new THREE.LineBasicMaterial({ color: new THREE.Color(1.0, 0.72, 0.35).multiplyScalar(3), transparent: true });
  for (let L = 0; L < B.levels; L++) {
    const y0 = levelY(L), y1 = levelY(L + 1);
    const pts = [];
    for (const x of B.xs) for (const z of B.zs) pts.push(x, 0, z, x, y1 - y0, z);
    const corners = [[-10, -7.5], [10, -7.5], [10, 7.5], [-10, 7.5]];
    for (let i = 0; i < 4; i++) {
      const [ax, az] = corners[i], [bx, bz] = corners[(i + 1) % 4];
      pts.push(ax, y1 - y0, az, bx, y1 - y0, bz);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const ls = new THREE.LineSegments(geo, gm);
    ls.position.y = y0;
    ghost.add(ls);
  }
  scene.add(ghost);
  world.ghost = ghost;

  // dust motes around the site (they freeze in the hook's stop)
  const rnd = mulberry32(99);
  const N = 900, dp = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    dp[i * 3] = (rnd() - 0.5) * 50;
    dp[i * 3 + 1] = rnd() * 22;
    dp[i * 3 + 2] = (rnd() - 0.5) * 50;
  }
  const dg = new THREE.BufferGeometry();
  dg.setAttribute("position", new THREE.Float32BufferAttribute(dp, 3));
  world.dust = new THREE.Points(dg, new THREE.PointsMaterial({ color: new THREE.Color(1.0, 0.8, 0.55).multiplyScalar(1.4), size: 0.09, transparent: true, opacity: 0.7, depthWrite: false }));
  world.dustBase = dp.slice();
  scene.add(world.dust);

  // scene 2 objects at building scale
  world.cost = costStack(M, 1.35);
  world.vessel = capitalVessel(M, 1.05);
  world.steps = profitSteps(M, 1.0);
  scene.add(world.cost, world.vessel, world.steps);

  // scene 3: data around the white model on the table
  const s3 = new THREE.Group();
  world.s3vessel = capitalVessel(M, 2.6);
  world.s3vessel.position.set(-19, 0, 4);
  s3.add(world.s3vessel);
  const bars = new THREE.Group();
  const barMatA = new THREE.MeshPhysicalMaterial({ color: 0x9fe6ff, roughness: 0.1, transparent: true, opacity: 0.18, clearcoat: 1, depthWrite: false });
  for (let i = 0; i < 6; i++) {
    const h = 4 + i * 2.2;
    const m = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1, 2.2).translate(0, 0.5, 0), barMatA);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(2.24, 0.25, 2.24), M.goldGlow);
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(2.2, 1, 2.2).translate(0, 0.5, 0)), new THREE.LineBasicMaterial({ color: new THREE.Color(0.3, 1.0, 0.95).multiplyScalar(1.6) }));
    const col = new THREE.Group();
    col.add(m, edge, cap);
    col.position.set(13 + i * 3.1, 0, 14 - i * 1.2);
    col.userData = { h, m, edge, cap };
    bars.add(col);
  }
  s3.add(bars);
  world.s3bars = bars;
  // level rings: slab outlines that light up floor by floor
  const rings = new THREE.Group();
  const ringMat = new THREE.LineBasicMaterial({ color: new THREE.Color(0.25, 1.0, 0.95).multiplyScalar(2.5), transparent: true });
  for (let L = 1; L <= B.levels; L++) {
    const y = levelY(L) + 0.05;
    const pts = [V(-10.4, y, -7.9), V(10.4, y, -7.9), V(10.4, y, 9.4), V(-10.4, y, 9.4)];
    const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), ringMat.clone());
    rings.add(ring);
  }
  s3.add(rings);
  world.s3rings = rings;
  // helix of growth around the building
  const hp = [];
  for (let i = 0; i <= 200; i++) {
    const k = i / 200, a = -0.6 + k * Math.PI * 3.1, r = 19 - k * 5;
    hp.push(V(Math.cos(a) * r, 0.5 + k * 33, -3 + Math.sin(a) * r));
  }
  const helixCurve = new THREE.CatmullRomCurve3(hp);
  const helixGeo = new THREE.TubeGeometry(helixCurve, 600, 0.22, 10, false);
  const helix = new THREE.Mesh(helixGeo, M.goldGlow);
  const helixHead = new THREE.Mesh(new THREE.SphereGeometry(0.7, 24, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.8, 0.45).multiplyScalar(5) }));
  s3.add(helix, helixHead);
  world.helix = { mesh: helix, head: helixHead, curve: helixCurve, total: helixGeo.index.count };
  // dimension lines
  world.dims = [
    dimensionLine(M, [-10.2, 0.4, 13.5], [10.2, 0.4, 13.5], 1.2),
    dimensionLine(M, [13.2, 0.4, -15.5], [13.2, 0.4, 9.5], 1.2),
    dimensionLine(M, [-13.5, 0, 10], [-13.5, roofY, 10], 1.2),
  ];
  world.dims.forEach((d) => s3.add(d));
  scene.add(s3);
  world.s3 = s3;

  // converging data swarm (scene 4)
  const SW = 2600, sp = new Float32Array(SW * 3), sseed = new Float32Array(SW * 4);
  const r2 = mulberry32(5);
  for (let i = 0; i < SW; i++) {
    const a = r2() * Math.PI * 2, rr = 14 + r2() * 30, y = r2() * 38;
    sseed.set([Math.cos(a) * rr, y, Math.sin(a) * rr - 3, r2()], i * 4);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute("position", new THREE.Float32BufferAttribute(sp, 3));
  world.swarm = new THREE.Points(sg, new THREE.PointsMaterial({ color: new THREE.Color(1.0, 0.78, 0.42).multiplyScalar(3), size: 0.16, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  world.swarmSeed = sseed;
  world.swarm.frustumCulled = false;
  scene.add(world.swarm);

  // tabletop set (scenes 5 and 8): model, laptop, phone, data streams
  world.model = buildModel(M);
  world.model.scale.setScalar(1 / 110);
  world.laptop = buildLaptop(M);
  world.phone = buildPhone(M);
  scene.add(world.model, world.laptop, world.phone);
  const ST = 420, stp = new Float32Array(ST * 3);
  const stg = new THREE.BufferGeometry();
  stg.setAttribute("position", new THREE.Float32BufferAttribute(stp, 3));
  world.stream = new THREE.Points(stg, new THREE.PointsMaterial({ color: new THREE.Color(1.0, 0.76, 0.4).multiplyScalar(3), size: 0.0013, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  world.stream.frustumCulled = false;
  scene.add(world.stream);
  // plot outline on the model base (lights up as land data arrives)
  const plotLine = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints([V(LOT.x0, 0.08, LOT.z0), V(LOT.x1, 0.08, LOT.z0), V(LOT.x1, 0.08, LOT.z1), V(LOT.x0, 0.08, LOT.z1)]),
    new THREE.LineBasicMaterial({ color: new THREE.Color(1.0, 0.72, 0.35).multiplyScalar(3), transparent: true }),
  );
  world.model.add(plotLine);
  world.model.userData.plotLine = plotLine;

  // dashboard (scene 6)
  world.dash = buildDashboard(M);
  scene.add(world.dash);

  // scene 7: analysis lines on the finished building
  const s7 = new THREE.Group();
  const s7line = M.blueprint.clone();
  s7line.color = new THREE.Color(1.0, 0.74, 0.36).multiplyScalar(1.5);
  world.s7plot = drawnPath(P, s7line, 0.22, 0.2);
  s7.add(world.s7plot);
  world.s7height = dimensionLine(M, [12.2, 0, 9.8], [12.2, roofY + 0.9, 9.8], 1.4);
  s7.add(world.s7height);
  const ticks = new THREE.Group();
  for (let L = 1; L <= B.levels; L++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 0.08), M.goldGlow);
    m.position.set(13.3, levelY(L), 9.8);
    ticks.add(m);
  }
  s7.add(ticks);
  world.s7ticks = ticks;
  scene.add(s7);
  world.s7 = s7;

  scene.fog = new THREE.FogExp2(0x1a2338, 0.0022);
  world.all = [world.sky, world.backdrop, world.floor, world.city, world.lot, world.bld, world.crane, world.blueprint, world.ghost, world.dust, world.cost, world.vessel, world.steps, world.s3, world.swarm, world.model, world.laptop, world.phone, world.stream, world.dash, world.s7];
}

// ---------------------------------------------------------------- frame state
const tmpV = new THREE.Vector3();
function placeLabels() {
  for (const el of labels) {
    const a = world.anchors?.[el.dataset.anchor];
    if (!a || !a.visible || a.opacity <= 0.001) {
      el.style.opacity = 0;
      continue;
    }
    tmpV.copy(a.pos).project(camera);
    const x = (tmpV.x * 0.5 + 0.5) * W, y = (-tmpV.y * 0.5 + 0.5) * H;
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) scale(${(0.92 + 0.08 * a.opacity).toFixed(3)})`;
    el.style.opacity = a.opacity.toFixed(3);
  }
}
function setEnv(name, intensity = 1) {
  scene.environment = world.env[name];
  scene.environmentIntensity = intensity;
}
function reset() {
  for (const o of world.all) o.visible = false;
  world.city.userData.poleMesh.visible = true;
  world.anchors = {};
  world.screens = {};
  SCAN.uScanOn.value = 0;
  sun.castShadow = true;
  sun.intensity = 0;
  hemi.intensity = 0;
  rimL.intensity = kickL.intensity = 0;
  for (const f of world.lot.userData.floods) f.visible = false;
  post.dof.enabled = false;
  const g = post.grade.uniforms;
  g.uFlash.value = 0;
  g.uFade.value = 0;
  g.uSat.value = 1.02;
  g.uContrast.value = 1.06;
  g.uVignette.value = 0.4;
  g.uLift.value.set(0, 0, 0);
  g.uGain.value.set(1, 1, 1);
  g.uGrain.value = 0.022;
  post.bloom.strength = 0.5;
  post.bloom.threshold = 0.9;
  post.bloom.radius = 0.55;
  renderer.toneMappingExposure = 1.0;
  scene.fog.density = 0;
  camera.near = 0.1;
  camera.far = 8000;
}
function dof(focus, range, maxBlur) {
  post.dof.enabled = !window.__noDof;
  post.dof.uniforms.uFocus.value = focus;
  post.dof.uniforms.uRange.value = range;
  post.dof.uniforms.uMaxBlur.value = maxBlur;
}

// building state helper (works for the real building and the model)
function buildingState(root, { cols = 0, frames = 0, facade = 0, glazing = 0, rails = 0, rebarAt = -1, formAt = -1, roof = false, scaffold = false, lights = false, drop = 2.2 }) {
  const p = root.userData.parts;
  for (let L = 0; L < B.levels; L++) {
    const c = clamp(cols - L), f = clamp(frames - L);
    p.columns[L].visible = c > 0.001;
    p.columns[L].scale.y = Math.max(0.001, c);
    p.frame[L].visible = f > 0.001;
    p.frame[L].position.y = levelY(L + 1) + (1 - easeOut(f, 3)) * drop;
    p.frame[L].scale.set(lerp(0.96, 1, f), 1, lerp(0.96, 1, f));
    p.facade[L].visible = L < facade;
    p.glazing[L].visible = L < glazing;
    p.rails[L].visible = L < rails;
    p.rebar[L].visible = L === rebarAt;
    p.formwork[L].visible = L === formAt;
    p.props[L].visible = L === formAt;
    p.lights[L].visible = lights && L < glazing;
  }
  p.roof.visible = roof;
  p.scaffold.visible = scaffold;
}
const COMPLETE = { cols: 7, frames: 7, facade: 7, glazing: 7, rails: 7, roof: true };

function nightCity(te, glow = 1.3) {
  world.sky.visible = world.city.visible = world.lot.visible = true;
  world.sky.userData.set(SKY_PRESETS.dusk);
  world.sky.material.uniforms.uDrift.value = te * 0.004;
  setEnv("dusk", 0.55);
  scene.fog.color.set(0x1a2338);
  scene.fog.density = 0.0021;
  U.windowGlow.value = glow;
  world.city.userData.lamps.visible = true;
  world.city.userData.pools.visible = true;
  world.city.userData.pools.material.opacity = 1;
}

// ================================================================ scene 1
// 0 - 6.45  dive into the city at blue hour; blueprint; frame rises; freeze.
const s1cam = cameraPath([
  [0.0, [-12, 118, 262], [0, 28, -230], 36],
  [0.18, [-8, 104, 196], [0, 2, -30], 38],
  [0.45, [14, 30, 46], [0, 4, -3], 44],
  [0.75, [19, 27, 47], [0, 8, -3], 44],
  [1.0, [22, 26, 48], [0, 9, -3], 44],
]);
const FREEZE0 = 4.62, FREEZE1 = 5.2;
const s1time = (t) => (t < FREEZE0 ? t : t < FREEZE1 ? FREEZE0 : FREEZE0 + (t - FREEZE1) * 0.35);
function scene1(t) {
  const te = s1time(t);
  const u = te < 2.6 ? 0.45 * easeInOut(te / 2.6) : 0.45 + 0.55 * smooth((te - 2.6) / (6.45 - 2.6));
  s1cam(u, camera);
  if (t >= FREEZE0 && t < FREEZE1) {
    camera.fov -= 1.6 * easeOut(prog(t, FREEZE0, FREEZE0 + 0.12));
    camera.updateProjectionMatrix();
  }
  nightCity(te);
  aimSun([0.3, 0.8, -0.5], V(0, 0, 0), 60, 200);
  sun.castShadow = false;
  sun.color.set(0x8fa6d8);
  sun.intensity = 0.35;
  hemi.color.set(0x3a4c70);
  hemi.groundColor.set(0x0b0b0d);
  hemi.intensity = 0.45;
  const fl = world.lot.userData.floods;
  fl[0].visible = fl[1].visible = true;
  fl[0].intensity = 5000;
  fl[1].intensity = 2600 * smooth(prog(te, 1.8, 2.6));
  world.city.userData.trafficAt(te, 5);

  const bpK = prog(te, 2.3, 3.1);
  world.blueprint.visible = true;
  world.blueprint.children.forEach((c, i) => c.userData.set?.(clamp(bpK * 1.3 - i * 0.03)));
  world.blueprint.userData.pads.children.forEach((p, i) => (p.visible = bpK > 0.5 + (i % 5) * 0.08));
  const lv = Math.max(0, (te - 2.8) / 0.27);
  world.ghost.visible = true;
  world.ghost.children.forEach((g, L) => {
    const k = clamp(lv + 0.6 - L);
    g.visible = k > 0.001;
    g.scale.y = Math.max(0.001, easeOut(k));
  });
  world.bld.visible = true;
  buildingState(world.bld, { cols: lv, frames: Math.max(0, lv - 0.75) });

  const pos = world.dust.geometry.attributes.position, b = world.dustBase;
  for (let i = 0; i < pos.count; i++) pos.setXYZ(i, b[i * 3] + Math.sin(te * 0.4 + i) * 0.6, b[i * 3 + 1] + ((te * 0.25 + i * 0.37) % 3) - 1.5, b[i * 3 + 2] + Math.cos(te * 0.3 + i * 1.7) * 0.6);
  pos.needsUpdate = true;
  world.dust.visible = te > 2.2;

  const inFreeze = t >= FREEZE0 && t < FREEZE1 + 0.3;
  const g = post.grade.uniforms;
  g.uFlash.value = inFreeze ? 0.2 * Math.exp(-(t - FREEZE0) * 14) : 0;
  g.uSat.value = inFreeze ? lerp(0.5, 1.02, prog(t, FREEZE1 - 0.05, FREEZE1 + 0.3)) : 1.02;
  g.uContrast.value = 1.12;
  g.uVignette.value = 0.55;
  g.uLift.value.set(0.0, 0.01, 0.025);
  post.bloom.strength = 0.75;
  renderer.toneMappingExposure = 1.15;
}

// ================================================================ scene 2
// 6.45 - 16.8  orbit the half-built frame; dusk turns to morning; cost,
// capital and profit arrive as objects in front of it.
const s2cam = timedPath([
  [6.45, [22, 26, 48], [0, 9, -3], 44],
  [8.6, [16, 20, 42], [0, 10, -2], 44],
  [10.4, [4, 14, 40], [0, 9, 0], 42],
  [11.95, [-1.4, 6.2, 27.0], [-3.6, 5.2, 15], 42],
  [12.75, [-1.1, 6.2, 26.8], [-3.4, 5.2, 15], 42],
  [13.2, [2.8, 5.2, 27.6], [1.0, 5.3, 16.5], 42],
  [14.3, [3.0, 5.3, 27.4], [1.0, 5.3, 16.5], 42],
  [14.75, [6.8, 7.3, 27.2], [5.0, 7.3, 15], 42],
  [15.9, [6.6, 7.4, 27.0], [5.0, 7.3, 15], 42],
  [16.8, [1.2, 9.5, 28], [1.0, 6.4, 12], 48],
]);
function scene2(t) {
  s2cam(t, camera);
  const k = smooth(prog(t, 10.4, 13.6));
  world.sky.visible = world.city.visible = world.lot.visible = true;
  world.sky.userData.set(SKY_PRESETS.dusk, SKY_PRESETS.morning, k);
  world.sky.material.uniforms.uDrift.value = t * 0.004;
  setEnv(k < 0.17 ? "dusk" : k < 0.5 ? "dawn1" : k < 0.83 ? "dawn2" : "morning", lerp(0.55, 0.75, k));
  scene.fog.color.set(0x1a2338).lerp(new THREE.Color(0xc4d2e0), k);
  scene.fog.density = lerp(0.0021, 0.0014, k);
  const sd = new THREE.Vector3(...SKY_PRESETS.dusk.sun).lerp(new THREE.Vector3(...SKY_PRESETS.morning.sun), k);
  sd.y = lerp(0.35, 0.42, k);
  aimSun(sd.toArray(), V(0, 8, 4), 34, 140);
  sun.castShadow = k > 0.05;
  sun.color.set(0xffa25c).lerp(new THREE.Color(0xffe6c4), k);
  sun.intensity = lerp(0.0, 4.2, k);
  hemi.color.set(0x3a4c70).lerp(new THREE.Color(0xa9c3e6), k);
  hemi.groundColor.set(0x0b0b0d).lerp(new THREE.Color(0x5a5048), k);
  hemi.intensity = lerp(0.45, 0.55, k);
  U.windowGlow.value = lerp(1.3, 0.0, k);
  const fl = world.lot.userData.floods;
  fl[0].visible = fl[1].visible = k < 0.98;
  fl[0].intensity = 5000 * (1 - k);
  fl[1].intensity = 2600 * (1 - k);
  world.city.userData.pools.visible = k < 0.6;
  world.city.userData.pools.material.opacity = 1 - k / 0.6;
  world.city.userData.lamps.visible = k < 0.6;
  world.city.userData.trafficAt(s1time(6.45) + (t - 6.45) * 0.6, lerp(5, 0.001, k));
  world.blueprint.visible = k < 0.95;
  world.blueprint.children.forEach((c) => c.userData.set?.(1));

  world.bld.visible = world.crane.visible = true;
  buildingState(world.bld, { cols: 6, frames: 5, facade: 3, glazing: 3, rails: 3, rebarAt: 5, formAt: 5, scaffold: true, lights: k < 0.5 });
  world.bld.userData.parts.facade[3].visible = true;
  world.crane.rotation.y = 0.55 + (t - 6.45) * 0.035;
  world.crane.userData.trolley.position.x = 17 + Math.sin(t * 0.3) * 3;

  const P = { cost: [-3.6, 5.0, 15.0], capital: [1.0, 3.6, 16.5], profit: [5.0, 6.1, 15.0] };
  const bob = (i) => Math.sin(t * 0.9 + i * 2.1) * 0.1;
  const place = (o, p, i, kk, ry) => {
    o.position.set(p[0], p[1] + bob(i), p[2]);
    o.visible = kk > 0;
    o.userData.set(kk);
    o.rotation.y = ry;
  };
  place(world.cost, P.cost, 0, prog(t, 12.05, 12.9), 0.35 + t * 0.04);
  place(world.vessel, P.capital, 1, prog(t, 12.9, 14.6), 0);
  place(world.steps, P.profit, 2, prog(t, 14.45, 15.8), -0.25);
  const below = (p, d) => V(p[0], p[1] - d, p[2]);
  world.anchors = {
    cost: { pos: below(P.cost, 0.75), visible: t > 12.1, opacity: smooth(prog(t, 12.1, 12.4)) },
    capital: { pos: below(P.capital, 0.75), visible: t > 12.94, opacity: smooth(prog(t, 12.94, 13.25)) },
    profit: { pos: below(P.profit, 0.75), visible: t > 14.53, opacity: smooth(prog(t, 14.53, 14.85)) },
  };
  // focus follows the featured object
  const focusOn = t < 12.9 ? P.cost : t < 14.4 ? P.capital : t < 15.9 ? P.profit : null;
  if (t > 11.6 && focusOn) dof(camera.position.distanceTo(V(...focusOn)), 3.5, 9 * smooth(prog(t, 11.6, 12.2)) * (1 - smooth(prog(t, 15.9, 16.6))));

  const g = post.grade.uniforms;
  g.uSat.value = lerp(1.02, 1.06, k);
  g.uContrast.value = lerp(1.12, 1.08, k);
  g.uVignette.value = lerp(0.55, 0.35, k);
  g.uLift.value.set(0.0, 0.01, 0.025).multiplyScalar(1 - k);
  post.bloom.strength = lerp(0.75, 0.35, k);
  renderer.toneMappingExposure = lerp(1.15, 1.0, k);
}

// ================================================================ scene 3
// 16.8 - 25.1  the frame becomes a white architectural model on a navy glass
// table; three questions, three moves: capital (push), cost (track), profit (crane).
const s3cam = timedPath([
  [16.8, [1.2, 9.5, 28], [1.0, 6.4, 12], 48],
  [17.9, [8, 16, 52], [0, 10, -3], 44],
  [18.2, [-4, 12, 54], [-11, 8, 2], 42],
  [19.68, [-9, 9.5, 40], [-13, 7, 3], 42],
  [19.75, [2, 7, 44], [12, 6, 8], 42],
  [21.9, [17, 8, 40], [24, 7, 6], 42],
  [21.97, [20, 5, 40], [0, 10, -3], 46],
  [25.1, [8, 40, 54], [0, 18, -3], 46],
], (x) => x);
function scene3(t) {
  s3cam(t, camera);
  // cut points between questions are hard cuts on the camera curve
  const scan = prog(t, 16.85, 17.75);
  const studio = smooth(prog(t, 17.45, 17.95));
  SCAN.uScanOn.value = 1;
  SCAN.uScanY.value = lerp(-1, roofY + 4, easeInOut(scan));
  const inCity = t < 17.95;
  world.bld.visible = true;
  buildingState(world.bld, { ...COMPLETE, scaffold: false });
  // above the scan line the frame is still the half-built site
  const p = world.bld.userData.parts;
  for (let L = 0; L < B.levels; L++) {
    const below = levelY(L) < SCAN.uScanY.value;
    p.facade[L].visible = p.glazing[L].visible = p.rails[L].visible = below || L < 3;
    if (!below && L >= 5) p.frame[L].visible = L < 5;
  }
  p.roof.visible = SCAN.uScanY.value > roofY;
  p.scaffold.visible = inCity && scan < 0.6;
  world.lot.visible = true;
  world.lot.children.forEach((c, i) => (c.visible = i === 0 || (inCity && scan < 0.3)));
  if (inCity) {
    world.sky.visible = world.city.visible = true;
    world.sky.userData.set(SKY_PRESETS.morning);
    setEnv("morning", 0.75);
    scene.fog.color.set(0xc4d2e0).lerp(new THREE.Color(0x06101c), studio);
    scene.fog.density = lerp(0.0014, 0.03, studio);
    aimSun(SKY_PRESETS.morning.sun, V(0, 8, 0), 40, 150);
    sun.intensity = 4.2;
    sun.color.set(0xffe6c4);
    hemi.intensity = 0.5;
    hemi.color.set(0xa9c3e6);
    hemi.groundColor.set(0x5a5048);
    U.windowGlow.value = 0;
    world.crane.visible = scan < 0.4;
  } else {
    world.backdrop.visible = world.floor.visible = true;
    world.backdrop.userData.set(0x0d1b30, 0x081322, 0x02050a, 0x10324a, [0.3, 0.25, -1]);
    world.floor.userData.dark();
    world.floor.position.y = -0.3;
    setEnv("navy", 0.9);
    scene.fog.color.set(0x06101c);
    scene.fog.density = 0.006;
    aimSun([-0.5, 0.9, 0.35], V(0, 10, 0), 45, 150);
    sun.intensity = 2.4;
    sun.color.set(0xdfe9ff);
    hemi.intensity = 0.25;
    hemi.color.set(0x5577aa);
    hemi.groundColor.set(0x020408);
    spot(rimL, [30, 18, -20], [0, 10, 0], 5000, 0x37d6cc);
    spot(kickL, [-30, 8, 25], [-10, 6, 0], 1800, 0xffb062);
  }
  // questions
  world.s3.visible = t > 17.6;
  const q1 = prog(t, 17.75, 19.6), q2 = prog(t, 19.7, 21.8), q3 = prog(t, 21.95, 24.9);
  world.s3vessel.visible = t > 17.6;
  world.s3vessel.userData.set(smooth(q1) * 0.82);
  world.s3bars.children.forEach((c, i) => {
    const kk = clamp(q2 * 1.6 - i * 0.12);
    c.visible = kk > 0;
    c.userData.m.scale.y = c.userData.edge.scale.y = Math.max(0.001, easeOut(kk, 3) * c.userData.h);
    c.userData.cap.position.y = easeOut(kk, 3) * c.userData.h;
  });
  world.s3rings.children.forEach((r, i) => {
    const kk = clamp(q2 * 1.4 - i * 0.12);
    r.visible = kk > 0;
    r.material.opacity = kk;
  });
  const hk = easeInOut(q3);
  const { mesh, head, curve, total } = world.helix;
  mesh.geometry.setDrawRange(0, Math.floor((total * hk) / 3) * 3);
  mesh.visible = head.visible = hk > 0.002;
  head.position.copy(curve.getPoint(hk));
  world.dims.forEach((d, i) => d.userData.set(easeOut(prog(t, 18.0 + i * 0.25, 18.9 + i * 0.25), 3)));
  world.anchors = {
    dimW: { pos: V(0, 2.4, 13.5), visible: t > 18.5 && t < 22, opacity: smooth(prog(t, 18.6, 18.9)) * (1 - smooth(prog(t, 21.6, 22))) },
    dimH: { pos: V(-13.5, roofY / 2, 10), visible: t > 18.9 && t < 22, opacity: smooth(prog(t, 19.0, 19.3)) * (1 - smooth(prog(t, 21.6, 22))) },
  };
  const g = post.grade.uniforms;
  g.uContrast.value = 1.1;
  g.uVignette.value = 0.5;
  g.uLift.value.set(0.0, 0.012, 0.03).multiplyScalar(studio);
  const scanHot = Math.sin(Math.PI * clamp(scan));
  post.bloom.strength = lerp(0.35, 0.55, studio);
  post.bloom.threshold = lerp(1.4, 1.6, studio);
  renderer.toneMappingExposure = lerp(1.0, 0.95, studio) - 0.22 * scanHot;
}

// ================================================================ scene 4
// 25.1 - 31.0  the data is pulled into one point; light opens to a clean bright
// studio where the logo card appears (DOM overlay, untouched artwork).
const C4 = V(0, 24, -3);
function scene4(t) {
  const pull = prog(t, 25.1, 25.95);
  const bright = smooth(prog(t, 25.85, 26.35));
  if (t < 25.95) {
    // still in the navy studio: everything collapses to the core
    camera.position.set(lerp(8, 4, pull), lerp(40, 30, pull), lerp(54, 46, easeIn(pull)));
    camera.lookAt(C4);
    camera.fov = lerp(46, 40, easeIn(pull));
    camera.updateProjectionMatrix();
    world.backdrop.visible = world.floor.visible = true;
    world.backdrop.userData.set(0x0d1b30, 0x081322, 0x02050a, 0x10324a, [0.3, 0.25, -1]);
    world.floor.userData.dark();
    world.floor.position.y = -0.3;
    setEnv("navy", lerp(0.9, 0.3, pull));
    scene.fog.color.set(0x06101c);
    scene.fog.density = 0.006;
    aimSun([-0.5, 0.9, 0.35], V(0, 10, 0), 45, 150);
    sun.intensity = 2.4 * (1 - pull);
    hemi.intensity = 0.2;
    world.bld.visible = world.lot.visible = true;
    world.lot.children.forEach((c, i) => (c.visible = i === 0));
    buildingState(world.bld, COMPLETE);
    SCAN.uScanOn.value = 1;
    SCAN.uScanY.value = 999;
    world.s3.visible = true;
    // pull every data object toward the core
    const e = easeIn(pull, 2.4);
    world.s3.position.copy(C4).multiplyScalar(e);
    world.s3.scale.setScalar(1 - 0.98 * e);
    world.s3vessel.userData.set(0.82);
    world.helix.mesh.geometry.setDrawRange(0, world.helix.total);
    world.dims.forEach((d) => d.userData.set(1 - e));
    world.s3bars.children.forEach((c) => {
      c.visible = true;
      c.userData.m.scale.y = c.userData.edge.scale.y = c.userData.h;
      c.userData.cap.position.y = c.userData.h;
    });
  }
  world.s3.position.set(0, 0, 0);
  // the swarm: particles stream to the core then burst outward into the light
  world.swarm.visible = t < 27.2;
  const sp = world.swarm.geometry.attributes.position, sd = world.swarmSeed;
  for (let i = 0; i < sp.count; i++) {
    const ph = sd[i * 4 + 3];
    const kin = easeIn(clamp(pull * 1.25 - ph * 0.25), 2);
    let x = lerp(sd[i * 4], C4.x, kin), y = lerp(sd[i * 4 + 1], C4.y, kin), z = lerp(sd[i * 4 + 2], C4.z, kin);
    if (t > 25.9) {
      const out = expoOut(prog(t, 25.9, 27.2));
      const dir = tmpV.set(sd[i * 4] - C4.x, sd[i * 4 + 1] - C4.y, sd[i * 4 + 2] - C4.z).normalize();
      x = C4.x + dir.x * out * (30 + ph * 40);
      y = C4.y + dir.y * out * (30 + ph * 40);
      z = C4.z + dir.z * out * (30 + ph * 40);
    }
    sp.setXYZ(i, x, y, z);
  }
  sp.needsUpdate = true;
  world.swarm.material.opacity = 1 - smooth(prog(t, 26.4, 27.2));
  if (t >= 25.95) {
    // bright studio behind the logo
    const k = t - 25.95;
    camera.position.set(-6 + k * 1.1, 10 - k * 0.25, 44 - k * 1.2);
    camera.lookAt(0, 7.5 - k * 0.1, -3);
    camera.fov = 40;
    camera.updateProjectionMatrix();
    world.backdrop.visible = world.floor.visible = true;
    world.backdrop.userData.set(0xf3f1ec, 0xe6e2db, 0xd2ccc2, 0x0d0b08, [0.0, 0.1, -1]);
    world.floor.userData.bright();
    world.floor.position.y = 0;
    scene.fog.color.set(0xe6e2db);
    scene.fog.density = 0.006;
    setEnv("bright", 0.6);
    hemi.intensity = 0.6;
    hemi.color.set(0xffffff);
    hemi.groundColor.set(0xcfc8bd);
    world.blueprint.visible = true;
    world.blueprint.children.forEach((c, i) => c.userData.set?.(clamp(prog(t, 26.0, 27.4) * 1.3 - i * 0.03)));
    world.blueprint.userData.pads.children.forEach((p, i) => (p.visible = t > 26.6 + (i % 5) * 0.08));
  }
  const g = post.grade.uniforms;
  g.uFlash.value = t > 25.85 ? 0.9 * Math.exp(-(t - 25.85) * 5.5) : 0;
  g.uVignette.value = lerp(0.5, 0.18, bright);
  g.uContrast.value = lerp(1.1, 1.0, bright);
  post.bloom.strength = lerp(0.8, 0.3, bright);
  renderer.toneMappingExposure = lerp(1.1, 1.0, bright);
}

// ================================================================ tabletop
// Shared bright-studio tabletop for scenes 5 and 8 (units: metres).
function tabletop(t, { modelFloors = 7, laptopOpen = 1 } = {}) {
  world.backdrop.visible = world.floor.visible = true;
  world.backdrop.userData.set(0xd9d6d0, 0xc9c4bc, 0x8f887e, 0x1c1812, [0.4, 0.3, -1]);
  world.floor.userData.bright();
  world.floor.position.y = 0;
  setEnv("bright", 0.42);
  aimSun([-0.45, 0.85, 0.4], V(0, 0, 0), 0.6, 4);
  sun.color.set(0xfff1e0);
  sun.intensity = 2.2;
  hemi.color.set(0xffffff);
  hemi.groundColor.set(0x9c958a);
  hemi.intensity = 0.25;
  renderer.toneMappingExposure = 0.95;
  world.model.visible = world.laptop.visible = world.phone.visible = true;
  world.model.position.set(0.12, 0.0042, -0.2);
  world.model.rotation.y = -0.35;
  const fl = Math.min(7, modelFloors);
  buildingState(world.model.userData.building, { cols: fl, frames: fl, facade: fl, glazing: fl, rails: fl, roof: fl >= 7, drop: 3 });
  world.laptop.position.set(-0.17, 0, -0.08);
  world.laptop.rotation.set(0, 0.42, 0);
  world.laptop.userData.setOpen(laptopOpen);
  world.phone.position.set(0.075, 0.105, 0.09);
  world.phone.rotation.set(-0.08, -0.22, 0.0);
  scene.fog.density = 0;
  const g = post.grade.uniforms;
  g.uVignette.value = 0.3;
  g.uContrast.value = 1.06;
  post.bloom.strength = 0.12;
  post.bloom.threshold = 2.5;
  world.phone.userData.sheen.material.envMapIntensity = 0.22;
  world.laptop.userData.sheen.material.envMapIntensity = 0.2;
}
function phoneFrontCam(dist, uvx = 0.5, uvy = 0.5, offset = [0, 0, 0], fov = 30) {
  const ph = world.phone;
  ph.updateMatrixWorld(true);
  const [Wp, Hp] = ph.userData.size;
  const local = V((uvx - 0.5) * (Wp - 0.0042), (uvy - 0.5) * (Hp - 0.0042), 0.004);
  const target = local.clone().applyMatrix4(ph.matrixWorld);
  const n = V(0, 0, 1).transformDirection(ph.matrixWorld);
  camera.position.copy(target).addScaledVector(n, dist).add(V(...offset));
  camera.lookAt(target);
  camera.fov = fov;
  camera.near = 0.005;
  camera.far = 1500;
  camera.updateProjectionMatrix();
  return target;
}
function laptopScreenPoint(uvx, uvy) {
  const lp = world.laptop;
  lp.updateMatrixWorld(true);
  const sc = lp.userData.screen;
  const SW = 0.2965, SH = SW / 1.6;
  return V((uvx - 0.5) * SW, (uvy - 0.5) * SH, 0).applyMatrix4(sc.matrixWorld);
}
function laptopNormal() {
  return V(0, 0, 1).transformDirection(world.laptop.userData.screen.matrixWorld);
}
// data stream particles along a bezier from a to b
function stream(a, b, t, t0, t1, lift = 0.08, count = 420) {
  const pos = world.stream.geometry.attributes.position;
  const env = smooth(prog(t, t0, t0 + 0.25)) * (1 - smooth(prog(t, t1 - 0.25, t1)));
  world.stream.visible = env > 0.01;
  const c = a.clone().add(b).multiplyScalar(0.5);
  c.y += lift;
  for (let i = 0; i < count; i++) {
    const ph = (i * 0.618034) % 1;
    const f = (ph + (t - t0) * 0.9) % 1;
    const jitter = Math.sin(i * 12.9898) * 0.004;
    const q = 1 - f;
    const x = q * q * a.x + 2 * q * f * c.x + f * f * b.x + jitter;
    const y = q * q * a.y + 2 * q * f * c.y + f * f * b.y + Math.cos(i * 4.1) * 0.003;
    const z = q * q * a.z + 2 * q * f * c.z + f * f * b.z + Math.sin(i * 7.7) * 0.004;
    pos.setXYZ(i, x, y, z);
  }
  pos.needsUpdate = true;
  world.stream.material.opacity = env;
}

// ================================================================ scene 5
// 31.0 - 38.4  inputs: land data typed on the phone, project data on the
// laptop, both flowing into the model; the real "calculate" step and loader.
const PHONE_TYPING = [
  [31.0, "s1_empty"], [31.22, "s1_land_focus"], [31.36, "s1_land_1"], [31.45, "s1_land_2"], [31.54, "s1_land_3"], [31.63, "s1_land_4"], [31.72, "s1_land_5"],
  [31.86, "s1_type_focus"], [31.98, "s1_type_1"], [32.06, "s1_type_2"], [32.14, "s1_type_3"], [32.22, "s1_type_4"], [32.3, "s1_type_5"], [32.38, "s1_type_6"],
  [32.5, "s1_area_focus"], [32.62, "s1_area_1"], [32.72, "s1_area_2"], [32.82, "s1_area_3"],
];
const LAPTOP_TYPING = [[32.9, "s3_empty"], [33.45, "s3_floors_focus"], [33.62, "s3_floors_1"]];
function pick(list, t) {
  let cur = list[0][1];
  for (const [ts, l] of list) if (t >= ts) cur = l;
  return cur;
}
function screensAt(t) {
  if (t >= 30.6 && t < 38.6) {
    let phone;
    if (t < 34.25) phone = pick(PHONE_TYPING, t);
    else if (t < 34.95) phone = "s5_ready";
    else phone = `load_${String(Math.min(35, Math.floor((t - 34.95) * 12))).padStart(2, "0")}`;
    const laptop = t < 32.9 ? "s1_empty" : pick(LAPTOP_TYPING, t);
    return { phone, laptop };
  }
  if (t >= 56.8) return { phone: "hero", laptop: "hero" };
  return {};
}
function applyScreens(t) {
  const s = screensAt(t);
  for (const [dev, key, obj] of [["phone", "mobile", world.phone], ["laptop", "desktop", world.laptop]]) {
    const label = s[dev];
    const mat = obj.userData.screenMat;
    if (!label) {
      mat.map = null;
      mat.color.set(0x000000);
      mat.needsUpdate = true;
      continue;
    }
    const tex = bank.get(key, label);
    if (mat.map !== tex) {
      mat.map = tex;
      mat.needsUpdate = true;
    }
    mat.color.setScalar(tex ? 1 : 0);
  }
}
function prepare(t) {
  const s = screensAt(t);
  const list = [];
  if (s.phone) list.push(["mobile", s.phone]);
  if (s.laptop) list.push(["desktop", s.laptop]);
  return bank.ready(list);
}

function scene5(t) {
  // model grows with the typed floor count; plot outline lights with land data
  const floors = t < 33.62 ? 0.0 + 1.0 * smooth(prog(t, 32.0, 32.9)) : 1 + 6 * easeOut(prog(t, 33.62, 34.4), 2);
  tabletop(t, { modelFloors: floors, laptopOpen: easeInOut(prog(t, 30.9, 31.9)) * 0 + 1 });
  world.model.userData.plotLine.visible = t > 31.5;
  world.model.userData.plotLine.material.opacity = smooth(prog(t, 31.5, 32.0));
  applyScreens(t);
  // entrance: phone glides in, laptop already open behind
  const ent = expoOut(prog(t, 30.75, 31.6));
  world.phone.position.x += (1 - ent) * 0.25;
  world.phone.rotation.y += (1 - ent) * -0.9;
  if (t < 32.9) {
    // phone close-up while land data is typed
    const tg = phoneFrontCam(lerp(0.43, 0.36, smooth(prog(t, 31.0, 32.9))), 0.5, 0.62, [0.035, 0.02, 0], 30);
    dof(camera.position.distanceTo(tg), 0.06, 12);
    const a = V(0, 0.002, 0.004).applyMatrix4(world.phone.matrixWorld);
    const b = V(0, 0.4, -3).applyMatrix4(world.model.matrixWorld);
    stream(a, b, t, 31.45, 32.95, 0.06);
  } else if (t < 34.25) {
    // punch-in on the laptop's floor-count field
    const tg = laptopScreenPoint(0.45, 0.5);
    const n = laptopNormal();
    const d = lerp(0.3, 0.24, smooth(prog(t, 32.9, 34.25)));
    camera.position.copy(tg).addScaledVector(n, d).add(V(0.02, 0.015, 0));
    camera.lookAt(tg);
    camera.fov = 30;
    camera.near = 0.005;
    camera.far = 1500;
    camera.updateProjectionMatrix();
    dof(d, 0.05, 10);
    const a = laptopScreenPoint(0.35, 0.5);
    const b = V(0, 10, -3).applyMatrix4(world.model.matrixWorld);
    stream(a, b, t, 33.62, 34.25, 0.08);
  } else {
    // back on the phone: calculate, then the real loader; push into it
    const push = easeIn(prog(t, 36.3, 38.4), 3);
    const tg = phoneFrontCam(lerp(0.4, 0.004, push), 0.5, lerp(0.62, 0.553, smooth(prog(t, 36.3, 37.2))), [0.03 * (1 - push), 0.02 * (1 - push), 0], 30);
    dof(camera.position.distanceTo(tg), 0.05, 12 * (1 - push));
  }
  // finger tap on "calculate" (34.6): a soft press glow at the button
  world.anchors = {
    tap: { pos: V((0.313 - 0.5) * 0.0674, (0.049 - 0.5) * 0.1428, 0.0045).applyMatrix4(world.phone.matrixWorld), visible: t > 34.55 && t < 35.15, opacity: Math.sin(Math.PI * prog(t, 34.55, 35.15)) },
  };
  const g = post.grade.uniforms;
  g.uFade.value = 0;
  if (t > 37.9) {
    g.uFadeColor.value.set(0x071827);
    g.uFade.value = smooth(prog(t, 37.9, 38.4));
  }
}

// ================================================================ scene 6
// 38.4 - 47.45  the four outputs, each on its word.
const s6keys = [
  [38.4, [0.8, 2.9, 4.4], [0.06, 2.2, 0], 40],
  [39.0, [0.3, 2.32, 2.95], [0.06, 2.22, 0], 40],
  [40.55, [0.22, 2.28, 2.85], [0.06, 2.18, 0], 40],
  [40.95, [-0.4, 0.88, 2.5], [-0.1, 0.78, -0.45], 40],
  [43.15, [-0.3, 0.84, 2.45], [-0.1, 0.76, -0.45], 40],
  [43.55, [0.36, -0.58, 2.75], [0.08, -0.7, -0.15], 40],
  [45.0, [0.26, -0.62, 2.7], [0.08, -0.72, -0.15], 40],
  [45.4, [-0.32, -2.06, 2.35], [-0.06, -2.18, -0.55], 40],
  [46.45, [-0.22, -2.1, 2.3], [-0.06, -2.18, -0.55], 40],
  [47.45, [0.5, 0.0, 9.0], [0.0, 0.0, -0.3], 40],
];
const s6cam = cameraPath(s6keys.map(([tt, p, q, f]) => [(tt - 38.4) / (47.45 - 38.4), p, q, f]));
function scene6(t) {
  const u = (t - 38.4) / (47.45 - 38.4);
  // ease within each segment so moves land and hold
  const ks = s6keys.map((k) => (k[0] - 38.4) / (47.45 - 38.4));
  let i = 0;
  while (i < ks.length - 2 && u > ks[i + 1]) i++;
  const seg = (u - ks[i]) / (ks[i + 1] - ks[i]);
  s6cam(ks[i] + (ks[i + 1] - ks[i]) * easeInOut(seg), camera);
  camera.near = 0.02;
  camera.far = 200;
  camera.updateProjectionMatrix();
  world.backdrop.visible = true;
  world.backdrop.userData.set(0x0b1a2e, 0x061222, 0x020509, 0x0f3d4d, [0.2, 0.0, -1]);
  setEnv("navy", 1.0);
  aimSun([-0.4, 0.6, 0.8], V(0, 0, 0), 4, 10);
  sun.castShadow = false;
  sun.intensity = 1.6;
  sun.color.set(0xdde8ff);
  hemi.intensity = 0.3;
  hemi.color.set(0x4c6a99);
  spot(rimL, [4, 3, -3], [0, 0, 0], 60, 0x37d6cc);
  spot(kickL, [-4, -2, 3], [0, 0, 0], 40, 0xffb062);
  world.dash.visible = true;
  const [p1, p2, p3, p4] = world.dash.userData.panels;
  p1.userData.set(prog(t, 39.03, 40.4));
  p2.userData.set(prog(t, 40.7, 42.4));
  // P&L reveal: clip plane sweeps across panel 3 in world space
  p3.updateMatrixWorld(true);
  const x0 = V(-0.5, 0, 0).applyMatrix4(p3.matrixWorld).x, x1 = V(0.5, 0, 0).applyMatrix4(p3.matrixWorld).x;
  const sweep = easeInOut(prog(t, 43.35, 44.9));
  p3.userData.set(sweep, lerp(x0, x1, sweep));
  p4.userData.set(prog(t, 45.2, 46.6));
  const ps = world.dash.userData.particles.geometry.attributes.position;
  world.dash.userData.particles.position.y = (t - 38.4) * 0.03;
  // entrance: the space opens from the loader's dark navy
  const g = post.grade.uniforms;
  g.uFadeColor.value.set(0x071827);
  g.uFade.value = 1 - smooth(prog(t, 38.4, 38.9));
  // exit: brighten into the light (cut to scene 7 on the brightest frame)
  g.uFlash.value = 0.85 * easeIn(prog(t, 46.95, 47.45), 2);
  g.uVignette.value = 0.45;
  g.uContrast.value = 1.08;
  post.bloom.strength = 0.6;
  post.bloom.threshold = 0.8;
  renderer.toneMappingExposure = 1.05 + 1.2 * easeIn(prog(t, 46.95, 47.45), 2);
  const focusTo = t < 40.8 ? p1 : t < 43.4 ? p2 : t < 45.3 ? p3 : p4;
  if (t < 46.5) dof(camera.position.distanceTo(focusTo.getWorldPosition(tmpV)), 0.7, 8);
}

// ================================================================ scene 7
// 47.45 - 57.1  out of the analysis into a clear morning: the finished
// building with its plot, height and levels traced in gold.
const s7cam = timedPath([
  [47.45, [3, 11, 19], [0, 11, 0], 42],
  [51.6, [14, 22, 44], [-2, 11, -2], 50],
  [57.1, [18, 24, 47], [-2.2, 11.5, -2], 50],
]);
function scene7(t) {
  s7cam(t, camera);
  const day = smooth(prog(t, 47.45, 52));
  world.sky.visible = world.city.visible = world.lot.visible = world.bld.visible = true;
  world.lot.children.forEach((c, i) => (c.visible = i === 0));
  world.sky.userData.set(SKY_PRESETS.morning, SKY_PRESETS.day, day);
  setEnv(day < 0.5 ? "morning" : "day", 0.85);
  scene.fog.color.set(0xc9d6e2);
  scene.fog.density = 0.0012;
  const sd = new THREE.Vector3(...SKY_PRESETS.morning.sun).lerp(new THREE.Vector3(0.45, 0.62, 0.62), day);
  aimSun(sd.toArray(), V(0, 10, 0), 40, 150);
  sun.color.set(0xffe2bc).lerp(new THREE.Color(0xfff6ea), day);
  sun.intensity = 4.4;
  hemi.color.set(0xb5cdec);
  hemi.groundColor.set(0x6b6157);
  hemi.intensity = 0.55;
  U.windowGlow.value = 0;
  world.city.userData.trafficAt(t, 0.001);
  world.city.userData.poleMesh.visible = world.city.userData.lamps.visible = false;
  buildingState(world.bld, COMPLETE);
  world.s7.visible = true;
  world.s7plot.userData.set(easeInOut(prog(t, 48.6, 50.6)));
  world.s7height.userData.set(easeOut(prog(t, 49.6, 51.0), 3));
  world.s7ticks.children.forEach((m, i) => (m.visible = t > 50.0 + i * 0.12));
  const fadeLines = 1 - smooth(prog(t, 55.6, 56.8));
  world.s7.visible = fadeLines > 0.01;
  const g = post.grade.uniforms;
  // arrive overexposed from the flash and settle
  renderer.toneMappingExposure = lerp(2.25, 1.0, expoOut(prog(t, 47.45, 48.6)));
  g.uVignette.value = 0.3;
  g.uContrast.value = 1.06;
  g.uSat.value = 1.06;
  post.bloom.strength = 0.4;
}

// ================================================================ scene 8
// 57.1 - 67  the final composition: model, laptop and phone with the real
// site, logo and slogan above (DOM), held still at the end.
function scene8(t) {
  tabletop(t, { modelFloors: 7, laptopOpen: 1 });
  applyScreens(t);
  const arrive = expoOut(prog(t, 56.8, 58.6));
  // devices settle into a lower-half composition, leaving the top for the mark
  world.phone.position.set(0.085, 0.078, 0.11);
  world.phone.rotation.set(-0.1, -0.36, 0.02);
  world.laptop.position.set(-0.045, 0, -0.04);
  world.laptop.rotation.set(0, 0.3, 0);
  world.model.position.set(0.075, 0.0042, -0.26);
  world.model.scale.setScalar(1 / 150);
  const drift = Math.max(0, t - 58.6) * 0.0025;
  camera.position.set(lerp(0.3, 0.012, arrive) - drift * 0.4, lerp(0.52, 0.44, arrive), lerp(1.55, 1.24, arrive) - drift);
  camera.lookAt(0.0, lerp(0.16, 0.215, arrive), -0.06);
  camera.fov = 32;
  camera.near = 0.01;
  camera.far = 1500;
  camera.updateProjectionMatrix();
  dof(camera.position.distanceTo(V(0.02, 0.09, 0.0)), 0.45, 4);
  world.anchors = {
    lblPhone: { pos: V(0.1, 0.168, 0.12), visible: t > 62.1, opacity: smooth(prog(t, 62.18, 62.5)) },
    lblWeb: { pos: V(-0.12, 0.215, -0.08), visible: t > 63.0, opacity: smooth(prog(t, 63.09, 63.4)) },
  };
  post.grade.uniforms.uFade.value = 0;
}

const SHOTS = [
  [0, 6.45, scene1],
  [6.45, 16.8, scene2],
  [16.8, 25.1, scene3],
  [25.1, 31.0, scene4],
  [31.0, 38.4, scene5],
  [38.4, 47.45, scene6],
  [47.45, 57.1, scene7],
  [57.1, 67.1, scene8],
];
// scene 4's bright tail hands over to the tabletop at 30.6 - 31.0
function renderAt(t) {
  if (!world.M) return;
  reset();
  const shot = SHOTS.find(([a, b]) => t >= a && t < b) || SHOTS.at(-1);
  shot[2](t);
  post.grade.uniforms.uSeed.value = Math.floor(t * 30) * 0.618;
  camera.updateMatrixWorld();
  placeLabels();
  post.syncDepth();
  post.composer.render();
}

let isReady = false;
const ready = build().then(() => {
  isReady = true;
  renderAt(0);
});
window.__hf = window.__hf || {};
window.__hf.buildReady = window.__hf.buildReady || {};
window.__hf.buildReady["world"] = ready;
window.addEventListener("hf-seek", (e) => {
  const t = e.detail.time;
  if (!isReady) {
    e.detail.waitUntil?.(ready.then(() => prepare(t)).then(() => renderAt(t)));
    return;
  }
  const p = prepare(t);
  if (p) e.detail.waitUntil?.(p.then(() => renderAt(t)));
  else renderAt(t);
});
window.__world = {
  ready,
  world,
  camera,
  scene,
  renderAt: async (t) => {
    await ready;
    await prepare(t);
    renderAt(t);
  },
};
