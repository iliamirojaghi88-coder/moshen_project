// One WebGL renderer for the whole site, three shots:
//
//  home     the infinity world behind the home hero. The camera flies in on
//           load, drifts with the pointer, and on scroll dives towards the
//           copper end of the cable as the products sheet rises over it.
//  products the armoured cable turning slowly beside the products headline,
//           with engineering callouts that follow its layers.
//  contact  two cable ends meeting, current glowing between them.
//
// The canvas moves to whichever page is showing; nothing renders while its
// host is off screen, while the tab is hidden or while a dialog covers it.
import {
  AdditiveBlending,
  CanvasTexture,
  DirectionalLight,
  Group,
  HemisphereLight,
  NeutralToneMapping,
  PerspectiveCamera,
  PointLight,
  SRGBColorSpace,
  Scene,
  Sprite,
  SpriteMaterial,
  Vector3,
  WebGLRenderer,
} from 'three';
import { docOffset } from '../util.js';
import { smoothstep } from './geometry.js';
import { createInfinityScene } from './infinity-scene.js';
import { buildCable } from './cable-model.js';
import { canvas, studioEnvironment } from './materials.js';

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const root = document.documentElement;

export async function createStage({ hosts, slot, hero, reducedMotion = false, capture = null, skipIntro = () => false, onCallouts = () => {} }) {
  const coarse = matchMedia('(pointer: coarse)').matches;
  const weak = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4 || navigator.connection?.saveData === true;
  const quality = capture ? 'high' : (coarse && innerWidth < 820) || weak ? 'low' : 'high';
  let dpr = Math.min(window.devicePixelRatio || 1, capture ? 2 : quality === 'high' ? 1.75 : 1.35);

  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: Boolean(capture) });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.setPixelRatio(dpr);
  renderer.shadowMap.enabled = true;
  const el = renderer.domElement;
  el.className = 'stage-canvas';
  el.setAttribute('aria-hidden', 'true');

  if (document.fonts?.load) {
    await Promise.race([
      Promise.all([document.fonts.load('900 120px Estedad'), document.fonts.load('700 40px Estedad')]),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  }

  const camera = new PerspectiveCamera(30, 1, 0.1, 400);
  const TAN = (fov) => Math.tan(((fov / 2) * Math.PI) / 180);

  // ---------------------------------------------------------------- scenes (built on first use)
  let home = null;
  let studio = null;

  function getHome() {
    if (!home) home = createInfinityScene(renderer, quality);
    return home;
  }

  function getStudio() {
    if (studio) return studio;
    const scene = new Scene();
    scene.environment = studioEnvironment(renderer);
    const key = new DirectionalLight('#fff6ec', 1.6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6 });
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.02;
    scene.add(key, key.target, new HemisphereLight('#e8f0ff', '#2a3140', 0.35));
    const make = (kind) => {
      const c = buildCable(kind, quality);
      const spin = new Group();
      const tilt = new Group();
      c.group.position.copy(c.focus.tips).negate();
      spin.add(c.group);
      tilt.add(spin);
      scene.add(tilt);
      return { ...c, spin, tilt };
    };
    const a = make('armoured');
    const b = make('instrument');
    // the current between the two ends on the contact page
    const [gc, g] = canvas(128);
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.18, 'rgba(170,225,255,0.9)');
    grad.addColorStop(0.5, 'rgba(60,140,255,0.28)');
    grad.addColorStop(1, 'rgba(40,110,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    const glowTex = new CanvasTexture(gc);
    glowTex.colorSpace = SRGBColorSpace;
    const glow = new Sprite(new SpriteMaterial({ map: glowTex, blending: AdditiveBlending, depthWrite: false, transparent: true }));
    const spark = new PointLight('#8fd3ff', 0, 8, 1.6);
    scene.add(glow, spark);
    studio = { scene, key, a, b, glow, spark };
    return studio;
  }

  // ---------------------------------------------------------------- layout
  const view = { slot: null, heroBottom: 1 };

  function measure() {
    if (slot && slot.offsetParent !== null) {
      const r = docOffset(slot);
      view.slot = { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height };
    }
    if (hero && hero.offsetParent !== null) {
      const r = docOffset(hero);
      view.heroBottom = r.top + r.height;
    }
  }

  // ---------------------------------------------------------------- modes
  let mode = 'off';
  let host = null;
  let width = 0;
  let height = 0;
  let enteredAt = performance.now();

  function resizeTo(target) {
    const w = Math.max(1, Math.round(target.clientWidth));
    const h = Math.max(1, Math.round(target.clientHeight));
    if (w !== width || h !== height) {
      width = w;
      height = h;
      renderer.setSize(w, h, false);
    }
  }

  function inView(node, margin = 80) {
    if (!node || node.offsetParent === null) return false;
    const r = node.getBoundingClientRect();
    return r.bottom > -margin && r.top < innerHeight + margin;
  }

  function chooseMode() {
    if (capture) return capture;
    const route = root.dataset.route || 'home';
    if (route === 'home') return scrollY < view.heroBottom + 40 ? 'home' : 'off';
    if (route === 'products') return inView(hosts.products) ? 'products' : 'off';
    if (route === 'contact') return inView(hosts.contact) ? 'contact' : 'off';
    return 'off';
  }

  function setMode(next) {
    if (next === mode) return;
    mode = next;
    root.dataset.stage = mode;
    if (mode === 'off') return;
    enteredAt = performance.now();
    const target = hosts[mode];
    if (host !== target) {
      target.appendChild(el);
      host = target;
      width = height = 0;
    }
    resizeTo(target);
    wake();
  }

  // ---------------------------------------------------------------- shots
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  let smooth = scrollY;
  let introStart = -1;
  const target = new Vector3();
  const offset = new Vector3();

  function orbit(t, dist, elv, az, shiftX, shiftY, fov) {
    camera.fov = fov;
    camera.aspect = width / height;
    offset.set(Math.sin(az) * Math.cos(elv), Math.sin(elv), Math.cos(az) * Math.cos(elv)).multiplyScalar(dist);
    camera.position.copy(t).add(offset);
    camera.lookAt(t);
    camera.updateProjectionMatrix();
    camera.projectionMatrix.elements[8] = -shiftX;
    camera.projectionMatrix.elements[9] = -shiftY;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }

  function homeShot(now, dt, t) {
    const s = getHome();
    const wide = width / height > 1.15;
    const fov = wide ? 30 : 34;
    const region = view.slot ?? { cx: width / 2, cy: height / 2, w: width, h: height };
    const elev = wide ? 0.25 : 0.42;
    // distance that fits the world into the free space between headline and buttons
    const sw = s.bounds.width;
    const sh = s.bounds.height * Math.cos(elev) + 9 * Math.sin(elev);
    // phones: let the far ends of the world leave the screen so the cable stays large
    const spill = width / height < 0.62 ? 1.4 : 1;
    const byW = sw / (2 * TAN(fov) * (width / height) * Math.min(1.5, (region.w * 0.98 * spill) / width));
    const byH = sh / (2 * TAN(fov) * clamp01((region.h * 0.98) / height));
    const fit = Math.max(byW, byH);

    let k = 1;
    if (!reducedMotion && !capture) {
      if (introStart < 0) introStart = skipIntro() ? now - 4000 : now;
      k = clamp01((now - introStart) / 3800);
    }
    const e = easeOutCubic(k);
    let dist = lerp(fit * 1.75, fit, e);
    let el = lerp(elev + 0.32, elev, e);
    let az = lerp(-0.62, 0, easeInOut(k));
    target.copy(s.focus.centre);
    let sx = (region.cx / width) * 2 - 1;
    let sy = 1 - (region.cy / height) * 2;

    if (!reducedMotion && !capture) {
      const idle = smoothstep(0.7, 1, k);
      pointer.sx = damp(pointer.sx, pointer.x, 2.2, dt);
      pointer.sy = damp(pointer.sy, pointer.y, 2.2, dt);
      az += (Math.sin(t * 0.13) * 0.04 + pointer.sx * 0.07) * idle;
      el += pointer.sy * -0.025 * idle;
      // scroll: dive towards the copper end
      smooth = damp(smooth, scrollY, 8, dt);
      const p = easeInOut(clamp01(smooth / (height * 0.85)));
      target.lerp(s.focus.tip, p);
      dist = lerp(dist, fit * 0.3, p);
      el = lerp(el, 0.16, p);
      az = lerp(az, -0.42, p);
      sx = lerp(sx, 0.15, p);
      sy = lerp(sy, 0.05, p);
      s.world.rotation.y = lerp(-0.16, 0, easeInOut(k));
    }
    // haze starts just behind the world's centre at any camera distance
    s.scene.fog.near = dist * 1.05;
    s.scene.fog.far = dist * 3;
    s.update(t);
    orbit(target, dist, el, az, sx, sy, fov);
    renderer.render(s.scene, camera);
  }

  function studioCamera(fov, dist) {
    camera.fov = fov;
    camera.aspect = width / height;
    camera.position.set(0, 0, dist);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }

  const anchorWorld = new Vector3();
  const anchorNormal = new Vector3();
  const toCam = new Vector3();

  function productsShot(now, dt, t) {
    const s = getStudio();
    s.b.tilt.visible = false;
    s.a.tilt.visible = true;
    s.glow.visible = false;
    s.spark.intensity = 0;
    const portrait = height > width;
    const r = host.getBoundingClientRect();
    const pr = clamp01((innerHeight - r.top) / (innerHeight + r.height));
    const k = reducedMotion ? 1 : easeOutCubic(clamp01((now - enteredAt) / 2200));
    s.a.tilt.rotation.set(0.62, 0, portrait ? -0.35 : -0.72, 'YXZ');
    s.a.spin.rotation.y = reducedMotion ? 0.6 : 0.6 + t * 0.16 + pr * 1.2 - (1 - k) * 1.4;
    s.a.tilt.position.set(portrait ? 0.4 : 0.9, portrait ? 0.3 : 0.2, 0);
    s.a.tilt.updateMatrixWorld(true);
    s.key.position.set(5, 7, 6);
    studioCamera(30, lerp(portrait ? 21 : 17.5, portrait ? 16.5 : 13.5, k));
    renderer.render(s.scene, camera);
    // callouts: project the anchors, hide the ones facing away
    const out = [];
    for (const [name, a] of Object.entries(s.a.anchors)) {
      anchorWorld.copy(a.p).applyMatrix4(s.a.group.matrixWorld);
      anchorNormal.copy(a.n).transformDirection(s.a.group.matrixWorld);
      toCam.copy(camera.position).sub(anchorWorld).normalize();
      const v = anchorWorld.clone().project(camera);
      out.push({ name, x: (v.x * 0.5 + 0.5) * width, y: (0.5 - v.y * 0.5) * height, visible: k > 0.85 && anchorNormal.dot(toCam) > 0.05 });
    }
    onCallouts('products', out);
  }

  function contactShot(now, dt, t) {
    const s = getStudio();
    s.a.tilt.visible = true;
    s.b.tilt.visible = true;
    const portrait = height > width * 0.9;
    const k = reducedMotion ? 1 : easeOutCubic(clamp01((now - enteredAt) / 1900));
    const gap = 0.55 + (1 - k) * 6;
    const lift = portrait ? 0.4 : 0;
    // A from the left, cut end pointing right; B from the right
    s.a.tilt.rotation.set(0.28, -0.32, -Math.PI / 2 + 0.06, 'YXZ');
    s.a.spin.rotation.y = 0.9 + (reducedMotion ? 0 : Math.sin(t * 0.4) * 0.08);
    s.a.tilt.position.set(-gap - 0.15, lift - 0.25, 0);
    s.b.tilt.rotation.set(0.25, 0.34, Math.PI / 2 - 0.08, 'YXZ');
    s.b.spin.rotation.y = 2.2 + (reducedMotion ? 0 : Math.sin(t * 0.37 + 1) * 0.08);
    s.b.tilt.position.set(gap + 0.1, lift + 0.35, 0.2);
    const pulse = reducedMotion ? 0.8 : 0.75 + 0.25 * Math.sin(t * 3.1) * Math.sin(t * 1.7 + 0.4);
    s.glow.visible = true;
    s.glow.position.set(0, lift + 0.05, 0.3);
    s.glow.scale.setScalar(2.6 * pulse * k + 0.01);
    s.glow.material.opacity = k;
    s.spark.position.copy(s.glow.position);
    s.spark.intensity = 9 * pulse * k;
    s.key.position.set(4, 8, 7);
    studioCamera(30, portrait ? 23 : 15.5);
    renderer.render(s.scene, camera);
  }

  // ---------------------------------------------------------------- loop
  let raf = 0;
  let last = performance.now();
  let first = true;
  let frames = [];
  const covered = () => root.classList.contains('dialog-open');

  function frame(now) {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = now / 1000;
    if (mode === 'off') return;
    if (mode === 'home') homeShot(now, dt, t);
    else if (mode === 'products') productsShot(now, dt, t);
    else if (mode === 'contact') contactShot(now, dt, t);
    if (first) {
      first = false;
      root.classList.add('stage-ready');
      if (capture) root.dataset.captureReady = '1';
    }
    adapt(dt);
    // reduced motion: still frames, redrawn only on scroll, resize or page change
    if (!capture && !reducedMotion) wake();
  }

  // drop resolution on slow devices instead of dropping frames
  function adapt(dt) {
    frames.push(dt);
    if (frames.length < 90) return;
    const avg = frames.reduce((a, b) => a + b, 0) / frames.length;
    frames = [];
    if (avg > 0.028 && dpr > 1) {
      dpr = Math.max(1, dpr - 0.25);
      renderer.setPixelRatio(dpr);
      width = height = 0;
      if (host) resizeTo(host);
    }
  }

  function wake() {
    if (!raf && !document.hidden && mode !== 'off' && !covered()) raf = requestAnimationFrame(frame);
  }

  measure();
  setMode(chooseMode());
  const onScroll = () => {
    setMode(chooseMode());
    wake();
  };
  const onResize = () => {
    measure();
    if (host) resizeTo(host);
    setMode(chooseMode());
    wake();
  };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onResize);
  new ResizeObserver(onResize).observe(document.body);
  const resume = () => {
    last = performance.now();
    wake();
  };
  document.addEventListener('visibilitychange', resume);
  new MutationObserver(resume).observe(root, { attributes: true, attributeFilter: ['class'] });
  addEventListener('simland:route', () => {
    enteredAt = performance.now();
    onResize();
  });
  if (!coarse && !reducedMotion) {
    addEventListener(
      'pointermove',
      (e) => {
        pointer.x = (e.clientX / innerWidth) * 2 - 1;
        pointer.y = (e.clientY / innerHeight) * 2 - 1;
      },
      { passive: true },
    );
  }
  wake();
  return { renderer, quality };
}
