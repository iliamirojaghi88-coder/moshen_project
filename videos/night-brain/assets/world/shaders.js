// GLSL for the 3D layer. Everything animated reads uniforms set from timeline
// time, so a frame is a pure function of t.

export const SIMPLEX3 = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

// Patches a MeshPhysicalMaterial into living tissue: wet micro-variation in
// roughness, a soft subsurface wrap, and neural impulses crawling along thin
// filaments (blue for anxiety, orange for alarm, gold for calm).
export function patchBrainMaterial(material, uniforms) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    // Low-frequency fields (activity fronts, hue) per vertex; only the fine
    // filaments are evaluated per pixel. Software GL pays per noise call.
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vObj;
varying float vFront, vHue, vMicro;
uniform float uTime;
${SIMPLEX3}`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
vObj = position;
vFront = smoothstep(0.32, 0.92, snoise(position * 16.0 + vec3(uTime * 0.31, -uTime * 0.17, 0.0)) * 0.5 + 0.5);
vHue = smoothstep(-0.4, 0.5, snoise(position * 7.0 + vec3(0.0, 0.0, uTime * 0.12)));
vMicro = fract(sin(dot(position, vec3(12.9898, 78.233, 37.719)) * 1000.0) * 43758.5453);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vObj;
varying float vFront, vHue, vMicro;
uniform float uTime, uAct, uOrange, uGold, uPulse, uRim, uSpark;
uniform vec3 uBlue, uAmber, uWarm;
${SIMPLEX3}`,
      )
      .replace(
        "#include <specularmap_fragment>",
        `#include <specularmap_fragment>
specularStrength *= 0.7 + 0.6 * vMicro; // wet, uneven sheen`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
{
  vec3 c = mix(uBlue, uAmber, clamp(vHue * uOrange + uOrange * 0.35, 0.0, 1.0));
  c = mix(c, uWarm, uGold);
  if (uAct + uSpark > 0.005) {
    float n1 = snoise(vObj * 48.0 + vec3(0.0, uTime * 0.42, uTime * 0.23));
    float vein = pow(1.0 - abs(n1), 22.0);
    float act = uAct * (1.0 + 1.4 * uPulse);
    totalEmissiveRadiance += c * vein * vFront * act * 3.2;
    // pinpoint sparks where filaments cross the busiest fronts
    totalEmissiveRadiance += c * smoothstep(0.994, 1.0, 1.0 - abs(n1)) * smoothstep(0.7, 0.98, vFront) * uSpark * 2.5;
  }
  vec3 V = normalize(vViewPosition);
  float fr = pow(1.0 - clamp(abs(dot(normal, V)), 0.0, 1.0), 3.0);
  totalEmissiveRadiance += c * fr * uRim * (0.6 + 0.8 * uPulse);
}`,
      );
  };
  material.customProgramCacheKey = () => "brain-tissue-v3";
}

// Background dome: vertical gradient plus a soft glow behind the subject.
export const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; }`;
export const SKY_FRAG = /* glsl */ `
uniform vec3 uTop, uMid, uBot, uGlow;
uniform float uGlowAmt;
uniform vec3 uGlowDir;
varying vec3 vDir;
void main(){
  float y = vDir.y;
  vec3 c = y > 0.0 ? mix(uMid, uTop, smoothstep(0.0, 0.7, y)) : mix(uMid, uBot, smoothstep(0.0, -0.5, y));
  float g = pow(max(dot(normalize(vDir), normalize(uGlowDir)), 0.0), 18.0);
  c += uGlow * g * uGlowAmt;
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

// Final look, after tone mapping: lens vignette, faint chromatic fringe at the
// edges, exposure flash, fade to black, and fine film grain seeded by frame.
export const FINISH_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uFrame: { value: 0 },
    uVignette: { value: 0.35 },
    uGrain: { value: 0.035 },
    uFlash: { value: 0 },
    uFlashColor: { value: [1, 1, 1] },
    uFade: { value: 0 },
    uCA: { value: 0.0012 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse; uniform float uFrame, uVignette, uGrain, uFlash, uFade, uCA; uniform vec3 uFlashColor;
varying vec2 vUv;
float hash(vec2 p){ p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
void main(){
  vec2 d = vUv - 0.5;
  float r2 = dot(d, d);
  vec2 off = d * uCA * r2 * 4.0;
  vec3 c;
  c.r = texture2D(tDiffuse, vUv + off).r;
  c.g = texture2D(tDiffuse, vUv).g;
  c.b = texture2D(tDiffuse, vUv - off).b;
  float v = smoothstep(0.85, 0.18, r2 * (1.0 + uVignette * 1.4));
  c *= mix(1.0, v, uVignette);
  c = mix(c, uFlashColor, uFlash);
  float g = hash(vUv * vec2(1080.0, 1920.0) + uFrame * 17.0) - 0.5;
  c += g * uGrain * (1.0 - 0.6 * dot(c, vec3(0.333)));
  c *= 1.0 - uFade;
  gl_FragColor = vec4(c, 1.0);
}`,
};

// Additive soft sprites (thought particles, dust).
export const POINTS_VERT = /* glsl */ `
attribute float aSize; attribute vec3 aColor; attribute float aSeed;
uniform float uScale, uTime, uOpacity, uBurst;
varying vec3 vColor; varying float vAlpha;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float tw = 0.6 + 0.4 * sin(uTime * (1.3 + aSeed * 2.1) + aSeed * 31.0);
  gl_PointSize = aSize * uScale * (1.0 + uBurst * aSeed) / max(-mv.z, 0.05);
  vColor = aColor; vAlpha = uOpacity * tw;
}`;
export const POINTS_FRAG = /* glsl */ `
uniform sampler2D uSprite; varying vec3 vColor; varying float vAlpha;
void main(){ float a = texture2D(uSprite, gl_PointCoord).a * vAlpha; if (a < 0.003) discard; gl_FragColor = vec4(vColor * a, a); }`;

// Flowing light along a tube (orbit trails, attention filaments).
export const FLOW_VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
export const FLOW_FRAG = /* glsl */ `
uniform vec3 uColor; uniform float uOpacity, uOffset, uReveal, uDash;
varying vec2 vUv;
void main(){
  if (vUv.x > uReveal) discard;
  float dash = 0.35 + 0.65 * pow(0.5 + 0.5 * sin((vUv.x * uDash - uOffset) * 6.2831), 6.0);
  float edge = smoothstep(uReveal, uReveal - 0.04, vUv.x);
  float a = uOpacity * dash * edge;
  gl_FragColor = vec4(uColor * a, a);
}`;
