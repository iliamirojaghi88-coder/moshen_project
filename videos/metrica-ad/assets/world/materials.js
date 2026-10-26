// Material library. Surface maps come from tools/make_textures.py and are
// box-projected in world space, so any box of any size tiles at real scale.
import * as THREE from "three";

// Shared uniforms: the "becomes an architectural model" scan (scene 3).
export const SCAN = {
  uScanY: { value: -1000 }, // world y below which surfaces turn to white model
  uScanOn: { value: 0 },
  uScanGlow: { value: new THREE.Color(0xffc46b).multiplyScalar(2.2) },
};

const TEX = {};
export async function loadTextures(base = "assets/tex/") {
  const loader = new THREE.TextureLoader();
  const names = [
    ["concrete_basecolor", true], ["concrete_normal"], ["concrete_roughness"],
    ["soil_basecolor", true], ["soil_normal"], ["soil_roughness"],
    ["asphalt_basecolor", true], ["asphalt_normal"], ["asphalt_roughness"],
    ["stone_basecolor", true], ["stone_normal"], ["stone_roughness"],
    ["brushed_normal"], ["brushed_roughness"],
    ["facade_basecolor", true], ["facade_emissive", true],
  ];
  await Promise.all(
    names.map(([n, srgb]) =>
      loader.loadAsync(base + n + ".jpg").then((t) => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = 8;
        if (srgb) t.colorSpace = THREE.SRGBColorSpace;
        TEX[n] = t;
      }),
    ),
  );
  return TEX;
}

// Box-projected world UVs + the white-model scan, injected into a standard material.
export function worldMapped(mat, tile = 2.0, opts = {}) {
  const { scan = true, whiteTo = 0.86 } = opts;
  mat.userData.tile = tile;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTile = { value: 1 / tile };
    Object.assign(sh.uniforms, SCAN);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;")
      .replace(
        "#include <worldpos_vertex>",
        `#include <worldpos_vertex>
        vec4 wpX = vec4(transformed, 1.0);
        vec3 wnX = objectNormal;
        #ifdef USE_INSTANCING
          wpX = instanceMatrix * wpX;
          wnX = mat3(instanceMatrix) * wnX;
        #endif
        vWPos = (modelMatrix * wpX).xyz;
        vWNrm = normalize(mat3(modelMatrix) * wnX);`,
      );
    const sub = (chunk) => THREE.ShaderChunk[chunk].replace(/v(Map|NormalMap|RoughnessMap|EmissiveMap|MetalnessMap)Uv/g, "boxUv");
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vWPos; varying vec3 vWNrm; uniform float uTile;
        uniform float uScanY; uniform float uScanOn; uniform vec3 uScanGlow;`,
      )
      .replace(
        "void main() {",
        `void main() {
        vec3 anX = abs(vWNrm);
        vec2 boxUv = (anX.y > max(anX.x, anX.z) ? vWPos.xz : (anX.x > anX.z ? vWPos.zy : vWPos.xy)) * uTile;
        float whiteK = ${scan ? "uScanOn * smoothstep(uScanY + 0.15, uScanY - 0.15, vWPos.y)" : "0.0"};`,
      )
      .replace("#include <map_fragment>", sub("map_fragment") + `\n diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${whiteTo}), whiteK);`)
      .replace("#include <roughnessmap_fragment>", sub("roughnessmap_fragment") + "\n roughnessFactor = mix(roughnessFactor, 0.72, whiteK);")
      .replace("#include <metalnessmap_fragment>", sub("metalnessmap_fragment") + "\n metalnessFactor = mix(metalnessFactor, 0.0, whiteK);")
      .replace("#include <normal_fragment_begin>", sub("normal_fragment_begin"))
      .replace("#include <normal_fragment_maps>", sub("normal_fragment_maps").replace("normal = normalize( tbn * mapN );", "normal = normalize( tbn * mix(mapN, vec3(0.0,0.0,1.0), whiteK) );"))
      .replace(
        "#include <emissivemap_fragment>",
        sub("emissivemap_fragment") +
          `\n totalEmissiveRadiance *= (1.0 - whiteK);
          ${scan ? "totalEmissiveRadiance += uScanGlow * uScanOn * exp(-abs(vWPos.y - uScanY) * 9.0);" : ""}`,
      );
  };
  mat.customProgramCacheKey = () => `wm${tile}${scan}${whiteTo}`;
  return mat;
}

export function makeMaterials() {
  const T = TEX;
  const M = {};
  M.concrete = worldMapped(new THREE.MeshStandardMaterial({ map: T.concrete_basecolor, normalMap: T.concrete_normal, roughnessMap: T.concrete_roughness, normalScale: new THREE.Vector2(0.8, 0.8), color: 0xf2efe9 }), 2.4);
  M.concreteFresh = worldMapped(new THREE.MeshStandardMaterial({ map: T.concrete_basecolor, normalMap: T.concrete_normal, roughnessMap: T.concrete_roughness, color: 0xb9b6b0 }), 2.4);
  M.soil = worldMapped(new THREE.MeshStandardMaterial({ map: T.soil_basecolor, normalMap: T.soil_normal, roughnessMap: T.soil_roughness, normalScale: new THREE.Vector2(1.2, 1.2) }), 6, { scan: true });
  M.asphalt = worldMapped(new THREE.MeshStandardMaterial({ map: T.asphalt_basecolor, normalMap: T.asphalt_normal, roughnessMap: T.asphalt_roughness }), 5, { scan: false });
  M.sidewalk = worldMapped(new THREE.MeshStandardMaterial({ map: T.concrete_basecolor, normalMap: T.concrete_normal, roughnessMap: T.concrete_roughness, color: 0xa8a39a }), 1.6, { scan: false });
  M.stone = worldMapped(new THREE.MeshStandardMaterial({ map: T.stone_basecolor, normalMap: T.stone_normal, roughnessMap: T.stone_roughness, normalScale: new THREE.Vector2(0.6, 0.6) }), 4.8);
  M.plaster = worldMapped(new THREE.MeshStandardMaterial({ map: T.concrete_basecolor, normalMap: T.concrete_normal, normalScale: new THREE.Vector2(0.25, 0.25), roughness: 0.9, color: 0xe9e2d6 }), 3.0);
  M.rebar = new THREE.MeshStandardMaterial({ color: 0x5b4535, metalness: 0.7, roughness: 0.55, normalMap: T.brushed_normal });
  M.formwork = worldMapped(new THREE.MeshStandardMaterial({ color: 0x8a4b22, roughness: 0.55, map: T.concrete_basecolor, normalMap: T.brushed_normal }), 1.2);
  M.galv = new THREE.MeshStandardMaterial({ color: 0xb9bec4, metalness: 0.85, roughness: 0.42 });
  M.craneYellow = new THREE.MeshStandardMaterial({ color: 0xf2b417, metalness: 0.35, roughness: 0.45 });
  M.darkSteel = new THREE.MeshStandardMaterial({ color: 0x2a2d31, metalness: 0.8, roughness: 0.4 });
  M.mullion = worldMapped(new THREE.MeshStandardMaterial({ color: 0x2b2f35, metalness: 0.75, roughness: 0.35 }), 1, { whiteTo: 0.8 });
  M.glass = worldMapped(new THREE.MeshStandardMaterial({ color: 0x1d2a36, metalness: 0.92, roughness: 0.06, envMapIntensity: 1.2 }), 1, { whiteTo: 0.55 });
  M.railGlass = new THREE.MeshPhysicalMaterial({ color: 0xbfd8e0, metalness: 0, roughness: 0.04, transparent: true, opacity: 0.28, clearcoat: 1, depthWrite: false });
  M.lightStrip = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.78, 0.5).multiplyScalar(4) });
  M.warning = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.08, 0.04).multiplyScalar(8) });
  M.fence = new THREE.MeshStandardMaterial({ color: 0x8c949c, metalness: 0.8, roughness: 0.5, normalMap: T.brushed_normal });
  M.fenceFrame = new THREE.MeshStandardMaterial({ color: 0x3b3f44, metalness: 0.6, roughness: 0.5 });
  // brand/data family
  M.gold = new THREE.MeshPhysicalMaterial({ color: 0xd9a24e, metalness: 1, roughness: 0.28, clearcoat: 0.6, clearcoatRoughness: 0.15, normalMap: T.brushed_normal, normalScale: new THREE.Vector2(0.15, 0.15) });
  M.goldGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.72, 0.32).multiplyScalar(3.5) });
  M.blueprint = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.74, 0.36).multiplyScalar(2.6), transparent: true, depthWrite: false });
  M.teal = new THREE.MeshPhysicalMaterial({ color: 0x1fc6c0, metalness: 0.1, roughness: 0.18, clearcoat: 1, emissive: 0x0c6d6a, emissiveIntensity: 0.6 });
  M.tealGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 0.95, 0.9).multiplyScalar(2.2) });
  M.frost = new THREE.MeshPhysicalMaterial({ color: 0xcfe6ff, metalness: 0, roughness: 0.32, transparent: true, opacity: 0.22, clearcoat: 1, clearcoatRoughness: 0.08, depthWrite: false, side: THREE.DoubleSide });
  M.clearGlass = new THREE.MeshPhysicalMaterial({ color: 0xdff4ff, metalness: 0, roughness: 0.03, transparent: true, opacity: 0.16, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide });
  M.whiteModel = new THREE.MeshStandardMaterial({ color: 0xf1efea, roughness: 0.74, metalness: 0 });
  M.acrylic = new THREE.MeshPhysicalMaterial({ color: 0xd8ecf5, roughness: 0.08, transparent: true, opacity: 0.55, clearcoat: 1 });
  M.aluminium = new THREE.MeshStandardMaterial({ color: 0xc8c9cc, metalness: 1, roughness: 0.36, normalMap: T.brushed_normal, normalScale: new THREE.Vector2(0.06, 0.06) });
  M.titanium = new THREE.MeshStandardMaterial({ color: 0xa69c8e, metalness: 1, roughness: 0.3, normalMap: T.brushed_normal, normalScale: new THREE.Vector2(0.2, 0.2) });
  M.blackGlass = new THREE.MeshPhysicalMaterial({ color: 0x050607, metalness: 0, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02 });
  M.keycap = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.62, metalness: 0.1 });
  M.rubber = new THREE.MeshStandardMaterial({ color: 0x0b0c0d, roughness: 0.9 });
  M.lens = new THREE.MeshPhysicalMaterial({ color: 0x0a0e18, metalness: 0.2, roughness: 0.02, clearcoat: 1, iridescence: 0.6, iridescenceIOR: 1.6 });
  return M;
}

export { TEX };
