// The surrounding city: dense mid-rise blocks with rooftop clutter (water
// tanks, AC units), streets, sidewalks, street lights, traffic light trails,
// and the empty 500 m2 lot with its site fence. All instanced and seeded.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { mulberry32 } from "./util.js";

export const LOT = { x0: -10.2, x1: 10.2, z0: -15.5, z1: 9.5 };
const ROAD = 14, WALK = 3;

// City facade material: procedural facades (floors, bays, framed windows,
// lit shopfronts, interior lights) from per-instance size, style and seed.
function facadeMaterial(TEX, U) {
  const mat = new THREE.MeshStandardMaterial({ map: TEX.concrete_basecolor, emissive: 0xffffff, roughness: 0.85, metalness: 0.0 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uGlow = U.windowGlow;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aStyle;\nattribute float aSeed;\nvarying vec3 vFac;\nvarying float vStyle;\nvarying float vSeed;\nvarying float vTop;\nvarying vec3 vLoc;\nvarying vec3 vScale;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vec3 sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        float uw = abs(normal.x) > 0.5 ? (position.z + 0.5) * sc.z : (position.x + 0.5) * sc.x;
        vFac = vec3(uw, position.y * sc.y, 0.0);
        vStyle = aStyle; vSeed = aSeed; vTop = normal.y; vLoc = position; vScale = sc;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vFac; varying float vStyle; varying float vSeed; varying float vTop; varying vec3 vLoc; varying vec3 vScale;
        uniform float uGlow;
        float hh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`,
      )
      .replace(
        "#include <map_fragment>",
        `float isWin = 0.0, frameK = 0.0, lit = 0.0; vec3 litCol = vec3(0.0); float fvv = 0.0;
        if (vTop > 0.5) {
          vec2 rp = vLoc.xz * vScale.xz;
          vec3 rc = texture2D(map, rp / 5.0 + vSeed).rgb;
          float edge = min(vScale.x * 0.5 - abs(rp.x), vScale.z * 0.5 - abs(rp.y));
          diffuseColor.rgb = rc * mix(vec3(0.42, 0.41, 0.40), vec3(0.62, 0.60, 0.56), hh(vec2(vSeed, 3.0))) * mix(0.45, 1.0, smoothstep(0.0, 1.6, edge));
        } else {
          float st = floor(vStyle + 0.5);
          float bw = st < 0.5 ? 3.0 : st < 1.5 ? 2.4 : st < 2.5 ? 1.55 : 3.6;
          float fh = 3.2;
          float u = vFac.x, v = vFac.y;
          float fl = floor(v / fh), fv = fract(v / fh);
          float bay = floor(u / bw), fu = fract(u / bw);
          fvv = fv;
          float sd = hh(vec2(vSeed, 1.0));
          vec3 wallA = mix(vec3(0.78, 0.72, 0.62), vec3(0.88, 0.86, 0.82), hh(vec2(vSeed, 2.0)));
          vec3 wallB = mix(vec3(0.55, 0.36, 0.27), vec3(0.42, 0.44, 0.47), hh(vec2(vSeed, 5.0)));
          vec3 wall = sd < 0.55 ? wallA : wallB;
          wall *= 0.85 + 0.3 * texture2D(map, vec2(u, v) / 3.0).r - 0.12;
          vec2 wmin = st > 1.5 && st < 2.5 ? vec2(0.07, 0.14) : vec2(0.2, 0.3);
          vec2 wmax = st > 1.5 && st < 2.5 ? vec2(0.93, 0.93) : vec2(0.8, 0.86);
          float shop = step(fl, 0.5);
          if (shop > 0.5) { wmin = vec2(0.05, 0.04); wmax = vec2(0.95, 0.8); }
          float top = floor((vScale.y - 0.8) / fh);
          float inX = step(wmin.x, fu) * step(fu, wmax.x), inY = step(wmin.y, fv) * step(fv, wmax.y);
          isWin = inX * inY * step(fl, top - 0.5);
          float fx = min(fu - wmin.x, wmax.x - fu) * bw, fy = min(fv - wmin.y, wmax.y - fv) * fh;
          frameK = isWin * (1.0 - step(0.07, min(fx, fy)));
          float mull = isWin * (1.0 - step(0.035, abs(fu - 0.5) * bw)) * (1.0 - shop);
          frameK = max(frameK, mull);
          float r = hh(vec2(vSeed * 13.1 + bay, fl));
          lit = isWin * (1.0 - frameK) * step(r, shop > 0.5 ? 0.55 : 0.33);
          float c = hh(vec2(r, vSeed));
          litCol = c < 0.62 ? vec3(1.0, 0.66, 0.36) : c < 0.88 ? vec3(1.0, 0.83, 0.6) : vec3(0.7, 0.82, 1.0);
          litCol *= shop > 0.5 ? 0.9 : (0.55 + 0.6 * hh(vec2(c, 7.0)));
          float band = (1.0 - step(0.07, fv)) * (1.0 - shop);
          vec3 glassC = vec3(0.05, 0.065, 0.08);
          vec3 col = mix(wall, wall * 0.78, band);
          col = isWin > 0.5 ? (frameK > 0.5 ? vec3(0.06, 0.06, 0.065) : glassC) : col;
          float recess = isWin * (1.0 - frameK) * smoothstep(0.0, 0.25, min(fx, fy));
          col *= isWin > 0.5 ? (0.6 + 0.4 * recess) : 1.0;
          diffuseColor.rgb = col;
        }`,
      )
      .replace("#include <roughnessmap_fragment>", "float roughnessFactor = isWin > 0.5 ? (frameK > 0.5 ? 0.45 : 0.1) : 0.86;")
      .replace("#include <metalnessmap_fragment>", "float metalnessFactor = isWin > 0.5 && frameK < 0.5 ? 0.55 : 0.0;")
      .replace("#include <emissivemap_fragment>", "totalEmissiveRadiance = lit * litCol * uGlow * (0.75 + 0.35 * fvv);");
  };
  mat.customProgramCacheKey = () => "cityfacade2";
  return mat;
}

// soft warm light pools under the street lamps (additive decals)
function poolTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, "rgba(255,255,255,1)");
  gr.addColorStop(0.35, "rgba(255,255,255,0.45)");
  gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  return t;
}

export function buildCity(M, TEX, U) {
  const root = new THREE.Group();
  root.name = "city";
  const rnd = mulberry32(2024);

  // ground plane
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), M.asphalt);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  root.add(ground);

  // block grid: blocks 140 x 84 m (x, z), roads between
  const BX = 140, BZ = 84;
  const blocks = [];
  for (let i = -5; i <= 5; i++)
    for (let j = -6; j <= 4; j++) {
      const x0 = i * (BX + ROAD + 2 * WALK) - BX / 2;
      const z1 = 9.5 + j * (BZ + ROAD + 2 * WALK);
      blocks.push({ x0, x1: x0 + BX, z0: z1 - BZ, z1, i, j });
    }

  const bldg = []; // [cx, cz, w, d, h, style]
  const keepClear = (x0, x1, z0, z1) => !(x1 > LOT.x0 - 0.2 && x0 < LOT.x1 + 0.2 && z1 > LOT.z0 - 0.2 && z0 < LOT.z1 + 0.2);
  for (const b of blocks) {
    const dist = Math.hypot((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
    const tall = dist > 260 && rnd() < 0.3;
    // perimeter parcels on all four sides
    const sides = [
      ["z1", b.x0, b.x1], ["z0", b.x0, b.x1], ["x0", b.z0 + 26, b.z1 - 26], ["x1", b.z0 + 26, b.z1 - 26],
    ];
    for (const [side, a0, a1] of sides) {
      let a = a0;
      while (a < a1 - 6) {
        const w = Math.min(a1 - a, 10 + rnd() * 14);
        const d = 18 + rnd() * 9;
        const floors = tall && rnd() < 0.5 ? 12 + Math.floor(rnd() * 18) : 3 + Math.floor(rnd() * 6) + (dist < 120 ? 1 : 0);
        const h = floors * 3.2 + 0.8;
        let cx, cz, bw, bd;
        if (side === "z1") { cx = a + w / 2; cz = b.z1 - d / 2; bw = w; bd = d; }
        else if (side === "z0") { cx = a + w / 2; cz = b.z0 + d / 2; bw = w; bd = d; }
        else if (side === "x0") { cx = b.x0 + d / 2; cz = a + w / 2; bw = d; bd = w; }
        else { cx = b.x1 - d / 2; cz = a + w / 2; bw = d; bd = w; }
        const opposite = Math.abs(cx) < 60 && cz > 25 && cz < 80;
        const hh = opposite ? (2 + Math.floor(rnd() * 2)) * 3.2 + 0.8 : h;
        if (keepClear(cx - bw / 2, cx + bw / 2, cz - bd / 2, cz + bd / 2)) bldg.push([cx, cz, bw - 0.3, bd, hh, Math.floor(rnd() * 4)]);
        a += w;
      }
    }
    // a few inner buildings / towers
    if (rnd() < 0.6) {
      const cx = (b.x0 + b.x1) / 2 + (rnd() - 0.5) * 40, cz = (b.z0 + b.z1) / 2 + (rnd() - 0.5) * 20;
      const floors = tall ? 18 + Math.floor(rnd() * 16) : 2 + Math.floor(rnd() * 4);
      if (keepClear(cx - 12, cx + 12, cz - 10, cz + 10)) bldg.push([cx, cz, 18 + rnd() * 10, 16 + rnd() * 8, floors * 3.2 + 1, Math.floor(rnd() * 4)]);
    }
  }
  // the lot's direct neighbours: attached mid-rise, as in a real street
  bldg.push([-21.5, -3, 22, 25, 6 * 3.2 + 1.2, 1], [21.5, -3, 22, 25, 5 * 3.2 + 1.2, 3]);

  const unit = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const styles = new Float32Array(bldg.length);
  const seeds = new Float32Array(bldg.length);
  const fac = new THREE.InstancedMesh(unit, facadeMaterial(TEX, U), bldg.length);
  const m = new THREE.Matrix4();
  bldg.forEach(([cx, cz, w, d, h, s], i) => {
    m.makeScale(w, h, d).setPosition(cx, 0, cz);
    fac.setMatrixAt(i, m);
    styles[i] = s;
    seeds[i] = (i * 0.6180339) % 1;
  });
  unit.setAttribute("aStyle", new THREE.InstancedBufferAttribute(styles, 1));
  unit.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 1));
  fac.castShadow = fac.receiveShadow = true;
  root.add(fac);

  // rooftop clutter: parapets, water tanks, AC units, stair boxes
  const tanks = [], acs = [], stairs = [], parapets = [];
  bldg.forEach(([cx, cz, w, d, h]) => {
    parapets.push([cx, h, cz, w, 0.7, d]);
    const n = 1 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) tanks.push([cx + (rnd() - 0.5) * w * 0.6, h, cz + (rnd() - 0.5) * d * 0.6, 0.6 + rnd() * 0.5]);
    const na = 2 + Math.floor(rnd() * 5);
    for (let k = 0; k < na; k++) acs.push([cx + (rnd() - 0.5) * w * 0.8, h, cz + (rnd() - 0.5) * d * 0.8, rnd() * Math.PI]);
    if (rnd() < 0.8) stairs.push([cx + (rnd() - 0.5) * w * 0.4, h, cz + (rnd() - 0.5) * d * 0.4, 3 + rnd() * 2, 2.6, 3 + rnd() * 2]);
  });
  const inst = (geo, mat, rows, fn) => {
    const im = new THREE.InstancedMesh(geo, mat, rows.length);
    rows.forEach((r, i) => im.setMatrixAt(i, fn(r)));
    im.castShadow = im.receiveShadow = true;
    root.add(im);
    return im;
  };
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x5d5c5a, roughness: 0.9 });
  const tankMat = new THREE.MeshStandardMaterial({ color: 0xc9ccce, roughness: 0.5, metalness: 0.3 });
  const acMat = new THREE.MeshStandardMaterial({ color: 0xb4b6b3, roughness: 0.6, metalness: 0.2 });
  // parapet = hollow ring approximated by a thin slab rim
  const rim = mergeGeometries([
    new THREE.BoxGeometry(1, 1, 0.02).translate(0, 0.5, 0.49), new THREE.BoxGeometry(1, 1, 0.02).translate(0, 0.5, -0.49),
    new THREE.BoxGeometry(0.02, 1, 1).translate(0.49, 0.5, 0), new THREE.BoxGeometry(0.02, 1, 1).translate(-0.49, 0.5, 0),
  ]);
  inst(rim, roofMat, parapets, ([x, y, z, w, h, d]) => new THREE.Matrix4().makeScale(w, h, d).setPosition(x, y, z));
  inst(new THREE.CylinderGeometry(1, 1, 1.6, 16).translate(0, 0.8 + 0.4, 0), tankMat, tanks, ([x, y, z, r]) => new THREE.Matrix4().makeScale(r, 1, r).setPosition(x, y, z));
  inst(new RoundedBoxGeometry(1.0, 0.7, 0.6, 1, 0.04).translate(0, 0.35, 0), acMat, acs, ([x, y, z, a]) => new THREE.Matrix4().makeRotationY(a).setPosition(x, y, z));
  inst(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), roofMat, stairs, ([x, y, z, w, h, d]) => new THREE.Matrix4().makeScale(w, h, d).setPosition(x, y, z));

  // sidewalks (raised), curbs
  const walks = [];
  for (const b of blocks) {
    walks.push(new THREE.BoxGeometry(b.x1 - b.x0 + 2 * WALK, 0.16, WALK).translate((b.x0 + b.x1) / 2, 0.08, b.z1 + WALK / 2));
    walks.push(new THREE.BoxGeometry(b.x1 - b.x0 + 2 * WALK, 0.16, WALK).translate((b.x0 + b.x1) / 2, 0.08, b.z0 - WALK / 2));
    walks.push(new THREE.BoxGeometry(WALK, 0.16, b.z1 - b.z0).translate(b.x0 - WALK / 2, 0.08, (b.z0 + b.z1) / 2));
    walks.push(new THREE.BoxGeometry(WALK, 0.16, b.z1 - b.z0).translate(b.x1 + WALK / 2, 0.08, (b.z0 + b.z1) / 2));
    // block interior (yards) slightly raised, dark
    walks.push(new THREE.BoxGeometry(b.x1 - b.x0, 0.12, b.z1 - b.z0).translate((b.x0 + b.x1) / 2, 0.06, (b.z0 + b.z1) / 2));
  }
  const wm = new THREE.Mesh(mergeGeometries(walks), M.sidewalk);
  wm.receiveShadow = true;
  root.add(wm);

  // lane markings: dashed centre lines on every road
  const dashes = [];
  const roadsX = [], roadsZ = [];
  for (let i = -5; i <= 5; i++) roadsX.push(i * (BX + ROAD + 2 * WALK) - BX / 2 - WALK - ROAD / 2);
  for (let j = -6; j <= 4; j++) roadsZ.push(9.5 + j * (BZ + ROAD + 2 * WALK) + WALK + ROAD / 2);
  for (const z of roadsZ) for (let x = -900; x < 900; x += 9) dashes.push([x, z, 0]);
  for (const x of roadsX) for (let z = -700; z < 500; z += 9) dashes.push([x, z, 1]);
  const dashMat = new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.7 });
  inst(new THREE.PlaneGeometry(4, 0.16).rotateX(-Math.PI / 2).translate(0, 0.012, 0), dashMat, dashes, ([x, z, r]) => new THREE.Matrix4().makeRotationY(r ? Math.PI / 2 : 0).setPosition(x, 0, z));

  // street lights along sidewalks
  const poles = [];
  for (const z of roadsZ) for (let x = -700; x < 700; x += 28) { poles.push([x, z - ROAD / 2 - 0.6]); poles.push([x + 14, z + ROAD / 2 + 0.6]); }
  for (const x of roadsX) for (let z = -600; z < 400; z += 28) { poles.push([x - ROAD / 2 - 0.6, z]); poles.push([x + ROAD / 2 + 0.6, z + 14]); }
  const poleMesh = inst(new THREE.CylinderGeometry(0.08, 0.11, 8, 6).translate(0, 4, 0), M.darkSteel, poles, ([x, z]) => new THREE.Matrix4().setPosition(x, 0, z));
  const headMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.75, 0.45) });
  const lamps = inst(new THREE.BoxGeometry(0.7, 0.12, 0.3).translate(0, 8, 0), headMat, poles, ([x, z]) => new THREE.Matrix4().setPosition(x, 0, z));
  lamps.castShadow = false;
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTexture(), color: new THREE.Color(1.0, 0.62, 0.3).multiplyScalar(0.55), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const pools = inst(new THREE.PlaneGeometry(16, 16).rotateX(-Math.PI / 2).translate(0, 0.2, 0), poolMat, poles, ([x, z]) => new THREE.Matrix4().setPosition(x, 0, z));
  pools.castShadow = pools.receiveShadow = false;

  // traffic: light trails moving along lanes (white heads one way, red tails the other)
  const cars = [];
  for (const z of roadsZ) for (let k = 0; k < 26; k++) cars.push({ axis: 0, lane: z + (k % 2 ? 3.2 : -3.2), dir: k % 2 ? 1 : -1, off: rnd() * 1800, v: 9 + rnd() * 6 });
  for (const x of roadsX) for (let k = 0; k < 18; k++) cars.push({ axis: 1, lane: x + (k % 2 ? 3.2 : -3.2), dir: k % 2 ? -1 : 1, off: rnd() * 1200, v: 9 + rnd() * 6 });
  const trailGeo = new THREE.BoxGeometry(1, 0.25, 1).translate(0, 0.6, 0);
  const headM = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.92, 0.8).multiplyScalar(3) });
  const tailM = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.1, 0.05).multiplyScalar(3) });
  const heads = new THREE.InstancedMesh(trailGeo, headM, cars.length);
  const tails = new THREE.InstancedMesh(trailGeo, tailM, cars.length);
  root.add(heads, tails);
  const trafficAt = (t, streak = 6) => {
    const mm = new THREE.Matrix4();
    cars.forEach((c, i) => {
      const span = c.axis === 0 ? 1800 : 1200, base = c.axis === 0 ? -900 : -700;
      const s = base + ((((c.off + c.dir * c.v * t) % span) + span) % span);
      const isHead = c.dir > 0;
      const w = 1.7, len = streak;
      if (c.axis === 0) mm.makeScale(len, 0.6, w * 0.12).setPosition(s, 0, c.lane);
      else mm.makeScale(w * 0.12, 0.6, len).setPosition(c.lane, 0, s);
      (isHead ? heads : tails).setMatrixAt(i, mm);
      (isHead ? tails : heads).setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0));
    });
    heads.instanceMatrix.needsUpdate = tails.instanceMatrix.needsUpdate = true;
  };
  trafficAt(0);

  root.userData = { trafficAt, lamps, pools, poleMesh, headMat, facades: fac };
  return root;
}

// The empty lot: soil, site fence on the street with a gate, site container,
// rebar bundles and pallets.
export function buildLot(M) {
  const g = new THREE.Group();
  g.name = "lot";
  const w = LOT.x1 - LOT.x0, d = LOT.z1 - LOT.z0;
  const soil = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, d).translate((LOT.x0 + LOT.x1) / 2, -0.12, (LOT.z0 + LOT.z1) / 2), M.soil);
  soil.receiveShadow = true;
  g.add(soil);
  // fence: corrugated panels on posts along the street, gap for the gate
  const panels = [], posts = [];
  for (let x = LOT.x0; x < LOT.x1 - 0.1; x += 2.0) {
    if (x > 2 && x < 6) continue;
    panels.push(new RoundedBoxGeometry(1.96, 2.4, 0.04, 1, 0.01).translate(x + 1.0, 1.2, LOT.z1 - 0.1));
    posts.push(new THREE.BoxGeometry(0.08, 2.5, 0.08).translate(x, 1.25, LOT.z1 - 0.06));
  }
  const fence = new THREE.Mesh(mergeGeometries(panels), M.fence);
  const postM = new THREE.Mesh(mergeGeometries(posts), M.fenceFrame);
  fence.castShadow = fence.receiveShadow = true;
  g.add(fence, postM);
  // site container in the back yard
  const cont = new THREE.Mesh(new RoundedBoxGeometry(6, 2.6, 2.4, 2, 0.05).translate(5, 1.3, -12.5), new THREE.MeshStandardMaterial({ color: 0xe6e3dc, roughness: 0.6, metalness: 0.3 }));
  cont.castShadow = cont.receiveShadow = true;
  g.add(cont);
  // rebar bundles
  const bars = [];
  for (let k = 0; k < 3; k++) for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2, r = (i % 7) * 0.02;
    bars.push(new THREE.CylinderGeometry(0.012, 0.012, 9, 5).rotateZ(Math.PI / 2).translate(-3, 0.2 + Math.sin(a) * r + k * 0.05, -12 + k * 0.6 + Math.cos(a) * r));
  }
  const bm = new THREE.Mesh(mergeGeometries(bars), M.rebar);
  bm.castShadow = true;
  g.add(bm);
  // pallets of blocks
  const pal = [];
  for (let i = 0; i < 4; i++) pal.push(new RoundedBoxGeometry(1.2, 1.0, 1.0, 1, 0.02).translate(-8 + i * 1.4, 0.5, -13.5));
  const pm = new THREE.Mesh(mergeGeometries(pal), M.concreteFresh);
  pm.castShadow = true;
  g.add(pm);
  // site lighting: a high work light over the lot (shadows) and a cool rim from the back
  const floods = [];
  const key = new THREE.SpotLight(0xffe7c4, 9000, 120, 0.42, 0.65, 2);
  key.position.set(10, 42, 14);
  key.target.position.set(0, 0, -3);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0003;
  key.shadow.normalBias = 0.02;
  key.shadow.camera.near = 10;
  key.shadow.camera.far = 90;
  const rim = new THREE.SpotLight(0x9fc0ff, 2600, 80, 0.6, 0.7, 2);
  rim.position.set(-16, 14, -26);
  rim.target.position.set(0, 6, 0);
  g.add(key, key.target, rim, rim.target);
  floods.push(key, rim);
  g.userData.floods = floods;
  return g;
}
