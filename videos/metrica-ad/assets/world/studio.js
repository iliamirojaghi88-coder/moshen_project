// Studio sets: the navy analysis table (scene 3), the bright product studio
// (scenes 4, 5, 8), and the white architectural model of the building.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { buildBuilding } from "./building.js";

// Backdrop that follows the camera: vertical gradient + soft glow spot.
export function makeBackdrop() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color() },
      mid: { value: new THREE.Color() },
      bottom: { value: new THREE.Color() },
      glow: { value: new THREE.Color() },
      glowDir: { value: new THREE.Vector3(0, 0.2, -1) },
    },
    vertexShader: `varying vec3 vD; void main(){ vD = normalize((modelMatrix*vec4(position,0.0)).xyz); vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: `uniform vec3 top, mid, bottom, glow, glowDir; varying vec3 vD;
      void main(){ float h = vD.y; vec3 c = h > 0.0 ? mix(mid, top, smoothstep(0.0, 0.7, h)) : mix(mid, bottom, smoothstep(0.0, -0.4, h));
      c += glow * pow(max(dot(normalize(vD), normalize(glowDir)), 0.0), 6.0);
      gl_FragColor = vec4(c, 1.0); }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), mat);
  m.scale.setScalar(4000);
  m.frustumCulled = false;
  m.renderOrder = -999;
  m.userData.set = (top, mid, bottom, glow, dir) => {
    mat.uniforms.top.value.set(top);
    mat.uniforms.mid.value.set(mid);
    mat.uniforms.bottom.value.set(bottom);
    mat.uniforms.glow.value.set(glow);
    if (dir) mat.uniforms.glowDir.value.set(...dir);
  };
  return m;
}

// Large glossy floor: dark glass for the navy set, satin white for the bright one.
export function makeFloor() {
  const mat = new THREE.MeshPhysicalMaterial({ color: 0x0a1422, metalness: 0.0, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.06 });
  const m = new THREE.Mesh(new THREE.CircleGeometry(600, 96).rotateX(-Math.PI / 2), mat);
  m.receiveShadow = true;
  m.userData.dark = () => {
    mat.color.set(0x07101c);
    mat.roughness = 0.1;
    mat.clearcoat = 1;
  };
  m.userData.bright = () => {
    mat.color.set(0xe9e7e2);
    mat.roughness = 0.42;
    mat.clearcoat = 0.25;
  };
  return m;
}

// White architectural model: the same building, all parts in model materials.
export function buildModel(M) {
  const white = new THREE.MeshStandardMaterial({ color: 0xf3f1ec, roughness: 0.72 });
  const shade = new THREE.MeshStandardMaterial({ color: 0xdedbd4, roughness: 0.6 });
  const acrylic = new THREE.MeshPhysicalMaterial({ color: 0xcfe6f2, roughness: 0.06, transparent: true, opacity: 0.5, clearcoat: 1, depthWrite: false });
  const proxy = new Proxy(M, {
    get(target, key) {
      if (["glass", "railGlass"].includes(key)) return acrylic;
      if (["mullion", "darkSteel", "rebar", "galv", "formwork"].includes(key)) return shade;
      if (key === "lightStrip") return white;
      if (target[key] && target[key].isMaterial) return white;
      return target[key];
    },
  });
  const b = buildBuilding(proxy);
  const p = b.userData.parts;
  // complete, dressed model
  for (let L = 0; L < p.columns.length; L++) {
    p.columns[L].visible = p.frame[L].visible = p.facade[L].visible = p.glazing[L].visible = p.rails[L].visible = true;
    p.rebar[L].visible = p.formwork[L].visible = p.props[L].visible = p.lights[L].visible = false;
  }
  p.roof.visible = true;
  p.scaffold.visible = false;
  const g = new THREE.Group();
  g.add(b);
  // base plate with the plot engraved
  const base = new THREE.Mesh(new RoundedBoxGeometry(30, 0.8, 34, 2, 0.25), new THREE.MeshStandardMaterial({ color: 0xd9cbb4, roughness: 0.55, map: M.formwork.map }));
  base.position.set(0, -0.42, -3);
  base.receiveShadow = base.castShadow = true;
  g.add(base);
  const plot = new THREE.Mesh(new THREE.BoxGeometry(20.4, 0.06, 25), new THREE.MeshStandardMaterial({ color: 0xece8df, roughness: 0.8 }));
  plot.position.set(0, 0.0, -3);
  plot.receiveShadow = true;
  g.add(plot);
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  g.userData = { building: b, parts: p, base };
  return g;
}
