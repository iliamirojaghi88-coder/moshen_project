// Post chain: MSAA HDR render -> bloom (emissives only) -> tone map -> grade.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uVignette: { value: 0.35 },
    uContrast: { value: 1.06 },
    uSat: { value: 1.0 },
    uLift: { value: new THREE.Vector3(0.0, 0.0, 0.0) },
    uGain: { value: new THREE.Vector3(1.0, 1.0, 1.0) },
    uGrain: { value: 0.025 },
    uSeed: { value: 0 },
    uFlash: { value: 0 },
    uFade: { value: 0 }, // fade to uFadeColor
    uFadeColor: { value: new THREE.Color(0, 0, 0) },
    uAspect: { value: 1080 / 1920 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uVignette, uContrast, uSat, uGrain, uSeed, uFlash, uFade, uAspect;
    uniform vec3 uLift, uGain, uFadeColor;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + uSeed) * 43758.5453); }
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSat);
      c = (c - 0.5) * uContrast + 0.5;
      c = c * uGain + uLift * (1.0 - c);
      vec2 q = (vUv - 0.5) * vec2(1.0, 1.0 / uAspect) * vec2(uAspect, uAspect);
      float v = smoothstep(0.95, 0.25, length((vUv - 0.5) * vec2(1.0, 1.25)));
      c *= mix(1.0, v, uVignette);
      c += uFlash;
      c = mix(c, uFadeColor, uFade);
      c += (h(vUv * 1000.0) - 0.5) * uGrain;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

// Depth of field from the main pass's own depth buffer (no second scene render).
const DofShader = {
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    uFocus: { value: 10 },
    uRange: { value: 4 },
    uMaxBlur: { value: 14 },
    uNear: { value: 0.1 },
    uFar: { value: 8000 },
    uRes: { value: new THREE.Vector2(1080, 1920) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `
    #include <packing>
    uniform sampler2D tDiffuse, tDepth; uniform float uFocus, uRange, uMaxBlur, uNear, uFar; uniform vec2 uRes;
    varying vec2 vUv;
    float lin(vec2 uv){ return perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar) * -1.0; }
    float coc(float z){ return clamp(abs(z - uFocus) / uRange, 0.0, 1.0); }
    void main(){
      float zc = lin(vUv);
      float cc = coc(zc) * uMaxBlur;
      vec4 base = texture2D(tDiffuse, vUv);
      if (cc < 0.5) { gl_FragColor = base; return; }
      vec3 acc = base.rgb; float wsum = 1.0;
      const float GA = 2.39996323;
      for (int i = 1; i < 32; i++) {
        float r = sqrt(float(i) / 31.0) * cc;
        float a = float(i) * GA;
        vec2 o = vec2(cos(a), sin(a)) * r / uRes;
        float zs = lin(vUv + o);
        // samples in front only bleed when they are blurred too
        float w = zs < zc ? clamp(coc(zs) * uMaxBlur / max(r, 0.001), 0.0, 1.0) : 1.0;
        acc += texture2D(tDiffuse, vUv + o).rgb * w;
        wsum += w;
      }
      gl_FragColor = vec4(acc / wsum, base.a);
    }`,
};

export function makePost(renderer, scene, camera, W, H) {
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
  rt.depthTexture = new THREE.DepthTexture(W, H);
  rt.depthTexture.type = THREE.UnsignedIntType;
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(1);
  composer.setSize(W, H);
  const render = new RenderPass(scene, camera);
  const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.55, 0.55, 1.0);
  const out = new OutputPass();
  const grade = new ShaderPass(GradeShader);
  const dof = new ShaderPass(DofShader);
  dof.enabled = false;
  composer.addPass(render);
  composer.addPass(dof);
  composer.addPass(bloom);
  composer.addPass(out);
  composer.addPass(grade);
  // the DOF pass reads the depth of whichever target the scene was drawn into
  const syncDepth = () => {
    dof.uniforms.tDepth.value = composer.readBuffer.depthTexture;
    dof.uniforms.uNear.value = camera.near;
    dof.uniforms.uFar.value = camera.far;
  };
  return { composer, bloom, grade, render, dof, syncDepth };
}
