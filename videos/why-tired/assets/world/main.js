// Boots the 3D world: loads assets, builds every shot, then draws the frame
// for whatever time HyperFrames seeks to.
import { Engine } from "./engine.js";
import { materials, glyphs } from "./props.js";
import s2 from "./shots/s2-clock.js";
import s3 from "./shots/s3-brain.js";
import s4 from "./shots/s4-night.js";
import s5 from "./shots/s5-rhythm.js";
import s6 from "./shots/s6-inertia.js";
import s7 from "./shots/s7-remedy.js";
import s8a from "./shots/s8-doctor.js";
import s8b from "./shots/s8-end.js";

const SHOTS = [s2, s3, s4, s5, s6, s7, s8a, s8b];
const E = new Engine(document.getElementById("world"));
window.__world = E;
let built = false;
let lastT = 0;

const ready = (async () => {
  await Promise.all(["400", "700", "900"].map((w) => document.fonts.load(`${w} 100px Vazirmatn`, "۰۱۲۸ اینرسی")));
  const M = await materials(E);
  const G = await glyphs(E);
  for (const build of SHOTS) E.add(await build({ E, M, G }));
  for (const s of E.shots) E.r.compile(s.scene, s.camera);
  built = true;
  E.frame(lastT);
})();

window.__hf = window.__hf || {};
window.__hf.buildReady = window.__hf.buildReady || {};
window.__hf.buildReady.world = ready;
window.addEventListener("hf-seek", (e) => {
  lastT = e.detail.time;
  if (built) E.frame(lastT);
  else e.detail.waitUntil?.(ready.then(() => E.frame(lastT)));
});
