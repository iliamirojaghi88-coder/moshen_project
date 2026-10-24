#!/usr/bin/env node
// Studio preview renderer for GLB/GLTF files (Playwright + Three.js, offline).
//
//   node tools/3d/preview.mjs <model.glb> <out.webp> [--size 512] [--views 3q|front|turntable]
//        [--morph name=0.8,name2=1] [--anim clip.glb --time 1.5] [--bg #e9e7e3] [--json]
//
// Frames the model by its bounding box, lights it with a neutral studio rig
// (RoomEnvironment + key/rim), renders a 3/4 view (or front, or a 4-view
// turntable strip) and prints stats: triangles, meshes, materials, textures,
// bones, morph targets, animations, real-world size. Used for library
// thumbnails and as the quality gate before an asset is approved.
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
// The cloud image ships a global Playwright + Chromium; ESM can't resolve
// global packages, CommonJS require can.
const { chromium } = createRequire(import.meta.url)("playwright");
const argv = process.argv.slice(2);
const opt = (k, d) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const [model, out] = argv.filter((a, i) => !a.startsWith("--") && !argv[i - 1]?.startsWith("--"));
if (!model || !out) {
  console.error("usage: preview.mjs <model.glb> <out.webp|png> [--size 512] [--views 3q|front|turntable] [--morph a=1] [--bg #hex]");
  process.exit(2);
}
const size = Number(opt("size", 512));
const views = opt("views", "3q");
const bg = opt("bg", "#e9e7e3");
const anim = opt("anim", null);
const animTime = Number(opt("time", 1));
const morph = Object.fromEntries((opt("morph", "") || "").split(",").filter(Boolean).map((p) => p.split("=")).map(([k, v]) => [k, Number(v)]));

const modelPath = resolve(model);
const modelDir = dirname(modelPath);
const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".bin": "application/octet-stream", ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".html": "text/html", ".ktx2": "image/ktx2" };

const page = `<!doctype html><html><body style="margin:0;background:${bg}">
<canvas id="c" width="${views === "turntable" ? size * 4 : size}" height="${size}"></canvas>
<script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
const W = ${views === "turntable" ? size * 4 : size}, H = ${size};
const r = new THREE.WebGLRenderer({ canvas: document.getElementById("c"), antialias: true, preserveDrawingBuffer: true });
r.setSize(W, H, false); r.toneMapping = THREE.AgXToneMapping; r.setScissorTest(true);
const scene = new THREE.Scene(); scene.background = new THREE.Color("${bg}");
const pmrem = new THREE.PMREMGenerator(r); scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.9;
const key = new THREE.DirectionalLight(0xfff4e6, 1.6); key.position.set(-2, 3, 2.5); scene.add(key);
const rim = new THREE.DirectionalLight(0xdfe8ff, 1.0); rim.position.set(2, 2, -3); scene.add(rim);
const gltf = await new GLTFLoader().loadAsync("/model/${encodeURIComponent(model.split("/").pop())}");
const root = gltf.scene; scene.add(root);
const stats = { tris: 0, meshes: 0, materials: new Set(), textures: new Set(), bones: 0, morphTargets: 0, morphNames: [], animations: gltf.animations.map((a) => a.name) };
const morph = ${JSON.stringify(morph)};
root.traverse((o) => {
  if (o.isBone) stats.bones++;
  if (!o.isMesh) return;
  stats.meshes++;
  const g = o.geometry; stats.tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
  for (const m of [].concat(o.material)) { stats.materials.add(m.uuid); for (const k of ["map","normalMap","roughnessMap","metalnessMap","aoMap","emissiveMap"]) if (m[k]) stats.textures.add(m[k].uuid); }
  if (o.morphTargetDictionary) {
    const names = Object.keys(o.morphTargetDictionary);
    if (names.length > stats.morphTargets) { stats.morphTargets = names.length; stats.morphNames = names; }
    for (const [k, v] of Object.entries(morph)) if (o.morphTargetDictionary[k] !== undefined) o.morphTargetInfluences[o.morphTargetDictionary[k]] = v;
  }
});
${anim ? `const clipGltf = await new GLTFLoader().loadAsync("/anim/clip.glb");
const mixer = new THREE.AnimationMixer(root);
mixer.clipAction(clipGltf.animations[0]).play();
mixer.setTime(${animTime});
stats.animations.push(clipGltf.animations[0].name + "@${animTime}s");` : ""}
root.updateMatrixWorld(true);
const box = new THREE.Box3().setFromObject(root, true), sz = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
const shadow = new THREE.Mesh(new THREE.CircleGeometry(Math.max(sz.x, sz.z) * 0.75, 64), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.12 }));
shadow.rotation.x = -Math.PI / 2; shadow.position.set(c.x, box.min.y + 0.0005 * sz.y, c.z); scene.add(shadow);
const cam = new THREE.PerspectiveCamera(30, (W / (${views === "turntable" ? 4 : 1})) / H, 0.001, 1000);
const radius = sz.length() * 0.5, dist = radius / Math.sin(THREE.MathUtils.degToRad(15)) * 1.02;
const angles = ${JSON.stringify(views === "turntable" ? [0.6, 2.17, 3.74, 5.31] : views === "front" ? [0] : [0.65])};
const vw = W / angles.length;
angles.forEach((a, i) => {
  const el = ${views === "front" ? 0.05 : 0.32};
  cam.position.set(c.x + Math.sin(a) * Math.cos(el) * dist, c.y + Math.sin(el) * dist, c.z + Math.cos(a) * Math.cos(el) * dist);
  cam.lookAt(c); cam.updateProjectionMatrix();
  r.setViewport(i * vw, 0, vw, H); r.setScissor(i * vw, 0, vw, H); r.render(scene, cam);
});
window.__stats = { ...stats, materials: stats.materials.size, textures: stats.textures.size, tris: Math.round(stats.tris), sizeM: [sz.x, sz.y, sz.z].map((v) => +v.toFixed(3)) };
window.__done = true;
</script></body></html>`;

const server = createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  let file;
  if (url === "/") return res.end(page);
  if (url.startsWith("/three/")) file = join(ROOT, "node_modules", url);
  else if (url.startsWith("/model/")) file = join(modelDir, url.slice(7));
  else if (url === "/anim/clip.glb" && anim) file = resolve(anim);
  if (!file || !existsSync(file) || !statSync(file).isFile()) { res.statusCode = 404; return res.end(); }
  res.setHeader("Content-Type", MIME[extname(file)] ?? "application/octet-stream");
  res.end(readFileSync(file));
}).listen(0);
const port = server.address().port;

const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  const p = await browser.newPage({ viewport: { width: views === "turntable" ? size * 4 : size, height: size } });
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${port}/`);
  await p.waitForFunction(() => window.__done || false, null, { timeout: 120000 }).catch(() => {});
  if (errors.length) throw new Error(errors.join("\n"));
  const stats = await p.evaluate(() => window.__stats);
  const buf = await p.locator("#c").screenshot({ type: out.endsWith(".png") ? "png" : "jpeg", quality: out.endsWith(".png") ? undefined : 88 });
  writeFileSync(out.replace(/\.webp$/, ".jpg"), buf);
  const short = { ...stats, morphNames: stats.morphNames.slice(0, 8) };
  console.log(argv.includes("--json") ? JSON.stringify(stats) : `${model}: ${JSON.stringify(short)}`);
} finally {
  await browser.close();
  server.close();
}
