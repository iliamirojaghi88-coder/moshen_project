// World engine: one WebGL renderer for every 3D shot of the film.
// Each frame is a pure function of timeline time: shots render into HDR
// multisampled targets, get bloom and depth of field, then a final pass
// mixes the outgoing/incoming shot, grades, tone-maps (AgX), adds vignette
// and seeded grain. No clocks, no Math.random().
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

export { THREE };
export const W = 1080;
export const H = 1920;
export const FPS = 30;

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const ease = {
  linear: (t) => t,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t * t,
  expoOut: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  expoInOut: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2),
  sine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  quintOut: (t) => 1 - Math.pow(1 - t, 5),
  backOut: (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2),
};
// eased progress of t through [a, b]
export const seg = (t, a, b, e = ease.inOut) => e(clamp((t - a) / (b - a)));
// deterministic pseudo-random in [0,1)
export const hash = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
};
// smooth deterministic wobble, ~[-1,1]
export const wobble = (t, seed = 0) =>
  0.5 * Math.sin(t * 1.7 + seed * 3.1) + 0.3 * Math.sin(t * 2.9 + seed * 1.3) + 0.2 * Math.sin(t * 4.3 + seed * 5.7);

const FINAL_VS = /* glsl */ `
in vec3 position; in vec2 uv; out vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const DOF_FS = /* glsl */ `
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D tColor; uniform sampler2D tDepth;
uniform float near, far, focus, aperture, maxR; uniform vec2 px;
float lin(float d){ float z = d * 2.0 - 1.0; return 2.0 * near * far / (far + near - z * (far - near)); }
float coc(vec2 uv){ float z = lin(texture(tDepth, uv).r); return clamp(abs(z - focus) / max(z, 1e-4) * aperture, 0.0, maxR); }
void main(){
  float c0 = coc(vUv);
  vec3 acc = texture(tColor, vUv).rgb; float wsum = 1.0;
  const int N = 28;
  for (int i = 0; i < N; i++) {
    float r = sqrt((float(i) + 0.5) / float(N)) * maxR;
    float a = float(i) * 2.39996323;
    vec2 off = vec2(cos(a), sin(a)) * r;
    vec2 uv = vUv + off * px;
    float cs = coc(uv);
    float w = smoothstep(r - 1.5, r + 0.5, min(cs, c0 + 2.0) );
    w = max(w, smoothstep(r - 1.5, r + 0.5, cs) * step(c0, cs));
    acc += texture(tColor, uv).rgb * w; wsum += w;
  }
  o = vec4(acc / wsum, c0);
}`;

const FINAL_FS = /* glsl */ `
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D tA, tB, tAd, tBd;
uniform float useDofA, useDofB;
uniform float uMix; uniform int uMode;
uniform float uZoomA, uZoomB; uniform vec2 uCenter;
uniform float uExposure, uSat, uContrast, uPunch, uVig, uGrain, uFrame, uBlur, uCA, uFade;
uniform vec3 uWB, uLift, uFadeColor;
uniform vec2 px;
${THREE.ShaderChunk.tonemapping_pars_fragment}
vec3 shotA(vec2 uv){
  uv = (uv - uCenter) / uZoomA + uCenter;
  vec3 s = texture(tA, uv).rgb;
  if (useDofA > 0.5) { vec4 d = texture(tAd, uv); s = mix(s, d.rgb, smoothstep(0.6, 2.5, d.a)); }
  return s;
}
vec3 shotB(vec2 uv){
  uv = (uv - uCenter) / uZoomB + uCenter;
  vec3 s = texture(tB, uv).rgb;
  if (useDofB > 0.5) { vec4 d = texture(tBd, uv); s = mix(s, d.rgb, smoothstep(0.6, 2.5, d.a)); }
  return s;
}
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 scene(vec2 uv){
  vec3 a = shotA(uv);
  if (uMode == 0 || uMix <= 0.0) return a;
  vec3 b = shotB(uv);
  if (uMode == 1 || uMode == 2) return mix(a, b, uMix);
  if (uMode == 3) { // light reveal: the incoming shot appears through its highlights first
    float l = clamp(log2(1.0 + luma(b) * 4.0) / 3.0, 0.0, 1.0);
    float m = smoothstep(1.0 - uMix * 1.6, 1.25 - uMix * 1.6, l) ;
    m = max(m, smoothstep(0.65, 1.0, uMix));
    return mix(a, b, m) + b * 0.22 * sin(3.14159 * uMix) * smoothstep(0.5, 1.0, l);
  }
  if (uMode == 4) { // iris from uCenter
    vec2 d = (uv - uCenter) * vec2(1.0, 1920.0 / 1080.0);
    float r = length(d);
    float m = smoothstep(uMix * 1.3, uMix * 1.3 - 0.05, r);
    return mix(a, b, m);
  }
  // 5: soft vertical wipe of light (top -> bottom)
  float e = uMix * 1.4 - 0.2;
  float m = smoothstep(e + 0.2, e - 0.2, 1.0 - uv.y);
  return mix(a, b, m);
}
uvec2 pcg2d(uvec2 v){
  v = v * 1664525u + 1013904223u; v.x += v.y * 1664525u; v.y += v.x * 1664525u; v = v ^ (v >> 16u);
  v.x += v.y * 1664525u; v.y += v.x * 1664525u; v = v ^ (v >> 16u); return v;
}
float h21(vec2 fc, float frame){ uvec2 h = pcg2d(uvec2(fc) + uvec2(uint(frame) * 1973u, uint(frame) * 9277u)); return float(h.x) * (1.0 / 4294967295.0); }
void main(){
  vec3 col;
  if (uBlur > 0.4) {
    col = scene(vUv); float ws = 1.0;
    for (int i = 0; i < 16; i++) {
      float r = sqrt((float(i) + 0.5) / 16.0) * uBlur;
      float a = float(i) * 2.39996323;
      col += scene(vUv + vec2(cos(a), sin(a)) * r * px); ws += 1.0;
    }
    col /= ws;
  } else {
    col = scene(vUv);
    if (uCA > 0.0) {
      vec2 d = (vUv - 0.5) * uCA * 0.004;
      col.r = scene(vUv + d).r; col.b = scene(vUv - d).b;
    }
  }
  col *= uExposure * uWB;
  float l = luma(col);
  col = mix(vec3(l), col, uSat);
  col = 0.18 * pow(max(col, 0.0) / 0.18, vec3(uContrast));
  col += uLift * 0.02;
  col = AgXToneMapping(col);
  // display-referred punch: mild S-curve and saturation lift over AgX's neutral base
  float lc = luma(col);
  col = mix(vec3(lc), col, 1.0 + 0.35 * uPunch);
  col = mix(col, col * col * (3.0 - 2.0 * col), 0.35 * uPunch);
  col = clamp(col, 0.0, 1.0);
  // sRGB OETF
  col = mix(col * 12.92, 1.055 * pow(col, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, col));
  vec2 q = vUv - 0.5; q.y *= 1.25;
  col *= mix(1.0, smoothstep(0.95, 0.18, length(q)), uVig);
  float g = h21(gl_FragCoord.xy, uFrame) - 0.5;
  col += g * uGrain * (0.6 + 0.4 * (1.0 - luma(col)));
  col = mix(col, uFadeColor, uFade);
  o = vec4(col, 1.0);
}`;

export const DEFAULT_POST = {
  exposure: 1.0,
  wb: [1, 1, 1],
  sat: 1.0,
  contrast: 1.0,
  punch: 0.6,
  lift: [0, 0, 0],
  vig: 0.55,
  grain: 0.035,
  blur: 0,
  ca: 0.6,
  fade: 0,
  fadeColor: [0, 0, 0],
  bloom: { strength: 0.45, radius: 0.55, threshold: 1.1 },
  dof: null, // { focus, aperture, maxR }
};

function mixPost(a, b, t) {
  const m = (x, y) => (Array.isArray(x) ? x.map((v, i) => lerp(v, y[i], t)) : lerp(x, y, t));
  const out = {};
  for (const k of Object.keys(DEFAULT_POST)) {
    if (k === "bloom" || k === "dof") continue;
    out[k] = m(a[k], b[k]);
  }
  return out;
}

export class Engine {
  constructor(canvas) {
    const r = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, preserveDrawingBuffer: true, stencil: false });
    r.setPixelRatio(1);
    r.setSize(W, H, false);
    r.toneMapping = THREE.NoToneMapping;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.localClippingEnabled = true;
    this.r = r;
    const mk = () => {
      const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
      rt.depthTexture = new THREE.DepthTexture(W, H);
      rt.depthTexture.type = THREE.UnsignedIntType;
      return rt;
    };
    this.rtA = mk();
    this.rtB = mk();
    const half = () => new THREE.WebGLRenderTarget(W / 2, H / 2, { type: THREE.HalfFloatType, depthBuffer: false });
    this.dofA = half();
    this.dofB = half();
    this.bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.45, 0.55, 1.1);
    this.pmrem = new THREE.PMREMGenerator(r);
    this.gltf = new GLTFLoader();
    this.texLoader = new THREE.TextureLoader();
    this.cache = new Map();

    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const tri = new THREE.PlaneGeometry(2, 2);
    this.dofMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: FINAL_VS,
      fragmentShader: DOF_FS,
      uniforms: {
        tColor: { value: null }, tDepth: { value: null }, near: { value: 0.1 }, far: { value: 100 },
        focus: { value: 1 }, aperture: { value: 0 }, maxR: { value: 12 }, px: { value: new THREE.Vector2(1 / W, 1 / H) },
      },
      depthTest: false, depthWrite: false,
    });
    this.dofQuad = new THREE.Mesh(tri, this.dofMat);
    this.dofScene = new THREE.Scene();
    this.dofScene.add(this.dofQuad);
    const U = (v) => ({ value: v });
    this.finalMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: FINAL_VS,
      fragmentShader: FINAL_FS,
      uniforms: {
        tA: U(null), tB: U(null), tAd: U(null), tBd: U(null), useDofA: U(0), useDofB: U(0),
        uMix: U(0), uMode: U(0), uZoomA: U(1), uZoomB: U(1), uCenter: U(new THREE.Vector2(0.5, 0.5)),
        uExposure: U(1), uSat: U(1), uContrast: U(1), uPunch: U(0.6), uVig: U(0.5), uGrain: U(0.03),
        uFrame: U(0), uBlur: U(0), uCA: U(0.5), uFade: U(0), uFadeColor: U(new THREE.Color(0, 0, 0)),
        uWB: U(new THREE.Vector3(1, 1, 1)), uLift: U(new THREE.Vector3()), px: U(new THREE.Vector2(1 / W, 1 / H)),
        toneMappingExposure: U(1),
      },
      depthTest: false, depthWrite: false,
    });
    this.finalScene = new THREE.Scene();
    this.finalScene.add(new THREE.Mesh(tri, this.finalMat));
    this.shots = [];
  }

  load(url) {
    if (!this.cache.has(url)) this.cache.set(url, this.gltf.loadAsync(url));
    return this.cache.get(url);
  }

  texture(url, { srgb = false, repeat = null, aniso = 8 } = {}) {
    const key = `${url}|${srgb}|${repeat}`;
    if (!this.cache.has(key)) {
      this.cache.set(
        key,
        this.texLoader.loadAsync(url).then((t) => {
          t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
          t.anisotropy = aniso;
          if (repeat) {
            t.wrapS = t.wrapT = THREE.RepeatWrapping;
            t.repeat.set(repeat[0], repeat[1]);
          }
          return t;
        }),
      );
    }
    return this.cache.get(key);
  }

  // A soft-box studio as an environment map: a dim room plus emissive panels.
  // panels: [{ pos:[x,y,z], size:[w,h], color:0xffffff, intensity }]
  studioEnv({ ambient = 0x0b0d12, panels = [] } = {}) {
    const s = new THREE.Scene();
    const room = new THREE.Mesh(
      new THREE.SphereGeometry(20, 32, 16),
      new THREE.MeshBasicMaterial({ color: ambient, side: THREE.BackSide }),
    );
    s.add(room);
    for (const p of panels) {
      const c = new THREE.Color(p.color ?? 0xffffff).multiplyScalar(p.intensity ?? 4);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(p.size[0], p.size[1]), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
      m.position.set(...p.pos);
      m.lookAt(0, 0, 0);
      s.add(m);
    }
    const rt = this.pmrem.fromScene(s, 0.02);
    return rt.texture;
  }

  // Persian / Latin label as a canvas texture (Canvas shapes RTL text correctly).
  textTexture(text, { size = 160, weight = 900, color = "#ffffff", family = "Vazirmatn", pad = 0.25, spacing = 0 } = {}) {
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d");
    const font = `${weight} ${size}px ${family}`;
    ctx.font = font;
    ctx.direction = "rtl";
    const w = Math.ceil(ctx.measureText(text).width + size * pad * 2);
    const h = Math.ceil(size * 1.6);
    c.width = w;
    c.height = h;
    ctx.font = font;
    ctx.direction = "rtl";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (spacing) ctx.letterSpacing = `${spacing}px`;
    ctx.fillStyle = color;
    ctx.fillText(text, w / 2, h * 0.54);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    return { texture: t, aspect: w / h };
  }

  label(text, { height = 0.1, intensity = 2.2, ...opts } = {}) {
    const { texture, aspect } = this.textTexture(text, opts);
    const mat = new THREE.MeshBasicMaterial({
      map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      color: new THREE.Color(intensity, intensity, intensity),
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(height * aspect, height), mat);
    m.renderOrder = 10;
    return m;
  }

  add(shot) {
    this.shots.push(shot);
    this.shots.sort((a, b) => a.t0 - b.t0);
  }

  renderShot(shot, t, rt, dofRt) {
    const post = Object.assign({}, DEFAULT_POST, shot.update(t) || {});
    post.bloom = Object.assign({}, DEFAULT_POST.bloom, post.bloom || {});
    this.r.setRenderTarget(rt);
    this.r.clear();
    this.r.render(shot.scene, shot.camera);
    const b = post.bloom;
    if (b.strength > 0.001) {
      this.bloom.strength = b.strength;
      this.bloom.radius = b.radius;
      this.bloom.threshold = b.threshold;
      this.bloom.render(this.r, null, rt, 0, false);
    }
    let useDof = 0;
    if (post.dof && post.dof.aperture > 0.01) {
      const u = this.dofMat.uniforms;
      u.tColor.value = rt.texture;
      u.tDepth.value = rt.depthTexture;
      u.near.value = shot.camera.near;
      u.far.value = shot.camera.far;
      u.focus.value = post.dof.focus;
      u.aperture.value = post.dof.aperture;
      u.maxR.value = post.dof.maxR ?? 10;
      u.px.value.set(1 / W, 1 / H);
      this.r.setRenderTarget(dofRt);
      this.r.render(this.dofScene, this.quadCam);
      useDof = 1;
    }
    return { post, useDof };
  }

  frame(t) {
    const active = this.shots.filter((s) => t >= s.t0 && t < s.t1);
    const u = this.finalMat.uniforms;
    u.uFrame.value = Math.round(t * FPS);
    if (!active.length) {
      this.r.setRenderTarget(null);
      this.r.setClearColor(0x000000, 1);
      this.r.clear();
      return;
    }
    const A = active[0];
    const B = active.length > 1 ? active[active.length - 1] : null;
    const ra = this.renderShot(A, t, this.rtA, this.dofA);
    let post = ra.post;
    u.tA.value = this.rtA.texture;
    u.tAd.value = this.dofA.texture;
    u.useDofA.value = ra.useDof;
    u.uMix.value = 0;
    u.uMode.value = 0;
    u.uZoomA.value = post.zoom ?? 1;
    u.uZoomB.value = 1;
    u.uCenter.value.set(0.5, 0.5);
    let blur = post.blur;
    if (B) {
      const rb = this.renderShot(B, t, this.rtB, this.dofB);
      const tr = B.transition || { mode: 1, ease: ease.inOut };
      const p = (tr.ease || ease.inOut)(clamp((t - B.t0) / (A.t1 - B.t0)));
      u.tB.value = this.rtB.texture;
      u.tBd.value = this.dofB.texture;
      u.useDofB.value = rb.useDof;
      u.uMode.value = tr.mode;
      u.uMix.value = p;
      if (tr.center) u.uCenter.value.set(tr.center[0], tr.center[1]);
      if (tr.mode === 2) {
        u.uZoomA.value = (ra.post.zoom ?? 1) * lerp(1, tr.zoomA ?? 1.6, ease.in(p));
        u.uZoomB.value = (rb.post.zoom ?? 1) * lerp(tr.zoomB ?? 0.8, 1, ease.out(p));
      } else {
        u.uZoomB.value = rb.post.zoom ?? 1;
      }
      post = Object.assign({}, rb.post, mixPost(ra.post, rb.post, p));
      blur = lerp(ra.post.blur, rb.post.blur, p) + (tr.blur ?? 0) * Math.sin(Math.PI * p);
    }
    u.uExposure.value = post.exposure;
    u.uWB.value.set(...post.wb);
    u.uSat.value = post.sat;
    u.uContrast.value = post.contrast;
    u.uPunch.value = post.punch;
    u.uLift.value.set(...post.lift);
    u.uVig.value = post.vig;
    u.uGrain.value = post.grain;
    u.uBlur.value = blur;
    u.uCA.value = post.ca;
    u.uFade.value = post.fade;
    u.uFadeColor.value.setRGB(...post.fadeColor);
    this.r.setRenderTarget(null);
    this.r.render(this.finalScene, this.quadCam);
  }
}

// ---------------------------------------------------------------- helpers
export function setShadow(light, size = 2048, extent = 1, near = 0.05, far = 20, radius = 4, bias = -0.0004) {
  light.castShadow = true;
  light.shadow.mapSize.set(size, size);
  const c = light.shadow.camera;
  if (c.isOrthographicCamera) {
    c.left = c.bottom = -extent;
    c.right = c.top = extent;
  }
  c.near = near;
  c.far = far;
  light.shadow.radius = radius;
  light.shadow.bias = bias;
  light.shadow.normalBias = 0.002;
  return light;
}

export function lookFrom(camera, pos, target, roll = 0, up = null) {
  camera.position.set(pos[0], pos[1], pos[2]);
  if (up) camera.up.set(up[0], up[1], up[2]);
  else camera.up.set(Math.sin(roll), Math.cos(roll), 0);
  camera.lookAt(target[0], target[1], target[2]);
  camera.updateMatrixWorld();
}

// Catmull-Rom through keyframes [[t, value...]] -> interpolated array at t
export function track(keys, t) {
  if (t <= keys[0][0]) return keys[0].slice(1);
  if (t >= keys[keys.length - 1][0]) return keys[keys.length - 1].slice(1);
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
  const k0 = keys[Math.max(0, i - 1)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(keys.length - 1, i + 2)];
  const u = ease.sine((t - k1[0]) / (k2[0] - k1[0]));
  const out = [];
  for (let j = 1; j < k1.length; j++) {
    const p0 = k0[j], p1 = k1[j], p2 = k2[j], p3 = k3[j];
    const u2 = u * u, u3 = u2 * u;
    // centripetal-ish Catmull-Rom with eased parameter: smooth starts/stops at keys
    out.push(0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3));
  }
  return out;
}
