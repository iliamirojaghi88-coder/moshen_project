// Music bed via Lyria 3.5 (Gemini API, paid: about $0.08 per song). Run only
// with the user's OK. The key is injected by the egress proxy (x-goog-api-key).
//   node tools/lyria_song.mjs assets/audio/music/lyria.mp3
import fs from "node:fs";

if (process.env.HTTPS_PROXY && !process.env.NODE_USE_ENV_PROXY) {
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync(process.execPath, process.argv.slice(1), { stdio: "inherit", env: { ...process.env, NODE_USE_ENV_PROXY: "1" } });
  process.exit(r.status ?? 1);
}
const out = process.argv[2] || "lyria.mp3";
const prompt = [
  "Instrumental cinematic electronic score for a 65-second premium real-estate technology commercial, no vocals, 100 BPM.",
  "0:00-0:26 dark, tense and controlled: deep pulsing sub bass, ticking hi-hats, low analog synth arpeggio, rising suspense, a short full stop near 0:05.",
  "0:26 a bright uplifting reveal: airy shimmering pads and a warm synth swell, then a confident modern groove with clean punchy drums and warm plucks.",
  "From 0:48 hopeful and fuller, building to a triumphant but controlled finale with a strong final hit at about 1:05, then a short reverb tail.",
].join(" ");
const res = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
  method: "POST",
  headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY || "injected-by-proxy" },
  body: JSON.stringify({ model: "lyria-3.5", input: prompt }),
});
const j = await res.json();
if (!res.ok) {
  console.error("HTTP", res.status, JSON.stringify(j).slice(0, 600));
  process.exit(1);
}
const find = (o) => {
  if (!o || typeof o !== "object") return null;
  if (typeof o.data === "string" && /audio/.test(o.mime_type || o.mimeType || "audio")) return o.data;
  for (const v of Object.values(o)) {
    const r = find(v);
    if (r) return r;
  }
  return null;
};
const b64 = find(j.output_audio || j.outputs || j);
if (!b64) {
  console.error("no audio in response", JSON.stringify(j).slice(0, 600));
  process.exit(1);
}
fs.writeFileSync(out, Buffer.from(b64, "base64"));
console.log("wrote", out);
