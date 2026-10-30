// The hero image, alive. The client's picture stays exactly where it is and
// keeps its size, angle and framing (no zoom, no camera, no parallax); one
// WebGL pass redraws it each frame with only these parts moving:
//
//   turbines  the blades cut from the picture turn inside each rotor's own
//             plane (an affine map fitted to the three blade tips), so the
//             two turbines seen at an angle turn in correct perspective
//   smoke     white-grey steam from each chimney mouth, ray-marched through a
//             soft volume: a dense column that breaks into billows, spreads,
//             drifts with the wind it has felt and thins out
//   plants    crowns sway from their trunks, leaves flutter, thin branches,
//             bushes, flowers and grass move slightly; trunks, buildings,
//             cable, text, panels, pylon and wires never move
//
// One wind drives everything: a slow swell with gusts about every 2.5 s that
// travel from right to left (the turbines face right-front). The rotors speed
// up a little, the crowns lean, the grass bends and the plumes drift with it.
// Moving parts are filtered straight from the full-resolution layers at their
// exact position, so they stay as crisp as the still picture.
//
// Without WebGL, or with reduced motion, the still layers stay on screen and
// show the picture exactly as supplied.

// The wind, 0..1: W0 plus these terms, each [rad/s, amplitude, phase]. Two
// close gust frequencies give a gust every ~2.5 s whose strength comes and
// goes; the shader evaluates the same sum (WF, WA), so everything agrees.
const WIND = [
  [0.41, 0.12, 0.0],
  [2.27, 0.17, 1.3],
  [2.83, 0.09, 4.1],
  [1.21, 0.06, 2.6],
];
const W0 = 0.5;
const GUST_SPEED = 650; // picture px per second, from the right
const ROTOR_LAG = 1.0; // s: heavy rotors follow the wind slowly

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
uniform vec4 uView; // canvas height in px, px per picture px (x, y), picture rows above the picture top
uniform sampler2D uBase;
uniform sampler2D uHi;
uniform sampler2D uAtlas;
uniform sampler2D uMasks;
uniform vec2 uSize;
uniform vec2 uBaseSize;
uniform vec2 uHiSize;
uniform float uHiS;
uniform vec2 uAtlasSize;
uniform float uAtlasS;
uniform float uEase;
uniform float uSmokeAge;
uniform float uAmp;
// every clock-driven value arrives already wrapped: phases mod 2 pi, noise
// offsets mod an exact period of the noise along the direction they move in,
// so nothing jumps and precision never degrades in a long run
uniform vec4 uWind;
uniform vec4 uSway;
uniform vec4 uFlow;
uniform vec4 uSmoke;
uniform vec2 uHub[3];
uniform mat2 uK[3];
uniform vec4 uBladeRect[3];
uniform vec4 uBladeUV[3];
uniform vec4 uCapRect[3];
uniform vec4 uCapUV[3];
uniform vec4 uChimney[2];

// 2D and 3D simplex noise: Ian McEwan, Ashima Arts, and Stefan Gustavson (webgl-noise), MIT License.
// Lattice indices are taken mod 289, so snoise(v + k(1,1)) repeats for k = 289/sqrt(3)
// and snoise3(v + k(1,1,1)) for k = 144.5: time offsets move along those directions.
vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
vec4 permute(vec4 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
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
float snoise3(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod(i, 289.0);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  vec3 ns = 0.142857142857 * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = inversesqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

// turns the picture so that an offset along (1,1) moves a noise pattern to the left
const mat2 ROT = mat2(0.70710678, 0.70710678, -0.70710678, 0.70710678);

// the wind (same terms as WIND in JS) as it was 'delay' seconds ago, felt
// through a lag of 'tau' seconds
const vec4 WF = vec4(0.41, 2.27, 2.83, 1.21);
const vec4 WA = vec4(0.12, 0.17, 0.09, 0.06);
float windAt(float delay, float tau) {
  vec4 wt = WF * tau;
  return 0.5 + dot(WA * inversesqrt(1.0 + wt * wt), sin(uWind - WF * delay - atan(wt)));
}
// the mean wind over the 'age' seconds that ended 'delay' seconds ago
float windMean(float delay, float age) {
  vec4 x = max(WF * age * 0.5, vec4(1e-4));
  return 0.5 + dot(WA * sin(x) / x, sin(uWind - WF * (delay + age * 0.5)));
}

vec4 over(vec4 top, vec4 under) { return top + under * (1.0 - top.a); }

// Catmull-Rom sampling clamped to the four nearest texels, for enlarging:
// as crisp as the picture allows, and it cannot ring or form halos.
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

float lanczos2(float x) {
  x = abs(x);
  if (x < 1e-4) return 1.0;
  if (x >= 2.0) return 0.0;
  float px = 3.14159265 * x;
  return 2.0 * sin(px) * sin(px * 0.5) / (px * px);
}

// A moving or turning part, filtered straight from a full-resolution layer to
// the screen at its exact position: Lanczos-2, clamped to the texels under the
// main lobe (no ringing, no halo). Shifting a picture that was already brought
// to screen size would soften it a second time. pos is in texels; s is screen
// px per texel, 0.4 .. 1 (the layer has at most 2.5 times the screen resolution).
vec4 sampleFine(sampler2D tex, vec2 pos, vec2 size, float s) {
  if (s > 0.999) return sampleSharp(tex, pos / size, size);
  vec2 first = floor(pos - 2.0 / s - 0.5) + 0.5;
  // the horizontal weights are the same for every row
  float wx[12];
  for (int i = 0; i < 12; i++) wx[i] = lanczos2((first.x + float(i) - pos.x) * s);
  vec4 acc = vec4(0.0);
  float wsum = 0.0;
  vec4 lo = vec4(1.0);
  vec4 hi = vec4(0.0);
  for (int j = 0; j < 12; j++) {
    float ty = first.y + float(j);
    float dy = (ty - pos.y) * s;
    if (dy >= 2.0) break;
    float wy = lanczos2(dy);
    for (int i = 0; i < 12; i++) {
      float tx = first.x + float(i);
      float dx = (tx - pos.x) * s;
      if (dx >= 2.0) break;
      float w = wx[i] * wy;
      vec4 t = texture2D(tex, vec2(tx, ty) / size);
      acc += t * w;
      wsum += w;
      if (abs(dx) < 1.0 && abs(dy) < 1.0) {
        lo = min(lo, t);
        hi = max(hi, t);
      }
    }
  }
  return clamp(acc / wsum, lo, hi);
}

vec4 sampleRect(vec2 q, vec4 rect, vec4 uv) {
  vec2 f = (q - rect.xy) / rect.zw;
  if (f.x < -0.02 || f.y < -0.02 || f.x > 1.02 || f.y > 1.02) return vec4(0.0);
  return sampleFine(uAtlas, (uv.xy + f * uv.zw) * uAtlasSize, uAtlasSize, uAtlasS);
}

// ---------------------------------------------------------------- steam
// Each plume is a soft volume around a rising, drifting axis. Its detail is
// noise carried up with the smoke: features rise at V0 (1 + h / H1) and grow
// as F0 (1 + h / H1), an exact transport, so the pattern never compresses or
// repeats. The noise turns slowly against itself (a second, slower warp
// field), so the billows keep changing shape as they rise.
const float V0 = 22.0;   // px/s at the mouth
const float H1 = 360.0;  // px: speed and feature size double over this height
const float F0 = 16.0;   // px: billow size at the mouth
// noise space: the plume's up axis maps to (1,1,1), the direction its time offsets move in
const mat3 M1 = mat3(0.70710678, -0.70710678, 0.0, 0.57735027, 0.57735027, 0.57735027, -0.40824829, -0.40824829, 0.81649658);
const mat3 M2 = mat3(0.40824829, 0.40824829, -0.81649658, 0.57735027, 0.57735027, 0.57735027, 0.70710678, -0.70710678, 0.0);
const vec3 SUN = vec3(-0.62, 0.55, 0.56);  // from the upper left, in front: x right, y up, z to the viewer

vec4 plume(vec2 P, vec4 ch, float seed) {
  // height above the middle of the mouth (the rim ellipse sits about 3 px below the top edge)
  float h = ch.y + 3.0 - P.y;
  if (h < -4.0 || h > 470.0) return vec4(0.0);
  float hp = max(h, 0.0);
  float grow = 1.0 + hp / H1;
  float yn = H1 / F0 * log(grow);   // noise height of this parcel
  float age = yn * F0 / V0;          // seconds since it left the mouth
  if (age > uSmokeAge) return vec4(0.0);  // only smoke made since the page opened
  float R = ch.z * 0.9 + 0.17 * hp;  // radius of the plume
  // the axis: carried left by every gust the smoke has felt since it left (it
  // takes a moment to pick up the wind), plus a slow meander born at the mouth
  float delay = (uSize.x - ch.x) / 650.0;
  float drift = 20.0 * age * windMean(delay, age) * age / (age + 1.6);
  float meander = 0.42 * R * smoothstep(0.4, 4.0, age) * snoise(vec2(uSmoke.w - 0.11 * age) + vec2(seed, -1.7 * seed));
  float x = P.x - (ch.x - drift + meander);
  float u = x / R;
  if (abs(u) > 1.5) return vec4(0.0);

  float F = F0 * grow;
  float rough = smoothstep(2.0, 60.0, hp);  // fresh steam at the mouth is smooth
  vec3 sd = vec3(seed, 2.3 * seed, -seed);
  // warp: a slower field than the billows, so their shapes keep changing
  vec3 w0 = M2 * vec3(x / F, yn, 0.0) * 0.5 + sd;
  vec2 warp = vec2(snoise3(w0 - uSmoke.z), snoise3(w0 + vec3(31.4, -12.1, 7.7) - uSmoke.z)) * 0.6 * rough;
  // optical depth across the middle: dense at the exit, thinner as it spreads and evaporates
  float od = 3.4 * pow(ch.z * 0.9 / R, 0.8) * exp(-age / 15.0) * ch.w;
  float sigma = od / (1.5 * R);
  float c = R * sqrt(max(2.25 - u * u, 0.0));  // half chord through the envelope
  float dz = 2.0 * c / 8.0;
  vec3 col = vec3(0.0);
  float T = 1.0;
  vec2 sunXZ = normalize(SUN.xz);
  float sunLen = length(SUN.xz);
  for (int k = 0; k < 8; k++) {
    float z = c - dz * (float(k) + 0.5);  // front to back
    float rho = length(vec2(x, z)) / R;
    if (rho > 1.2 + 0.34 * rough) continue;  // outside the envelope whatever the noise
    vec3 q = vec3(x / F + warp.x, yn + warp.y, z / F);
    vec3 p = M1 * q + sd;
    float n1 = snoise3(p - uSmoke.x);
    float n = 0.74 * n1 + 0.26 * snoise3(p * 2.1 + vec3(17.0, 3.0, -9.0) - uSmoke.y);
    float dens = (1.0 - smoothstep(0.45, 1.2, rho - 0.34 * n * rough)) * clamp(0.62 + 0.8 * n * rough, 0.0, 1.6);
    if (dens < 0.002) continue;
    // light: one step towards the sun through the billows (their sunny sides are
    // bright, their far sides and folds soft grey), the plume's own depth and
    // sky light from outside; steam scatters light many times, so it never goes dark
    float dl = 0.6 * F;
    vec2 pl = vec2(x, z) + SUN.xz * dl;
    float nl = snoise3(M1 * (q + SUN * 0.6) + sd - uSmoke.x);
    float densL = (1.0 - smoothstep(0.45, 1.2, length(pl) / R - 0.34 * nl * rough)) * clamp(0.62 + 0.8 * nl * rough, 0.0, 1.6);
    vec2 pq = vec2(x, z);
    float b = dot(pq, sunXZ);
    float toSun = (-b + sqrt(max(b * b - dot(pq, pq) + 1.44 * R * R, 0.0))) / sunLen;
    float sun = exp(-sigma * (0.9 * densL * dl + 0.12 * toSun));
    float sky = exp(-sigma * max(1.2 * R - length(pq), 0.0) * 0.3);
    // relief from the large billows only (the fine octave would draw thin lines)
    float relief = clamp((nl - n1) * 0.55, -1.0, 1.0) * rough * smoothstep(1.2, 0.6, rho);
    float lit = clamp(0.55 * sun + 0.3 * sky + 0.17 - 0.28 * relief, 0.0, 1.0);
    vec3 cs = mix(vec3(0.71, 0.73, 0.77), vec3(0.958, 0.961, 0.968), lit);
    float a = 1.0 - exp(-sigma * dens * dz);
    col += T * a * cs;
    T *= 1.0 - a;
  }
  float fade = smoothstep(-1.5, 3.5, h)                          // starts exactly at the mouth
    * clamp((uSmokeAge - age) * 1.2, 0.0, 1.0)                   // the first smoke's soft front
    * smoothstep(-uView.w, -uView.w + 80.0, P.y);                // always gone before the canvas edge
  return vec4(col, 1.0 - T) * fade;
}

void main() {
  // picture coordinates (source pixels, y down); the canvas reaches above the picture for the smoke
  vec2 P = vec2(gl_FragCoord.x / uView.y, (uView.x - gl_FragCoord.y) / uView.z - uView.w);
  vec4 col = vec4(0.0);
  if (P.y >= 0.0) {
    vec3 m = texture2D(uMasks, P / uSize).rgb;
    vec2 d = vec2(0.0);
    if (m.r + m.g > 0.004 && uEase > 0.0) {
      // the wind arrives from the right: the left side feels each gust later,
      // and stronger and weaker patches of it drift across with it
      float delay = (uSize.x - P.x) / 650.0;
      float patch = 0.85 + 0.15 * snoise(ROT * P * 0.0035 + uFlow.w);
      float wt = windAt(delay, 0.45) * patch;  // crowns answer a moment late
      float wg = windAt(delay, 0.12) * patch;  // leaves and grass at once
      // crowns lean with the wind and rock at their own pace (phases vary slowly across the scene)
      vec3 ph = 3.1416 * vec3(snoise(P * 0.0045 + 3.1), snoise(P * 0.0045 + 17.3), snoise(P * 0.0045 + 41.7));
      float osc = 0.5 * sin(uSway.x + ph.x) + 0.32 * sin(uSway.y + ph.y) + 0.18 * sin(uSway.z + ph.z);
      float bend = m.r * uAmp * 3.6 * ((wt - 0.32) + 0.38 * osc * (0.3 + wt));
      vec2 sway = vec2(-bend, 0.18 * abs(bend));
      // leaves: small irregular flutter carried along by the wind
      vec2 fp = ROT * P;
      float l1 = snoise(fp * 0.036 + uFlow.x);
      float l2 = snoise(fp * 0.049 + 23.1 + uFlow.y);
      float l3 = snoise(fp * 0.026 + 51.3 + uFlow.z);
      vec2 leaf = vec2(l1 + 0.5 * l2, 0.8 * l3 + 0.3 * l2) * m.g * uAmp * 0.7 * (0.2 + wg);
      // grass and bushes bend with each gust and come back
      float lean = m.g * uAmp * 0.8 * (wg - 0.4);
      d = (sway + leaf - vec2(lean, 0.0)) * uEase;
    }
    vec2 s = P - d;
    if (s.x >= 0.0 && s.y >= 0.0 && s.x <= uSize.x && s.y <= uSize.y) {
      // texel for pixel where nothing moves; straight from the full-resolution layer where it moves
      bool exact = dot(d, d) < 1e-6 && uBaseSize.x > uSize.x * uView.y - 0.5;
      col = exact ? texture2D(uBase, s / uSize) : sampleFine(uHi, s / uSize * uHiSize, uHiSize, uHiS);
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
  // the second chimney stands further back: its plume is drawn first
  col = over(plume(P, uChimney[1], 7.3), col);
  col = over(plume(P, uChimney[0], 0.0), col);
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

const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const TAU = Math.PI * 2;
const wrap = (x, p) => x - p * Math.floor(x / p);
const P2 = 289 / Math.sqrt(3); // period of snoise along (1,1)
const P3 = 144.5; // period of snoise3 along (1,1,1)

// the wind at time t, as it was 'delay' seconds ago, felt through a lag of 'tau' seconds
export function wind(t, delay = 0, tau = 0) {
  let w = W0;
  for (const [f, a, p] of WIND) w += (a / Math.hypot(1, f * tau)) * Math.sin(f * (t - delay) + p - Math.atan(f * tau));
  return w;
}

// the shader's clock-driven uniforms at scene time T, every value wrapped
export function clockUniforms(T) {
  const r = 22 / 16; // smoke noise rises V0 / F0 units per second
  return {
    uWind: WIND.map(([f, , p]) => wrap(f * T + p, TAU)),
    uSway: [wrap(2.3 * T, TAU), wrap(3.1 * T + 0.7, TAU), wrap(1.5 * T + 2.1, TAU), 0],
    // leaf noises drift left at 40-55 px/s, gust patches at the gust speed
    uFlow: [wrap(1.4 * T, P2), wrap(1.1 * T, P2), wrap(0.9 * T, P2), wrap((GUST_SPEED * 0.0035 * T) / Math.SQRT2, P2)],
    // billows (two octaves), the slower warp, the meander born at the mouth
    uSmoke: [wrap((r * T) / Math.sqrt(3), P3), wrap((2.1 * r * T) / Math.sqrt(3), P3), wrap((0.5 * 0.75 * r * T) / Math.sqrt(3), P3), wrap(0.11 * T, P2)],
  };
}

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
  gl.uniform1i(loc('uHi'), 3);
  const uEase = loc('uEase');
  const uSmokeAge = loc('uSmokeAge');
  const uAmp = loc('uAmp');
  const clockLoc = Object.fromEntries(['uWind', 'uSway', 'uFlow', 'uSmoke'].map((n) => [n, loc(n)]));
  const uK = loc('uK');

  const minv = turbines.map((t) => invert(t.m));

  // ---------------------------------------------------------------- textures
  // The picture is brought to the exact pixel size of the canvas once, on the
  // GPU, with a Lanczos-3 filter: the static parts are then drawn texel for
  // pixel, as sharp as the picture allows. Moving parts are filtered from a
  // copy at full resolution (or 2.5 times the screen resolution, when that is less).
  const down = link(gl, VERT, DOWN);
  if (down && gl.getAttribLocation(down, 'aPos') !== aPos) {
    gl.enableVertexAttribArray(gl.getAttribLocation(down, 'aPos'));
    gl.vertexAttribPointer(gl.getAttribLocation(down, 'aPos'), 2, gl.FLOAT, false, 0, 0);
  }
  const fbo = gl.createFramebuffer();
  const TMP = 4; // texture unit for intermediate work
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
    gl.activeTexture(gl.TEXTURE0 + TMP);
    gl.bindTexture(gl.TEXTURE_2D, src);
    gl.uniform1i(gl.getUniformLocation(down, 'uSrc'), TMP);
    gl.uniform2f(gl.getUniformLocation(down, 'uSrcSize'), srcW, srcH);
    gl.uniform2f(gl.getUniformLocation(down, 'uDir'), dir[0], dir[1]);
    gl.uniform1f(gl.getUniformLocation(down, 'uScale'), sc);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // source image (any size) -> texture of exactly dstW x dstH, premultiplied
  function scaled(source, srcW, srcH, dstW, dstH, unit) {
    if (!down || (dstW >= srcW && dstH >= srcH)) return { tex: texture(unit, source, srcW, srcH, true), w: srcW, h: srcH };
    const full = texture(TMP, source, srcW, srcH, true);
    const tmp = texture(TMP, null, dstW, srcH);
    const out = texture(TMP, null, dstW, dstH);
    gl.useProgram(down);
    pass(full, srcW, srcH, tmp, dstW, srcH, [1, 0], dstW / srcW);
    pass(tmp, dstW, srcH, out, dstW, dstH, [0, 1], dstH / srcH);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteTexture(full);
    gl.deleteTexture(tmp);
    gl.useProgram(program);
    return { tex: out, w: dstW, h: dstH };
  }

  let maskTex = null;
  const live = [];
  function buildTextures(sx, picW, picH) {
    while (live.length) gl.deleteTexture(live.pop());
    const base = scaled(images.base, W, H, picW, picH, 0);
    live.push(base.tex);
    gl.uniform2f(loc('uBaseSize'), base.w, base.h);
    // the full-resolution copy for moving plants (2.5 times the screen size at most)
    const hs = Math.min(1, 2.5 * sx);
    const hi = scaled(images.base, W, H, Math.round(W * hs), Math.round(H * hs), 3);
    live.push(hi.tex);
    gl.uniform2f(loc('uHiSize'), hi.w, hi.h);
    gl.uniform1f(loc('uHiS'), (sx * W) / hi.w);
    // blades and caps in one atlas, 10 px apart (more than the filter reaches), scaled the same way
    const parts = [
      ...turbines.map((t) => ({ img: images[`blades-${t.id}`], rect: t.blades })),
      ...turbines.map((t) => ({ img: images[`caps-${t.id}`], rect: t.cap })),
    ];
    const pad = 10;
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
    const aw = Math.max(1, Math.round(full.width * hs));
    const ah = Math.max(1, Math.round(full.height * hs));
    const atlas = scaled(full, full.width, full.height, aw, ah, 1);
    live.push(atlas.tex);
    gl.uniform2f(loc('uAtlasSize'), atlas.w, atlas.h);
    gl.uniform1f(loc('uAtlasS'), (sx * full.width) / atlas.w);
    const uv = (p) => [p.x / full.width, pad / full.height, p.rect[2] / full.width, p.rect[3] / full.height];
    gl.uniform4fv(loc('uBladeUV'), parts.slice(0, 3).flatMap(uv));
    gl.uniform4fv(loc('uCapUV'), parts.slice(3).flatMap(uv));
    if (!maskTex) maskTex = texture(2, images.masks, W, H, false);
    for (const [unit, tex] of [[0, base.tex], [1, atlas.tex], [2, maskTex], [3, hi.tex]]) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
    }
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

  // turbine angles: integrate a speed that follows the wind with a lag (heavy
  // rotors never jump), each rotor feeling a gust when it reaches its hub
  function step(dt) {
    clock += dt;
    const ease = smooth(clock / 2.8);
    turbines.forEach((tb, i) => {
      const g = wind(clock + 40, (W - tb.hub[0]) / GUST_SPEED, ROTOR_LAG);
      angle[i] = wrap(angle[i] + BASE_SPEED * tb.speed * (0.8 + 0.4 * g) * ease * dt, TAU);
    });
  }
  function advance(now) {
    let dt = Math.min(1 / 15, Math.max(0, (now - last) / 1000));
    last = now;
    while (dt > 1e-9) {
      const h = Math.min(dt, 1 / 60);
      step(h);
      dt -= h;
    }
  }

  function draw(now) {
    advance(now);
    const t = clock;
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
    const u = clockUniforms(t + 40);
    for (const n in clockLoc) gl.uniform4fv(clockLoc[n], u[n]);
    gl.uniform1f(uEase, smooth(t / 2.8));
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
      const n = Math.floor(seconds * 60 + 1e-6);
      for (let i = 0; i < n; i++) step(1 / 60);
      step(Math.max(0, seconds - n / 60));
      last = performance.now();
      draw(last);
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
