#!/usr/bin/env node
// Google Gemini API bridge (official @google/genai SDK).
//
//   node tools/ai/gemini.mjs check                       # free: key + model availability
//   node tools/ai/gemini.mjs plan  <scenario.txt> [--out plan.json]
//        Text only (Flash, free tier): scenario → sequences → per-shot asset
//        needs and a tailored prompt per character / asset, with the tool to use.
//   node tools/ai/gemini.mjs image "<prompt>" --name <id> [--ref a.png ...] [--model gemini-3.1-flash-image] [--size 1K] --approve-cost
//   node tools/ai/gemini.mjs video "<prompt>" --name <id> [--ref first.png] [--aspect 9:16] [--res 720p] --approve-cost
//
// Paid calls (image, video) refuse to run without --approve-cost and print
// the estimate first. Outputs land in library/ai/<name>/ with a ledger row
// marked ai:true, status "pending" — AI imagery never stands in for a real
// product, and only enters a video after the user approves it.
// Key: injected by the cloud Network secret (x-goog-api-key), or GEMINI_API_KEY
// locally; it is never read into files, logs or output.
import { GoogleGenAI } from "@google/genai";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Node's built-in fetch (used by the SDK) ignores HTTPS_PROXY unless
// NODE_USE_ENV_PROXY=1, and without the proxy the Network secret is never
// injected. Re-exec once with it set; nothing is sent before this point.
if (process.env.HTTPS_PROXY && !process.env.NODE_USE_ENV_PROXY) {
  const r = spawnSync(process.execPath, ["--disable-warning=UNDICI-EHPA", ...process.execArgv, ...process.argv.slice(1)], {
    stdio: "inherit",
    env: { ...process.env, NODE_USE_ENV_PROXY: "1" },
  });
  process.exit(r.status ?? 1);
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const LEDGER = join(ROOT, "library/ledger.json");
const CONFIG = JSON.parse(readFileSync(join(ROOT, "tools/ai/models.json"), "utf8"));

function args(argv) {
  const out = { _: [], ref: [] };
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) out._.push(argv[i]);
    else {
      const k = argv[i].slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
      if (k === "ref") out.ref.push(v);
      else out[k] = v;
    }
  }
  return out;
}

// In cloud sessions the key lives in the environment's Network secrets: the
// egress proxy overwrites the x-goog-api-key header on requests to
// generativelanguage.googleapis.com, so the container never holds the key and
// the SDK only needs a placeholder. A local GEMINI_API_KEY still wins.
const PROXY_PLACEHOLDER = "injected-by-network-secret";

function client() {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? PROXY_PLACEHOLDER;
  return new GoogleGenAI({ apiKey });
}

function explainAuthError(e) {
  const msg = String(e?.message ?? e);
  if (/API_KEY_INVALID|unregistered callers|PERMISSION_DENIED|401|403/.test(msg)) {
    return `${msg}\n→ No valid key reached Google. Cloud: check the Network secret for generativelanguage.googleapis.com (header x-goog-api-key). Local: export GEMINI_API_KEY.`;
  }
  return msg;
}

function imagePart(path) {
  const mime = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" }[extname(path).toLowerCase()];
  return { inlineData: { mimeType: mime ?? "image/png", data: readFileSync(path).toString("base64") } };
}

function ledgerAdd(row) {
  const l = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, "utf8")) : { assets: [] };
  l.assets = l.assets.filter((a) => a.key !== row.key);
  l.assets.push(row);
  writeFileSync(LEDGER, `${JSON.stringify(l, null, 2)}\n`);
}

function requireApproval(a, estimate) {
  console.log(`Estimated cost: ${estimate} (Gemini API paid tier, ${CONFIG.pricesCheckedAt}).`);
  if (!a["approve-cost"]) {
    console.error("Refusing: paid generation needs --approve-cost (and the user's explicit OK).");
    process.exit(4);
  }
}

async function check() {
  const ai = client();
  const want = Object.values(CONFIG.models).map((m) => m.id);
  const found = new Set();
  const pager = await ai.models.list({ config: { pageSize: 200 } });
  for await (const m of pager) found.add(m.name.replace(/^models\//, ""));
  for (const [role, m] of Object.entries(CONFIG.models)) {
    console.log(`${found.has(m.id) ? "✓" : "✗"} ${role.padEnd(10)} ${m.id.padEnd(28)} ${m.tier}`);
  }
  console.log(`${found.size} models visible to this key.`);
  if (want.some((id) => !found.has(id))) console.log("Missing models: check region, billing tier, or update tools/ai/models.json.");
}

const PLAN_INSTRUCTIONS = `You are the pre-production lead of a motion-graphics studio. Analyse the scenario and return JSON only:
{"title","durationS","sequences":[{"id","startS","endS","purpose","shots":[{"id","durationS","description","onScreenTextFa","assets":[{"name","kind":"real-product|real-photo|3d-model|icon|texture|character|generated-image|generated-video","mustBeReal":bool,"searchQuery":"english query for tools/assets/assets.mjs","tool":"assets.mjs|blender|gemini-image|gemini-omni|hyperframes|remotion","prompt":"only for generated kinds: detailed English prompt with subject, materials, lighting, lens, framing, background, style; consistent character sheet details"}]}]}],"characters":[{"name","sheet":"fixed appearance description reused verbatim in every prompt"}]}
Rules: real products and real places are never generated; generated kinds only for original characters or abstract visuals; Persian on-screen text stays in Persian; keep prompts self-contained.`;

async function plan(a) {
  const scenario = readFileSync(a._[1], "utf8");
  const ai = client();
  const res = await ai.models.generateContent({
    model: CONFIG.models.text.id,
    contents: scenario,
    config: { systemInstruction: PLAN_INSTRUCTIONS, responseMimeType: "application/json" },
  });
  const out = a.out ?? "plan.json";
  writeFileSync(out, `${JSON.stringify(JSON.parse(res.text), null, 2)}\n`);
  console.log(`plan → ${out} (${res.usageMetadata?.totalTokenCount ?? "?"} tokens)`);
}

async function image(a) {
  const m = a.model ?? CONFIG.models.image.id;
  const size = a.size ?? "1K";
  requireApproval(a, `${CONFIG.prices[m]?.[size] ?? "see pricing"} USD per image (${m}, ${size})`);
  const ai = client();
  const res = await ai.models.generateContent({
    model: m,
    contents: [{ role: "user", parts: [{ text: a._[1] }, ...a.ref.map(imagePart)] }],
    config: { responseModalities: ["IMAGE"], imageConfig: { imageSize: size, aspectRatio: a.aspect ?? "1:1" } },
  });
  const dir = join(ROOT, "library/ai", a.name);
  mkdirSync(dir, { recursive: true });
  const files = [];
  for (const p of res.candidates?.[0]?.content?.parts ?? []) {
    if (p.inlineData?.data) {
      const f = join(dir, `image-${files.length + 1}.png`);
      writeFileSync(f, Buffer.from(p.inlineData.data, "base64"));
      files.push(f.slice(ROOT.length + 1));
    }
  }
  record(a, "generated-image", m, files);
}

async function video(a) {
  const m = CONFIG.models.video.id;
  const res = a.res ?? "720p";
  requireApproval(a, `≈ ${CONFIG.prices[m]?.[res] ?? "?"} USD per second of output (${m}, ${res}); clips are 3–10 s`);
  const ai = client();
  const input = a.ref.length ? [{ type: "text", text: a._[1] }, ...a.ref.map((r) => ({ type: "image", data: readFileSync(r).toString("base64"), mime_type: "image/png" }))] : a._[1];
  const interaction = await ai.interactions.create({
    model: m,
    input,
    response_format: { type: "video", aspect_ratio: a.aspect ?? "9:16", resolution: res },
  });
  const dir = join(ROOT, "library/ai", a.name);
  mkdirSync(dir, { recursive: true });
  const files = [];
  if (interaction.output_video?.data) {
    const f = join(dir, "clip.mp4");
    writeFileSync(f, Buffer.from(interaction.output_video.data, "base64"));
    files.push(f.slice(ROOT.length + 1));
  }
  record(a, "generated-video", m, files, { interactionId: interaction.id });
}

function record(a, type, model, files, extra = {}) {
  const row = {
    key: `gemini:${a.name}`, source: "gemini", id: a.name, type, ai: true, status: "pending",
    fetchedAt: new Date().toISOString(), title: a.name, model, prompt: a._[1], references: a.ref,
    license: { spdx: "Google Gemini API terms (generated content)", commercial: true, attribution: false, note: "SynthID watermark embedded; not a real product" },
    files, ...extra,
  };
  writeFileSync(join(ROOT, "library/ai", a.name, "meta.json"), `${JSON.stringify(row, null, 2)}\n`);
  ledgerAdd(row);
  console.log(`${row.key} → ${files.join(", ") || "(no media returned)"}`);
}

const a = args(process.argv.slice(2));
const cmds = { check, plan, image, video };
if (!cmds[a._[0]]) {
  console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 16).join("\n"));
  process.exit(a._[0] ? 2 : 0);
}
cmds[a._[0]](a).catch((e) => {
  console.error(explainAuthError(e));
  process.exit(1);
});
