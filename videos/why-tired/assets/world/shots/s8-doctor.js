// SCENE 08a — "و یادت باشه، اگه با وجود خواب کافی مرتب خسته‌ای، بهتره علتش رو
// با پزشک بررسی کنی." (58.2 → 65.7)
// A seamless white studio. A frosted-glass medical cross with a soft luminous
// core floats above a white ceramic pedestal and turns slowly; on «پزشک» the
// core brightens and the camera leans in.
import { THREE, seg, ease, lerp, track, lookFrom, setShadow, wobble } from "../engine.js";
import { backdrop } from "../brain.js";

function roundedPolygon(pts, radii) {
  const s = new THREE.Shape();
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    const r = radii[i];
    const da = new THREE.Vector2(a[0] - p[0], a[1] - p[1]).normalize().multiplyScalar(r);
    const db = new THREE.Vector2(b[0] - p[0], b[1] - p[1]).normalize().multiplyScalar(r);
    const p1 = [p[0] + da.x, p[1] + da.y], p2 = [p[0] + db.x, p[1] + db.y];
    if (i === 0) s.moveTo(p1[0], p1[1]);
    else s.lineTo(p1[0], p1[1]);
    s.quadraticCurveTo(p[0], p[1], p2[0], p2[1]);
  }
  s.closePath();
  return s;
}

export function crossGeometry(a = 0.085, b = 0.03, depth = 0.034, bevel = 0.007) {
  const pts = [[b, a], [-b, a], [-b, b], [-a, b], [-a, -b], [-b, -b], [-b, -a], [b, -a], [b, -b], [a, -b], [a, b], [b, b]];
  const r = pts.map((_, i) => ([2, 5, 8, 11].includes(i) ? 0.006 : 0.012));
  const g = new THREE.ExtrudeGeometry(roundedPolygon(pts, r), { depth, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 6, curveSegments: 10 });
  g.center();
  return g;
}

export default async function build({ E, M }) {
  const scene = new THREE.Scene();
  const bgCol = new THREE.Color(0xd9dee4);
  scene.background = bgCol;
  scene.fog = new THREE.Fog(0xaab1ba, 1.0, 3.2);
  scene.environment = E.studioEnv({
    ambient: 0x8a9098,
    panels: [
      { pos: [-3, 4, 3], size: [5, 4], color: 0xffffff, intensity: 3.2 },
      { pos: [4, 2, 2], size: [3, 5], color: 0xeaf6ff, intensity: 2.0 },
      { pos: [0, 2, -5], size: [8, 3], color: 0xffffff, intensity: 1.6 },
      { pos: [0, -3, 2], size: [6, 2], color: 0xb9c2cc, intensity: 0.8 },
    ],
  });
  scene.environmentIntensity = 0.85;
  const bd = backdrop(0xc7cdd5, 0x7d8692, 0.25, [8, 6], { cy: 0.6 });
  bd.material.fog = false;
  bd.position.set(0, 0.8, -2.6);
  scene.add(bd);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(8, 96), new THREE.MeshPhysicalMaterial({ color: 0xb7bec7, roughness: 0.45, clearcoat: 0.4, clearcoatRoughness: 0.3 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // ceramic pedestal
  const ped = new THREE.Mesh(
    new THREE.LatheGeometry([[0, 0], [0.12, 0], [0.126, 0.004], [0.128, 0.012], [0.126, 0.026], [0.12, 0.03], [0, 0.03]].map(([r, y]) => new THREE.Vector2(r, y)), 160),
    new THREE.MeshPhysicalMaterial({ color: 0xe2e2df, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08 }),
  );
  ped.castShadow = ped.receiveShadow = true;
  scene.add(ped);

  // frosted glass cross with a luminous core
  const cross = new THREE.Group();
  scene.add(cross);
  const glass = new THREE.Mesh(crossGeometry(), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.28, transmission: 1, thickness: 0.05, ior: 1.45, attenuationColor: new THREE.Color(0xa9e3dc), attenuationDistance: 0.12, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.6 }));
  glass.castShadow = true;
  cross.add(glass);
  const coreMat = new THREE.MeshStandardMaterial({ color: 0x0a1f1d, emissive: new THREE.Color(0.55, 1.0, 0.92), emissiveIntensity: 1.2 });
  const core = new THREE.Mesh(crossGeometry(0.06, 0.014, 0.008, 0.003), coreMat);
  cross.add(core);
  const coreLight = new THREE.PointLight(0x9ff5e6, 0, 0.6, 2);
  cross.add(coreLight);

  const key = setShadow(new THREE.DirectionalLight(0xffffff, 2.2), 2048, 0.4, 0.1, 6, 10, -0.0004);
  key.position.set(-1.0, 2.2, 1.4);
  scene.add(key, key.target);
  const rim = new THREE.SpotLight(0xdff4ff, 3, 4, 0.5, 0.7, 2);
  rim.position.set(0.6, 0.6, -0.9);
  rim.target = cross;
  scene.add(rim);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xbfc6ce, 0.6));

  const camera = new THREE.PerspectiveCamera(34, 1080 / 1920, 0.01, 20);
  const keys = [
    [58.2, 0.5, 0.45, 1.25, 0, 0.15, 0],
    [60.0, 0.3, 0.33, 0.95, 0, 0.15, 0],
    [62.6, -0.08, 0.27, 0.86, 0, 0.15, 0],
    [64.4, -0.15, 0.23, 0.68, 0, 0.155, 0],
    [65.7, -0.17, 0.22, 0.6, 0, 0.16, 0],
  ];

  function update(t) {
    const k = track(keys, t);
    lookFrom(camera, [k[0], k[1], k[2]], [k[3], k[4], k[5]]);
    const rise = seg(t, 58.35, 59.6, ease.expoOut);
    cross.position.set(0, lerp(0.1, 0.165, rise) + 0.004 * Math.sin(t * 1.1), 0);
    cross.rotation.set(0.04 * wobble(t * 0.4, 1), lerp(-1.4, -0.35, rise) + 0.11 * (t - 59), 0);
    const doc = seg(t, 63.95, 64.4, ease.out) * (1 - 0.4 * seg(t, 64.9, 65.6));
    coreMat.emissiveIntensity = 0.7 + 1.1 * doc;
    coreLight.intensity = 0.15 + 0.35 * doc;
    return {
      exposure: 0.82,
      wb: [0.99, 1.0, 1.03],
      sat: 1.0,
      contrast: 1.14,
      punch: 0.5,
      vig: 0.32,
      grain: 0.025,
      bloom: { strength: 0.3, radius: 0.45, threshold: 2.2 },
      dof: { focus: camera.position.distanceTo(cross.position), aperture: 6, maxR: 10 },
    };
  }
  return { id: "s8a", t0: 58.2, t1: 65.7, scene, camera, update, transition: { mode: 3, blur: 4, ease: ease.inOut } };
}
