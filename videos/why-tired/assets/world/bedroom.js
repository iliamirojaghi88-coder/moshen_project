// The bedroom set (built in Blender by build/bedroom.py) with its real-time
// materials and practical lights. Blender (x, y, z) arrives as three (x, z, -y):
// window on the left wall (x = -2.3), headboard against the back wall (z = -2).
import { THREE } from "./engine.js";

const SKY_FS = `
uniform vec3 top, horizon, glow; uniform float sun; varying vec2 vUv;
void main(){
  float y = vUv.y;
  vec3 c = mix(horizon, top, smoothstep(0.15, 0.95, y));
  c += glow * sun * exp(-pow((y - 0.22) / 0.18, 2.0)) * exp(-pow((vUv.x - 0.45) / 0.35, 2.0));
  gl_FragColor = vec4(c, 1.0);
}`;
const SKY_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

export async function makeBedroom(E, M) {
  const gltf = await E.load("assets/models/bedroom.glb");
  const root = gltf.scene.clone(true);
  const T = M.tex;
  const P = (o) => new THREE.MeshPhysicalMaterial({ vertexColors: true, ...o });
  const linen = (color, sheen, rep = 15) => {
    const n = T.linenN.clone();
    n.repeat.set(rep, rep);
    n.needsUpdate = true;
    return P({ color, roughness: 0.92, normalMap: n, normalScale: new THREE.Vector2(0.35, 0.35), sheen: 1, sheenRoughness: 0.55, sheenColor: new THREE.Color(sheen) });
  };
  const emissive = (color) => new THREE.MeshStandardMaterial({ color: 0x050505, emissive: color, emissiveIntensity: 1, roughness: 0.3 });
  const sky = new THREE.ShaderMaterial({
    vertexShader: SKY_VS,
    fragmentShader: SKY_FS,
    uniforms: {
      top: { value: new THREE.Color(0.012, 0.02, 0.05) },
      horizon: { value: new THREE.Color(0.03, 0.05, 0.1) },
      glow: { value: new THREE.Color(4.0, 2.2, 0.9) },
      sun: { value: 0 },
    },
  });
  const oakR = T.oakR;
  const mats = {
    floor_oak: P({ map: T.oakA, normalMap: T.oakN, roughnessMap: oakR, roughness: 1, normalScale: new THREE.Vector2(0.6, 0.6), clearcoat: 0.25, clearcoatRoughness: 0.35 }),
    wall: P({ color: 0x8f8a83, roughness: 0.95, normalMap: T.plasterN, normalScale: new THREE.Vector2(0.25, 0.25) }),
    trim: P({ color: 0xb9b6b0, roughness: 0.55 }),
    rug: P({ color: 0x77736c, roughness: 1, normalMap: T.woolN, normalScale: new THREE.Vector2(1.0, 1.0), sheen: 1, sheenRoughness: 0.8, sheenColor: new THREE.Color(0x9a958c) }),
    fabric_headboard: linen(0x223047, 0x5f7598, 10),
    fabric_base: linen(0x223047, 0x5f7598, 10),
    sheet: linen(0xd9d8d3, 0xffffff),
    pillow: linen(0xe2e1dc, 0xffffff),
    duvet: linen(0xa9b3c2, 0xdfe7f3),
    throw: linen(0x3c4658, 0x8494b0, 9),
    wood_walnut: P({ map: T.walnutA, normalMap: T.walnutN, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.25 }),
    ceramic: P({ color: 0xd8d3c9, roughness: 0.28, clearcoat: 0.5, clearcoatRoughness: 0.2 }),
    lampshade: new THREE.MeshPhysicalMaterial({ color: 0xd9cfbd, roughness: 0.95, emissive: new THREE.Color(1.0, 0.72, 0.42), emissiveIntensity: 0, side: THREE.DoubleSide, sheen: 1, sheenColor: new THREE.Color(0xffffff) }),
    bulb: emissive(new THREE.Color(1, 0.75, 0.45)),
    metal_black: P({ color: 0x1a1b1e, metalness: 1, roughness: 0.4 }),
    metal_brass: P({ color: 0xb08d57, metalness: 1, roughness: 0.3 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.12, depthWrite: false }),
    phone_body: P({ color: 0x0b0b0d, roughness: 0.2, metalness: 0.3, clearcoat: 1 }),
    phone_screen: emissive(new THREE.Color(0.55, 0.72, 1.0)),
    led: emissive(new THREE.Color(0.25, 0.65, 1.0)),
    dock: P({ color: 0x1d1e21, roughness: 0.5 }),
    door: P({ color: 0xa8a49c, roughness: 0.5 }),
    door_gap_light: emissive(new THREE.Color(1, 0.78, 0.5)),
    curtain_sheer: new THREE.MeshPhysicalMaterial({ color: 0xe6e1d8, roughness: 0.95, transparent: true, opacity: 0.82, side: THREE.DoubleSide, sheen: 1, sheenColor: new THREE.Color(0xffffff), depthWrite: false }),
    curtain_blackout: new THREE.MeshPhysicalMaterial({ color: 0x1e2636, roughness: 0.95, side: THREE.DoubleSide, sheen: 1, sheenColor: new THREE.Color(0x5d6b88), normalMap: T.linenN, normalScale: new THREE.Vector2(0.3, 0.3) }),
    sky,
  };
  const byName = {};
  root.traverse((o) => {
    if (!o.isMesh) return;
    byName[o.name] = o;
    const name = o.material.name;
    if (mats[name]) o.material = mats[name];
    if (o.name === "lamp_r_shade") o.material = mats.lampshade_r = mats.lampshade.clone(); // switch each lamp alone
    // soften baked AO so lit faces stay clean; keep contact darkening
    const col = o.geometry.getAttribute("color");
    if (col && !o.geometry.userData.aoDone) {
      for (let i = 0; i < col.count; i++) {
        const a = Math.pow(col.getX(i), 0.9);
        const v = 0.28 + 0.72 * a;
        col.setXYZ(i, v, v, v);
      }
      col.needsUpdate = true;
      o.geometry.userData.aoDone = true; // geometry is shared between clones of the set
    }
    if (!col && o.material.vertexColors) {
      o.material = o.material.clone();
      o.material.vertexColors = false;
    }
    const noShadow = ["sky", "glass", "phone_screen", "led", "door_gap_light", "bulb", "curtain_sheer"].includes(name);
    o.castShadow = !noShadow;
    o.receiveShadow = !["sky", "bulb"].includes(name);
  });

  // practical lights (intensities driven per shot)
  const lights = {};
  for (const side of ["l", "r"]) {
    const bulb = byName[`lamp_${side}_bulb`];
    const p = new THREE.PointLight(0xffb36b, 0, 6, 2);
    p.position.copy(bulb.getWorldPosition(new THREE.Vector3()));
    p.castShadow = false;
    root.add(p);
    lights[`lamp_${side}`] = p;
  }
  const phone = byName.phone_screen.getWorldPosition(new THREE.Vector3());
  lights.phone = new THREE.PointLight(0x8fb4ff, 0, 1.6, 2);
  lights.phone.position.copy(phone).add(new THREE.Vector3(0, 0.05, 0));
  root.add(lights.phone);
  const gap = byName.door_gap.getWorldPosition(new THREE.Vector3());
  lights.door = new THREE.SpotLight(0xffc98a, 0, 3.2, 1.2, 0.9, 2);
  lights.door.position.copy(gap).add(new THREE.Vector3(0.12, 0.02, 0));
  lights.door.target.position.copy(gap).add(new THREE.Vector3(-1.5, 0, 0));
  root.add(lights.door, lights.door.target);
  const led = byName.standby_led.getWorldPosition(new THREE.Vector3());
  lights.led = new THREE.PointLight(0x4aa0ff, 0, 0.6, 2);
  lights.led.position.copy(led).add(new THREE.Vector3(0, 0.02, 0.01));
  root.add(lights.led);

  // set practical states: 0..1 per source
  function practicals({ lamp_l = 0, lamp_r = 0, phone = 0, door = 0, led = 0 } = {}) {
    lights.lamp_l.intensity = 1.6 * lamp_l;
    lights.lamp_r.intensity = 1.6 * lamp_r;
    mats.lampshade.emissiveIntensity = 0.55 * lamp_l;
    mats.lampshade_r.emissiveIntensity = 0.55 * lamp_r;
    mats.bulb.emissiveIntensity = 6 * Math.max(lamp_l, lamp_r);
    lights.phone.intensity = 0.35 * phone;
    mats.phone_screen.emissiveIntensity = 1.6 * phone;
    lights.door.intensity = 4 * door;
    mats.door_gap_light.emissiveIntensity = 7 * door;
    lights.led.intensity = 0.08 * led;
    mats.led.emissiveIntensity = 14 * led;
  }
  practicals();
  // move the phone (and its glow) to another spot, e.g. the left nightstand
  function movePhone(dx, dz) {
    for (const n of ["phone", "phone_screen"]) {
      byName[n].position.x += dx;
      byName[n].position.z += dz;
    }
    lights.phone.position.x += dx;
    lights.phone.position.z += dz;
  }
  return { root, byName, mats, lights, practicals, sky, movePhone };
}

// Clock positions on the nightstand tops (three coordinates, metres)
export const NIGHTSTAND_L = new THREE.Vector3(-1.2, 0.54, -1.6);
export const NIGHTSTAND_R = new THREE.Vector3(1.33, 0.54, -1.72);
