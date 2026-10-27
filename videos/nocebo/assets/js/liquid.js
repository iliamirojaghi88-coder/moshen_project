// Liquid field for S2: a dark liquid surface under softbox strips.
// The height field is a pure function of (x, z, time, params): swells for
// nausea, a tense shiver and sharp rings for pain. Big waves displace the mesh;
// the fine detail lives in a per-pixel normal from the same function.
import * as THREE from "three";

const HEIGHT_GLSL = /* glsl */ `
uniform float uTime;
uniform float uSwell;    // 0..1 nausea swell strength
uniform float uShiver;   // 0..1 tension shiver
uniform vec4 uRingT;     // start times of up to four rings (negative = off)
uniform vec2 uRingC;     // ring centre (world xz)
uniform float uRingA;    // ring amplitude
float swell(vec2 p) {
  float t = uTime;
  float h = 0.0;
  h += 0.24 * sin(dot(p, vec2(0.62, 0.78)) * 0.9 - t * 1.05);
  h += 0.13 * sin(dot(p, vec2(-0.85, 0.52)) * 1.45 - t * 1.38 + 1.7);
  h += 0.055 * sin(dot(p, vec2(0.2, -0.98)) * 2.4 - t * 1.9 + 0.4);
  return h * uSwell;
}
float ringAt(vec2 p, float t0) {
  if (t0 < 0.0 || uTime < t0) return 0.0;
  float age = uTime - t0;
  float r = length(p - uRingC);
  float front = 0.15 + age * 2.6;
  float w = 0.16 + age * 0.12;
  float x = (r - front) / w;
  return uRingA * exp(-age * 1.4) * exp(-x * x) * sin(x * 2.4);
}
float bigH(vec2 p) {
  return swell(p) + ringAt(p, uRingT.x) + ringAt(p, uRingT.y) + ringAt(p, uRingT.z) + ringAt(p, uRingT.w);
}
float fineH(vec2 p) {
  // irregular directional ripples (no grid): angles and lengths are fixed primes
  float t = uTime;
  float h = 0.0;
  h += sin(dot(p, vec2(0.97, 0.24)) * 3.1 - t * 1.6);
  h += sin(dot(p, vec2(-0.41, 0.91)) * 4.3 - t * 2.1 + 1.3);
  h += 0.8 * sin(dot(p, vec2(0.66, -0.75)) * 5.9 - t * 2.6 + 2.1);
  h += 0.6 * sin(dot(p, vec2(-0.88, -0.47)) * 7.7 - t * 3.0 + 0.7);
  h += 0.45 * sin(dot(p, vec2(0.13, 0.99)) * 10.3 - t * 3.7 + 4.2);
  float sh = sin(dot(p, vec2(0.71, 0.7)) * 17.0 + t * 9.0) * sin(dot(p, vec2(-0.6, 0.8)) * 13.0 - t * 11.0);
  return h * 0.0042 + sh * 0.0035 * uShiver;
}
`;

function envScene(strips) {
  const s = new THREE.Scene();
  s.background = new THREE.Color(0x020306);
  for (const st of strips) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(st.w, st.h, st.d), new THREE.MeshBasicMaterial({ color: new THREE.Color(st.color).multiplyScalar(st.power) }));
    m.position.set(...st.pos);
    s.add(m);
  }
  return s;
}

export function createLiquid(canvas, opts = {}) {
  const W = opts.width ?? 1080;
  const H = opts.height ?? 1920;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1); // 2 for high-density stills
  renderer.setSize(W, H, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  const scene = new THREE.Scene();
  const fogColor = new THREE.Color(0x060a12);
  scene.background = fogColor;
  scene.fog = new THREE.Fog(fogColor, 6, 30);

  // Studio strips overhead, reflected by the liquid: two long horizontal bars,
  // one far panel near the horizon line.
  const pm = new THREE.PMREMGenerator(renderer);
  const env = pm.fromScene(
    envScene([
      { w: 40, h: 0.12, d: 0.5, pos: [0, 6, -10], color: 0xffffff, power: 6 },
      { w: 40, h: 0.1, d: 0.35, pos: [0, 5, -4.5], color: 0xffffff, power: 3.2 },
      { w: 30, h: 1.4, d: 0.5, pos: [0, 1.2, -26], color: 0xbfd2ff, power: 0.55 },
      { w: 40, h: 0.2, d: 24, pos: [0, 9, -6], color: 0x8ea6c8, power: 0.16 },
    ]),
    0.0,
  ).texture;

  const uniforms = {
    uTime: { value: 0 },
    uSwell: { value: 0 },
    uShiver: { value: 0 },
    uRingT: { value: new THREE.Vector4(-1, -1, -1, -1) },
    uRingC: { value: new THREE.Vector2(0, -1.7) },
    uRingA: { value: 0.06 },
    uTint: { value: new THREE.Color(1, 1, 1) },
  };
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0x03060b,
    roughness: 0.11,
    metalness: 0.0,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    ior: 1.33,
    envMap: env,
    envMapIntensity: 1.0,
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${HEIGHT_GLSL}\nvarying vec2 vXZ;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\nvec2 wxz = (modelMatrix * vec4(transformed, 1.0)).xz;\ntransformed.y += bigH(wxz);\nvXZ = wxz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${HEIGHT_GLSL}\nvarying vec2 vXZ;\nuniform vec3 uTint;`)
      .replace(
        "#include <normal_fragment_begin>",
        `#include <normal_fragment_begin>
        {
          float e = 0.01;
          // fine detail fades with distance so the far field never aliases
          float fd = 1.0 - smoothstep(3.0, 12.0, length(vViewPosition));
          float hx = (bigH(vXZ + vec2(e, 0.0)) + fd * fineH(vXZ + vec2(e, 0.0))) - (bigH(vXZ - vec2(e, 0.0)) + fd * fineH(vXZ - vec2(e, 0.0)));
          float hz = (bigH(vXZ + vec2(0.0, e)) + fd * fineH(vXZ + vec2(0.0, e))) - (bigH(vXZ - vec2(0.0, e)) + fd * fineH(vXZ - vec2(0.0, e)));
          vec3 nW = normalize(vec3(-hx / (2.0 * e), 1.0, -hz / (2.0 * e)));
          normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
          nonPerturbedNormal = normal;
        }`,
      )
      .replace("#include <lights_fragment_maps>", "#include <lights_fragment_maps>\nradiance *= uTint;\nclearcoatRadiance *= uTint;");
  };
  const geo = new THREE.PlaneGeometry(36, 44, 360, 440);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, -16);
  const water = new THREE.Mesh(geo, mat);
  scene.add(water);

  const camera = new THREE.PerspectiveCamera(38, W / H, 0.05, 60);

  /**
   * p: { time, swell, shiver, rings:[t0..], tint:[r,g,b], camY, camZ, pitch, roll, exposure }
   */
  function render(p) {
    uniforms.uTime.value = p.time;
    uniforms.uSwell.value = p.swell ?? 0;
    uniforms.uShiver.value = p.shiver ?? 0;
    const r = p.rings ?? [];
    uniforms.uRingT.value.set(r[0] ?? -1, r[1] ?? -1, r[2] ?? -1, r[3] ?? -1);
    if (p.ringAmp != null) uniforms.uRingA.value = p.ringAmp;
    if (p.tint) uniforms.uTint.value.setRGB(...p.tint);
    renderer.toneMappingExposure = p.exposure ?? 1.0;
    camera.position.set(p.camX ?? 0, p.camY ?? 0.85, p.camZ ?? 2.4);
    camera.rotation.order = "YXZ";
    camera.rotation.set(p.pitch ?? -0.17, p.yaw ?? 0, p.roll ?? 0);
    renderer.render(scene, camera);
  }
  return { render, renderer, scene, camera };
}
