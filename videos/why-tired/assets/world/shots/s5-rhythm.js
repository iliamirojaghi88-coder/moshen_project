// SCENE 05 — "دلیل دوم: ساعت خواب نامنظم. وقتی هر شب یه ساعت متفاوت می‌خوابی،
// ساعت زیستی بدنت ممکنه به هم بریزه." (29.0 → 38.9)
// Dark studio, the clock on black stone. A two-tone ۲ (night navy / day gold)
// leads in; four nights flip like a time-lapse — the hands snap to a new
// bedtime and a real moon moves across the sky each night. Then a brass
// circadian orrery assembles: sun and moon ride an arm around the clock, warm
// and cold light sweeping across it in rhythm — until «به هم بریزه», when the
// rhythm slips out of phase.
import { THREE, seg, ease, lerp, clamp, track, lookFrom, setShadow, smooth, wobble, hash } from "../engine.js";
import { makeClock, setClockTime } from "../props.js";
import { backdrop } from "../brain.js";
import { dust, ghosts } from "../fx.js";

const NIGHTS = [
  // [start, clock hours, moon position, moon tint]
  // [start, clock hours, moon position on screen (NDC), moon tint]
  [32.66, 23.0, [-0.38, 0.56], 0xb7c8ff],
  [33.3, 25.5, [0.3, 0.68], 0xc9d2ef],
  [33.92, 22.17, [-0.12, 0.4], 0xa9b9f2],
  [34.52, 26.75, [0.42, 0.6], 0xd6d9e8],
];

export default async function build({ E, M, G }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x010206);
  scene.fog = new THREE.Fog(0x02040a, 1.2, 4.2);
  scene.environment = E.studioEnv({
    ambient: 0x030509,
    panels: [
      { pos: [-4, 3, 3], size: [3, 2], color: 0xa9bcff, intensity: 1.6 },
      { pos: [4, 2, 2], size: [2, 3], color: 0xffd7a0, intensity: 1.0 },
      { pos: [0, 5, -4], size: [6, 1], color: 0x7a8fbf, intensity: 0.8 },
    ],
  });
  scene.environmentIntensity = 0.5;
  const bd = backdrop(0x060c1c, 0x010205, 0.5, [12, 8], { cy: 0.66, floorFade: 1 });
  bd.material.fog = false;
  bd.position.set(0, 0.6, -4.5);
  scene.add(bd);

  // black stone floor
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(12, 128),
    new THREE.MeshPhysicalMaterial({ color: 0x07080b, roughness: 0.55, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.35, normalMap: M.tex.plasterN, normalScale: new THREE.Vector2(0.15, 0.15) }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.053;
  floor.receiveShadow = true;
  scene.add(floor);

  const clock = makeClock(E, M);
  scene.add(clock);
  const minuteMesh = clock.userData.hands.minute.children[0];
  const hourMesh = clock.userData.hands.hour.children[0];
  const mGhost = ghosts(minuteMesh, 6, 0.3);
  const hGhost = ghosts(hourMesh, 6, 0.3);
  mGhost.position.z = hGhost.position.z = 0.0012;
  clock.userData.body.add(mGhost, hGhost);

  // ۲: two halves of one glyph — night navy anodised / day polished gold
  const clipL = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
  const clipR = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
  const navy = new THREE.MeshPhysicalMaterial({ color: 0x1b2f5c, metalness: 0.9, roughness: 0.3, clearcoat: 0.6, clippingPlanes: [clipL], envMapIntensity: 1.6 });
  const gold = new THREE.MeshPhysicalMaterial({ color: 0xe0b366, metalness: 1, roughness: 0.22, clippingPlanes: [clipR], envMapIntensity: 1.8 });
  const two = new THREE.Group();
  const twoA = new THREE.Mesh(G.n2, navy);
  const twoB = new THREE.Mesh(G.n2, gold);
  twoA.castShadow = twoB.castShadow = true;
  two.add(twoA, twoB);
  scene.add(two);
  const twoKey = new THREE.SpotLight(0xffffff, 0, 3, 0.4, 0.6, 2);
  twoKey.position.set(0.4, 0.6, 0.9);
  twoKey.target = two;
  scene.add(twoKey);

  // the moon (sky by night, then a rider on the orrery)
  const [moonA, moonH, sunE] = await Promise.all([
    E.texture("assets/tex/moon_a.png", { srgb: true }),
    E.texture("assets/tex/moon_h.png"),
    E.texture("assets/tex/sun_e.png", { srgb: true }),
  ]);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 64), moonMaterial(moonA, moonH));
  moon.castShadow = false;
  scene.add(moon);
  const moonGlow = glowSprite(0x9fb6ff);
  scene.add(moonGlow);

  const sun = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 48), new THREE.MeshBasicMaterial({ map: sunE, color: new THREE.Color(0.95, 0.36, 0.05) }));
  scene.add(sun);
  const sunGlow = glowSprite(0xffb050);
  scene.add(sunGlow);
  const sunLight = new THREE.PointLight(0xffb36a, 0, 1.6, 2);
  sun.add(sunLight);
  const moonLight = new THREE.PointLight(0x9fb6ff, 0, 1.6, 2);
  moon.add(moonLight);

  // orrery: horizontal 24h ring, meridian ring, arm
  const brass = new THREE.MeshPhysicalMaterial({ color: 0xc9995c, metalness: 1, roughness: 0.28, normalMap: M.tex.brushedN, normalScale: new THREE.Vector2(0.2, 0.2), envMapIntensity: 1.4 });
  const orrery = new THREE.Group();
  scene.add(orrery);
  const RO = 0.3;
  const base = new THREE.Group();
  orrery.add(base);
  const baseRing = new THREE.Mesh(new THREE.TorusGeometry(RO, 0.0045, 24, 300), brass);
  baseRing.rotation.x = Math.PI / 2;
  baseRing.castShadow = true;
  base.add(baseRing);
  const tickG = new THREE.BoxGeometry(0.003, 0.003, 0.022);
  const ticks = new THREE.InstancedMesh(tickG, brass, 24);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a);
    m4.compose(new THREE.Vector3(Math.sin(a) * (RO + 0.016), 0, Math.cos(a) * (RO + 0.016)), q, new THREE.Vector3(1, 1, i % 6 === 0 ? 1.6 : 1));
    ticks.setMatrixAt(i, m4);
  }
  base.add(ticks);
  const hourLbls = ["۰", "۶", "۱۲", "۱۸"].map((txt, i) => {
    const l = E.label(txt, { height: 0.026, intensity: 1.3, color: "#f0d9b0", weight: 700 });
    const a = (i / 4) * Math.PI * 2;
    l.position.set(Math.sin(a) * (RO + 0.06), 0.0, Math.cos(a) * (RO + 0.06));
    l.rotation.x = -Math.PI / 2;
    l.rotation.z = a;
    base.add(l);
    return l;
  });
  const meridian = new THREE.Mesh(new THREE.TorusGeometry(RO + 0.02, 0.003, 16, 300), brass);
  meridian.castShadow = true;
  orrery.add(meridian);
  const arm = new THREE.Group();
  orrery.add(arm);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, RO * 2, 12), brass);
  rod.rotation.z = Math.PI / 2;
  rod.position.y = 0.11;
  arm.add(rod);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.17, 12), brass);
  post.position.y = 0.03;
  arm.add(post);

  const key = setShadow(new THREE.DirectionalLight(0xc8d4ff, 1.4), 2048, 0.6, 0.1, 6, 4, -0.0004);
  key.position.set(-1.2, 1.6, 1.4);
  scene.add(key, key.target);
  // night sky: deterministic stars on a far shell, shown for the four nights
  const starGeo = new THREE.BufferGeometry();
  const sp = [];
  for (let i = 0; i < 1400; i++) {
    const x = (hash(i * 1.13) - 0.5) * 7, y = -0.2 + hash(i * 2.71) * 4.2;
    sp.push(x, y, -4.3 - hash(i * 0.37) * 0.2);
  }
  starGeo.setAttribute("position", new THREE.Float32BufferAttribute(sp, 3));
  const sizes = [];
  for (let i = 0; i < 1400; i++) sizes.push(hash(i * 5.3));
  starGeo.setAttribute("seed", new THREE.Float32BufferAttribute(sizes, 1));
  const starMat = new THREE.PointsMaterial({ color: 0xcfdcff, size: 0.012, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);
  const motes = dust(260, new THREE.Box3(new THREE.Vector3(-0.8, -0.05, -1.0), new THREE.Vector3(0.8, 1.0, 0.8)), { size: 0.003, opacity: 0.3, seed: 12 });
  scene.add(motes);

  const camera = new THREE.PerspectiveCamera(35, 1080 / 1920, 0.01, 30);
  const keys = [
    [29.0, -0.06, 0.14, 0.72, 0.0, 0.14, 0.2],
    [30.2, 0.02, 0.13, 0.66, 0.0, 0.14, 0.2],
    [31.0, 0.14, 0.07, 0.44, 0.0, 0.02, 0],
    [32.4, 0.1, 0.06, 0.38, 0.0, 0.015, 0],
    [33.4, 0.2, 0.12, 0.72, 0.0, 0.14, -0.2],
    [35.2, 0.06, 0.14, 0.82, 0.0, 0.2, -0.3],
    [36.4, 0.46, 0.55, 1.5, 0.0, 0.1, 0],
    [38.9, 0.62, 0.62, 1.48, 0.0, 0.08, 0],
  ];
  const _v = new THREE.Vector3();

  function update(t) {
    const k = track(keys, t);
    lookFrom(camera, [k[0], k[1], k[2]], [k[3], k[4], k[5]]);

    // ۲ lockup
    const tIn = seg(t, 29.15, 29.85, ease.expoOut);
    const tOut = seg(t, 30.3, 30.95, ease.in);
    two.visible = t < 31.0;
    two.position.set(-0.025 + 0.22 * tOut, 0.19 - 0.02 * (1 - tIn), 0.2 + 0.05 * tOut);
    two.rotation.y = lerp(-1.2, 0, tIn) + 0.06 * Math.sin(t * 0.8) - 0.6 * tOut;
    two.scale.setScalar(0.24 * lerp(0.85, 1, tIn));
    twoKey.intensity = 3 * tIn;
    // the night/day split follows the glyph's own vertical axis
    two.updateMatrixWorld();
    const ax = new THREE.Vector3(1, 0, 0).applyQuaternion(two.getWorldQuaternion(new THREE.Quaternion()));
    clipR.setFromNormalAndCoplanarPoint(ax, two.position);
    clipL.setFromNormalAndCoplanarPoint(ax.clone().negate(), two.position);

    // clock time: jittering on "نامنظم", then four nights
    let hours = 23.0 + 0.12 * Math.sin(t * 0.7);
    let night = -1;
    for (let i = 0; i < NIGHTS.length; i++) if (t >= NIGHTS[i][0]) night = i;
    if (t > 30.9 && t < 32.6) {
      // indecisive hands on «نامنظم»: deterministic stutter between bedtimes
      const step = Math.floor((t - 30.9) * 5);
      const a = 21.5 + 5 * hash(step * 3.7);
      const b = 21.5 + 5 * hash((step + 1) * 3.7);
      hours = lerp(a, b, ease.expoOut(((t - 30.9) * 5) % 1));
    }
    if (night >= 0) {
      const [t0, h] = NIGHTS[night];
      const prevH = night > 0 ? NIGHTS[night - 1][1] : 23.0;
      hours = lerp(prevH, h, seg(t, t0, t0 + 0.28, ease.expoOut));
    }
    if (t > 35.4) hours = lerp(NIGHTS[3][1], 26.75 + (t - 35.4) * 0.8, seg(t, 35.4, 35.8));
    setClockTime(clock, hours, 7);
    const ga = [], gh = [];
    for (let i = 0; i < 6; i++) {
      const hh = hours - (i + 1) * 0.06 * (night >= 0 && t - NIGHTS[night][0] < 0.3 ? 1 : 0);
      ga.push(-(hh % 1) * Math.PI * 2);
      gh.push(-((hh % 12) / 12) * Math.PI * 2);
    }
    const fast = night >= 0 && t - NIGHTS[night][0] < 0.3 ? 1 - (t - NIGHTS[night][0]) / 0.3 : 0;
    mGhost.userData.set(ga, fast);
    hGhost.userData.set(gh, fast * 0.6);

    // moon: sky position per night, then flies to the orrery arm
    const orr = seg(t, 35.4, 36.4, ease.inOut);
    let ndc = NIGHTS[0][2], tint = 0xb7c8ff;
    if (night >= 0) {
      const [t0, , p1, c1] = NIGHTS[night];
      const p0 = night > 0 ? NIGHTS[night - 1][2] : NIGHTS[0][2];
      const u = seg(t, t0, t0 + 0.3, ease.expoOut);
      ndc = [lerp(p0[0], p1[0], u), lerp(p0[1], p1[1], u)];
      tint = c1;
    }
    // the sky moon is placed where the frame wants it: unproject its screen spot to 3 m
    const sky = new THREE.Vector3(ndc[0], ndc[1], 0.5).unproject(camera).sub(camera.position).normalize().multiplyScalar(3.0).add(camera.position);
    const mp = [sky.x, sky.y, sky.z];
    // orrery arm angle: steady rhythm, then «به هم بریزه» (37.44 →) loses phase
    const chaos = seg(t, 37.4, 38.2, ease.inOut);
    const baseAng = 0.9 * (t - 35.4);
    const ang = baseAng + chaos * (0.9 * Math.sin((t - 37.4) * 5.3) + 0.6 * Math.sin((t - 37.4) * 8.9 + 1));
    arm.rotation.y = ang;
    orrery.visible = t > 35.3;
    const oIn = seg(t, 35.45, 36.3, ease.expoOut);
    orrery.scale.setScalar(lerp(0.6, 1, oIn));
    base.rotation.set(chaos * 0.14 * Math.sin((t - 37.4) * 3.1), 0, chaos * 0.1 * Math.sin((t - 37.4) * 2.3 + 0.6));
    meridian.rotation.set(0, ang * 0.5 + chaos * 0.8 * Math.sin((t - 37.4) * 4.1), chaos * 0.35 * Math.sin((t - 37.4) * 3.7));
    // arm-mounted positions (sun at +x end, moon at -x end); moon slips toward the sun on chaos
    const moonSlip = chaos * 1.2;
    _v.set(Math.cos(ang) * RO, 0.11, -Math.sin(ang) * RO);
    const sunPos = _v.clone();
    const ma = ang + Math.PI - moonSlip;
    const moonOrr = new THREE.Vector3(Math.cos(ma) * RO, 0.11 + 0.03 * chaos * Math.sin((t - 37.4) * 6), -Math.sin(ma) * RO);
    moon.position.set(lerp(mp[0], moonOrr.x, orr), lerp(mp[1], moonOrr.y, orr), lerp(mp[2], moonOrr.z, orr));
    moon.scale.setScalar(lerp(0.105, 0.034, orr));
    moon.material.uniforms.bumpScale.value = lerp(0.0016, 0.0, orr);
    moon.rotation.y = 0.4 + 0.05 * t;
    // a readable gibbous phase in the sky and on the orrery alike
    moon.material.uniforms.sunDir.value.set(0.92, 0.28, 0.32).normalize();
    moonGlow.position.copy(moon.position);
    moonGlow.scale.setScalar(moon.scale.x * 4.0);
    moonGlow.material.opacity = 0.22 * (1 - 0.6 * orr);
    moonGlow.material.color.set(tint);
    moon.visible = t > 32.4;
    moonGlow.visible = moon.visible;
    moonLight.intensity = 0.25 * orr;
    moon.material.uniforms.power.value = lerp(2.4, 1.3, orr);

    const sIn = seg(t, 35.55, 36.2, ease.expoOut);
    sun.visible = sIn > 0.001;
    sun.position.copy(sunPos);
    sun.scale.setScalar(0.042 * sIn);
    sun.rotation.y = 0.1 * t;
    sunGlow.position.copy(sunPos);
    sunGlow.scale.setScalar(0.042 * sIn * 6.5);
    sunGlow.material.opacity = 0.55 * sIn * (1 - 0.3 * chaos * (0.5 + 0.5 * Math.sin(t * 23)));
    sunLight.intensity = 0.55 * sIn;

    // lighting moods: cold night key, warmer accents once the sun appears
    key.intensity = lerp(1.4, 0.6, orr);
    key.color.set(tint);
    motes.userData.update(t);
    starMat.opacity = 0.85 * seg(t, 32.4, 33.0) * (1 - seg(t, 35.3, 36.2));
    stars.rotation.z = 0.004 * (t - 32);
    const flash = night >= 0 ? Math.exp(-(t - NIGHTS[night][0]) * 6) : 0;
    const focusDist = t < 30.6 ? camera.position.distanceTo(two.position) : camera.position.distanceTo(clock.position);
    return {
      exposure: 1.08 + 0.12 * flash + 0.1 * sIn,
      wb: [lerp(0.9, 1.02, sIn), lerp(0.96, 0.98, sIn), lerp(1.12, 0.98, sIn)],
      sat: 1.0,
      contrast: 1.1,
      vig: 0.62,
      bloom: { strength: 0.42, radius: 0.55, threshold: 1.6 },
      dof: { focus: focusDist, aperture: 8 - 3 * orr, maxR: 10 },
    };
  }
  return { id: "s5", t0: 29.0, t1: 38.9, scene, camera, update, transition: { mode: 3, ease: ease.inOut } };
}

function glowSprite(color) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, "rgba(255,255,255,0.9)");
  gr.addColorStop(0.18, "rgba(255,255,255,0.35)");
  gr.addColorStop(0.45, "rgba(255,255,255,0.08)");
  gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  return s;
}

// Moon: albedo + derivative bump, lit by a fixed sun direction (its phase),
// independent of the studio lights.
function moonMaterial(map, hmap) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, hmap: { value: hmap }, sunDir: { value: new THREE.Vector3(1, 0.3, 0.5).normalize() }, bumpScale: { value: 0.018 }, power: { value: 2.4 } },
    vertexShader: `
      varying vec2 vUv; varying vec3 vN; varying vec3 vP;
      void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vec4 wp = modelMatrix * vec4(position, 1.0); vP = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `
      uniform sampler2D map, hmap; uniform vec3 sunDir; uniform float bumpScale, power;
      varying vec2 vUv; varying vec3 vN; varying vec3 vP;
      void main(){
        vec2 dx = dFdx(vUv), dy = dFdy(vUv);
        float h0 = texture2D(hmap, vUv).r;
        vec2 dH = bumpScale * vec2(texture2D(hmap, vUv + dx).r - h0, texture2D(hmap, vUv + dy).r - h0) * 40.0;
        vec3 sx = dFdx(vP), sy = dFdy(vP), n = normalize(vN);
        vec3 r1 = cross(sy, n), r2 = cross(n, sx);
        float det = dot(sx, r1);
        vec3 g = sign(det) * (dH.x * r1 + dH.y * r2);
        n = normalize(abs(det) * n - g);
        float l = max(dot(n, normalize(sunDir)), 0.0);
        l = pow(l, 0.85);
        vec3 alb = texture2D(map, vUv).rgb;
        gl_FragColor = vec4(alb * (l * power + 0.015), 1.0);
      }`,
  });
}
