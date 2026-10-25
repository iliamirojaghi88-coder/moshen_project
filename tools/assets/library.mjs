// Library layer on top of assets.mjs: offline catalogs, local-first smart
// search, one-command install with conversion + preview + QC, gallery.
//
// Catalogs (metadata only, in git): library/catalog/<source>.json
// Installed assets: library/<kind>/<source>/<id>/ + a ledger row with
//   kind, category, tags, files, preview, stats (tris, bones, morphs, size),
//   qc (automatic checks), status (ready = QC passed + reviewed; approved =
//   user approved; pending; rejected), licence, source page.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, copyFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { ROOT, LIBRARY, SOURCES, license, getJson, download, readLedger, writeLedger, upsert } from "./assets.mjs";

const CATALOG = join(LIBRARY, "catalog");
// Downloaded/converted files live in a git-ignored cache; projects copy what
// they use into videos/<project>/assets/. The ledger (git) keeps provenance,
// QC and usage, so any asset can be re-created on demand with `install`.
const CACHE = join(LIBRARY, ".cache");
const SRC = process.env.ASSET_SRC_DIR ?? "/opt/src";
const RAW = "https://raw.githubusercontent.com";
const NPX = ["--no-install", "gltf-transform"];

// ---------- helpers ----------

const sh = (cmd, argv, opts = {}) => execFileSync(cmd, argv, { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1 << 28, ...opts }).toString();
const rel = (p) => p.slice(ROOT.length + 1);
const sha256 = (f) => createHash("sha256").update(readFileSync(f)).digest("hex");
const words = (s) => String(s).toLowerCase().replace(/[^a-z0-9؀-ۿ]+/g, " ").trim().split(/\s+/).filter(Boolean);

function sparseRepo(url, dir, paths) {
  if (!existsSync(join(dir, ".git"))) {
    mkdirSync(dirname(dir), { recursive: true });
    sh("git", ["clone", "-q", "--depth", "1", "--filter=blob:none", "--sparse", url, dir], { env: { ...process.env, GIT_LFS_SKIP_SMUDGE: "1" } });
  }
  // `clone --sparse` starts in cone mode, but callers pass file patterns: switch to non-cone once.
  let cone = "";
  try {
    cone = sh("git", ["-C", dir, "config", "--get", "core.sparseCheckoutCone"]).trim();
  } catch {
    // unset: git's default for `sparse-checkout add` is cone mode
  }
  if (cone !== "false") {
    sh("git", ["-C", dir, "sparse-checkout", "set", "--no-cone", "/*", "!/*/"]);
  }
  if (paths?.length) sh("git", ["-C", dir, "sparse-checkout", "add", "--skip-checks", ...paths]);
  return dir;
}
const tree = (dir, path) => sh("git", ["-C", dir, "ls-tree", "-r", "--name-only", "HEAD", path]).split("\n").filter(Boolean);

// Synonyms widen scenario wording to catalogue wording (English; the planner
// writes English search queries). Kept small and literal on purpose.
const SYN = {
  phone: ["mobile", "smartphone", "cellphone", "cell"], mobile: ["phone", "smartphone"], laptop: ["notebook", "computer", "macbook"],
  computer: ["laptop", "pc", "monitor", "desktop"], tv: ["television", "monitor", "screen"], sofa: ["couch", "seating"], couch: ["sofa"],
  chair: ["seat", "seating", "armchair", "stool"], table: ["desk"], desk: ["table", "office"], bed: ["mattress"], lamp: ["light", "lighting"],
  car: ["vehicle", "automobile"], truck: ["vehicle", "lorry"], tree: ["trees", "plant"], plant: ["plants", "potted", "flower"], rock: ["rocks", "stone", "boulder"],
  building: ["buildings", "house", "structure"], house: ["building", "home"], tool: ["tools", "wrench", "hammer"], doctor: ["medical", "physician", "nurse"],
  nurse: ["medical"], business: ["office", "businessman", "businesswoman", "suit"], worker: ["construction", "builder"], police: ["officer", "cop"],
  kid: ["child", "children"], child: ["children", "kid"], woman: ["female"], man: ["male"], talk: ["gestic", "talk", "speak", "presentation"],
  walk: ["walk", "stroll"], sit: ["sit", "chair"], wave: ["wave", "greet"], money: ["coin", "dollar", "cash", "wallet"], coin: ["money", "dollar"],
  clock: ["time", "watch", "alarm"], watch: ["clock", "time"], tile: ["tiles", "ceramic"], ceramic: ["tile", "tiles", "pottery", "vase"],
};
function expand(q) {
  // Words the user typed weigh 3, their singular form 3, synonyms 1.
  const base = words(q);
  const out = new Map();
  for (const w of base) {
    out.set(w, 3);
    out.set(w.replace(/s$/, ""), 3);
    for (const s of SYN[w] ?? []) if (!out.has(s)) out.set(s, 1);
  }
  return [...out].map(([t, w]) => ({ t, w }));
}
function score(terms, hay) {
  const h = ` ${words(hay).join(" ")} `;
  let s = 0;
  const hit = new Set();
  for (const { t, w } of terms) {
    if (h.includes(` ${t} `)) { s += w; hit.add(t); }
    else if (t.length > 3 && h.includes(t)) { s += w / 3; hit.add(t); }
  }
  return s;
}

// ---------- catalogs ----------

async function buildPolyhaven() {
  const out = [];
  for (const [t, kind] of [["models", "model"], ["textures", "texture"], ["hdris", "hdri"]]) {
    const all = await getJson(`https://api.polyhaven.com/assets?t=${t}`);
    for (const [id, a] of Object.entries(all)) {
      out.push({
        key: `polyhaven:${id}`, kind, title: a.name, category: a.category ?? a.categories?.[0], tags: [...(a.categories ?? []), ...(a.tags ?? [])],
        description: a.description, polycount: a.polycount, dimensionsMm: a.dimensions?.map((v) => Math.round(v)), rigged: (a.categories ?? []).includes("rigged"),
        thumb: a.thumbnail_url, page: `https://polyhaven.com/a/${id}`, license: "CC0-1.0", popularity: a.download_count,
      });
    }
  }
  return out;
}

function buildRocketbox() {
  const dir = sparseRepo("https://github.com/microsoft/Microsoft-Rocketbox", join(SRC, "rocketbox"));
  const avatars = [...new Set(tree(dir, "Assets/Avatars").map((p) => p.split("/").slice(0, 4).join("/")).filter((p) => p.split("/").length === 4))];
  const chars = avatars.map((p) => {
    const [, , group, name] = p.split("/");
    const female = /female/i.test(name);
    const role = name.replace(/_(Female|Male)_\d+$/, "").replace(/^(Female|Male)_/, "").replace(/_\d+$/, "");
    return {
      key: `rocketbox:${name}`, kind: "character", title: name.replace(/_/g, " "), category: group === "Professions" ? `profession/${role.toLowerCase()}` : group.toLowerCase(),
      tags: [female ? "female" : "male", female ? "woman" : "man", group === "Children" ? "child" : "adult", role.toLowerCase(), "realistic", "rigged", "arkit", "visemes", "human", "person"],
      rigged: true, morphs: "52 ARKit + 15 visemes", bones: 80, thumb: `${RAW}/microsoft/Microsoft-Rocketbox/master/${p}/${name}.png`,
      page: `https://github.com/microsoft/Microsoft-Rocketbox/tree/master/${p}`, license: "MIT", repoPath: p,
    };
  });
  const anims = tree(dir, "Assets/Animations").filter((p) => p.endsWith(".fbx")).map((p) => {
    const clip = basename(p).split(".")[0].replace(/ /g, "_");
    return {
      key: `rocketbox-anim:${clip}`, kind: "animation", title: clip.replace(/_/g, " "), category: clip.startsWith("f_") ? "female" : clip.startsWith("m_") ? "male" : "any",
      tags: words(clip.replace(/^[fm]_/, "")), rigged: true, page: `https://github.com/microsoft/Microsoft-Rocketbox/tree/master/Assets/Animations`, license: "MIT", repoPath: p,
    };
  });
  return [...chars, ...anims];
}

async function buildKhronos() {
  const idx = await getJson(`${RAW}/KhronosGroup/glTF-Sample-Assets/main/Models/model-index.json`);
  return idx.filter((m) => m.variants["glTF-Binary"]).map((m) => ({
    key: `khronos:${m.name}`, kind: "model", title: m.label, category: "reference", tags: [...(m.tags ?? []), ...words(m.label)],
    thumb: `${RAW}/KhronosGroup/glTF-Sample-Assets/main/Models/${m.name}/${m.screenshot}`, page: `https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/${m.name}`, license: "see metadata.json",
  }));
}

function buildIcons3d() {
  const dir = sparseRepo("https://github.com/realvjy/3dicons", join(SRC, "3dicons"));
  const files = tree(dir, "content/3dicons-meta").filter((p) => p.endsWith(".md"));
  const byslug = {};
  for (const f of files) {
    const md = sh("git", ["-C", dir, "show", `HEAD:${f}`]);
    const get = (k) => md.match(new RegExp(`^${k}:\\s*(.+)$`, "m"))?.[1]?.trim();
    const slug = get("file-slug") ?? basename(f, ".md");
    const angle = get("angle") ?? "dynamic";
    const e = (byslug[slug] ??= { key: `3dicons:${slug}`, kind: "icon", title: get("title") ?? slug, category: "3d-icon", tags: [...words(slug), ...words(get("category") ?? ""), "3d"], license: "CC0-1.0", page: "https://3dicons.co", variants: {} });
    for (const style of ["clay", "gradient", "color", "premium"]) if (get(style)) e.variants[`${angle}-${style}`] = get(style);
    e.thumb ??= e.variants[`${angle}-color`];
  }
  return Object.values(byslug);
}

function buildFluent3d() {
  const dir = sparseRepo("https://github.com/microsoft/fluentui-emoji", join(SRC, "fluentui-emoji"));
  return tree(dir, "assets").filter((p) => /\/3D\/[^/]+_3d\.png$/.test(p)).map((p) => {
    const name = p.split("/")[1];
    return {
      key: `fluent3d:${name}`, kind: "icon", title: name, category: "3d-emoji", tags: [...words(name), "3d", "emoji"], license: "MIT",
      thumb: `${RAW}/microsoft/fluentui-emoji/main/${p.split("/").map(encodeURIComponent).join("/")}`, page: "https://github.com/microsoft/fluentui-emoji", repoPath: p,
    };
  });
}

async function buildRegistry() {
  const reg = await getJson(`${RAW}/heygen-com/hyperframes/main/registry/registry.json`);
  const items = reg.items ?? reg.blocks ?? reg;
  return (Array.isArray(items) ? items : Object.values(items)).map((x) => ({
    key: `hyperframes:${x.name ?? x.id}`, kind: "element", title: x.title ?? x.name, category: x.type ?? x.category ?? "block",
    tags: [...(x.tags ?? []), ...words(x.description ?? ""), ...words(x.name ?? "")], description: x.description, license: "Apache-2.0 (HyperFrames registry)",
    page: `https://hyperframes.heygen.com/catalog/blocks/${x.name}`, usage: `npx hyperframes add ${x.name}  (inside a video project)`,
  }));
}

const BUILDERS = { polyhaven: buildPolyhaven, rocketbox: buildRocketbox, khronos: buildKhronos, "3dicons": buildIcons3d, fluent3d: buildFluent3d, hyperframes: buildRegistry };

function loadCatalogs() {
  if (!existsSync(CATALOG)) return [];
  return readdirSync(CATALOG).filter((f) => f.endsWith(".json")).flatMap((f) => JSON.parse(readFileSync(join(CATALOG, f), "utf8")));
}

export async function catalog(a) {
  const sub = a._[0] ?? "stats";
  if (sub === "build") {
    mkdirSync(CATALOG, { recursive: true });
    const only = a.only ? String(a.only).split(",") : Object.keys(BUILDERS);
    for (const name of only) {
      try {
        const rows = await BUILDERS[name]();
        writeFileSync(join(CATALOG, `${name}.json`), `${JSON.stringify(rows)}\n`);
        console.log(`catalog ${name.padEnd(12)} ${rows.length} entries`);
      } catch (e) {
        console.error(`! catalog ${name}: ${e.message}`);
      }
    }
  }
  const rows = loadCatalogs();
  const by = {};
  for (const r of rows) by[r.kind] = (by[r.kind] ?? 0) + 1;
  console.log(`catalogued: ${rows.length}  ${JSON.stringify(by)}  · installed: ${readLedger().assets.length}`);
}

// ---------- local icon packs (searched in node_modules directly) ----------

function iconPacks(terms, limit) {
  const packs = [
    ["phosphor", "node_modules/@phosphor-icons/core/assets/regular", "-", "MIT", (n) => n.replace(/\.svg$/, "")],
    ["tabler", "node_modules/@tabler/icons/icons/outline", "-", "MIT", (n) => n.replace(/\.svg$/, "")],
    ["material", "node_modules/@material-symbols/svg-400/rounded", "_", "Apache-2.0", (n) => n.replace(/\.svg$/, "")],
    ["lucide", "node_modules/lucide-static/icons", "-", "ISC", (n) => n.replace(/\.svg$/, "")],
  ];
  const out = [];
  for (const [pack, dir, sep, lic, id] of packs) {
    const abs = join(ROOT, dir);
    if (!existsSync(abs)) continue;
    for (const f of readdirSync(abs)) {
      if (f.includes("-fill") || !f.endsWith(".svg")) continue;
      const s = score(terms, id(f).split(sep).join(" "));
      if (s > 0) out.push({ key: `${pack}:${id(f)}`, kind: "icon", title: `${pack} ${id(f)}`, category: "2d-icon", license: lic, file: `${dir}/${f}`, _s: s });
    }
  }
  return out.sort((x, y) => y._s - x._s).slice(0, limit);
}

// ---------- find ----------

export async function find(a) {
  const q = a._.join(" ");
  const kind = a.kind;
  const limit = Number(a.limit ?? 8);
  const terms = expand(q);
  const ledger = readLedger().assets.filter((r) => r.status !== "rejected");
  const installed = new Set(ledger.map((r) => r.key));
  const rank = (rows) =>
    rows
      .filter((r) => !kind || r.kind === kind)
      .map((r) => ({ ...r, _rel: score(terms, [r.title, r.category, ...(r.tags ?? []), r.description ?? ""].join(" ")) }))
      .filter((r) => r._rel >= 3)
      .map((r) => ({ ...r, _s: r._rel + (installed.has(r.key) ? 3 : 0) + (r.popularity ? Math.min(1, r.popularity / 50000) : 0) }))
      .sort((x, y) => y._s - x._s);

  const local = rank(ledger).slice(0, limit);
  const cat = rank(loadCatalogs().filter((r) => !installed.has(r.key))).slice(0, limit);
  const icons = !kind || kind === "icon" ? iconPacks(terms, Math.ceil(limit / 2)) : [];
  let online = [];
  if (a.online || (!local.length && !cat.length)) {
    const res = await Promise.all(["sketchfab", "openverse", "met", "ambientcg"].map((n) => SOURCES[n].search(q, 4, { commercial: true }).catch(() => [])));
    online = res.flat().map((r) => ({ key: `${r.source}:${r.id}`, kind: r.type, title: r.title, license: r.license?.spdx, page: r.page, detail: r.detail }));
  }
  const show = (label, rows) => {
    if (!rows.length) return;
    console.log(`\n${label}`);
    for (const r of rows) {
      const lic = typeof r.license === "string" ? r.license : r.license?.spdx;
      const extra = [r.kind, r.category, r.polycount && `${r.polycount.toLocaleString()} tris`, r.rigged && "rigged", r.morphs, r.status && `status:${r.status}`, r.detail].filter(Boolean).join(" · ");
      console.log(`  ${r.key}\n     ${r.title} — ${lic ?? "?"} — ${extra}${r.preview ? `\n     preview: ${r.preview}` : r.thumb ? `\n     thumb: ${r.thumb}` : ""}${r.usage ? `\n     use: ${r.usage}` : ""}`);
    }
  };
  if (a.json) return console.log(JSON.stringify({ local, catalog: cat, icons, online }, null, 2));
  console.log(`need: "${q}"  (terms: ${terms.map((x) => x.t).join(", ")})`);
  show("1) already in the library (ready to use)", local);
  show("2) catalogued, installable  →  npm run assets -- install <key>", cat);
  show("3) icon packs (local SVG, no install needed)", icons);
  show("4) online sources (check licence + quality before install)", online);
  if (!local.length && !cat.length && !online.length) console.log("\nnothing suitable: consider a custom build (tools/3d) or, with the user's OK, a generated asset (tools/ai).");
}

// ---------- install ----------

function optimizeGlb(input, output, size) {
  sh("npx", [...NPX, "optimize", input, output, "--texture-compress", "webp", "--texture-size", String(size), "--compress", "false", "--simplify", "false"], { cwd: ROOT });
}

function preview(glb, out, extra = []) {
  const res = sh("node", [join(ROOT, "tools/3d/preview.mjs"), glb, out, "--size", "512", "--json", ...extra], { cwd: ROOT });
  return JSON.parse(res.trim().split("\n").pop());
}

function qc(kind, stats) {
  const checks = {
    loads: true,
    textured: stats.textures > 0,
    geometry: stats.tris > 50,
    plausibleSize: stats.sizeM.every((v) => v > 0.001 && v < 500),
  };
  if (kind === "character") Object.assign(checks, { rigged: stats.bones >= 50, faceShapes: stats.morphTargets >= 52, humanHeight: stats.sizeM[1] > 0.9 && stats.sizeM[1] < 2.2 });
  return { passed: Object.values(checks).every(Boolean), checks };
}

async function installPolyhavenModel(id, a, dir) {
  const res = a.res ?? "1k";
  const files = await getJson(`https://api.polyhaven.com/files/${id}`);
  const info = await getJson(`https://api.polyhaven.com/info/${id}`);
  const g = files.gltf?.[res]?.gltf ?? files.gltf?.["1k"]?.gltf;
  if (!g) throw new Error(`no glTF for ${id}`);
  const tmp = join(dir, ".src");
  mkdirSync(tmp, { recursive: true });
  const gltf = await download(g.url, join(tmp, basename(g.url)));
  for (const [relPath, inc] of Object.entries(g.include ?? {})) await download(inc.url, join(tmp, relPath));
  const glb = join(dir, `${id}.glb`);
  optimizeGlb(gltf, glb, res === "2k" ? 2048 : 1024);
  rmSync(tmp, { recursive: true, force: true });
  return {
    kind: "model", title: info.name, category: info.category ?? info.categories?.[0], tags: [...(info.categories ?? []), ...(info.tags ?? [])],
    page: `https://polyhaven.com/a/${id}`, license: license("cc0"), authors: Object.keys(info.authors ?? {}), rigged: (info.categories ?? []).includes("rigged"),
    dimensionsMm: info.dimensions?.map((v) => Math.round(v)), format: "GLB (WebP textures)", textureRes: res, glb,
  };
}

async function installRocketbox(name, a, dir) {
  const cat = loadCatalogs().find((r) => r.key === `rocketbox:${name}`);
  const repo = sparseRepo("https://github.com/microsoft/Microsoft-Rocketbox", join(SRC, "rocketbox"), [`/${cat?.repoPath ?? ""}/*`, "/LICENSE.md"]);
  const avatar = join(repo, cat.repoPath);
  const raw = join(dir, ".raw.glb");
  mkdirSync(dir, { recursive: true });
  sh("blender", ["-b", "--factory-startup", "-P", join(ROOT, "tools/3d/rocketbox_to_glb.py"), "--", avatar, raw]);
  const glb = join(dir, `${name}.glb`);
  optimizeGlb(raw, glb, Number(a.texsize ?? 2048));
  rmSync(raw, { force: true });
  return {
    kind: "character", title: cat.title, category: cat.category, tags: cat.tags, page: cat.page, rigged: true,
    license: { spdx: "MIT", commercial: true, attribution: true, note: "Microsoft Rocketbox Avatar Library — keep MIT notice (library/LICENSES/rocketbox-MIT.txt)" },
    authors: ["Microsoft / Rocketbox"], format: "GLB (WebP textures, 80-bone Biped, 52 ARKit + 15 viseme morphs)", glb,
  };
}

async function installRocketboxAnim(clip, a, dir) {
  const cat = loadCatalogs().find((r) => r.key === `rocketbox-anim:${clip}`);
  if (!cat) throw new Error(`unknown clip ${clip} (run catalog build)`);
  const repo = sparseRepo("https://github.com/microsoft/Microsoft-Rocketbox", join(SRC, "rocketbox"), [`/${cat.repoPath}`]);
  mkdirSync(dir, { recursive: true });
  const out = sh("blender", ["-b", "--factory-startup", "-P", join(ROOT, "tools/3d/rocketbox_anim_to_glb.py"), "--", dir, join(repo, cat.repoPath)]);
  const m = out.match(/CLIP (\S+): (\d+) frames @ (\d+) fps/);
  return {
    kind: "animation", title: cat.title, category: cat.category, tags: cat.tags, page: cat.page, rigged: true,
    license: { spdx: "MIT", commercial: true, attribution: true }, format: "GLB animation clip (Rocketbox Bip01 skeleton)",
    frames: Number(m?.[2]), fps: Number(m?.[3]), durationS: m ? +(m[2] / m[3]).toFixed(2) : undefined,
    files: [rel(join(dir, `${m?.[1] ?? clip}.glb`))], noPreview: true,
  };
}

async function installIcon3d(slug, a, dir) {
  const cat = loadCatalogs().find((r) => r.key === `3dicons:${slug}`);
  if (!cat) throw new Error(`unknown 3dicons ${slug}`);
  const want = a.variant ? [String(a.variant)] : Object.keys(cat.variants);
  const files = [];
  for (const v of want) if (cat.variants[v]) files.push(rel(await download(cat.variants[v], join(dir, `${slug}-${v}.png`))));
  return { kind: "icon", title: cat.title, category: "3d-icon", tags: cat.tags, page: cat.page, license: license("cc0"), format: "PNG (transparent)", files, preview: files.find((f) => f.includes("color")) ?? files[0], noPreview: true };
}

async function installFluent3d(name, a, dir) {
  const cat = loadCatalogs().find((r) => r.key === `fluent3d:${name}`);
  if (!cat) throw new Error(`unknown fluent3d ${name}`);
  const f = await download(cat.thumb, join(dir, `${name.replace(/\s+/g, "_")}_3d.png`));
  return { kind: "icon", title: name, category: "3d-emoji", tags: cat.tags, page: cat.page, license: { spdx: "MIT", commercial: true, attribution: true }, format: "PNG 256px (transparent)", files: [rel(f)], preview: rel(f), noPreview: true };
}

const INSTALLERS = {
  polyhaven: { kindDir: "models", run: installPolyhavenModel },
  rocketbox: { kindDir: "characters", run: installRocketbox },
  "rocketbox-anim": { kindDir: "animations", run: installRocketboxAnim },
  "3dicons": { kindDir: "icons", run: installIcon3d },
  fluent3d: { kindDir: "icons", run: installFluent3d },
};

function useInProject(row, project) {
  const proj = join(ROOT, project);
  if (!existsSync(proj)) throw new Error(`project ${project} not found`);
  const dest = join(proj, "assets", row.kind ?? "misc", row.id.replace(/[^\w.-]+/g, "_"));
  mkdirSync(dest, { recursive: true });
  for (const f of row.files ?? []) copyFileSync(join(ROOT, f), join(dest, basename(f)));
  if (row.preview && existsSync(join(ROOT, row.preview))) copyFileSync(join(ROOT, row.preview), join(dest, "preview.jpg"));
  const credit = { key: row.key, title: row.title, page: row.page, license: row.license, authors: row.authors };
  writeFileSync(join(dest, "SOURCE.json"), `${JSON.stringify(credit, null, 2)}\n`);
  const l = readLedger();
  const r = l.assets.find((x) => x.key === row.key);
  if (r) {
    r.projects = [...new Set([...(r.projects ?? []), project])];
    writeLedger(l);
  }
  console.log(`  ↳ copied into ${rel(dest)}`);
}

export async function install(a) {
  const keys = a._;
  for (const key of keys) {
    const [source, ...rest] = key.split(":");
    const id = rest.join(":");
    const existing = readLedger().assets.find((r) => r.key === key);
    if (existing && !a.force && (existing.files ?? []).length && (existing.files ?? []).every((f) => existsSync(join(ROOT, f)))) {
      console.log(`= ${key} cached (${existing.status})`);
      if (a.project) useInProject(existing, a.project);
      continue;
    }
    const inst = INSTALLERS[source];
    if (!inst) {
      // Fall back to the plain fetch adapters (textures, HDRIs, photos, khronos, met …).
      const dir = join(CACHE, source, id);
      const row = await SOURCES[source].fetch(id, a, dir);
      upsert({ key, source, id, fetchedAt: new Date().toISOString(), status: "pending", ...row });
      console.log(`+ ${key} (fetched, status pending)`);
      continue;
    }
    const dir = join(CACHE, inst.kindDir, source, id.replace(/[^\w.-]+/g, "_"));
    try {
      const row = await inst.run(id, a, dir);
      let stats, preview;
      if (row.glb) {
        preview = join(dir, "preview.jpg");
        stats = previewStats(row.glb, preview, row.kind === "character" ? ["--views", "3q"] : []);
        row.files = [rel(row.glb)];
        row.sha256 = sha256(row.glb);
        row.sizeBytes = statSync(row.glb).size;
        delete row.glb;
      }
      const dup = row.sha256 && readLedger().assets.find((r) => r.sha256 === row.sha256 && r.key !== key);
      if (dup) {
        console.log(`! ${key} duplicates ${dup.key}; not added`);
        rmSync(dir, { recursive: true, force: true });
        continue;
      }
      const check = stats ? qc(row.kind, stats) : { passed: true, checks: { downloaded: (row.files ?? []).length > 0 } };
      const full = {
        key, source, id, installedAt: new Date().toISOString(), ...row,
        preview: row.preview ?? (preview ? rel(preview) : undefined), stats, qc: check,
        status: check.passed ? "ready" : "pending",
      };
      delete full.noPreview;
      writeFileSync(join(dir, "meta.json"), `${JSON.stringify(full, null, 2)}\n`);
      upsert(full);
      if (a.project) useInProject(full, a.project);
      console.log(`${check.passed ? "+" : "?"} ${key} → ${rel(dir)}  ${stats ? `${stats.tris} tris, ${stats.textures} tex, ${(full.sizeBytes / 1e6).toFixed(1)} MB` : (full.files ?? []).length + " files"}  [${full.status}]`);
    } catch (e) {
      console.error(`✗ ${key}: ${e.message.split("\n")[0]}`);
      rmSync(dir, { recursive: true, force: true });
    }
  }
}

function previewStats(glb, out, extra) {
  return preview(glb, out, extra);
}

// ---------- verify + gallery ----------

export async function verify() {
  const l = readLedger();
  let notCached = 0;
  for (const r of l.assets) {
    const missing = (r.files ?? []).filter((f) => !existsSync(join(ROOT, f)));
    if (missing.length) {
      notCached++;
      if (process.argv.includes("--verbose")) console.log(`· ${r.key}: not cached (npm run assets -- install ${r.key})`);
    }
  }
  const by = {};
  for (const r of l.assets) by[`${r.kind ?? r.type}/${r.status}`] = (by[`${r.kind ?? r.type}/${r.status}`] ?? 0) + 1;
  const cacheMb = existsSync(CACHE) ? Number(sh("du", ["-sm", CACHE]).split("\t")[0]) : 0;
  console.log(`${l.assets.length} assets in ledger, ${l.assets.length - notCached} cached locally (${cacheMb} MB in library/.cache), ${notCached} re-installable on demand  ${JSON.stringify(by)}`);
}

export async function gallery() {
  const rows = readLedger().assets.map((r) => ({
    key: r.key, kind: r.kind ?? r.type, title: r.title, category: r.category, tags: (r.tags ?? []).slice(0, 12), status: r.status,
    license: r.license?.spdx ?? r.license, page: r.page, preview: r.preview ? `../${r.preview}` : null, files: r.files,
    stats: r.stats && { tris: r.stats.tris, bones: r.stats.bones, morphs: r.stats.morphTargets, sizeM: r.stats.sizeM }, durationS: r.durationS,
  }));
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Asset Library</title><style>
:root{--bg:#f4f2ee;--card:#fff;--ink:#1d1b18;--muted:#6f6a62;--line:#e2ddd4;--accent:#b3121f}
@media (prefers-color-scheme:dark){:root{--bg:#141311;--card:#1e1c19;--ink:#efe9df;--muted:#a39b8f;--line:#2e2b27}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 system-ui,sans-serif}
header{position:sticky;top:0;background:var(--bg);padding:16px;border-bottom:1px solid var(--line);display:flex;gap:8px;flex-wrap:wrap;align-items:center}
h1{font-size:18px;margin:0 12px 0 0}input,select{font:inherit;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--ink)}
input{flex:1;min-width:180px}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px;padding:16px}
.c{background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}.c img{width:100%;aspect-ratio:1;object-fit:contain;background:#e9e7e3;display:block}
.ph{aspect-ratio:1;display:grid;place-items:center;color:var(--muted);background:var(--line)}.b{padding:10px}.t{font-weight:600}.m{color:var(--muted);font-size:12px;word-break:break-word}
.s{display:inline-block;font-size:11px;padding:1px 6px;border-radius:99px;border:1px solid var(--line);margin-right:4px}.ready{border-color:#2f8f4e;color:#2f8f4e}.pending{border-color:#b7791f;color:#b7791f}
</style></head><body><header><h1>Asset Library</h1><input id="q" placeholder="search name, tag, category…"><select id="k"><option value="">all kinds</option></select><span id="n" class="m"></span></header><main id="g"></main>
<script>const A=${JSON.stringify(rows)};const k=document.getElementById("k"),q=document.getElementById("q"),g=document.getElementById("g"),n=document.getElementById("n");
[...new Set(A.map(a=>a.kind))].sort().forEach(x=>k.add(new Option(x,x)));
function esc(s){return String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}
function draw(){const t=q.value.toLowerCase().split(/\\s+/).filter(Boolean),kk=k.value;const r=A.filter(a=>(!kk||a.kind===kk)&&t.every(w=>(a.key+" "+a.title+" "+a.category+" "+a.tags.join(" ")).toLowerCase().includes(w)));
n.textContent=r.length+" / "+A.length;g.innerHTML=r.map(a=>'<div class="c">'+(a.preview?'<img loading="lazy" src="'+esc(a.preview)+'" alt="">':'<div class="ph">'+esc(a.kind)+'</div>')+'<div class="b"><div class="t">'+esc(a.title)+'</div><div class="m">'+esc(a.key)+'</div><div class="m"><span class="s '+esc(a.status)+'">'+esc(a.status)+'</span>'+esc(a.license)+'</div><div class="m">'+esc(a.category||"")+(a.stats?' · '+a.stats.tris+' tris'+(a.stats.bones?' · '+a.stats.bones+' bones':'')+(a.stats.morphs?' · '+a.stats.morphs+' morphs':''):'')+(a.durationS?' · '+a.durationS+' s':'')+'</div></div></div>').join("")}
q.oninput=k.onchange=draw;draw();</script></body></html>`;
  writeFileSync(join(LIBRARY, "index.html"), html);
  console.log(`gallery → library/index.html (${rows.length} assets)`);
}
