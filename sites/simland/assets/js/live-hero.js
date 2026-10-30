// The hero image, alive. The client's picture stays exactly where it is and
// keeps its size and framing; one WebGL pass redraws it each frame with only
// these parts moving:
//
//   turbines  the blades cut from the picture turn inside each rotor's own
//             plane (an affine map fitted to the three blade tips), so the
//             two turbines seen at an angle turn in correct perspective
//   smoke     a soft white-grey plume from each chimney, rising and leaning
//             with the wind; continuous noise, no particles
//   plants    tree crowns sway a pixel or two above their ground line, leaves,
//             bushes and grass flutter less; buildings, cable, text, panels
//             and pylon have zero weight and never move
//
// One wind drives everything: gusts travel from right to left (the turbines
// face right-front), speed the rotors up, bend the plumes and the crowns.
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
uniform float uTime;
uniform float uEase;
uniform float uSmokeAge;
uniform vec2 uHub[3];
uniform mat2 uK[3];
uniform vec4 uBladeRect[3];
uniform vec4 uBladeUV[3];
uniform vec4 uCapRect[3];
uniform vec4 uCapUV[3];
uniform vec3 uChimney[2];

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
float fbm(vec2 p) {
  float f = 0.0;
  float a = 0.5;
  mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    f += a * snoise(p);
    p = r * p * 2.03 + 17.1;
    a *= 0.5;
  }
  return f;
}

// gust strength 0..1 at time t (same formula as gust() in JS)
float gust(float t) {
  return 0.5 + 0.5 * (0.55 * sin(0.31 * t) + 0.3 * sin(0.73 * t + 1.1) + 0.15 * sin(1.37 * t + 2.3));
}

vec4 over(vec4 top, vec4 under) { return top + under * (1.0 - top.a); }

vec4 sampleRect(vec2 q, vec4 rect, vec4 uv) {
  vec2 f = (q - rect.xy) / rect.zw;
  if (f.x < 0.0 || f.y < 0.0 || f.x > 1.0 || f.y > 1.0) return vec4(0.0);
  return texture2D(uAtlas, uv.xy + f * uv.zw);
}

float fbm4(vec2 p) {
  float f = 0.0;
  float a = 0.5;
  mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 4; i++) {
    f += a * snoise(p);
    p = r * p * 2.02 + 11.3;
    a *= 0.5;
  }
  return f;
}

float fbm3(vec2 p) {
  return 0.57 * snoise(p) + 0.29 * snoise(mat2(0.8, -0.6, 0.6, 0.8) * p * 2.02 + 11.3)
    + 0.14 * snoise(mat2(-0.28, -0.96, 0.96, -0.28) * p * 4.07 + 3.7);
}

// A plume of white-grey steam: round billows that swell as they rise, swirl
// slowly, lean with the wind they left the chimney in, and thin out. Lit from
// the sun side (upper left), softly grey on the other.
//
// The billows scroll upward with a scale that grows with height. Scrolling
// such a pattern for ever would compress it, so two copies take turns
// (a flow map): each scrolls for four seconds and fades out as the other,
// half a cycle apart, fades in; a fresh pattern starts while a copy is unseen.
vec2 billow(float dx, float h, float sc, float rise, float seed) {
  vec2 n = vec2(0.0);
  float wsum = 0.0;
  for (int k = 0; k < 2; k++) {
    float cyc = uTime / 4.0 + 0.5 * float(k);
    float ph = fract(cyc);
    float id = floor(cyc) + seed * 7.0 + float(k) * 3.0;
    vec2 off = vec2(fract(sin(id * 12.9898) * 43758.5453), fract(sin(id * 78.233) * 12543.1)) * 37.0;
    vec2 q = vec2(dx / sc, (h - ph * 4.0 * rise) / sc) + off;
    vec2 wq = q + vec2(fbm3(q * 0.45), fbm3(q * 0.45 + vec2(4.7, 2.1))) * 0.75;
    float w = 1.0 - abs(2.0 * ph - 1.0);
    n += vec2(fbm3(wq), fbm3(wq + vec2(-0.22, 0.26))) * w;
    wsum += w * w;
  }
  return n / sqrt(wsum);  // keeps the contrast steady through the crossfade
}

vec4 plume(vec2 P, vec3 ch, float seed) {
  float h = ch.y - P.y;
  if (h < -1.0 || h > 380.0) return vec4(0.0);
  float rise = 26.0;
  float g = gust(uTime - h / rise);
  float lean = (0.011 + 0.011 * g) * pow(max(h, 0.0), 1.3);
  float dx = P.x - (ch.x - lean);
  float w = ch.z * 0.7 + h * 0.33;
  float u = dx / w;
  if (abs(u) > 2.1) return vec4(0.0);
  vec2 n = billow(dx, h, 21.0 + h * 0.19, rise, seed);
  float core = exp(-u * u * 1.3);
  float d = smoothstep(0.04, 0.78, core * (0.7 + 0.62 * n.x) - h / 1100.0);
  float puff = 0.9 + 0.1 * sin(uTime * 0.42 + seed * 1.7);
  float grown = clamp((uSmokeAge * rise - h) / 30.0, 0.0, 1.0);  // only smoke made since the page opened
  float a = d * smoothstep(0.0, 7.0, h) * exp(-h / 230.0) * puff * grown * 0.86;
  float lit = clamp(0.5 - (n.y - n.x) * 2.2 - 0.14 * u + 0.2 * n.x, 0.0, 1.0);
  vec3 c = mix(vec3(0.73, 0.75, 0.79), vec3(0.975, 0.978, 0.985), lit);
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
      // wind from the right: a gust reaches the left side later
      float g = gust(uTime - (uSize.x - P.x) / 520.0);
      float osc = 0.6 * sin(uTime * 2.3 + P.x * 0.017 + P.y * 0.009) + 0.4 * sin(uTime * 1.45 + P.x * 0.011 + 1.7);
      vec2 sway = vec2(-1.0, 0.12) * m.r * (0.62 * g + 0.38 * osc * (0.35 + 0.65 * g)) * 2.3;
      vec2 leaf = vec2(snoise(P * 0.07 + vec2(uTime * 1.2, 0.0)), snoise(P * 0.07 + vec2(13.7, -uTime * 1.05)));
      leaf *= m.g * 0.6 * (0.45 + 0.55 * g);
      d = (sway + leaf) * uEase;
    }
    vec2 s = P - d;
    if (s.x >= 0.0 && s.y >= 0.0 && s.x <= uSize.x && s.y <= uSize.y) col = texture2D(uBase, s / uSize);

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

const EXT = 0.27; // canvas reaches this share of the picture height above it, for the smoke
const BASE_SPEED = 1.05; // rad/s

export function gust(t) {
  return 0.5 + 0.5 * (0.55 * Math.sin(0.31 * t) + 0.3 * Math.sin(0.73 * t + 1.1) + 0.15 * Math.sin(1.37 * t + 2.3));
}

const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

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
  gl.uniform3fv(loc('uChimney'), scene.chimneys.flatMap((c) => [c.x, c.y, c.r]));
  gl.uniform1i(loc('uBase'), 0);
  gl.uniform1i(loc('uAtlas'), 1);
  gl.uniform1i(loc('uMasks'), 2);
  const uTime = loc('uTime');
  const uEase = loc('uEase');
  const uSmokeAge = loc('uSmokeAge');
  const uK = loc('uK');

  const textures = [gl.createTexture(), gl.createTexture(), gl.createTexture()];
  const minv = turbines.map((t) => invert(t.m));

  // ---------------------------------------------------------------- textures at screen resolution
  // The picture is resampled once by the browser (same quality as an <img>)
  // to the exact pixel size of the canvas, so the static parts are drawn 1:1.
  let scale = 0;
  function upload(unit, source, premultiply) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, textures[unit]);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiply);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  function resampled(img, w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, c.width, c.height);
    return c;
  }

  function buildTextures(s) {
    upload(0, s >= 0.999 ? images.base : resampled(images.base, W * s, Math.round(H * s)), true);
    // blades and caps in one atlas, one row, 4 px apart
    const parts = [
      ...turbines.map((t) => ({ img: images[`blades-${t.id}`], rect: t.blades })),
      ...turbines.map((t) => ({ img: images[`caps-${t.id}`], rect: t.cap })),
    ];
    const ps = Math.min(1, s);
    const pad = 4;
    let x = pad;
    let hMax = 0;
    for (const p of parts) {
      p.w = Math.ceil(p.rect[2] * ps);
      p.h = Math.ceil(p.rect[3] * ps);
      p.x = x;
      x += p.w + pad;
      hMax = Math.max(hMax, p.h);
    }
    const atlas = document.createElement('canvas');
    atlas.width = x;
    atlas.height = hMax + pad * 2;
    const g = atlas.getContext('2d');
    g.imageSmoothingQuality = 'high';
    for (const p of parts) g.drawImage(p.img, p.x, pad, p.w, p.h);
    upload(1, atlas, true);
    const uv = (p) => [p.x / atlas.width, pad / atlas.height, (p.rect[2] * ps) / atlas.width, (p.rect[3] * ps) / atlas.height];
    gl.uniform4fv(loc('uBladeUV'), parts.slice(0, 3).flatMap(uv));
    gl.uniform4fv(loc('uCapUV'), parts.slice(3).flatMap(uv));
    upload(2, images.masks, false);
    for (let i = 0; i < 3; i++) {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, textures[i]);
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
  function resize() {
    const r = host.getBoundingClientRect();
    if (!r.width) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const left = r.left + scrollX;
    const top = r.top + scrollY;
    const x0 = Math.ceil(left * dpr - 1e-4) / dpr - left;
    const y0 = Math.ceil(top * dpr - 1e-4) / dpr - top;
    const pxW = Math.floor((r.width - x0) * dpr + 1e-4);
    const s = pxW / W;
    const picH = Math.round(H * s);
    const extPx = Math.round(H * EXT * s);
    const w = pxW / dpr;
    if (still) Object.assign(still.style, { left: `${x0}px`, top: `${y0}px`, width: `${w}px`, height: `${picH / dpr}px`, right: 'auto', bottom: 'auto' });
    canvas.width = pxW;
    canvas.height = picH + extPx;
    Object.assign(canvas.style, { left: `${x0}px`, top: `${y0 - extPx / dpr}px`, width: `${w}px`, height: `${(picH + extPx) / dpr}px` });
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform4f(uView, canvas.height, s, picH / H, extPx / (picH / H));
    if (Math.abs(s - scale) > 1e-3 || w !== cssW) {
      scale = s;
      cssW = w;
      buildTextures(s);
    }
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
      const g = gust(clock - (W - tb.hub[0]) / 520);
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
    gl.uniform1f(uTime, t + 40);
    gl.uniform1f(uEase, ease);
    gl.uniform1f(uSmokeAge, t);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  let raf = 0;
  let visible = true;
  let first = true;
  function frame(now) {
    raf = 0;
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
      loop();
    }
  }).observe(host);
  document.addEventListener('visibilitychange', () => {
    last = performance.now();
    loop();
  });
  new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 120);
  }).observe(host);
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
