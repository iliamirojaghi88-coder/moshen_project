// The anatomical brain (build/brain.py) with its real-time tissue material,
// plus the deep-blue studio it lives in.
import { THREE } from "./engine.js";

export async function makeBrain(E) {
  const gltf = await E.load("assets/models/brain.glb");
  const root = gltf.scene.clone(true);
  const tissue = tissueMaterial();
  const meshes = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.material = tissue;
    o.castShadow = o.receiveShadow = true;
    if (o.name === "brainstem") o.visible = false;
    meshes.push(o);
  });
  // centre on the cerebrum
  const box = new THREE.Box3();
  meshes.filter((m) => m.name.startsWith("hemisphere")).forEach((m) => box.expandByObject(m));
  const c = box.getCenter(new THREE.Vector3());
  const pivot = new THREE.Group();
  root.position.sub(c);
  pivot.add(root);
  return { pivot, tissue, size: box.getSize(new THREE.Vector3()) };
}

// Living tissue: vertex-coloured (crowns, sulcal floors, vessels), a wet clearcoat, and a
// red-tinted light wrap around the terminator that stands in for subsurface scattering.
export function tissueMaterial() {
  const m = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    color: 0xffffff,
    roughness: 0.42,
    sheen: 0.35,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color(0xe8a39a),
    clearcoat: 0.55,
    clearcoatRoughness: 0.24,
    specularIntensity: 0.6,
  });
  m.userData.sss = { value: new THREE.Color(0.5, 0.11, 0.07) }; // controlled scattering: warm, never glowing
  m.onBeforeCompile = (shader) => {
    shader.uniforms.sssColor = m.userData.sss;
    const chunk = THREE.ShaderChunk.lights_physical_pars_fragment
      .replace(
        "float dotNL = saturate( dot( geometryNormal, directLight.direction ) );",
        "float dotNL = saturate( dot( geometryNormal, directLight.direction ) );\n\tfloat wrapNL = saturate( ( dot( geometryNormal, directLight.direction ) + 0.5 ) / 1.5 );\n\tvec3 sssLight = directLight.color * max( wrapNL * wrapNL - dotNL * 0.6, 0.0 ) * sssColor;",
      )
      .replace(
        "reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );",
        "reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );\n\treflectedLight.directDiffuse += sssLight * BRDF_Lambert( material.diffuseColor );",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <lights_physical_pars_fragment>", "uniform vec3 sssColor;\n" + chunk);
  };
  m.customProgramCacheKey = () => "tissue-sss";
  return m;
}

const BACKDROP_FS = `
uniform vec3 inner, outer; uniform float glow, cy, floorFade; varying vec2 vUv;
void main(){
  vec2 q = vUv - vec2(0.5, cy); q.x *= 0.75;
  float r = length(q);
  vec3 c = mix(inner, outer, smoothstep(0.0, 0.55, r));
  c += inner * glow * exp(-r * r * 18.0);
  c *= mix(1.0, smoothstep(0.3, 0.62, vUv.y), floorFade);
  gl_FragColor = vec4(c, 1.0);
}`;

export function backdrop(inner, outer, glow = 0.6, size = [6, 10], { cy = 0.52, floorFade = 0 } = {}) {
  const mat = new THREE.ShaderMaterial({
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: BACKDROP_FS,
    uniforms: { inner: { value: new THREE.Color(inner) }, outer: { value: new THREE.Color(outer) }, glow: { value: glow }, cy: { value: cy }, floorFade: { value: floorFade } },
    depthWrite: false,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size[0], size[1]), mat);
  m.renderOrder = -1;
  return m;
}
