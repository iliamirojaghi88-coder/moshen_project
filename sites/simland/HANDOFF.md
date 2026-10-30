# SIMLAND — handoff (read this first when the user says «ادامه پروژه»)

Branch: `claude/simland-3d-website-vbz3vl`. Deliverable: `sites/simland/dist/index.html` (single file).
Build: `cd sites/simland && node tools/build-pages.mjs` (layers: `python3 tools/build-hero-layers.py`).
Dev server for tests: `python3 -m http.server 8765 --bind 127.0.0.1` in `sites/simland` (run in background).

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
    mod 289); `uGustPh`, `uSwayPh`, `uAdv`, `uCyc`, `uEvolve`.
  - Wind:
    - gusts travel right→left;
    - gust patches;
    - per-tree phase field;
    - crown sway about 3.4 source px × `uAmp` (1.0 on desktop to 1.6 on phones);
    - leaf flutter.
  - Smoke:
    - flow-map billows;
    - dense exit column;
    - meander carried with the smoke;
    - lean depends on the gust at emission time;
    - fades before the top edge of the canvas.
  - Sharpness:
    - clamped Catmull-Rom (`sampleSharp`) for moving plants, rotated blades, caps and upscaling;
    - GPU Lanczos-3 prefilter with anti-ringing (`DOWN` program) to device resolution for the base and the
      full-resolution atlas. Measured: the live canvas is now as sharp as the browser's own `<img>`
      (gradient energy 5.34 vs 5.27).
  - The canvas backing store follows `device-pixel-content-box` (shown 1:1, never resampled).
  - Frame pacing: drops to a steady 30 fps on slow devices.
- `assets/css/home.css`: `.scene` has `touch-action: pan-x pan-y`, `user-select:none`,
  `-webkit-touch-callout:none`; still images have `pointer-events:none`; `build-pages.mjs` adds
  `draggable="false"`.
- QA scripts are in `tools/qa/` (all tested). Run them from that folder, or pass absolute paths.

| Script | Usage | What it does |
| --- | --- | --- |
| `hero-check.cjs` | `<url> <w> <h> <dpr> <outdir> [t...]` | Still vs live frames at fixed times (needs `window.__hero`) |
| `responsive.cjs` | `<dist/index.html> <outdir>` | 11 viewports (320–1920): overflow, title lines, buttons in one row, full 2:1 scene, live, errors |
| `temporal.cjs` | `<url> <outdir> <t0> <n>` | 30 fps frame sequence; then diff static regions (pylon/house/cable must stay ~0) |
| `smoke-bench.cjs` | `<outprefix> <t...>` | Renders `tools/smoke-bench.html` (smoke alone, 1.6×) via the dev server |
| `fallback.cjs` | `<dist> <prefix>` | Reduced motion and no-WebGL show the still picture, no errors |
| `interact.cjs` | `<dist>` | Locked menu items do nothing; buttons; focusables |
| `preview-frames.cjs` | `<dist> <outdir> <t0> <seconds> <fps> <w> <h> <dpr>` | Deterministic frames; then `ffmpeg … -c:v libx264 -crf 16` for a preview MP4 |
| `align.cjs` | `<url> <w> <h> <dpr>` | Device-pixel boxes of the canvas and the still image |

### Not finished yet — exact next steps

The last edit (narrower plumes `w = r*0.66 + h*0.24`, shaded exit column) is in `live-hero.js` and
`dist` is rebuilt, but it has **not been looked at** yet.

1. Smoke in situ:
   - Run `hero-check.cjs` on `file://…/dist/index.html` at 1366 768 2 with t 12 16, and at 390 844 3.
   - Crop above the chimneys: source x 380–700 and the 27% extension above the picture.
   - Check that it starts at the mouths, the exit column is visible, both plumes are distinct, there is
     no edge, and it is not too wide or too faint.
   - Tune only `plume()` / `billow()`.
2. Wind:
   - `temporal.cjs` at 1366@1, 31 frames: static regions (house, pylon, cable text, solar panel) must stay
     ≤ 1–2 levels.
   - Zoomed frame pairs of the crowns (left tree x140–330 y280–440, pine x1320–1440 y160–260, flower bed)
     must show no stretching at trunk junctions or next to walls/wires.
   - If the sway is still hard to see on 390@3, raise the 3.4 a little (keep strain ≤ ~0.3).
3. Masks: `source/hero/qc/weights.png` (R sway, G flutter, B occluder). Wires and pylon must have zero
   weight; trunks zero.
4. Long run: `renderAt(3600)` and `renderAt(36000)` must look normal (precision).
5. Full pass:
   - `responsive.cjs`, `fallback.cjs`, `interact.cjs`, `recomp.py`;
   - preview MP4 (8 s, 1366×768) and `scripts/qc-video.sh` (the expected warnings are: size profile,
     no audio, still frame).
6. Commit, push, `SendUserFile` with `dist/index.html` and the preview, then a short Persian report of the
   10 checks with honest limits. Limits to report:
   - tests run in headless software WebGL;
   - the source is 1774×887 (very large screens are a little soft);
   - plant motion is kept small because the picture is flat.

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
