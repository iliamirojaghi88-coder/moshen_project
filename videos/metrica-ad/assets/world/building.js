// The hero building, built to real dimensions: a 20 x 15 m footprint on a
// 500 m2 lot, pilot (parking) level + 6 residential floors + stair penthouse,
// reinforced-concrete frame on a ~5 m grid. Every level is a set of parts the
// director can grow, show or dress independently.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export const B = {
  W: 20, D: 15, levels: 7, pilotH: 3.0, floorH: 3.3, slab: 0.28,
  xs: [-9.75, -4.875, 0, 4.875, 9.75],
  zs: [-7.25, -2.42, 2.42, 7.25],
  col: 0.5,
};
// base (finished floor) height of level L; level 0 is the pilot
export const levelY = (L) => (L === 0 ? 0 : B.pilotH + (L - 1) * B.floorH);
export const roofY = levelY(B.levels);

function box(w, h, d, x, y, z, r = 0.02) {
  const g = r > 0 ? new RoundedBoxGeometry(w, h, d, 1, r) : new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}
function cyl(r, h, x, y, z, seg = 6) {
  const g = new THREE.CylinderGeometry(r, r, h, seg, 1);
  g.translate(x, y, z);
  return g;
}
const merge = (list) => mergeGeometries(list.filter(Boolean), false);

// instanced cylinders between point pairs (tubes, rebar, lattice members)
function tubes(pairs, radius, material, seg = 6) {
  const geo = new THREE.CylinderGeometry(radius, radius, 1, seg, 1);
  const mesh = new THREE.InstancedMesh(geo, material, pairs.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3(), s = new THREE.Vector3();
  pairs.forEach(([p, r2], i) => {
    a.set(...p);
    b.set(...r2);
    d.subVectors(b, a);
    const len = d.length();
    q.setFromUnitVectors(up, d.normalize());
    s.set(1, len, 1);
    m.compose(a.clone().add(b).multiplyScalar(0.5), q, s);
    mesh.setMatrixAt(i, m);
  });
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function buildBuilding(M) {
  const root = new THREE.Group();
  root.name = "building";
  const parts = { columns: [], frame: [], rebar: [], formwork: [], facade: [], glazing: [], rails: [], lights: [], props: [] };
  const H = (L) => (L === 0 ? B.pilotH : B.floorH);

  for (let L = 0; L < B.levels; L++) {
    const y0 = levelY(L), h = H(L);
    const colH = h - B.slab;
    // columns grow from their base: geometry starts at y = 0
    const cols = [];
    for (const x of B.xs) for (const z of B.zs) cols.push(box(B.col, colH, B.col, x, colH / 2, z, 0.015));
    const cm = new THREE.Mesh(merge(cols), M.concrete);
    cm.position.y = L === 0 ? 0 : y0;
    cm.castShadow = cm.receiveShadow = true;
    root.add(cm);
    parts.columns.push(cm);

    // slab + downstand beams that close this level (top at levelY(L+1))
    const top = levelY(L + 1);
    const fr = [];
    fr.push(box(B.W + 0.3, B.slab, B.D + 0.3, 0, -B.slab / 2, 0, 0.03));
    if (L >= 1) fr.push(box(B.W - 4, B.slab, 1.5, 0, -B.slab / 2, B.D / 2 + 0.9, 0.03)); // front balcony console
    for (const z of B.zs) fr.push(box(B.W, 0.5, 0.4, 0, -B.slab - 0.22, z, 0.01));
    for (const x of B.xs) fr.push(box(0.4, 0.5, B.D, x, -B.slab - 0.22, 0, 0.01));
    const fm = new THREE.Mesh(merge(fr), M.concrete);
    fm.position.y = top;
    fm.castShadow = fm.receiveShadow = true;
    root.add(fm);
    parts.frame.push(fm);

    // starter bars above each column (seen while the next level is not cast)
    const rb = [];
    for (const x of B.xs)
      for (const z of B.zs)
        for (const [dx, dz] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17], [0, -0.17], [0, 0.17]])
          rb.push([[x + dx, 0, z + dz], [x + dx, 1.25 + 0.08 * ((dx + dz) * 10 % 2), z + dz]]);
    const rbm = tubes(rb, 0.014, M.rebar, 5);
    rbm.position.y = top;
    rbm.visible = false;
    root.add(rbm);
    parts.rebar.push(rbm);

    // formwork boxes around columns + slab edge forms + shoring props below the slab
    const fw = [];
    for (const x of B.xs) for (const z of B.zs) fw.push(box(B.col + 0.08, colH * 0.98, B.col + 0.08, x, colH / 2, z, 0.0));
    fw.push(box(B.W + 0.5, 0.4, 0.05, 0, colH + 0.05, B.D / 2 + 0.2, 0));
    fw.push(box(B.W + 0.5, 0.4, 0.05, 0, colH + 0.05, -B.D / 2 - 0.2, 0));
    const fwm = new THREE.Mesh(merge(fw), M.formwork);
    fwm.position.y = y0;
    fwm.visible = false;
    fwm.castShadow = true;
    root.add(fwm);
    parts.formwork.push(fwm);
    const pr = [];
    for (let x = -9; x <= 9; x += 1.5) for (let z = -6.5; z <= 6.5; z += 1.6) pr.push([[x, 0, z], [x, colH, z]]);
    const prm = tubes(pr, 0.03, M.galv, 5);
    prm.position.y = y0;
    prm.visible = false;
    root.add(prm);
    parts.props.push(prm);

    // facade dressing for residential levels
    const fac = new THREE.Group();
    const gl = new THREE.Group();
    const rails = new THREE.Group();
    if (L >= 1) {
      const zf = B.D / 2; // front face
      // stone: slab-edge band, corner piers, side walls
      const st = [];
      st.push(box(B.W + 0.6, 0.55, 0.12, 0, h - 0.27, zf + 1.66, 0.01)); // balcony fascia
      st.push(box(1.0, h, 0.6, -B.W / 2 + 0.2, h / 2, zf + 0.15, 0.01));
      st.push(box(1.0, h, 0.6, B.W / 2 - 0.2, h / 2, zf + 0.15, 0.01));
      for (const sx of [-1, 1]) {
        st.push(box(0.25, h, B.D * 0.42, sx * (B.W / 2 + 0.05), h / 2, zf - B.D * 0.21, 0.01));
        st.push(box(0.25, h, B.D * 0.42, sx * (B.W / 2 + 0.05), h / 2, -zf + B.D * 0.21, 0.01));
      }
      // back wall in plaster with window gaps is simplified to stone panels
      st.push(box(B.W, 0.9, 0.2, 0, 0.45, -zf - 0.1, 0.01));
      st.push(box(B.W, 0.5, 0.2, 0, h - 0.25, -zf - 0.1, 0.01));
      const stm = new THREE.Mesh(merge(st), M.stone);
      stm.castShadow = stm.receiveShadow = true;
      fac.add(stm);
      // aluminium mullions: front glazing line set back 0.35 m, every 1.6 m
      const mu = [];
      for (let x = -8.6; x <= 8.61; x += 1.72) mu.push(box(0.07, h - 0.3, 0.14, x, (h - 0.3) / 2, zf - 0.3, 0));
      mu.push(box(17.4, 0.08, 0.14, 0, 0.04, zf - 0.3, 0), box(17.4, 0.08, 0.14, 0, h - 0.34, zf - 0.3, 0), box(17.4, 0.06, 0.12, 0, 2.2, zf - 0.3, 0));
      for (let x = -8.6; x <= 8.61; x += 2.15) mu.push(box(0.07, h - 1.3, 0.14, x, 0.45 + (h - 1.3) / 2, -zf - 0.12, 0));
      for (const sx of [-1, 1]) for (const z of [-3.2, 3.2]) mu.push(box(0.14, h - 0.6, 0.07, sx * (B.W / 2 + 0.1), (h - 0.3) / 2, z, 0));
      const mum = new THREE.Mesh(merge(mu), M.mullion);
      mum.castShadow = true;
      fac.add(mum);
      // glass panes
      const gp = [];
      gp.push(box(17.3, h - 0.42, 0.03, 0, (h - 0.3) / 2, zf - 0.32, 0));
      gp.push(box(17.3, h - 1.42, 0.03, 0, 0.9 + (h - 1.42) / 2, -zf - 0.14, 0));
      for (const sx of [-1, 1]) for (const z of [-3.2, 3.2]) gp.push(box(0.03, h - 0.65, 2.4, sx * (B.W / 2 + 0.08), (h - 0.3) / 2, z, 0));
      gl.add(new THREE.Mesh(merge(gp), M.glass));
      // balcony glass railing with a slim steel cap
      const rg = new THREE.Mesh(box(B.W - 4.2, 1.05, 0.02, 0, 0.55, zf + 1.6, 0), M.railGlass);
      const cap = new THREE.Mesh(box(B.W - 4.2, 0.05, 0.06, 0, 1.1, zf + 1.6, 0.01), M.darkSteel);
      rails.add(rg, cap);
      // warm ceiling strip inside each flat, visible through the glass at dusk
      const ls = new THREE.Mesh(box(15, 0.04, 0.3, 0, h - 0.33, zf - 1.6, 0), M.lightStrip);
      ls.visible = false;
      gl.add(ls);
      parts.lights.push(ls);
    } else {
      // pilot: lobby glass box at the back, stone entrance wall, ceiling lights
      const st = [box(6, B.pilotH - 0.3, 0.4, -6.5, (B.pilotH - 0.3) / 2, -B.D / 2 + 0.2, 0.01), box(0.4, B.pilotH - 0.3, 5, -9.6, (B.pilotH - 0.3) / 2, -B.D / 2 + 2.6, 0.01)];
      const stm = new THREE.Mesh(merge(st), M.stone);
      stm.castShadow = stm.receiveShadow = true;
      fac.add(stm);
      gl.add(new THREE.Mesh(box(7, B.pilotH - 0.35, 0.04, 2.5, (B.pilotH - 0.35) / 2, -B.D / 2 + 3.5, 0), M.glass));
      const ls = new THREE.Mesh(merge([0, 1, 2].map((i) => box(0.25, 0.04, 12, -5 + i * 5, B.pilotH - 0.33, 0, 0))), M.lightStrip);
      ls.visible = false;
      gl.add(ls);
      parts.lights.push(ls);
    }
    fac.position.y = gl.position.y = rails.position.y = y0;
    fac.visible = gl.visible = rails.visible = false;
    root.add(fac, gl, rails);
    parts.facade.push(fac);
    parts.glazing.push(gl);
    parts.rails.push(rails);
  }

  // roof: parapet + stair penthouse
  const roof = new THREE.Group();
  const pp = [box(B.W + 0.6, 0.9, 0.25, 0, 0.45, B.D / 2 + 0.05, 0.01), box(B.W + 0.6, 0.9, 0.25, 0, 0.45, -B.D / 2 - 0.05, 0.01), box(0.25, 0.9, B.D, B.W / 2 + 0.05, 0.45, 0, 0.01), box(0.25, 0.9, B.D, -B.W / 2 - 0.05, 0.45, 0, 0.01)];
  const ppm = new THREE.Mesh(merge(pp), M.stone);
  const ph = new THREE.Mesh(box(6, 3.0, 5, -5, 1.5, -3.5, 0.02), M.stone);
  const phg = new THREE.Mesh(box(2.4, 2.2, 0.03, -5, 1.2, -0.98, 0), M.glass);
  ppm.castShadow = ph.castShadow = true;
  roof.add(ppm, ph, phg);
  roof.position.y = roofY;
  roof.visible = false;
  root.add(roof);
  parts.roof = roof;

  // scaffolding on the front face (levels 3..6)
  const sc = [];
  const zS = B.D / 2 + 2.3, zS2 = zS + 1.1;
  const yTop = roofY + 1;
  for (let x = -10.5; x <= 10.51; x += 2.1) {
    sc.push([[x, levelY(3) - 0.3, zS], [x, yTop, zS]], [[x, levelY(3) - 0.3, zS2], [x, yTop, zS2]]);
  }
  for (let y = levelY(3); y <= yTop; y += 2.0) {
    sc.push([[-10.5, y, zS], [10.5, y, zS]], [[-10.5, y, zS2], [10.5, y, zS2]]);
    for (let x = -10.5; x <= 10.51; x += 2.1) sc.push([[x, y, zS], [x, y, zS2]]);
  }
  for (let x = -10.5; x < 10.4; x += 4.2) sc.push([[x, levelY(3), zS2], [x + 4.2, levelY(3) + 4.0, zS2]], [[x, levelY(3) + 4.0, zS2], [x + 4.2, levelY(3) + 8.0, zS2]]);
  const scm = tubes(sc, 0.024, M.galv, 6);
  const boards = [];
  for (let y = levelY(3); y <= yTop; y += 2.0) boards.push(box(21, 0.05, 1.0, 0, y + 0.03, (zS + zS2) / 2, 0));
  const bdm = new THREE.Mesh(merge(boards), M.formwork);
  const scaff = new THREE.Group();
  scaff.add(scm, bdm);
  scaff.visible = false;
  root.add(scaff);
  parts.scaffold = scaff;

  root.userData.parts = parts;
  return root;
}

// Tower crane: lattice mast, jib, counter-jib with ballast, cab, trolley, hook.
export function buildCrane(M, mastH = 34, jibL = 32) {
  const g = new THREE.Group();
  const s = 1.6, seg = 2.0;
  const pairs = [];
  const c = [[-s / 2, -s / 2], [s / 2, -s / 2], [s / 2, s / 2], [-s / 2, s / 2]];
  for (const [x, z] of c) pairs.push([[x, 0, z], [x, mastH, z]]);
  for (let y = 0; y < mastH - 0.01; y += seg) {
    for (let i = 0; i < 4; i++) {
      const [x1, z1] = c[i], [x2, z2] = c[(i + 1) % 4];
      pairs.push([[x1, y, z1], [x2, y + seg, z2]]);
      pairs.push([[x1, y, z1], [x2, y, z2]]);
    }
  }
  // jib: triangular section along +x, counter-jib along -x
  const jw = 1.0, jh = 1.4;
  const jy = mastH + 0.6;
  const chords = (x0, x1, top) => {
    const out = [[[x0, jy, -jw / 2], [x1, jy, -jw / 2]], [[x0, jy, jw / 2], [x1, jy, jw / 2]]];
    if (top) out.push([[x0, jy + jh, 0], [x1 * 0.98, jy + jh * 0.3, 0]]);
    return out;
  };
  pairs.push(...chords(0, jibL, true), ...chords(-11, 0, false));
  for (let x = 0; x < jibL - 0.01; x += 1.6) {
    const k = 1 - x / jibL;
    const ht = jh * (0.3 + 0.7 * k);
    pairs.push([[x, jy, -jw / 2], [x + 1.6, jy + ht * 0.95, 0]], [[x, jy, jw / 2], [x + 1.6, jy + ht * 0.95, 0]], [[x, jy, -jw / 2], [x, jy, jw / 2]]);
  }
  for (let x = -11; x < 0; x += 1.6) pairs.push([[x, jy, -jw / 2], [x + 1.6, jy, jw / 2]], [[x, jy, -jw / 2], [x, jy, jw / 2]]);
  // tower head and pendants
  pairs.push([[-0.6, mastH, -0.6], [0, mastH + 6, 0]], [[0.6, mastH, 0.6], [0, mastH + 6, 0]], [[0.6, mastH, -0.6], [0, mastH + 6, 0]], [[-0.6, mastH, 0.6], [0, mastH + 6, 0]]);
  const lattice = tubes(pairs, 0.06, M.craneYellow, 6);
  g.add(lattice);
  const cables = tubes([[[0, mastH + 6, 0], [jibL * 0.7, jy + 0.5, 0]], [[0, mastH + 6, 0], [-10, jy + 0.3, 0]]], 0.025, M.darkSteel, 4);
  g.add(cables);
  const ballast = new THREE.Mesh(box(2.2, 2.4, 1.6, -9.5, jy - 0.9, 0, 0.05), M.concreteFresh);
  const cab = new THREE.Mesh(box(1.6, 1.8, 1.6, 1.2, mastH - 0.6, 1.4, 0.08), M.craneYellow);
  const cabGlass = new THREE.Mesh(box(1.62, 0.9, 1.0, 1.25, mastH - 0.4, 1.6, 0.02), M.glass);
  ballast.castShadow = cab.castShadow = true;
  g.add(ballast, cab, cabGlass);
  // trolley + hook (animated along the jib)
  const trolley = new THREE.Group();
  trolley.add(new THREE.Mesh(box(1.2, 0.4, 1.3, 0, jy - 0.3, 0, 0.03), M.darkSteel));
  const hookLine = tubes([[[0, jy - 0.4, -0.15], [0, 0, -0.15]], [[0, jy - 0.4, 0.15], [0, 0, 0.15]]], 0.012, M.darkSteel, 4);
  const hook = new THREE.Mesh(box(0.6, 0.9, 0.5, 0, 0, 0, 0.08), M.craneYellow);
  trolley.add(hookLine, hook);
  trolley.userData.setDrop = (drop) => {
    hookLine.scale.y = 1;
    hook.position.y = jy - 0.6 - drop;
    hookLine.position.y = 0;
    hookLine.scale.set(1, (jy - 0.4 - (jy - 0.6 - drop)) / (jy - 0.4), 1);
    hookLine.position.y = jy - 0.4 - (jy - 0.4) * hookLine.scale.y;
  };
  trolley.userData.setDrop(14);
  trolley.position.x = 18;
  g.add(trolley);
  // red aviation lights
  const red = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), M.warning);
  red.position.set(0, mastH + 6.2, 0);
  const red2 = red.clone();
  red2.position.set(jibL, jy + 0.6, 0);
  g.add(red, red2);
  g.userData = { trolley, jy };
  lattice.castShadow = true;
  return g;
}
