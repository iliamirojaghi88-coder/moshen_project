// Skies and studio light rigs, generated in code, plus their PMREM reflections.
import * as THREE from "three";

const skyVert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const skyFrag = /* glsl */ `
uniform vec3 uZenith, uHorizon, uGround, uGlow, uSunDir, uCloudLit, uCloudShade;
uniform float uGlowPow, uHalo, uCloud, uDrift, uSunDisc, uExposure;
varying vec3 vDir;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<6;i++){ s+=a*noise(p); p=p*2.03+vec2(1.7,9.2); a*=0.5; } return s; }
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 sky = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.55));
  sky = mix(uGround, sky, smoothstep(-0.04, 0.02, h));
  float sd = max(dot(d, normalize(uSunDir)), 0.0);
  float band = exp(-abs(h) * 7.0);
  sky += uGlow * (pow(sd, uGlowPow) * 1.4 + uHalo * pow(sd, 3.0) * band + 0.25 * uHalo * band);
  sky += uGlow * uSunDisc * smoothstep(0.9993, 0.9997, sd) * 30.0;
  if (h > 0.0 && uCloud > 0.0) {
    vec2 uv = d.xz / (h + 0.12) * 1.6 + vec2(uDrift, 0.0);
    float c = fbm(uv);
    float cov = smoothstep(0.55 - 0.25 * uCloud, 0.95, c) * smoothstep(0.0, 0.25, h);
    float lit = pow(sd, 4.0) * 0.8 + 0.2;
    vec3 cc = mix(uCloudShade, uCloudLit, lit * (0.6 + 0.4 * fbm(uv * 2.0 + 3.0)));
    sky = mix(sky, cc, cov * 0.85);
  }
  gl_FragColor = vec4(sky * uExposure, 1.0);
}`;

export const SKY_PRESETS = {
  // blue hour over the city: navy zenith, amber rim at the horizon
  dusk: {
    zenith: 0x050c1c, horizon: 0x2a3550, ground: 0x05080f, glow: 0xff9a4a, sun: [-0.55, 0.02, -0.8],
    glowPow: 18, halo: 0.55, cloud: 0.55, cloudLit: 0xb06a48, cloudShade: 0x10172a, sunDisc: 0, exposure: 1.0,
  },
  // early morning, warm low sun
  morning: {
    zenith: 0x3d6fb0, horizon: 0xc9d6e3, ground: 0x6b6a66, glow: 0xffd9a0, sun: [0.55, 0.42, 0.72],
    glowPow: 40, halo: 0.45, cloud: 0.35, cloudLit: 0xfff1e0, cloudShade: 0x9aa8bc, sunDisc: 1, exposure: 1.0,
  },
  // bright clean day
  day: {
    zenith: 0x3f7cc8, horizon: 0xdbe7f2, ground: 0x7a7a76, glow: 0xfff4e0, sun: [-0.35, 0.62, -0.45],
    glowPow: 60, halo: 0.3, cloud: 0.3, cloudLit: 0xffffff, cloudShade: 0xb8c4d4, sunDisc: 1, exposure: 1.0,
  },
};

export function makeSky() {
  const uniforms = {
    uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGround: { value: new THREE.Color() },
    uGlow: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3() }, uCloudLit: { value: new THREE.Color() },
    uCloudShade: { value: new THREE.Color() }, uGlowPow: { value: 20 }, uHalo: { value: 0.5 }, uCloud: { value: 0.5 },
    uDrift: { value: 0 }, uSunDisc: { value: 0 }, uExposure: { value: 1 },
  };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: skyVert, fragmentShader: skyFrag, side: THREE.BackSide, depthWrite: false, fog: false });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.scale.setScalar(5000);
  const tmpA = new THREE.Color(), tmpB = new THREE.Color();
  const mix = (key, a, b, k) => uniforms[key].value.copy(tmpA.set(a)).lerp(tmpB.set(b), k);
  // blend two presets (k: 0 -> a, 1 -> b)
  mesh.userData.set = (a, b = a, k = 0) => {
    mix("uZenith", a.zenith, b.zenith, k);
    mix("uHorizon", a.horizon, b.horizon, k);
    mix("uGround", a.ground, b.ground, k);
    mix("uGlow", a.glow, b.glow, k);
    mix("uCloudLit", a.cloudLit, b.cloudLit, k);
    mix("uCloudShade", a.cloudShade, b.cloudShade, k);
    uniforms.uSunDir.value.set(...a.sun).lerp(new THREE.Vector3(...b.sun), k).normalize();
    for (const [u, p] of [["uGlowPow", "glowPow"], ["uHalo", "halo"], ["uCloud", "cloud"], ["uSunDisc", "sunDisc"], ["uExposure", "exposure"]])
      uniforms[u].value = THREE.MathUtils.lerp(a[p], b[p], k);
  };
  return mesh;
}

// PMREM of a sky preset blend, for reflections.
export function skyEnvironment(pmrem, a, b = a, k = 0) {
  const scene = new THREE.Scene();
  const sky = makeSky();
  sky.scale.setScalar(100);
  sky.userData.set(a, b, k);
  sky.material.uniforms.uSunDisc.value = 0;
  scene.add(sky);
  const rt = pmrem.fromScene(scene, 0.02, 0.1, 1000);
  sky.geometry.dispose();
  sky.material.dispose();
  return rt.texture;
}

// Studio light rig: a dim gradient room with soft boxes. Colours in linear HDR.
export function studioEnvironment(pmrem, rig) {
  const scene = new THREE.Scene();
  const roomMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { top: { value: new THREE.Color(rig.top) }, bottom: { value: new THREE.Color(rig.bottom) } },
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top, bottom; varying vec3 vP; void main(){ float h = normalize(vP).y*0.5+0.5; gl_FragColor = vec4(mix(bottom, top, smoothstep(0.2, 0.9, h)), 1.0); }`,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), roomMat));
  for (const b of rig.boxes) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(b.w, b.h), new THREE.MeshBasicMaterial({ color: new THREE.Color(b.color).multiplyScalar(b.i), side: THREE.DoubleSide }));
    m.position.set(...b.p);
    m.lookAt(0, 0, 0);
    scene.add(m);
  }
  return pmrem.fromScene(scene, 0.03).texture;
}

export const STUDIO_RIGS = {
  // dark navy product studio with teal and amber strips (analysis scenes)
  navy: {
    top: 0x0b1830, bottom: 0x02050b,
    boxes: [
      { p: [-14, 10, 8], w: 18, h: 8, color: 0x9fd8ff, i: 3.0 },
      { p: [16, 6, -6], w: 3, h: 22, color: 0x2fd3c8, i: 5.0 },
      { p: [-10, 4, -16], w: 3, h: 18, color: 0xffb35a, i: 4.0 },
      { p: [0, 22, 0], w: 16, h: 16, color: 0xdfe9ff, i: 1.6 },
    ],
  },
  // bright clean white studio (brand and device scenes)
  bright: {
    top: 0xf3f5f8, bottom: 0x9aa1ab,
    boxes: [
      { p: [-12, 14, 10], w: 20, h: 12, color: 0xffffff, i: 6.0 },
      { p: [14, 8, 6], w: 6, h: 18, color: 0xfff3e2, i: 4.0 },
      { p: [0, 10, -18], w: 26, h: 6, color: 0xe8f1ff, i: 3.0 },
      { p: [0, 25, 0], w: 20, h: 20, color: 0xffffff, i: 3.0 },
    ],
  },
};
