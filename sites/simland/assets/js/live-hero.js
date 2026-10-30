// The hero image, alive. The client's picture stays exactly where it is and
// keeps its size, angle and framing (no zoom, no camera, no parallax); one
// WebGL pass redraws it each frame with only these parts moving:
//
//   turbines  the blades cut from the picture turn inside each rotor's own
//             plane (an affine map fitted to the three blade tips), so the
//             two turbines seen at an angle turn in correct perspective
//   smoke     white-grey steam from each chimney mouth: a dense column that
//             breaks into soft billows, spreads, leans with the wind, thins out
//   plants    crowns sway from their trunks, leaves flutter, thin branches,
//             bushes, flowers and grass move slightly; trunks, buildings,
//             cable, text, panels, pylon and wires never move
//
// One wind drives everything: gusts travel from right to left (the turbines
// face right-front), speed the rotors up a little, bend the plumes and the
// crowns. Moving parts are sampled with clamped Catmull-Rom filtering so they
// stay as crisp as the still picture.
//
// Without WebGL, or with reduced motion, the still layers stay on screen and
// show the picture exactly as supplied.

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
uniform vec4 uView; // canvas height in px, px per picture px (x, y), picture rows above the picture top
uniform sampler2D uBase;
uniform sampler2D uAtlas;
uniform sampler2D uMasks;
uniform vec2 uSize;
uniform vec2 uBaseSize;
uniform vec2 uAtlasSize;
uniform float uEase;
uniform float uSmokeAge;
uniform float uAmp;
// every clock-driven value arrives already wrapped (phases mod 2 pi, noise offsets
// mod 289, the noise's own period), so precision never degrades in a long run
uniform vec4 uGustPh;
uniform vec4 uSwayPh;
uniform vec4 uAdv;
uniform vec4 uCyc;
uniform float uEvolve;
uniform vec2 uHub[3];
uniform mat2 uK[3];
uniform vec4 uBladeRect[3];
uniform vec4 uBladeUV[3];
uniform vec4 uCapRect[3];
uniform vec4 uCapUV[3];
uniform vec4 uChimney[2];

// 2D simplex noise: Ian McEwan, Ashima Arts, and Stefan Gustavson (webgl-noise), MIT License
vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float fbm3(vec2 p) {
  return 0.57 * snoise(p) + 0.29 * snoise(mat2(0.8, -0.6, 0.6, 0.8) * p * 2.02 + 11.3)
    + 0.14 * snoise(mat2(-0.28, -0.96, 0.96, -0.28) * p * 4.07 + 3.7);
}

// gust strength 0..1, as it was 'delay' seconds ago (same formula as gust() in JS)
float gustAgo(float delay) {
  return 0.5 + 0.5 * (0.55 * sin(uGustPh.x - 0.31 * delay) + 0.3 * sin(uGustPh.y - 0.73 * delay)
    + 0.15 * sin(uGustPh.z - 1.37 * delay));
}

vec4 over(vec4 top, vec4 under) { return top + under * (1.0 - top.a); }

// Catmull-Rom sampling clamped to the four nearest texels: as crisp as the
// picture itself where it moves or turns, and it cannot ring or form halos.
vec4 sampleSharp(sampler2D tex, vec2 uv, vec2 size) {
  vec2 pos = uv * size;
  vec2 tc = floor(pos - 0.5) + 0.5;
  vec2 f = pos - tc;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
  vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
  vec2 w3 = f * f * (-0.5 + 0.5 * f);
  vec2 w12 = w1 + w2;
  vec2 t0 = (tc - 1.0) / size;
  vec2 t3 = (tc + 2.0) / size;
  vec2 t12 = (tc + w2 / w12) / size;
  vec4 r = (texture2D(tex, vec2(t0.x, t0.y)) * w0.x + texture2D(tex, vec2(t12.x, t0.y)) * w12.x + texture2D(tex, vec2(t3.x, t0.y)) * w3.x) * w0.y
    + (texture2D(tex, vec2(t0.x, t12.y)) * w0.x + texture2D(tex, vec2(t12.x, t12.y)) * w12.x + texture2D(tex, vec2(t3.x, t12.y)) * w3.x) * w12.y
    + (texture2D(tex, vec2(t0.x, t3.y)) * w0.x + texture2D(tex, vec2(t12.x, t3.y)) * w12.x + texture2D(tex, vec2(t3.x, t3.y)) * w3.x) * w3.y;
  vec4 a = texture2D(tex, tc / size);
  vec4 b = texture2D(tex, (tc + vec2(1.0, 0.0)) / size);
  vec4 c = texture2D(tex, (tc + vec2(0.0, 1.0)) / size);
  vec4 d = texture2D(tex, (tc + vec2(1.0, 1.0)) / size);
  return clamp(r, min(min(a, b), min(c, d)), max(max(a, b), max(c, d)));
}

vec4 sampleRect(vec2 q, vec4 rect, vec4 uv) {
  vec2 f = (q - rect.xy) / rect.zw;
  if (f.x < -0.02 || f.y < -0.02 || f.x > 1.02 || f.y > 1.02) return vec4(0.0);
  return sampleSharp(uAtlas, uv.xy + f * uv.zw, uAtlasSize);
}

// Smoke detail: billows that scroll up with the smoke while their size grows
// with height. Scrolling such a pattern for ever would compress it, so two
// copies take turns (a flow map): each scrolls for four seconds and fades out
// as the other, half a cycle apart, fades in; a fresh pattern starts while a
// copy is unseen.
vec2 billow(float dx, float h, float sc, float rise, float seed) {
  vec2 n = vec2(0.0);
  float wsum = 0.0;
  for (int k = 0; k < 2; k++) {
    float ph = k == 0 ? uCyc.x : uCyc.z;
    float id = (k == 0 ? uCyc.y : uCyc.w) + seed * 7.0 + float(k) * 3.0;
    vec2 off = vec2(fract(sin(id * 12.9898) * 43758.5453), fract(sin(id * 78.233) * 12543.1)) * 37.0;
    vec2 q = vec2(dx / sc, (h - ph * 4.0 * rise) / sc) + off;
    vec2 wq = q + vec2(fbm3(q * 0.45 + vec2(0.0, uEvolve)), fbm3(q * 0.45 + vec2(4.7, 2.1 - uEvolve))) * 0.8;
    float w = 1.0 - abs(2.0 * ph - 1.0);
    // second value: density a little towards the sun (upper left), for broad, soft shading
    n += vec2(fbm3(wq), fbm3(wq + vec2(-0.55, 0.6))) * w;
    wsum += w * w;
  }
  return n / sqrt(wsum);  // keeps the contrast steady through the crossfade
}

// Steam from one chimney: a dense column leaves the mouth, breaks into soft
// billows within a few mouth widths, spreads, leans with the wind it left the
// chimney in and thins out. White-grey, lit from the sun side (upper left).
vec4 plume(vec2 P, vec4 ch, float seed) {
  float h = ch.y - P.y;
  if (h < -2.0 || h > 400.0) return vec4(0.0);
  float rise = 24.0;
  float hp = max(h, 0.0);
  float g = gustAgo((uSize.x - ch.x) / 520.0 + hp / rise);
  float lean = (0.010 + 0.014 * g) * pow(hp, 1.32);
  // slow meander carried up with the smoke (parcel coordinates: no compression)
  float meander = 7.0 * snoise(vec2(hp * 0.011 - uAdv.w, seed)) * smoothstep(10.0, 140.0, hp);
  float dx = P.x - (ch.x - lean + meander);
  float w = ch.z * 0.66 + hp * 0.24;
  float u = dx / w;
  if (abs(u) > 2.2) return vec4(0.0);
  vec2 n = billow(dx, hp, 24.0 + hp * 0.16, rise, seed);
  float core = exp(-u * u * 1.25);
  float dens = mix(0.97, 0.66 + 0.7 * n.x, smoothstep(4.0, 75.0, hp));
  float d = smoothstep(0.05, 0.75, core * dens - hp / 1050.0);
  float puff = 0.9 + 0.1 * sin(uGustPh.w + seed * 1.7);
  float grown = clamp((uSmokeAge * rise - hp) / 30.0, 0.0, 1.0);  // only smoke made since the page opened
  float a = d * smoothstep(-1.5, 5.0, h) * exp(-hp / 240.0) * puff * grown * 0.84 * ch.w;
  a *= smoothstep(-uView.w, -uView.w + 80.0, P.y);  // always gone before the canvas edge
  // light: the side facing the sun and the billow tops are bright, folds and the
  // shaded side soft grey; fresh steam at the mouth is bright and smooth
  float relief = smoothstep(0.0, 90.0, hp);
  float lit = 0.6 - (n.y - n.x) * 1.1 * relief - 0.2 * u + 0.12 * n.x - 0.16 * d * relief;
  // the fresh column at the mouth: round, lit from the left, a soft grey on its shaded side
  float column = 0.8 - 0.32 * u - 0.12 * u * u;
  lit = clamp(mix(lit, column, 1.0 - relief), 0.0, 1.0);
  vec3 c = mix(vec3(0.68, 0.705, 0.75), vec3(0.975, 0.978, 0.985), lit);
  return vec4(c * a, a);
}

void main() {
  // picture coordinates (source pixels, y down); the canvas reaches above the picture for the smoke
  vec2 P = vec2(gl_FragCoord.x / uView.y, (uView.x - gl_FragCoord.y) / uView.z - uView.w);
  vec4 col = vec4(0.0);
  if (P.y >= 0.0) {
    vec3 m = texture2D(uMasks, P / uSize).rgb;
    vec2 d = vec2(0.0);
    if (m.r + m.g > 0.004 && uEase > 0.0) {
      // the wind blows from the right: a gust reaches the left side later, and
      // stronger patches of it travel across the scene with it
      float G = gustAgo((uSize.x - P.x) / 520.0) * (0.82 + 0.18 * snoise(P * 0.0035 + vec2(uAdv.z, 0.0)));
      // every tree has its own rhythm (phases vary slowly across the scene)
      vec3 ph = 3.1416 * vec3(snoise(P * 0.0045 + 3.1), snoise(P * 0.0045 + 17.3), snoise(P * 0.0045 + 41.7));
      float osc = 0.5 * sin(uSwayPh.x + ph.x) + 0.32 * sin(uSwayPh.y + ph.y) + 0.18 * sin(uSwayPh.z + ph.z);
      float bend = m.r * uAmp * 3.4 * (0.5 * G + 0.5 * osc * (0.35 + 0.65 * G));
      vec2 sway = vec2(-bend, 0.18 * abs(bend));
      // leaves: small irregular flutter carried by the wind
      float l1 = snoise(P * 0.036 + vec2(uAdv.x, 0.0));
      float l2 = snoise(P * 0.049 + vec2(23.1, -uAdv.y));
      float l3 = snoise(P * 0.026 + vec2(-0.7 * uAdv.y, 51.3));
      vec2 leaf = vec2(l1 + 0.5 * l2, 0.8 * l3 + 0.3 * l2) * m.g * uAmp * 0.75 * (0.35 + 0.65 * G);
      d = (sway + leaf) * uEase;
    }
    vec2 s = P - d;
    if (s.x >= 0.0 && s.y >= 0.0 && s.x <= uSize.x && s.y <= uSize.y) {
      // texel for pixel where nothing moves; crisp filtering where it moves or the picture is enlarged
      bool exact = dot(d, d) < 1e-6 && uBaseSize.x > uSize.x * uView.y - 0.5;
      col = exact ? texture2D(uBase, s / uSize) : sampleSharp(uBase, s / uSize, uBaseSize);
    }

    // rotors, back to front; trees (and for the first turbine the factory) stand in front of them
    for (int i = 0; i < 3; i++) {
      vec2 q = uHub[i] + uK[i] * (P - uHub[i]);
      vec4 blade = sampleRect(q, uBladeRect[i], uBladeUV[i]);
      if (i < 2) blade *= 1.0 - m.b;
      col = over(blade, col);
    }
    for (int i = 0; i < 3; i++) col = over(sampleRect(P, uCapRect[i], uCapUV[i]), col);
  }
  col = over(plume(P, uChimney[0], 0.0), col);
  col = over(plume(P, uChimney[1], 7.3), col);
  gl_FragColor = col;
}`;

// One pass of a separable Lanczos-3 downscale (premultiplied colour). The
// result is clamped to the texels under the kernel's main lobe, so edges come
// out as crisp as the browser's best image scaling but cannot ring or halo.
const DOWN = `
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uSrcSize;
uniform vec2 uDir;      // (1, 0) horizontal pass, (0, 1) vertical pass
uniform float uScale;   // destination / source along the pass, <= 1
float lanczos3(float x) {
  x = abs(x);
  if (x < 1e-4) return 1.0;
  if (x >= 3.0) return 0.0;
  float px = 3.14159265 * x;
  return 3.0 * sin(px) * sin(px / 3.0) / (px * px);
}
void main() {
  vec2 o = gl_FragCoord.xy;
  float along = dot(o, uDir);
  float c = along / uScale;                 // centre in source pixels (pixel centres at +0.5)
  vec2 other = o * (vec2(1.0) - uDir);
  vec4 acc = vec4(0.0);
  float wsum = 0.0;
  vec4 lo = vec4(1.0);
  vec4 hi = vec4(0.0);
  float base = floor(c);
  for (int k = -20; k <= 20; k++) {
    float xi = base + float(k) + 0.5;       // source pixel centre
    float x = (xi - c) * uScale;
    if (abs(x) >= 3.0) continue;
    if (xi < 0.0 || xi > dot(uSrcSize, uDir)) continue;
    vec2 pos = uDir * xi + other;
    vec4 t = texture2D(uSrc, pos / (uDir * uSrcSize + (vec2(1.0) - uDir) * uSrcSize));
    float w = lanczos3(x);
    acc += t * w;
    wsum += w;
    if (abs(x) < 1.0) {
      lo = min(lo, t);
      hi = max(hi, t);
    }
  }
  gl_FragColor = clamp(acc / wsum, lo, hi);
}`;

const EXT = 0.27; // canvas reaches this share of the picture height above it, for the smoke
const BASE_SPEED = 1.05; // rad/s

export function gust(t) {
  return 0.5 + 0.5 * (0.55 * Math.sin(0.31 * t) + 0.3 * Math.sin(0.73 * t + 1.1) + 0.15 * Math.sin(1.37 * t + 2.3));
}

const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const TAU = Math.PI * 2;
const wrap = (x, p) => x - p * Math.floor(x / p);

export async function createLiveHero({ host, scene, images, reducedMotion = false, onLive = () => {} }) {
  if (reducedMotion) return null;
  const canvas = document.createElement('canvas');
  canvas.className = 'scene-live';
  canvas.setAttribute('aria-hidden', 'true');
  const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false, preserveDrawingBuffer: false });
  if (!gl || !gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT)?.precision) return null;

  await Promise.all(Object.values(images).map((img) => (img.decode ? img.decode().catch(() => {}) : null)));

  const program = link(gl, VERT, FRAG);
  if (!program) return null;
  gl.useProgram(program);
  const loc = (n) => gl.getUniformLocation(program, n);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const W = scene.width;
  const H = scene.height;
  const turbines = scene.turbines;
  gl.uniform2f(loc('uSize'), W, H);
  const uView = loc('uView');
  gl.uniform2fv(loc('uHub'), turbines.flatMap((t) => t.hub));
  gl.uniform4fv(loc('uBladeRect'), turbines.flatMap((t) => t.blades));
  gl.uniform4fv(loc('uCapRect'), turbines.flatMap((t) => t.cap));
  gl.uniform4fv(loc('uChimney'), scene.chimneys.flatMap((c) => [c.x, c.y, c.r, c.d ?? 1]));
  gl.uniform1i(loc('uBase'), 0);
  gl.uniform1i(loc('uAtlas'), 1);
  gl.uniform1i(loc('uMasks'), 2);
  const uEase = loc('uEase');
  const uSmokeAge = loc('uSmokeAge');
  const uAmp = loc('uAmp');
  const uGustPh = loc('uGustPh');
  const uSwayPh = loc('uSwayPh');
  const uAdv = loc('uAdv');
  const uCyc = loc('uCyc');
  const uEvolve = loc('uEvolve');
  const uK = loc('uK');

  const minv = turbines.map((t) => invert(t.m));

  // ---------------------------------------------------------------- textures at screen resolution
  // The picture is brought to the exact pixel size of the canvas once, on the
  // GPU, with a Lanczos-3 filter: the static parts are then drawn texel for
  // pixel, as sharp as the picture allows.
  const down = link(gl, VERT, DOWN);
  if (down && gl.getAttribLocation(down, 'aPos') !== aPos) {
    gl.enableVertexAttribArray(gl.getAttribLocation(down, 'aPos'));
    gl.vertexAttribPointer(gl.getAttribLocation(down, 'aPos'), 2, gl.FLOAT, false, 0, 0);
  }
  const fbo = gl.createFramebuffer();
  let scale = 0;

  function texture(unit, source, w, h, premultiply) {
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (source) {
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiply);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    return tex;
  }

  function pass(src, srcW, srcH, dst, dstW, dstH, dir, sc) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, dst, 0);
    gl.viewport(0, 0, dstW, dstH);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, src);
    gl.uniform1i(gl.getUniformLocation(down, 'uSrc'), 3);
    gl.uniform2f(gl.getUniformLocation(down, 'uSrcSize'), srcW, srcH);
    gl.uniform2f(gl.getUniformLocation(down, 'uDir'), dir[0], dir[1]);
    gl.uniform1f(gl.getUniformLocation(down, 'uScale'), sc);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // source image (any size) -> texture of exactly dstW x dstH, premultiplied
  function scaled(source, srcW, srcH, dstW, dstH, unit) {
    if (!down || (dstW >= srcW && dstH >= srcH)) return { tex: texture(unit, source, srcW, srcH, true), w: srcW, h: srcH };
    const full = texture(3, source, srcW, srcH, true);
    const tmp = texture(3, null, dstW, srcH);
    const out = texture(3, null, dstW, dstH);
    gl.useProgram(down);
    pass(full, srcW, srcH, tmp, dstW, srcH, [1, 0], dstW / srcW);
    pass(tmp, dstW, srcH, out, dstW, dstH, [0, 1], dstH / srcH);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteTexture(full);
    gl.deleteTexture(tmp);
    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, out);
    return { tex: out, w: dstW, h: dstH };
  }

  let maskTex = null;
  const live = [];
  function buildTextures(sx, picW, picH) {
    while (live.length) gl.deleteTexture(live.pop());
    const base = scaled(images.base, W, H, picW, picH, 0);
    live.push(base.tex);
    gl.uniform2f(loc('uBaseSize'), base.w, base.h);
    // blades and caps in one atlas at full resolution, 6 px apart, then scaled like the picture
    const parts = [
      ...turbines.map((t) => ({ img: images[`blades-${t.id}`], rect: t.blades })),
      ...turbines.map((t) => ({ img: images[`caps-${t.id}`], rect: t.cap })),
    ];
    const pad = 6;
    let x = pad;
    let hMax = 0;
    for (const p of parts) {
      p.x = x;
      x += p.rect[2] + pad;
      hMax = Math.max(hMax, p.rect[3]);
    }
    const full = document.createElement('canvas');
    full.width = x;
    full.height = hMax + pad * 2;
    const g = full.getContext('2d');
    for (const p of parts) g.drawImage(p.img, p.x, pad, p.rect[2], p.rect[3]);
    const ps = Math.min(1, sx);
    const aw = Math.max(1, Math.round(full.width * ps));
    const ah = Math.max(1, Math.round(full.height * ps));
    const atlas = scaled(full, full.width, full.height, aw, ah, 1);
    live.push(atlas.tex);
    gl.uniform2f(loc('uAtlasSize'), atlas.w, atlas.h);
    const uv = (p) => [p.x / full.width, pad / full.height, p.rect[2] / full.width, p.rect[3] / full.height];
    gl.uniform4fv(loc('uBladeUV'), parts.slice(0, 3).flatMap(uv));
    gl.uniform4fv(loc('uCapUV'), parts.slice(3).flatMap(uv));
    if (!maskTex) maskTex = texture(2, images.masks, W, H, false);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, base.tex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, atlas.tex);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, maskTex);
  }

  // ---------------------------------------------------------------- size
  host.appendChild(canvas);
  let cssW = 0;
  let resizeTimer = 0;
  // The still picture and the canvas share one box that starts and ends on whole
  // device pixels, so both show the picture texel for pixel and the switch from
  // one to the other cannot shift anything.
  const still = host.querySelector('.scene-still');
  let device = null; // the canvas' real size in device pixels, when the browser reports it
  function resize() {
    const r = host.getBoundingClientRect();
    if (!r.width) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const left = r.left + scrollX;
    const top = r.top + scrollY;
    const x0 = Math.ceil(left * dpr - 1e-4) / dpr - left;
    const y0 = Math.ceil(top * dpr - 1e-4) / dpr - top;
    const pxW = Math.floor((r.width - x0) * dpr + 1e-4);
    const sx0 = pxW / W;
    const extPx = Math.round(H * EXT * sx0);
    const picH0 = Math.round(H * sx0);
    const w = pxW / dpr;
    if (still) Object.assign(still.style, { left: `${x0}px`, top: `${y0}px`, width: `${w}px`, height: `${picH0 / dpr}px`, right: 'auto', bottom: 'auto' });
    Object.assign(canvas.style, { left: `${x0}px`, top: `${y0 - extPx / dpr}px`, width: `${w}px`, height: `${(picH0 + extPx) / dpr}px` });
    // the backing store matches the device pixels the canvas really covers, so
    // the browser shows it 1:1 and never resamples it
    const cw = device && Math.abs(device[0] - pxW) <= 1 ? device[0] : pxW;
    const ch = device && Math.abs(device[1] - picH0 - extPx) <= 1 ? device[1] : picH0 + extPx;
    const picH = ch - extPx;
    const sx = cw / W;
    const sy = picH / H;
    if (canvas.width !== cw) canvas.width = cw;
    if (canvas.height !== ch) canvas.height = ch;
    gl.useProgram(program);
    gl.uniform4f(uView, ch, sx, sy, extPx / sy);
    // on small screens the same breeze gets a little more room, so it is still felt
    gl.uniform1f(uAmp, Math.min(1.6, Math.max(1, Math.sqrt(0.5 / (w / W)))));
    if (Math.abs(sx - scale) > 1e-6 || picH !== cssW) {
      scale = sx;
      cssW = picH;
      buildTextures(sx, cw, picH);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    draw(performance.now());
  }

  // ---------------------------------------------------------------- time
  // The animation's own clock only runs while the scene is drawn, so after the
  // tab was hidden or the hero scrolled away everything continues exactly where
  // it was: no jump in the smoke, the plants or the turbines.
  let clock = 0;
  let last = performance.now();
  const angle = turbines.map(() => 0);
  const kBuf = new Float32Array(12);

  // turbine angles follow the wind: integrate their speed over time
  function advance(now) {
    const dt = Math.min(1 / 15, Math.max(0, (now - last) / 1000));
    last = now;
    clock += dt;
    const ease = smooth(clock / 2.8);
    turbines.forEach((tb, i) => {
      // spin up gently, then follow the gusts (they reach the left turbines later)
      const g = gust(clock + 40 - (W - tb.hub[0]) / 520);
      angle[i] += BASE_SPEED * tb.speed * (0.82 + 0.36 * g) * ease * dt;
    });
  }

  function draw(now) {
    advance(now);
    const t = clock;
    const ease = smooth(t / 2.8);
    turbines.forEach((tb, i) => {
      const a = -angle[i];
      const c = Math.cos(a);
      const sn = Math.sin(a);
      // K = M R(-angle) M^-1: where a rotor point now on screen came from in the picture
      const m = tb.m;
      const r = [c, sn, -sn, c]; // column-major 2x2 [[c,-s],[s,c]]
      const mr = mul(m, r);
      const k = mul(mr, minv[i]);
      kBuf.set([k[0], k[1], k[2], k[3]], i * 4);
    });
    gl.uniformMatrix2fv(uK, false, kBuf);
    const T = t + 40;
    gl.uniform4f(uGustPh, wrap(0.31 * T, TAU), wrap(0.73 * T + 1.1, TAU), wrap(1.37 * T + 2.3, TAU), wrap(0.42 * T, TAU));
    gl.uniform4f(uSwayPh, wrap(1.9 * T, TAU), wrap(2.7 * T + 0.7, TAU), wrap(1.3 * T + 2.1, TAU), 0);
    gl.uniform4f(uAdv, wrap(0.9 * T, 289), wrap(0.6 * T, 289), wrap(0.3 * T, 289), wrap(24 * 0.011 * T, 289));
    const c0 = T / 4;
    const c1 = T / 4 + 0.5;
    gl.uniform4f(uCyc, c0 - Math.floor(c0), Math.floor(c0) % 1000, c1 - Math.floor(c1), Math.floor(c1) % 1000);
    gl.uniform1f(uEvolve, wrap(0.03 * T, 289));
    gl.uniform1f(uEase, ease);
    gl.uniform1f(uSmokeAge, Math.min(t, 100));
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  let raf = 0;
  let visible = true;
  let first = true;
  // A device that cannot keep up draws every other display frame (30 fps)
  // instead of dropping frames unevenly; resolution and detail stay the same.
  let pace = 0;
  let lastDraw = 0;
  const intervals = [];
  function frame(now) {
    raf = 0;
    if (pace && now - lastDraw < pace) {
      loop();
      return;
    }
    if (lastDraw) {
      intervals.push(now - lastDraw);
      if (intervals.length > 90) intervals.shift();
      if (!pace && intervals.length === 90 && intervals.reduce((a, b) => a + b, 0) / 90 > 26) pace = 30;
    }
    lastDraw = now;
    draw(now);
    if (first) {
      first = false;
      onLive();
    }
    loop();
  }
  function loop() {
    if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame);
  }
  new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
    if (visible) {
      last = performance.now();
      lastDraw = 0;
      loop();
    }
  }).observe(host);
  document.addEventListener('visibilitychange', () => {
    last = performance.now();
    lastDraw = 0;
    loop();
  });
  new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 120);
  }).observe(host);
  try {
    new ResizeObserver((entries) => {
      const box = entries[0].devicePixelContentBoxSize?.[0];
      if (!box) return;
      const next = [box.inlineSize, box.blockSize];
      if (!device || next[0] !== device[0] || next[1] !== device[1]) {
        device = next;
        if (next[0] !== canvas.width || next[1] !== canvas.height) resize();
      }
    }).observe(canvas, { box: 'device-pixel-content-box' });
  } catch {
    /* older browsers: the computed size is used */
  }
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    cancelAnimationFrame(raf);
    raf = 0;
    visible = false;
    canvas.remove();
    host.classList.remove('is-live');
  });

  resize();
  loop();
  return {
    canvas,
    pause() {
      visible = false;
      cancelAnimationFrame(raf);
      raf = 0;
    },
    // for checks: draw the frame at a given number of seconds after start
    renderAt(seconds) {
      angle.fill(0);
      clock = 0;
      last = 0;
      let n = 0;
      for (; n + 1000 / 60 < seconds * 1000; n += 1000 / 60) advance(n);
      draw(seconds * 1000);
    },
  };
}

// 2x2 matrices: m given row-major [[a,b],[c,d]] from JSON, results column-major for WebGL
function invert(m) {
  const [[a, b], [c, d]] = m;
  const det = a * d - b * c;
  return [d / det, -c / det, -b / det, a / det]; // column-major
}

function mul(x, y) {
  // x: row-major nested or column-major flat; y: column-major flat
  const xa = Array.isArray(x[0]) ? [x[0][0], x[1][0], x[0][1], x[1][1]] : x;
  return [
    xa[0] * y[0] + xa[2] * y[1],
    xa[1] * y[0] + xa[3] * y[1],
    xa[0] * y[2] + xa[2] * y[3],
    xa[1] * y[2] + xa[3] * y[3],
  ];
}

function link(gl, vs, fs) {
  const make = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('[simland] shader:', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  };
  const v = make(gl.VERTEX_SHADER, vs);
  const f = make(gl.FRAGMENT_SHADER, fs);
  if (!v || !f) return null;
  const p = gl.createProgram();
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.warn('[simland] program:', gl.getProgramInfoLog(p));
    return null;
  }
  return p;
}
