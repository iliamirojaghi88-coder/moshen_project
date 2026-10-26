// Dev preview: render chosen times of the world directly (no HyperFrames
// runtime), report console errors and per-frame cost, save PNGs + a sheet.
//   node tools/frames.cjs <outdir> 0 1.2 3.4 ...
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const out = path.resolve(process.argv[2]);
const times = process.argv.slice(3).map(Number);
const types = { ".js": "application/javascript", ".html": "text/html", ".jpg": "image/jpeg", ".png": "image/png", ".ttf": "font/ttf", ".json": "application/json", ".mp3": "audio/mpeg" };
const srv = http
  .createServer((q, s) => {
    const f = path.join(root, decodeURIComponent(q.url.split("?")[0]));
    fs.readFile(f, (e, d) => {
      if (e) {
        s.writeHead(404);
        s.end();
        return;
      }
      s.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" });
      s.end(d);
    });
  })
  .listen(0);

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const port = srv.address().port;
  const b = await chromium.launch({
    executablePath: process.env.CHROME || "/root/.cache/hyperframes/chrome/chrome-headless-shell/linux-152.0.7977.30/chrome-headless-shell-linux64/chrome-headless-shell",
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--use-gl=angle", "--autoplay-policy=no-user-gesture-required"],
  });
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  p.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  p.on("console", (m) => {
    if (["error", "warning"].includes(m.type())) console.log("CONSOLE", m.type(), m.text().slice(0, 400));
  });
  const t0 = Date.now();
  if (process.env.NODOF) await p.addInitScript(() => (window.__noDof = true));
  await p.goto(`http://localhost:${port}/index.html`);
  await p.waitForFunction(() => window.__world && window.__world.ready, null, { timeout: 120000 });
  await p.evaluate(() => window.__world.ready);
  console.log("build", Date.now() - t0, "ms");
  for (const t of times) {
    const s = Date.now();
    await p.evaluate((t) => {
      // let GSAP-driven overlays follow too when present
      for (const k in window.__timelines || {}) window.__timelines[k].seek(t, false);
      return window.__world.renderAt(t);
    }, t);
    await p.evaluate(() => window.__world.settle?.());
    const file = path.join(out, `t${t.toFixed(2).padStart(6, "0")}.png`);
    await p.screenshot({ path: file });
    console.log(`t=${t} ${Date.now() - s} ms -> ${file}`);
  }
  await b.close();
  srv.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
