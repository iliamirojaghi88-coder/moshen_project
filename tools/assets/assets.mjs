#!/usr/bin/env node
// Asset Research & Discovery engine.
//
//   node tools/assets/assets.mjs search "<query>" [--sources a,b] [--limit 8] [--commercial] [--json]
//   node tools/assets/assets.mjs fetch <source>:<id> [--res 2k] [--format jpg]
//   node tools/assets/assets.mjs ledger [--json]
//   node tools/assets/assets.mjs status <source>:<id> approved|rejected|pending [--note "..."]
//
// Every fetched asset lands in library/<source>/<id>/ with meta.json and a
// ledger row (source URL, licence, commercial use, attribution, format,
// resolution / face count, textures, rig). Nothing enters a video without a
// ledger row; status starts at "pending" until a human approves it.
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve, basename } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const LIBRARY = join(ROOT, "library");
const LEDGER = join(LIBRARY, "ledger.json");
const UA = "moshen-asset-research/1.0 (https://github.com/iliamirojaghi88-coder/moshen_project)";

// ---------- licence normalisation ----------

const LICENSES = {
  "cc0": { spdx: "CC0-1.0", commercial: true, attribution: false, shareAlike: false },
  "pdm": { spdx: "PDM-1.0", commercial: true, attribution: false, shareAlike: false },
  "by": { spdx: "CC-BY", commercial: true, attribution: true, shareAlike: false },
  "by-sa": { spdx: "CC-BY-SA", commercial: true, attribution: true, shareAlike: true },
  "by-nd": { spdx: "CC-BY-ND", commercial: true, attribution: true, shareAlike: false, noDerivatives: true },
  "by-nc": { spdx: "CC-BY-NC", commercial: false, attribution: true, shareAlike: false },
  "by-nc-sa": { spdx: "CC-BY-NC-SA", commercial: false, attribution: true, shareAlike: true },
  "by-nc-nd": { spdx: "CC-BY-NC-ND", commercial: false, attribution: true, shareAlike: false, noDerivatives: true },
  "isc": { spdx: "ISC", commercial: true, attribution: false, shareAlike: false },
  "apache-2.0": { spdx: "Apache-2.0", commercial: true, attribution: false, shareAlike: false },
};

function license(key, version = "", url = "") {
  const raw = String(key).toLowerCase().replace(/ /g, "-");
  const k = LICENSES[raw] ? raw : raw.replace(/^cc[-_]?/, "");
  const base = LICENSES[k] ?? { spdx: key, commercial: null, attribution: null, shareAlike: null };
  return { ...base, spdx: version && base.spdx.startsWith("CC-") ? `${base.spdx}-${version}` : base.spdx, url };
}

function sketchfabLicense(label = "") {
  const map = {
    "CC0 Public Domain": "cc0",
    "CC Attribution": "by",
    "CC Attribution-ShareAlike": "by-sa",
    "CC Attribution-NoDerivs": "by-nd",
    "CC Attribution-NonCommercial": "by-nc",
    "CC Attribution-NonCommercial-ShareAlike": "by-nc-sa",
    "CC Attribution-NonCommercial-NoDerivs": "by-nc-nd",
  };
  return license(map[label] ?? label, label.startsWith("CC0") ? "" : "4.0");
}

// ---------- http ----------

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers: { "User-Agent": UA, ...headers } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} ← ${url}`);
  return res.json();
}

async function download(url, dest, headers = {}) {
  mkdirSync(dirname(dest), { recursive: true });
  const res = await fetch(url, { headers: { "User-Agent": UA, ...headers } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} ← ${url}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
  return dest;
}

// ---------- sources ----------
// Each source: search(query, limit) → Result[]; fetch(id, opts, dir) → Partial<LedgerRow>.

const KHRONOS_RAW = "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models";

const SOURCES = {
  polyhaven: {
    kind: "PBR textures, HDRIs, models (CC0, scanned)",
    async search(q, limit) {
      const all = await getJson("https://api.polyhaven.com/assets");
      const words = q.toLowerCase().split(/\s+/);
      const type = { 0: "hdri", 1: "texture", 2: "model" };
      return Object.entries(all)
        .map(([id, a]) => {
          const hay = [id, a.name, ...(a.tags ?? []), ...(a.categories ?? [])].join(" ").toLowerCase();
          return { id, a, score: words.filter((w) => hay.includes(w)).length };
        })
        .filter((x) => x.score > 0)
        .sort((x, y) => y.score - x.score || (y.a.download_count ?? 0) - (x.a.download_count ?? 0))
        .slice(0, limit)
        .map(({ id, a }) => ({
          source: "polyhaven", id, title: a.name, type: type[a.type],
          license: license("cc0"), page: `https://polyhaven.com/a/${id}`,
          preview: `https://cdn.polyhaven.com/asset_img/thumbs/${id}.png?width=512`,
          detail: a.max_resolution ? `${a.max_resolution.join("×")} max` : "",
          realWorldSize: a.dimensions ? `${(a.dimensions[0] / 1000).toFixed(2)}×${(a.dimensions[1] / 1000).toFixed(2)} m` : undefined,
        }));
    },
    async fetch(id, { res = "2k", format = "jpg" }, dir) {
      const info = await getJson(`https://api.polyhaven.com/info/${id}`);
      const files = await getJson(`https://api.polyhaven.com/files/${id}`);
      const got = [];
      if (info.type === 0) {
        const f = files.hdri[res]?.hdr ?? files.hdri[res]?.exr;
        got.push(await download(f.url, join(dir, basename(f.url))));
      } else if (info.type === 2 || files.gltf?.[res]) {
        const g = files.gltf?.[res]?.gltf;
        if (g) {
          got.push(await download(g.url, join(dir, basename(g.url))));
          for (const [rel, inc] of Object.entries(g.include ?? {})) got.push(await download(inc.url, join(dir, rel)));
        }
      } else {
        const maps = { Diffuse: "diff", nor_gl: "nor_gl", Rough: "rough", AO: "ao", Displacement: "disp", arm: "arm" };
        for (const [key] of Object.entries(maps)) {
          const f = files[key]?.[res]?.[format] ?? files[key]?.[res]?.png ?? files[key]?.[res]?.exr;
          if (f) got.push(await download(f.url, join(dir, basename(f.url))));
        }
      }
      return {
        title: info.name, type: { 0: "hdri", 1: "texture", 2: "model" }[info.type],
        page: `https://polyhaven.com/a/${id}`, license: license("cc0"),
        authors: Object.keys(info.authors ?? {}), resolution: res,
        realWorldSize: info.dimensions ? `${info.dimensions[0]}×${info.dimensions[1]} mm` : undefined,
        textures: info.type === 0 ? "n/a" : "PBR (diffuse, normal-GL, roughness, AO, displacement)",
        rig: false, files: got.map((f) => f.slice(ROOT.length + 1)),
      };
    },
  },

  ambientcg: {
    kind: "PBR materials (CC0, photogrammetry / procedural)",
    async search(q, limit) {
      const d = await getJson(`https://ambientcg.com/api/v2/full_json?q=${encodeURIComponent(q)}&limit=${limit}&include=downloadData,imageData`);
      return d.foundAssets.map((a) => ({
        source: "ambientcg", id: a.assetId, title: a.displayName, type: a.dataType?.toLowerCase(),
        license: license("cc0"), page: a.shortLink, preview: a.previewImage?.["512-PNG"],
        detail: a.creationMethodName ?? "", realWorldSize: a.dimensionX ? `${a.dimensionX}×${a.dimensionY} cm` : undefined,
      }));
    },
    async fetch(id, { res = "2K", format = "JPG" }, dir) {
      const d = await getJson(`https://ambientcg.com/api/v2/full_json?id=${id}&include=downloadData`);
      const a = d.foundAssets[0];
      const want = `${res.toUpperCase()}-${format.toUpperCase()}`;
      const dl = a.downloadFolders.default.downloadFiletypeCategories.zip.downloads.find((x) => x.attribute === want);
      if (!dl) throw new Error(`no ${want} download for ${id}`);
      const zip = await download(dl.downloadLink, join(dir, dl.fileName));
      execFileSync("unzip", ["-o", "-q", zip, "-d", dir]);
      rmSync(zip);
      return {
        title: a.displayName, type: a.dataType?.toLowerCase(), page: a.shortLink, license: license("cc0"),
        resolution: want, realWorldSize: a.dimensionX ? `${a.dimensionX}×${a.dimensionY} cm` : undefined,
        textures: "PBR (color, normal-GL/DX, roughness, AO, displacement)", rig: false,
        files: readdirSync(dir).filter((f) => !f.endsWith(".zip")).map((f) => join(dir, f).slice(ROOT.length + 1)),
      };
    },
  },

  khronos: {
    kind: "Reference glTF models (CC0 / CC-BY), rigged + PBR test assets",
    async search(q, limit) {
      const idx = await getJson(`${KHRONOS_RAW}/model-index.json`);
      const words = q.toLowerCase().split(/\s+/);
      return idx
        .filter((m) => words.some((w) => `${m.name} ${m.label} ${(m.tags ?? []).join(" ")}`.toLowerCase().includes(w)))
        .slice(0, limit)
        .map((m) => ({
          source: "khronos", id: m.name, title: m.label, type: "model",
          license: { spdx: "see metadata.json", commercial: null }, page: `https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/${m.name}`,
          preview: `${KHRONOS_RAW}/${m.name}/${m.screenshot}`, detail: Object.keys(m.variants).join(", "),
        }));
    },
    async fetch(id, _opts, dir) {
      const idx = await getJson(`${KHRONOS_RAW}/model-index.json`);
      const m = idx.find((x) => x.name === id);
      if (!m) throw new Error(`unknown Khronos model ${id}`);
      const meta = await getJson(`${KHRONOS_RAW}/${id}/metadata.json`);
      const glb = m.variants["glTF-Binary"];
      const files = [];
      if (glb) files.push(await download(`${KHRONOS_RAW}/${id}/glTF-Binary/${glb}`, join(dir, glb)));
      const spdx = [...new Set(meta.legal.map((l) => l.spdx).filter(Boolean))];
      const nc = spdx.some((s) => /NC/.test(s));
      return {
        title: m.label, type: "model", page: `https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/${id}`,
        license: { spdx: spdx.join(" + "), commercial: !nc, attribution: spdx.some((s) => s !== "CC0-1.0"), parts: meta.legal.map((l) => `${l.what}: ${l.spdx} © ${l.artist}`) },
        authors: [...new Set(meta.legal.map((l) => l.artist))], files: files.map((f) => f.slice(ROOT.length + 1)),
      };
    },
  },

  openverse: {
    kind: "Real photographs under CC licences (Wikimedia, Flickr, museums)",
    async search(q, limit, { commercial } = {}) {
      const lt = commercial ? "&license_type=commercial,modification" : "";
      const d = await getJson(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=${limit}${lt}`);
      return d.results.map((r) => ({
        source: "openverse", id: r.id, title: r.title, type: "photo",
        license: license(r.license, r.license_version, r.license_url), page: r.foreign_landing_url,
        preview: r.thumbnail, detail: `${r.width ?? "?"}×${r.height ?? "?"} · ${r.source} · ${r.creator ?? "unknown"}`,
      }));
    },
    async fetch(id, _opts, dir) {
      const r = await getJson(`https://api.openverse.org/v1/images/${id}/`);
      const ext = (r.filetype || r.url.split(".").pop().split("?")[0] || "jpg").toLowerCase();
      const file = await download(r.url, join(dir, `original.${ext}`));
      return {
        title: r.title, type: "photo", page: r.foreign_landing_url, sourceUrl: r.url,
        license: license(r.license, r.license_version, r.license_url), authors: [r.creator].filter(Boolean),
        attributionText: r.attribution, resolution: `${r.width}×${r.height}`, files: [file.slice(ROOT.length + 1)],
      };
    },
  },

  sketchfab: {
    kind: "3D models incl. photogrammetry scans; download needs SKETCHFAB_API_TOKEN",
    async search(q, limit, { commercial } = {}) {
      const d = await getJson(`https://api.sketchfab.com/v3/search?type=models&downloadable=true&q=${encodeURIComponent(q)}&count=${limit}`);
      return d.results
        .map((r) => ({
          source: "sketchfab", id: r.uid, title: r.name, type: r.isAgeRestricted ? "model (age-restricted)" : "model",
          license: sketchfabLicense(r.license?.label), page: r.viewerUrl,
          preview: r.thumbnails?.images?.sort((a, b) => b.width - a.width).find((i) => i.width <= 640)?.url,
          detail: `${(r.faceCount ?? 0).toLocaleString()} faces · ${r.animationCount ? `${r.animationCount} anim` : "static"} · ${r.user?.username}`,
        }))
        .filter((r) => !commercial || r.license.commercial);
    },
    async fetch(id, _opts, dir) {
      const token = process.env.SKETCHFAB_API_TOKEN;
      if (!token) throw new Error("SKETCHFAB_API_TOKEN is not set (free account → sketchfab.com/settings/password → API token)");
      const auth = { Authorization: `Token ${token}` };
      const m = await getJson(`https://api.sketchfab.com/v3/models/${id}`);
      const dl = await getJson(`https://api.sketchfab.com/v3/models/${id}/download`, auth);
      const pick = dl.glb ?? dl.gltf;
      const file = await download(pick.url, join(dir, dl.glb ? "model.glb" : "model.zip"));
      if (!dl.glb) execFileSync("unzip", ["-o", "-q", file, "-d", dir]);
      return {
        title: m.name, type: "model", page: m.viewerUrl, license: sketchfabLicense(m.license?.label),
        authors: [m.user?.displayName ?? m.user?.username], faces: m.faceCount, vertices: m.vertexCount,
        rig: Boolean(m.animationCount), animations: m.animationCount, files: [file.slice(ROOT.length + 1)],
      };
    },
  },

  met: {
    kind: "The Met open access: real museum objects, public-domain photos + measured dimensions",
    async search(q, limit) {
      const d = await getJson(`https://collectionapi.metmuseum.org/public/collection/v1.1/search?hasImages=true&q=${encodeURIComponent(q)}&limit=${limit * 3}`);
      const objs = await Promise.all((d.objectIDs ?? []).slice(0, limit * 3).map((id) => getJson(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`).catch(() => null)));
      return objs
        .filter((o) => o?.isPublicDomain && o.primaryImage)
        .slice(0, limit)
        .map((o) => ({
          source: "met", id: String(o.objectID), title: `${o.title} — ${o.culture || o.period || ""}`.trim(), type: "museum photo",
          license: license("cc0"), page: o.objectURL, preview: o.primaryImageSmall,
          detail: `${o.medium} · ${o.dimensions.replace(/\s+/g, " ")}`,
        }));
    },
    async fetch(id, _opts, dir) {
      const o = await getJson(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`);
      if (!o.isPublicDomain) throw new Error(`Met ${id} is not public domain`);
      const files = [await download(o.primaryImage, join(dir, `primary${o.primaryImage.match(/\.\w+$/)?.[0] ?? ".jpg"}`))];
      for (const [i, u] of (o.additionalImages ?? []).slice(0, 6).entries()) files.push(await download(u, join(dir, `additional-${i + 1}${u.match(/\.\w+$/)?.[0] ?? ".jpg"}`)));
      return {
        title: o.title, type: "museum photo", page: o.objectURL, license: license("cc0"),
        object: { culture: o.culture, period: o.period, date: o.objectDate, country: o.country, geographyType: o.geographyType, medium: o.medium, dimensions: o.dimensions, classification: o.classification, department: o.department, creditLine: o.creditLine, accession: o.accessionNumber },
        authors: ["The Metropolitan Museum of Art"], files: files.map((f) => f.slice(ROOT.length + 1)),
      };
    },
  },

  cleveland: {
    kind: "Cleveland Museum of Art open access: CC0 photos of real objects",
    async search(q, limit) {
      const d = await getJson(`https://openaccess-api.clevelandart.org/api/artworks/?q=${encodeURIComponent(q)}&has_image=1&cc0=1&limit=${limit}`);
      return d.data.map((x) => ({
        source: "cleveland", id: String(x.id), title: `${x.title} — ${(x.culture ?? []).join(", ")}`, type: "museum photo",
        license: license("cc0"), page: x.url, preview: x.images?.web?.url,
        detail: `${x.technique ?? ""} · ${x.measurements ?? ""}`.replace(/\s+/g, " "),
      }));
    },
    async fetch(id, _opts, dir) {
      const { data: x } = await getJson(`https://openaccess-api.clevelandart.org/api/artworks/${id}`);
      if (x.share_license_status !== "CC0") throw new Error(`Cleveland ${id} is not CC0`);
      const img = x.images.print ?? x.images.web;
      const file = await download(img.url, join(dir, img.filename ?? "print.jpg"));
      return {
        title: x.title, type: "museum photo", page: x.url, license: license("cc0"), resolution: `${img.width}×${img.height}`,
        object: { culture: x.culture, date: x.creation_date, technique: x.technique, measurements: x.measurements, accession: x.accession_number },
        authors: ["Cleveland Museum of Art"], files: [file.slice(ROOT.length + 1)],
      };
    },
  },

  lucide: {
    kind: "2D line icons (ISC), local package",
    async search(q, limit) {
      const dir = join(ROOT, "node_modules/lucide-static/icons");
      const words = q.toLowerCase().split(/\s+/);
      return readdirSync(dir)
        .filter((f) => words.some((w) => f.replace(/\.svg$/, "").split("-").some((p) => p === w || p === w.replace(/s$/, ""))))
        .slice(0, limit)
        .map((f) => ({ source: "lucide", id: f.replace(/\.svg$/, ""), title: f, type: "icon", license: license("isc"), page: `https://lucide.dev/icons/${f.replace(/\.svg$/, "")}` }));
    },
    async fetch(id, _opts, dir) {
      mkdirSync(dir, { recursive: true });
      const src = join(ROOT, "node_modules/lucide-static/icons", `${id}.svg`);
      writeFileSync(join(dir, `${id}.svg`), readFileSync(src));
      return { title: id, type: "icon", page: `https://lucide.dev/icons/${id}`, license: license("isc"), files: [join(dir, `${id}.svg`).slice(ROOT.length + 1)] };
    },
  },

  material: {
    kind: "Material Symbols icons (Apache-2.0), local package",
    async search(q, limit) {
      const dir = join(ROOT, "node_modules/@material-symbols/svg-400/rounded");
      const words = q.toLowerCase().split(/\s+/);
      return readdirSync(dir)
        .filter((f) => !f.includes("-fill") && words.some((w) => f.replace(/\.svg$/, "").split("_").some((p) => p === w || p === w.replace(/s$/, ""))))
        .slice(0, limit)
        .map((f) => ({ source: "material", id: f.replace(/\.svg$/, ""), title: f, type: "icon", license: license("apache-2.0"), page: "https://fonts.google.com/icons" }));
    },
    async fetch(id, _opts, dir) {
      mkdirSync(dir, { recursive: true });
      for (const v of [id, `${id}-fill`]) {
        const src = join(ROOT, "node_modules/@material-symbols/svg-400/rounded", `${v}.svg`);
        if (existsSync(src)) writeFileSync(join(dir, `${v}.svg`), readFileSync(src));
      }
      return { title: id, type: "icon", page: "https://fonts.google.com/icons", license: license("apache-2.0"), files: readdirSync(dir).map((f) => join(dir, f).slice(ROOT.length + 1)) };
    },
  },
};

// ---------- ledger ----------

function readLedger() {
  return existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, "utf8")) : { assets: [] };
}

function writeLedger(l) {
  mkdirSync(LIBRARY, { recursive: true });
  writeFileSync(LEDGER, `${JSON.stringify(l, null, 2)}\n`);
}

function upsert(row) {
  const l = readLedger();
  const i = l.assets.findIndex((a) => a.key === row.key);
  if (i >= 0) l.assets[i] = { ...l.assets[i], ...row, status: l.assets[i].status };
  else l.assets.push(row);
  writeLedger(l);
}

// ---------- cli ----------

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const k = argv[i].slice(2);
      out[k] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
    } else out._.push(argv[i]);
  }
  return out;
}

function printTable(rows) {
  for (const r of rows) {
    const lic = r.license?.spdx ?? "?";
    const com = r.license?.commercial === true ? "commercial✓" : r.license?.commercial === false ? "NON-COMMERCIAL" : "check";
    console.log(`${r.source}:${r.id}\n  ${r.title}  [${r.type ?? ""}]\n  ${lic} · ${com}${r.detail ? ` · ${r.detail}` : ""}${r.realWorldSize ? ` · ${r.realWorldSize}` : ""}\n  ${r.page}`);
  }
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const a = args(rest);

  if (cmd === "search") {
    const q = a._.join(" ");
    const names = a.sources ? String(a.sources).split(",") : Object.keys(SOURCES);
    const limit = Number(a.limit ?? 6);
    const results = [];
    await Promise.all(
      names.map(async (n) => {
        try {
          results.push(...(await SOURCES[n].search(q, limit, { commercial: Boolean(a.commercial) })));
        } catch (e) {
          console.error(`! ${n}: ${e.message}`);
        }
      }),
    );
    if (a.json) console.log(JSON.stringify(results, null, 2));
    else printTable(results);
    return;
  }

  if (cmd === "fetch") {
    const [source, ...idParts] = String(a._[0] ?? "").split(":");
    const id = idParts.join(":");
    if (!SOURCES[source] || !id) throw new Error("usage: fetch <source>:<id>");
    const dir = join(LIBRARY, source, id);
    const row = await SOURCES[source].fetch(id, a, dir);
    const full = { key: `${source}:${id}`, source, id, fetchedAt: new Date().toISOString(), status: "pending", ...row };
    writeFileSync(join(dir, "meta.json"), `${JSON.stringify(full, null, 2)}\n`);
    upsert(full);
    console.log(`${full.key} → ${dir.slice(ROOT.length + 1)} (${full.license?.spdx}, commercial: ${full.license?.commercial})`);
    return;
  }

  if (cmd === "status") {
    const [key, status] = a._;
    const l = readLedger();
    const row = l.assets.find((x) => x.key === key);
    if (!row || !["approved", "rejected", "pending"].includes(status)) throw new Error("usage: status <source>:<id> approved|rejected|pending");
    Object.assign(row, { status, statusNote: a.note ?? row.statusNote, statusAt: new Date().toISOString() });
    writeLedger(l);
    console.log(`${key}: ${status}`);
    return;
  }

  if (cmd === "ledger") {
    const l = readLedger();
    if (a.json) return console.log(JSON.stringify(l, null, 2));
    for (const r of l.assets) console.log(`${r.status.padEnd(8)} ${r.key.padEnd(40)} ${r.license?.spdx ?? "?"}  ${r.title ?? ""}`);
    return;
  }

  console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 11).join("\n"));
  console.log("\nSources:");
  for (const [n, s] of Object.entries(SOURCES)) console.log(`  ${n.padEnd(10)} ${s.kind}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
