// The cable stage: one WebGL renderer and one cable model, filmed in two
// "shots". The canvas is re-parented between them, so the page never runs two
// WebGL scenes at once.
//
//  hero  — fixed behind the hero. A short dolly-in on load, then scroll moves
//          the cable from the hero composition onto the products heading,
//          where it locks to the page and scrolls away with it.
//  macro — inside the "why SIMLAND" panel: a close-up of the copper strands
//          that turns slowly as that section scrolls.
import {
  DirectionalLight,
  Group,
  NeutralToneMapping,
  PerspectiveCamera,
  SRGBColorSpace,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { docOffset } from '../util.js';
import { buildCable } from './cable-model.js';
import { smoothstep } from './geometry.js';
import { createStudioEnvironment } from './studio.js';

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const damp = (current, target, lambda, dt) => lerp(current, target, 1 - Math.exp(-lambda * dt));

const POSE_KEYS = ['tiltX', 'tiltZ', 'spin', 'yaw', 'pitch', 'dist', 'x', 'y', 'env', 'focus'];
function mix(a, b, t) {
  const out = {};
  for (const k of POSE_KEYS) out[k] = lerp(a[k], b[k], t);
  return out;
}

const FOV = 26;
const TAN = Math.tan(((FOV / 2) * Math.PI) / 180);
const INTRO_SECONDS = 3.6;
// Must match the hero layout switch in responsive.css.
const wideQuery = matchMedia('(min-aspect-ratio: 21/20) and (min-width: 640px)');

export async function createCableStage({ heroHost, macroHost, slot, heroCopy, header, reducedMotion = false, capture = null, skipIntro = () => false }) {
  const heroSection = heroCopy.closest('section');
  const coarse = matchMedia('(pointer: coarse)').matches;
  const weak =
    (navigator.hardwareConcurrency || 8) <= 4 ||
    (navigator.deviceMemory || 8) <= 4 ||
    navigator.connection?.saveData === true;
  const quality = capture ? 'high' : coarse && innerWidth < 820 ? 'low' : weak ? 'low' : 'high';
  const maxDpr = capture ? 2 : quality === 'high' ? 2 : 1.5;
  let dpr = Math.min(window.devicePixelRatio || 1, maxDpr);

  const renderer = new WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: Boolean(capture),
  });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setPixelRatio(dpr);
  const canvas = renderer.domElement;
  canvas.className = 'stage-canvas';
  canvas.setAttribute('aria-hidden', 'true');

  if (document.fonts?.load) {
    await Promise.race([document.fonts.load('600 34px Estedad'), new Promise((r) => setTimeout(r, 1500))]);
  }

  const scene = new Scene();
  scene.environment = createStudioEnvironment(renderer);
  scene.environmentIntensity = 1.0;

  const cable = buildCable(quality);
  const spin = new Group();
  const tilt = new Group();
  spin.add(cable.group);
  tilt.add(spin);
  scene.add(tilt);

  const key = new DirectionalLight('#fff7ef', 1.4);
  scene.add(key);
  scene.add(key.target);

  const camera = new PerspectiveCamera(FOV, 1, 0.1, 200);

  // ---------------------------------------------------------------------------
  // Layout: where on screen the cable should sit, measured from the DOM.
  const layout = { vw: 1, vh: 1, hero: null, land: null, landScroll: 0, wide: true };

  function measure() {
    const vw = heroHost.clientWidth || innerWidth;
    const vh = heroHost.clientHeight || innerHeight;
    const wide = wideQuery.matches;
    const headerBottom = header ? header.offsetTop + header.offsetHeight : 0;
    const copy = docOffset(heroCopy);
    const copyTop = copy.top;
    let hero;
    if (wide) {
      // Text block on the right (RTL start); the cable owns the left side.
      const right = copy.left - vw * 0.02;
      hero = { cx: right * 0.56, cy: vh * 0.53, w: right, h: vh - headerBottom };
    } else {
      const top = headerBottom + 4;
      const bottom = Math.max(top + vh * 0.24, copyTop - 6);
      hero = { cx: vw * 0.5, cy: (top + bottom) / 2, w: vw, h: bottom - top };
    }
    const r = docOffset(slot);
    const landScroll = Math.max(1, r.top + r.height / 2 - vh / 2);
    const land = { cx: r.left + r.width / 2, cy: vh / 2, w: r.width, h: r.height };
    Object.assign(layout, { vw, vh, wide, hero, land, landScroll });
  }

  // Distance that makes a subject of (sw × sh) world units fill `fill` of a region.
  function fitDistance(region, sw, sh, fill) {
    const byH = sh / (2 * TAN * clamp01((region.h * fill) / layout.vh));
    const byW = sw / (2 * TAN * (layout.vw / layout.vh) * clamp01((region.w * fill) / layout.vw));
    return Math.max(byH, byW);
  }

  function heroPose() {
    const { hero, wide } = layout;
    // Wide: rising from the lower-left corner towards the headline.
    // Narrow: hanging in from the top-left corner, stripped end pointing down
    // at the title, so the cable never crosses the text below it.
    return wide
      ? { tiltX: 0.4, tiltZ: -0.62, spin: 0.55, yaw: -0.18, pitch: 0.1, dist: fitDistance(hero, 6.6, 7.6, 0.84), x: hero.cx, y: hero.cy, env: 0, focus: 0.5 }
      : { tiltX: -0.3, tiltZ: -2.28, spin: 2.2, yaw: 0.1, pitch: 0.06, dist: fitDistance(hero, 6.4, 6.4, 0.96), x: hero.cx * 1.18, y: hero.cy + hero.h * 0.1, env: 0, focus: 0.55 };
  }

  function introPose(p) {
    return { ...p, tiltX: p.tiltX - 0.25, tiltZ: p.tiltZ + 0.22, spin: p.spin - 1.35, yaw: p.yaw + 0.5, pitch: p.pitch - 0.1, dist: p.dist * 1.85, env: -1.6 };
  }

  function landPose() {
    const { land, wide } = layout;
    // Lying almost horizontal, cut end pointing at the heading text.
    return wide
      ? { tiltX: 0.55, tiltZ: -1.36, spin: 1.2, yaw: -0.3, pitch: 0.16, dist: fitDistance(land, 8.2, 5.2, 0.95), x: land.cx, y: land.cy, env: 0.7, focus: 0.15 }
      : { tiltX: 0.5, tiltZ: -1.4, spin: 1.2, yaw: -0.22, pitch: 0.14, dist: fitDistance(land, 8.6, 5.0, 0.98), x: land.cx, y: land.cy, env: 0.7, focus: 0.15 };
  }

  function macroPose(m, t) {
    const w = macroHost.clientWidth || 1;
    const h = macroHost.clientHeight || 1;
    const portrait = h > w;
    return {
      tiltX: 1.02,
      tiltZ: -0.32,
      spin: 0.4 + m * 2.0 + (reducedMotion ? 0 : Math.sin(t * 0.2) * 0.05),
      yaw: 0.25,
      pitch: 0.02,
      dist: portrait ? 9.2 : 7.4,
      x: w / 2,
      y: h * 0.5,
      env: 0.3 + m * 0.9,
      focus: 1,
    };
  }

  // ---------------------------------------------------------------------------
  const focusLocal = new Vector3();
  const focusWorld = new Vector3();
  const offset = new Vector3();

  function apply(pose, viewW, viewH, extraShiftPx = 0) {
    tilt.rotation.set(pose.tiltX, 0, pose.tiltZ);
    spin.rotation.y = pose.spin;
    focusLocal.lerpVectors(cable.focus.cut, cable.focus.tips, pose.focus);
    tilt.updateMatrixWorld(true);
    focusWorld.copy(focusLocal).applyMatrix4(tilt.matrixWorld);

    offset.set(Math.sin(pose.yaw) * Math.cos(pose.pitch), Math.sin(pose.pitch), Math.cos(pose.yaw) * Math.cos(pose.pitch)).multiplyScalar(pose.dist);
    camera.position.copy(focusWorld).add(offset);
    camera.lookAt(focusWorld);
    camera.aspect = viewW / viewH;
    camera.updateProjectionMatrix();
    // Lens shift: move the focus point to (x, y) in canvas pixels.
    const dx = (pose.x / viewW) * 2 - 1;
    const dy = 1 - ((pose.y - extraShiftPx) / viewH) * 2;
    camera.projectionMatrix.elements[8] = -dx;
    camera.projectionMatrix.elements[9] = -dy;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();

    scene.environmentRotation.set(0, pose.env, 0);
    key.position.set(Math.cos(pose.env + 0.9) * 10, 8, Math.sin(pose.env + 0.9) * 10).add(focusWorld);
    key.target.position.copy(focusWorld);
  }

  // ---------------------------------------------------------------------------
  let mode = 'off';
  let host = null;
  let width = 0;
  let height = 0;

  function resizeTo(el) {
    const w = Math.max(1, Math.round(el.clientWidth));
    const h = Math.max(1, Math.round(el.clientHeight));
    if (w !== width || h !== height) {
      width = w;
      height = h;
      renderer.setSize(w, h, false);
    }
  }

  function setMode(next) {
    if (next === mode) return;
    mode = next;
    document.documentElement.dataset.stage = mode;
    if (mode === 'off') return;
    const target = mode === 'hero' ? heroHost : macroHost;
    if (host !== target) {
      target.appendChild(canvas);
      host = target;
      width = height = 0;
    }
    resizeTo(target);
    wake();
  }

  function chooseMode() {
    if (capture) return capture === 'macro' ? 'macro' : 'hero';
    // The products view hides the hero and the "why" panel.
    if (document.documentElement.dataset.route === 'products') return 'off';
    // With reduced motion the cable never lands, so the hero itself is the limit.
    const heroEnd = (reducedMotion ? heroSection : slot).getBoundingClientRect();
    if (heroEnd.bottom > -40) return 'hero';
    const m = macroHost.getBoundingClientRect();
    if (m.bottom > -80 && m.top < innerHeight + 80) return 'macro';
    return 'off';
  }

  // ---------------------------------------------------------------------------
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  let smoothScroll = scrollY;
  let introStart = -1;
  let last = performance.now();
  let raf = 0;
  let frameTimes = [];
  let firstFrame = true;

  function frame(now) {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = now / 1000;

    if (mode === 'hero') {
      const base = heroPose();
      let pose = base;
      let introDone = true;
      if (!reducedMotion && !capture) {
        if (introStart < 0) introStart = skipIntro() ? now - INTRO_SECONDS * 1000 : now;
        const k = clamp01((now - introStart) / 1000 / INTRO_SECONDS);
        introDone = k >= 1;
        const from = introPose(base);
        pose = mix(from, base, easeOutCubic(k));
        pose.env = lerp(from.env, base.env, easeInOut(k));
        pose.spin = lerp(from.spin, base.spin, easeInOut(k));
        // Idle drift, faded in after the intro so the hand-off is seamless.
        const idle = smoothstep(0.75, 1, k);
        pose.spin += Math.sin(t * 0.3) * 0.06 * idle;
        pose.env += Math.sin(t * 0.17) * 0.12 * idle;
        pointer.sx = damp(pointer.sx, pointer.x, 2.5, dt);
        pointer.sy = damp(pointer.sy, pointer.y, 2.5, dt);
        pose.yaw += pointer.sx * 0.06 * idle;
        pose.pitch += pointer.sy * 0.035 * idle;
      }

      const raw = scrollY;
      let attachPx;
      if (reducedMotion || capture) {
        attachPx = capture ? 0 : raw;
      } else {
        smoothScroll = damp(smoothScroll, raw, 9, dt);
        const a = easeInOut(clamp01(smoothScroll / layout.landScroll));
        pose = mix(pose, landPose(), a);
        attachPx = Math.max(0, raw - layout.landScroll);
      }
      if (!introDone || Math.abs(smoothScroll - raw) > 0.5) wake();
      apply(pose, width, height, attachPx);
    } else if (mode === 'macro') {
      const r = macroHost.getBoundingClientRect();
      const m = clamp01((innerHeight - r.top) / (innerHeight + r.height));
      apply(macroPose(m, t), width, height, 0);
    }

    if (mode !== 'off') {
      renderer.render(scene, camera);
      if (firstFrame) {
        firstFrame = false;
        document.documentElement.classList.add('stage-ready');
        if (capture) document.documentElement.dataset.captureReady = '1';
      }
      adapt(dt);
      // Keep animating while visible: the idle light drift is part of the shot.
      if (!reducedMotion && !capture) wake();
    }
  }

  // Drop resolution on slow devices instead of dropping frames.
  function adapt(dt) {
    frameTimes.push(dt);
    if (frameTimes.length < 90) return;
    const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
    frameTimes = [];
    if (avg > 0.026 && dpr > 1) {
      dpr = Math.max(1, dpr - 0.25);
      renderer.setPixelRatio(dpr);
      width = height = 0;
      if (host) resizeTo(host);
    }
  }

  // The product dialog covers the page: no need to keep rendering under it.
  const covered = () => document.documentElement.classList.contains('dialog-open');

  function wake() {
    if (!raf && !document.hidden && mode !== 'off' && !covered()) raf = requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------------------
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
  new MutationObserver(resume).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
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
  return { renderer, setMode, measure, quality };
}
