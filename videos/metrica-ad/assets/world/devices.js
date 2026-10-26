// Phone and laptop, modelled for this film at real size (metres), with
// screens that show captures of the real METRICA site.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { squircleShape, roundedRectShape, shapeGeometryUV } from "./util.js";

// Specular-only glass: black base, additive, so the screen shows through and
// the environment slides across it.
function glassSheen(intensity = 1) {
  return new THREE.MeshStandardMaterial({ color: 0x000000, metalness: 0, roughness: 0.06, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, envMapIntensity: intensity });
}

function extrudeShape(shape, depth, bevel, segs = 3, curve = 24) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: depth - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: segs, curveSegments: curve });
  g.translate(0, 0, -(depth - 2 * bevel) / 2);
  g.computeVertexNormals();
  return g;
}

export function buildPhone(M) {
  const W = 0.0716, H = 0.147, D = 0.00825, R = 0.0112;
  const g = new THREE.Group();
  g.name = "phone";
  const body = new THREE.Mesh(extrudeShape(squircleShape(W, H, R, 14), D, 0.0009, 4), M.titanium);
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  // front: black glass, screen, sheen
  const front = new THREE.Mesh(new THREE.ShapeGeometry(squircleShape(W - 0.0012, H - 0.0012, R - 0.0006, 14)), M.blackGlass);
  front.position.z = D / 2 + 0.00002;
  const sw = W - 0.0042, sh = H - 0.0042;
  const screenMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const screen = new THREE.Mesh(shapeGeometryUV(squircleShape(sw, sh, R - 0.0023, 14), 20), screenMat);
  screen.position.z = D / 2 + 0.00006;
  const sheen = new THREE.Mesh(screen.geometry, glassSheen(1.0));
  sheen.position.z = D / 2 + 0.0001;
  const island = new THREE.Mesh(new THREE.ShapeGeometry(roundedRectShape(0.0205, 0.0062, 0.0031)), new THREE.MeshPhysicalMaterial({ color: 0x010101, roughness: 0.2, clearcoat: 1 }));
  island.position.set(0, sh / 2 - 0.0012 - 0.0031 - 0.0023, D / 2 + 0.00012);
  g.add(front, screen, sheen, island);
  // back: frosted glass, camera plateau with three lenses + flash
  const backMat = new THREE.MeshPhysicalMaterial({ color: 0xa79f93, roughness: 0.42, metalness: 0.0, clearcoat: 0.6, clearcoatRoughness: 0.35 });
  const back = new THREE.Mesh(new THREE.ShapeGeometry(squircleShape(W - 0.0012, H - 0.0012, R - 0.0006, 14)), backMat);
  back.rotation.y = Math.PI;
  back.position.z = -D / 2 - 0.00002;
  g.add(back);
  const cam = new THREE.Group();
  const plate = new THREE.Mesh(extrudeShape(squircleShape(0.0345, 0.0355, 0.0085, 10), 0.0014, 0.0004, 3), new THREE.MeshPhysicalMaterial({ color: 0xb2a99c, roughness: 0.15, clearcoat: 1 }));
  cam.add(plate);
  const ringMat = M.titanium;
  for (const [x, y] of [[-0.0083, 0.0085], [-0.0083, -0.0085], [0.0085, 0.0]]) {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.0066, 0.0068, 0.0016, 40).rotateX(Math.PI / 2), ringMat);
    ring.position.set(x, y, 0.0012);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.0052, 0.0052, 0.0006, 40).rotateX(Math.PI / 2), M.lens);
    lens.position.set(x, y, 0.0019);
    const inner = new THREE.Mesh(new THREE.CircleGeometry(0.0022, 24), new THREE.MeshPhysicalMaterial({ color: 0x050a14, roughness: 0.02, clearcoat: 1, iridescence: 1 }));
    inner.position.set(x, y, 0.00225);
    cam.add(ring, lens, inner);
  }
  const flash = new THREE.Mesh(new THREE.CircleGeometry(0.0022, 20), new THREE.MeshStandardMaterial({ color: 0xf3ead2, roughness: 0.3 }));
  flash.position.set(0.0088, 0.0105, 0.00075);
  cam.add(flash);
  cam.rotation.y = Math.PI;
  cam.position.set(W / 2 - 0.0035 - 0.0172, H / 2 - 0.0035 - 0.0177, -D / 2 - 0.0001);
  g.add(cam);
  // side buttons
  const btn = (w, h, x, y) => {
    const b = new THREE.Mesh(new RoundedBoxGeometry(w, h, 0.0028, 2, 0.0006), M.titanium);
    b.position.set(x, y, 0);
    g.add(b);
  };
  btn(0.0012, 0.017, W / 2 + 0.0003, 0.022);
  btn(0.0012, 0.009, -W / 2 - 0.0003, 0.037);
  btn(0.0012, 0.0095, -W / 2 - 0.0003, 0.019);
  btn(0.0012, 0.0095, -W / 2 - 0.0003, 0.006);
  g.userData = { screen, screenMat, sheen, size: [W, H, D] };
  return g;
}

export function buildLaptop(M) {
  const W = 0.3126, DP = 0.2215, HB = 0.0145, HL = 0.0058, R = 0.012;
  const g = new THREE.Group();
  g.name = "laptop";
  // base: rounded slab, extruded downwards from its top face at y = HB
  const baseGeo = extrudeShape(roundedRectShape(W, DP, R), HB, 0.0018, 4).rotateX(-Math.PI / 2).translate(0, HB / 2, 0);
  const base = new THREE.Mesh(baseGeo, M.aluminium);
  base.castShadow = base.receiveShadow = true;
  g.add(base);
  // keyboard well + keys
  const well = new THREE.Mesh(new THREE.ShapeGeometry(roundedRectShape(0.278, 0.112, 0.004)).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1c1e21, roughness: 0.5, metalness: 0.4 }));
  well.position.set(0, HB + 0.00005, -0.044);
  g.add(well);
  const keys = [];
  const rows = [
    { n: 14, w: 0.0172, h: 0.0092, z: -0.093 },
    { n: 14, w: 0.0172, h: 0.0158, z: -0.0775 },
    { n: 14, w: 0.0172, h: 0.0158, z: -0.0587 },
    { n: 13, w: 0.0172, h: 0.0158, z: -0.0399 },
    { n: 12, w: 0.0172, h: 0.0158, z: -0.0211 },
  ];
  for (const r of rows) {
    const gap = 0.0019;
    const total = 0.27;
    const ww = (total - gap * (r.n - 1)) / r.n;
    for (let i = 0; i < r.n; i++) keys.push([-total / 2 + ww / 2 + i * (ww + gap), r.z, ww, r.h]);
  }
  // bottom row with a long space bar
  const bz = -0.0023;
  const bottom = [0.0172, 0.0172, 0.0172, 0.0215, 0.098, 0.0215, 0.0172, 0.0172, 0.0172];
  let x = -0.135;
  for (const w of bottom) {
    keys.push([x + w / 2, bz, w, 0.0158]);
    x += w + 0.0019;
  }
  const keyGeo = new RoundedBoxGeometry(1, 0.0012, 1, 1, 0.0004);
  const keyMesh = new THREE.InstancedMesh(keyGeo, M.keycap, keys.length);
  const m = new THREE.Matrix4();
  keys.forEach(([kx, kz, kw, kh], i) => {
    m.makeScale(kw, 1, kh).setPosition(kx, HB + 0.0006, kz);
    keyMesh.setMatrixAt(i, m);
  });
  keyMesh.castShadow = true;
  g.add(keyMesh);
  // trackpad
  const pad = new THREE.Mesh(new THREE.ShapeGeometry(roundedRectShape(0.15, 0.092, 0.006)).rotateX(-Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0xbfc0c3, metalness: 0.6, roughness: 0.28, clearcoat: 0.4 }));
  pad.position.set(0, HB + 0.00005, 0.058);
  g.add(pad);
  // rubber feet
  for (const [fx, fz] of [[-0.13, -0.09], [0.13, -0.09], [-0.13, 0.09], [0.13, 0.09]]) {
    const f = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.0012, 20), M.rubber);
    f.position.set(fx, -0.0006, fz);
    g.add(f);
  }
  // hinge barrel
  const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.0042, 0.0042, 0.25, 24).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2a2c30, metalness: 0.8, roughness: 0.35 }));
  hinge.position.set(0, HB + 0.0005, -DP / 2 + 0.002);
  g.add(hinge);

  // lid on a pivot at the hinge; closed = 0, open = 1.9 rad
  const pivot = new THREE.Group();
  pivot.position.set(0, HB + 0.0004, -DP / 2 + 0.002);
  g.add(pivot);
  const lid = new THREE.Group();
  pivot.add(lid);
  const lidGeo = extrudeShape(roundedRectShape(W, DP, R), HL, 0.0012, 3).rotateX(-Math.PI / 2).translate(0, HL / 2, DP / 2);
  const lidBody = new THREE.Mesh(lidGeo, M.aluminium);
  lidBody.castShadow = true;
  lid.add(lidBody);
  // inner face (y = 0 plane facing down when closed): bezel glass + screen
  const bezel = new THREE.Mesh(new THREE.ShapeGeometry(roundedRectShape(W - 0.003, DP - 0.003, R - 0.0015)).rotateX(Math.PI / 2), M.blackGlass);
  bezel.position.set(0, -0.00005, DP / 2);
  lid.add(bezel);
  const SW = 0.2965, SH = SW / 1.6;
  const screenMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const sgeo = shapeGeometryUV(roundedRectShape(SW, SH, 0.0035), 8);
  // map the screen so the image's top sits at the far (hinge-opposite) edge
  const screen = new THREE.Mesh(sgeo, screenMat);
  screen.rotation.x = Math.PI / 2;
  screen.position.set(0, -0.0001, DP / 2 + 0.003);
  lid.add(screen);
  const sheen = new THREE.Mesh(sgeo, glassSheen(0.9));
  sheen.rotation.copy(screen.rotation);
  sheen.position.set(0, -0.00016, DP / 2 + 0.003);
  lid.add(sheen);
  g.userData = { pivot, screen, screenMat, sheen, size: [W, DP, HB], setOpen: (k) => (pivot.rotation.x = -1.92 * k) };
  g.userData.setOpen(1);
  return g;
}

// Lazy, cached screen textures: only the states near the playhead are in memory.
export class ScreenBank {
  constructor(renderer, base = "assets/screens/") {
    this.base = base;
    this.cache = new Map();
    this.loader = new THREE.TextureLoader();
    this.max = 14;
    this.aniso = renderer.capabilities.getMaxAnisotropy();
  }
  key(dev, label) {
    return `${dev}/${label}`;
  }
  load(dev, label) {
    const k = this.key(dev, label);
    let e = this.cache.get(k);
    if (!e) {
      e = { tex: null, used: 0 };
      e.promise = this.loader.loadAsync(`${this.base}${dev}/${label}.jpg`).then((t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = Math.min(8, this.aniso);
        t.generateMipmaps = true;
        t.minFilter = THREE.LinearMipmapLinearFilter;
        e.tex = t;
        return t;
      });
      this.cache.set(k, e);
      this.evict();
    }
    e.used = performance.now();
    return e;
  }
  get(dev, label) {
    const e = this.load(dev, label);
    return e.tex;
  }
  ready(list) {
    const ps = list.map(([d, l]) => this.load(d, l)).filter((e) => !e.tex).map((e) => e.promise);
    return ps.length ? Promise.all(ps) : null;
  }
  evict() {
    if (this.cache.size <= this.max) return;
    const sorted = [...this.cache.entries()].filter(([, e]) => e.tex).sort((a, b) => a[1].used - b[1].used);
    while (this.cache.size > this.max && sorted.length) {
      const [k, e] = sorted.shift();
      e.tex.dispose();
      this.cache.delete(k);
    }
  }
}
