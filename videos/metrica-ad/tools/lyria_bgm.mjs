// Music bed for the METRICA film via Lyria RealTime (Gemini API, experimental).
// Streams PCM over a websocket and steers the prompt along the film's arc,
// keyed to seconds of received audio. The API key never lives here: the
// cloud egress proxy injects x-goog-api-key (local fallback: GEMINI_API_KEY).
//
//   node tools/lyria_bgm.mjs assets/audio/music-raw.wav 76
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const WebSocket = require("ws");
const { HttpsProxyAgent } = require("https-proxy-agent");

const out = process.argv[2] || "music-raw.wav";
const seconds = Number(process.argv[3] || 76);
const RATE = 48000, CH = 2;

const style = "premium cinematic electronic score for a modern real-estate tech commercial, polished, no vocals";
// [audio second, prompts, config overrides]
const SCORE = [
  [0, [["dark tense cinematic pulse, deep sub-bass hits, ticking hi-hats, low analog synth drone, suspense", 1.0]], { density: 0.35, brightness: 0.25 }],
  [8, [["driving cinematic electronic pulse, tight controlled drums, gritty bass arpeggio, rising tension", 1.0]], { density: 0.5, brightness: 0.35 }],
  [18, [["sparse suspenseful arpeggio, glassy plucks, ticking clock percussion, questioning mood", 1.0]], { density: 0.35, brightness: 0.4 }],
  [26, [["bright uplifting reveal, airy shimmering pads, warm synth swell, modern and clean", 1.0]], { density: 0.45, brightness: 0.75 }],
  [33, [["confident modern electronic groove, clean punchy drums, warm plucks, sleek tech product feel", 1.0]], { density: 0.6, brightness: 0.7 }],
  [48, [["hopeful uplifting cinematic electronic, fuller pads, steady confident beat, optimistic", 1.0]], { density: 0.65, brightness: 0.8 }],
  [58, [["triumphant controlled finale, big warm chords, strong final hits, cinematic resolve", 1.0]], { density: 0.7, brightness: 0.75 }],
];
const BASE = { bpm: 100, temperature: 1.0, guidance: 4.5, scale: "D_MAJOR_B_MINOR" };

const url = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateMusic"
  + (process.env.GEMINI_API_KEY ? `?key=${process.env.GEMINI_API_KEY}` : "");
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const ws = new WebSocket(url, {
  agent: proxy ? new HttpsProxyAgent(proxy) : undefined,
  headers: process.env.GEMINI_API_KEY ? {} : { "x-goog-api-key": "injected-by-proxy" },
});

const chunks = [];
let bytes = 0, step = -1, started = false;
const target = seconds * RATE * CH * 2;
const send = (m) => ws.send(JSON.stringify(m));
const steer = (i) => {
  const [, prompts, cfg] = SCORE[i];
  send({ clientContent: { weightedPrompts: [...prompts.map(([text, weight]) => ({ text, weight })), { text: style, weight: 0.6 }] } });
  send({ musicGenerationConfig: { ...BASE, ...cfg } });
  console.log(`steer @${(bytes / (RATE * CH * 2)).toFixed(1)}s -> ${prompts[0][0].slice(0, 50)}`);
};

ws.on("open", () => send({ setup: { model: "models/lyria-realtime-exp" } }));
ws.on("message", (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.setupComplete && !started) {
    started = true;
    step = 0;
    steer(0);
    send({ playbackControl: "PLAY" });
    return;
  }
  if (msg.filteredPrompt) console.log("filtered:", JSON.stringify(msg.filteredPrompt));
  const ac = msg.serverContent?.audioChunks;
  if (!ac) {
    if (!msg.serverContent) console.log("msg:", JSON.stringify(msg).slice(0, 300));
    return;
  }
  for (const c of ac) {
    const b = Buffer.from(c.data, "base64");
    chunks.push(b);
    bytes += b.length;
  }
  const sec = bytes / (RATE * CH * 2);
  while (step + 1 < SCORE.length && sec >= SCORE[step + 1][0]) steer(++step);
  if (bytes >= target) finish();
});
ws.on("error", (e) => { console.error("ws error:", e.message); process.exit(1); });
ws.on("unexpected-response", (req, res) => {
  let body = "";
  res.on("data", (d) => (body += d));
  res.on("end", () => { console.error("HTTP", res.statusCode, body.slice(0, 500)); process.exit(1); });
});
ws.on("close", (code, reason) => { console.log("closed", code, reason.toString()); if (bytes < target) finish(); });

let done = false;
function finish() {
  if (done) return;
  done = true;
  try { send({ playbackControl: "STOP" }); } catch {}
  const pcm = Buffer.concat(chunks).subarray(0, Math.min(bytes, target));
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(CH, 22);
  h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * CH * 2, 28); h.writeUInt16LE(CH * 2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(out, Buffer.concat([h, pcm]));
  console.log(`wrote ${out} ${(pcm.length / (RATE * CH * 2)).toFixed(1)}s`);
  ws.close();
  setTimeout(() => process.exit(0), 300);
}
setTimeout(() => { console.error("timeout"); finish(); }, (seconds + 120) * 1000);
