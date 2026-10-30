# SIMLAND — handoff (read this first when the user says «ادامه پروژه»)

Branch: `claude/simland-3d-website-vbz3vl`. Deliverable: `sites/simland/dist/index.html` (single file).
Build: `cd sites/simland && node tools/build-pages.mjs` (layers: `python3 tools/build-hero-layers.py`).
Dev server for tests: `python3 -m http.server 8765 --bind 127.0.0.1` in `sites/simland` (run in background).

## Exact stop point (2026-10-30, products section delivered, waiting for the user's approval)

- Branch: `ccr-2cd3266d-qpjs3p`.
- Done in this step (prompt «SIMLAND — طراحی ریسپانسیو سکشن محصولات و اصلاح نهایی هیرو»), see «Products section»:
  hero order title → text → picture → buttons; the products section after the hero; the transition.
- The hero animation (`live-hero.js`) was not touched in this step.
- **Next action:** wait for the user's verdict. Then «چرا سیم‌لند؟» and the contact section (see below);
  the «دریافت مشاوره» button already points to `#contact`.

### Approved — do not change

- The locked hero picture `source/hero/infinity-hero.png`: framing, 2:1 aspect, position, scale. No zoom,
  camera, parallax or crop.
- The cleaned layers from phase 1: blade cut-outs, caps, root extensions, matte cleanup.
- Header design: glass pill with three items; «خانه» active; products and contact locked.
- Hero copy and buttons:
  - title «جریان مطمئن، اتصال ماندگار»;
  - description «تأمین انواع سیم و کابل ساختمانی، صنعتی و تخصصی برای پروژه‌های امروز و فردا.»;
  - buttons «مشاهده محصولات» and «دریافت مشاوره», with the order and layout as delivered.
- Single-file delivery.
- No sound, no new background, transparency kept.
- Smoke colour: white with a very light grey, semi-transparent.

## Where we are

Phase 1 (header + live hero) was delivered and approved in general. The user then sent
**"SIMLAND — FINAL HERO ANIMATION REFINEMENT"**: refine the hero only, keep everything that works.
Its requirements (all must hold):

1. No zoom of any kind (touch, double-tap, click, scroll, mouse), no camera move, parallax, animated scale
   or crop; whole infinity image at every size; page scroll unaffected.
2. Sharper turbines and chimneys, without halos, ringing, noise or changes of shape/colour/position.
3. Photoreal smoke from BOTH chimney mouths: starts exactly at each mouth, white with a very light grey,
   semi-transparent, soft, volumetric, denser at the exit, spreading and fading as it rises, irregular,
   subtle turbulence, small differences between the two, leaning gently with the wind; no cartoon puffs,
   particles, straight lines, flat fog, sudden appear/disappear, no rectangular edge; visible on the light page.
4. A perceptible but natural breeze: one shared wind field; turbines turn smoothly, speed changes subtle and
   gradual; leaves, thin branches, bushes, flowers, grass move slightly and not in sync; trunks, ground,
   buildings stay still; smoke and plants bend the same way; no wind lines or effects.
5. Picture locked: cable, «سیم‌لند», copper ends, buildings, solar panels, pylon unchanged and static; no new
   background; transparency kept; no sound; clean masks (turbines, trees, chimneys, pylon, wires).
6. Endless smooth animation, no jumps or resets, no frame drops; weak devices: keep quality and stability.
7. Test after every change (10 checks: framing/no zoom, sharpness without halo, both plumes natural, wind
   direction consistent, no pixel stretching in leaves/grass, masks at high zoom, mobile/tablet/desktop,
   long-run smoothness, transparency, original unchanged). Fix and retest on the spot.

### Done for this refinement (code in place)

- `tools/build-hero-layers.py`
  - `sharpen_machines()`: clamped unsharp mask (no overshoot), applied only on turbines and chimneys.
  - `classify_trees()`: splits plants into foliage (moves), thin branches (0.55 weight) and trunks (locked).
    Building polygons are in `STATIC_SHAPES`.
  - Masks are now full size (1774×887).
  - Chimney mouths: `CHIMNEYS` (x 498/584, top y 101/141, half width 25/22, density 1/0.88).
  - Recomposition check against the cleaned+sharpened source: 4 px off by ≤10/255. Check with
    `python3 -I tools/qa/recomp.py` from `sites/simland`.
- `assets/js/live-hero.js`
  - Precision-safe clock: all time inputs reach the shader pre-wrapped (phases mod 2π, noise offsets
    mod 289). Superseded in refinement 2: `uWind`, `uSway`, `uFlow`, `uSmoke`, wrapped to the noise's exact
    periods (see below).
  - Wind, smoke and the sampling of moving parts were reworked in refinement 2 (see below). Kept from this
    step: the GPU Lanczos-3 prefilter with anti-ringing (`DOWN`) for static parts, texel for pixel; clamped
    Catmull-Rom (`sampleSharp`) when the picture is enlarged.
  - The canvas backing store follows `device-pixel-content-box` (shown 1:1, never resampled).
  - Frame pacing: drops to a steady 30 fps on slow devices.
- `assets/css/home.css`: `.scene` has `touch-action: pan-x pan-y`, `user-select:none`,
  `-webkit-touch-callout:none`; still images have `pointer-events:none`; `build-pages.mjs` adds
  `draggable="false"`.
- QA scripts are in `tools/qa/` (all tested). Run them from that folder, or pass absolute paths.

| Script | Usage | What it does |
| --- | --- | --- |
| `hero-check.cjs` | `<url> <w> <h> <dpr> <outdir> [t...]` | Still vs live frames at fixed times (needs `window.__hero`) |
| `responsive.cjs` | `<dist/index.html> <outdir>` | 11 viewports (320–1920; `VP='[[w,h,dpr],…]'` to choose): overflow, title lines, buttons in one row, full 2:1 scene, centring / left column, in first view, live, errors |
| `temporal.cjs` | `<url> <outdir> <t0> <n>` | 30 fps frame sequence; then diff static regions (pylon/house/cable must stay ~0) |
| `smoke-bench.cjs` | `<outprefix> <t...>` | Renders `tools/smoke-bench.html` (smoke alone, 1.6×, same clock via `clockUniforms`) via the dev server |
| `fallback.cjs` | `<dist> <prefix>` | Reduced motion and no-WebGL show the still picture, no errors |
| `interact.cjs` | `<dist>` | Locked menu items do nothing; buttons; focusables |
| `preview-frames.cjs` | `<dist> <outdir> <t0> <seconds> <fps> <w> <h> <dpr>` | Deterministic frames; then `ffmpeg … -c:v libx264 -crf 16` for a preview MP4 |
| `align.cjs` | `<url> <w> <h> <dpr>` | Device-pixel boxes of the canvas and the still image |

### Hero refinement 2 (done, tested)

- **Sharpness (root cause fixed).** Static parts were already as sharp as a Lanczos downscale of the PNG.
  Moving parts (plants, rotating blades, caps) were resampled twice (screen-size prefilter, then an
  interpolation at a sub-pixel offset): up to ~20% detail loss at half-pixel offsets. They are now filtered
  straight from a full-resolution layer (`uHi`, atlas at `min(1, 2.5 sx)`) with a clamped Lanczos-2
  (`sampleFine`). Measured: blades at 1366@1 0.91 → 0.97 of the reference at rest; moving trees on 390@3
  +2.6% vs the old filter under the same fixed shift. Static parts unchanged (bit-identical).
- **Smoke (method replaced).** `plume()` is now a light ray march (8 steps) through a soft volume: exact
  transport of 3D simplex noise (features rise at `V0 (1 + h/H1)` and grow as `F0 (1 + h/H1)`, no flow-map
  crossfade), a slower warp field that keeps changing the billows, one light sample per step towards the sun
  (billow relief), weak light extinction (multiple scattering: never dark). The axis drifts by the mean wind
  the parcel has felt since it left the mouth (`windMean`, analytic). The far chimney's plume is drawn first.
- **Wind.** `WIND` terms in JS and `WF`/`WA` in the shader: W0 0.5 + four sines; two close gust frequencies give
  a gust every 2.4–3.6 s (median 2.6 s). Gusts travel right→left at 650 px/s. Rotors: speed × (0.8 + 0.4 W)
  through a 1 s lag (±9%, ≤13%/s change). Crowns: lean with the wind through a 0.45 s lag plus their own
  rocking; leaves flutter and grass bends with a 0.12 s lag.
- **Precision.** Every time offset is wrapped to an exact period of the noise along the direction it moves
  (2D simplex repeats along (1,1) every 289/√3, 3D along (1,1,1) every 144.5). Checked across every wrap
  point and at 1 h and 10 h: no jumps.
- **Layout.** `home.css`: tablets 600–1199 px (incl. 1024) stacked and centred, the picture sized so the whole
  hero fits one view; side by side (picture in the left column) from 1200 px.
- **Tests run** (all pass): `responsive.cjs` (11 widths 320–1920, now also reports centring, picture left of
  the copy, picture in the first view, smoke top), `fallback.cjs`, `interact.cjs`, `recomp.py`, static pixels
  bit-identical over a 30-frame sequence, plants at wind extremes (no stretching; wires/pylon/trunks still),
  long run and wrap points, preview MP4 + `qc-video.sh`.
- Known limits (tell the user): tests run in headless software WebGL; the source is 1774×887, so very large
  screens are a little soft; plant motion stays small because the picture is flat; the new smoke and filter
  cost ~1.3–1.5× the previous frame in software rendering (small areas; 30 fps pacing on slow devices).

### Products section (done, tested)

- The client's reference (2 images): image 1 = the ten cables at one size; image 2 = card style (text right:
  icon chip, short accent line, title, text, blue-circle arrow + «مشاهده محصولات»; cable left over a soft
  green/blue glow, its base running into the card edge). Card copy, icon and tone per product are taken from
  that reference and live in `source/mapping.json` (`text`, `icon`, `tone`).
- `tools/build-images.mjs` now writes `assets/images/products/<slug>.webp`: trimmed, all 640 px tall (one
  size); the old 4:5 440/660/880 sets were removed.
- `build-pages.mjs` renders the cards (`<!-- products -->`); icons are symbols `p-*` in `src/index.html`.
- CSS: 2 columns below 1200 px (grid max 940 px so a card stays ≤ ~460 px); from 1200 px the `pgrid`
  container picks 3 / 4 (≥1100) / 5 (≥1380) columns; unfinished last rows centred (6/8-track grids);
  `grid-auto-rows: 1fr`. Card layout by its own width (`pcard` container): ≥300 side by side, <300 stacked,
  <170 compact. Cable height `min(96%, 64cqi)` side by side so the widest one never leaves its column.
- Hero: DOM order copy, scene, actions. Desktop grid areas `copy scene / actions scene`; buttons end level
  with the picture; hero height from the picture (`--scene-h`), no min-height: gap to products 55–71 px.
- QA: `tools/qa/products.cjs` (12 widths 320–1920): columns, rows, equal gaps and heights, order, every
  cable whole and at one size, no clipped/overlapping text, buttons below the picture; `interact.cjs` checks
  the scroll to the products (title clear of the header) and that card buttons are locked.

## After the user approves the hero: the rest of the home page

Source: the user's **"SIMLAND — FINAL MASTER IMPLEMENTATION PROMPT"**. Home page only, in this order:
header, hero, products, why, contact; the page ends after contact (no long footer, no extra sections or
CTAs). Mobile reference width 390; test 320/360/375/390/414/430, tablet and desktop.

Palette:

| Name | Colour |
| --- | --- |
| navy | `#071C4B` |
| brand | `#0878F9` |
| light blue | `#37B6FF` |
| ice | `#EAF6FF` |
| pearl | `#F8FCFF` |
| muted | `#49638B` |
| line | `#DCEAF8` |

Header (already built):
- glass pill with three items, خانه | محصولات | ارتباط با ما;
- «خانه» is active (light-blue background and a small bar);
- the other two are locked, with no navigation.

The hero buttons scroll to `#products` and `#contact`.

**Products section**
- Small label «محصولات سیم‌لند»; title «دسته‌بندی محصولات», with «محصولات» in brand blue; centred.
- Mobile grid: exactly 2 columns × 5 rows, 10–12 px gap horizontally and 12–16 px vertically. More columns
  on tablet and desktop, same card identity.
- Cards:
  - horizontal, about 95–115 px tall at 390, rounded;
  - very light ice gradient, soft shadow, no thick border;
  - product image on the right, large, part of the cable on a diagonal;
  - name in the middle or left;
  - arrow inside a light-blue circle;
  - subtle hover/tap.
- Use ONLY the client's 10 product photos: `source/standardized/<slug>.png` (transparent). Map the names
  via `source/mapping.json`; do not alter material, colour or strand count.
- Order (right to left, top to bottom):
  1. کابل ساختمانی
  2. کابل نسوز
  3. کابل قدرت
  4. کابل آلومینیومی
  5. کابل کنترل افشان
  6. کابل آرمودار
  7. کابل ابزار دقیق
  8. کابل سولار
  9. کابل فشار ضعیف
  10. کابل جوش

**Why section**
- Label «چرا سیم‌لند؟»; title «انتخاب مطمئن برای پروژه‌های شما», with selected words in blue.
- Four cards, 2 columns on mobile, each with a 3D icon, title and short text:

| Card | Title | Icon | Text |
| --- | --- | --- | --- |
| 1 | کیفیت قابل اعتماد | blue shield with a check | «محصولات باکیفیت برای کاربردهای مختلف» |
| 2 | تنوع محصولات | blue 3D gear | «انواع کابل ساختمانی، صنعتی و تخصصی» |
| 3 | قیمت رقابتی | blue and copper coins | «انتخاب اقتصادی متناسب با نیاز پروژه» |
| 4 | ارسال سریع | blue 3D truck | «ارسال سفارش‌ها به سراسر کشور» |

- Never claim free shipping.
- Icons: consistent material. The Blender pipeline is `tools/blender/render-imagery.py` (not run on this
  set yet); the old icon WebPs were removed with the V2 code and can be found in git history (commit
  9fd6db4).

**Contact section (last)**
- One horizontal rounded panel with a light-blue gradient.
- Label «ارتباط با ما»; title «برای مشاوره و استعلام قیمت با ما در تماس باشید»; text «کارشناسان ما آماده
  پاسخ‌گویی به سؤالات شما هستند.»
- Three ways: phone, WhatsApp, email. Demo values, clearly labelled as demo, with no live links. Config is
  in `assets/js/site-config.js` (`active:false`).
- 3D image: a cable with a dark-blue sheath and open copper end, blue light, advertising quality. Options:
  Blender with `tools/export-cables.mjs` + `render-imagery.py`, or the macro render.

Rules that always apply:
- No AI imagery without the user's explicit OK.
- No unverified claims.
- Demo contact info is never linked.
- Commit messages end with the attribution lines.
- No model names in commits.
- Do not open a PR unless asked.

## Working economically (agreed with the user)

- **Context**
  - Start a new session per phase. Read only this file and the files the step needs.
  - Do not re-read large files.
- **Visual checks**
  - Batch them: one script that writes numbers plus ONE small contact sheet (≤ 1200 px wide) per check.
  - No separate screenshot reads per detail.
  - Prefer numeric checks (diffs, gradient energy, region stats) and look at images only to confirm.
- **Builds and renders**
  - Edit with small exact replacements; rebuild once per batch of edits.
  - Long renders run in the background with a single wait, never polling loops.
- **Session state**
  - Update this file at the end of each step, then commit and push.
