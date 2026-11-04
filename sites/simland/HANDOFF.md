# SIMLAND — handoff (read this first when the user says «ادامه پروژه»)

Branch: `claude/simland-3d-website-vbz3vl`. Deliverable: `sites/simland/dist/index.html` (single file).
Build: `cd sites/simland && node tools/build-pages.mjs` (layers: `python3 tools/build-hero-layers.py`).
Dev server for tests: `python3 -m http.server 8765 --bind 127.0.0.1` in `sites/simland` (run in background).

## Exact stop point (2026-11-04, solar product page, waiting for the user's approval)

- Branch: `ccr-2cd3266d-qpjs3p`.
- Done in this step («دستور نهایی تکمیل کابل سولار»):
  - the home «کابل سولار» card (slug `low-voltage`) now links to `#/products/solar`; product
    `#/products/solar/solar-panel-cable`. The home card keeps the two-cable photo (Arian's category picture is
    also the pair; their product picture is the single cable) — tell the user, swap on request.
  - photo: the client's JPEG on white `source/catalog/solar-panel-cable.jpg` → `tools/cutout-white.py` (the
    black-background matte of standardize-products.py run on the inverted photo; near-white JPEG noise reached
    from the frame edge = background; product pixels within 1 level) → `solar-panel-cable.png` → lossless WebP.
  - texts exactly as given, in the reference order: subtitle (small) + name «کابل پنل خورشیدی (سولار)»,
    «کد محصول» `H1Z2Z2-K` (grey chip), «ویژگی کابل پنل خورشیدی» list, «ساختار» two LTR lines, «مشخصات فنی»
    table (جنس عایق XLPE LTR, سایز ۱×۴ / ۱×۶ RTL), «استعلام قیمت», then the «توضیحات» accordion (4 sub-headings,
    10 paragraphs, 1 list). No «نظرات» / «دیتا شیت» (not in the site's structure). The client's text says «سه
    دسته» before a list of four — kept verbatim.
  - template (build-pages.mjs): `subtitle`, `codesLabel`, `code` as a list, `specs` table, `content` blocks,
    `afterInquiry`; armored and instrumentation pages byte-identical. Solar shares the grey-code / blue-title look.
  - the client's solar photo is small (227×732): `.pdetail-img.is-low` + `--native-h` caps it per screen-density
    band so it is never upscaled (slightly smaller frame fill on 2–3× screens). Ask for a larger file if wanted.
- Delivered `SIMLAND-site-2026-11-04-739d3af.zip` + standalone. Tests: catalog 10/10 widths × 3 categories
  (solar re-run after the cap), all 10 home cards pixel-identical to the previous build, products 15/15,
  contact 11/11, nav-spy 8/8, motion-nav 9/9, why 9/9, responsive 11/11, interact (7 locked + 3 linked),
  fallback 2/2; delivered zip + standalone: solar 375/1440, resume-open — all PASS.
- **Next action:** wait for the user's verdict. Still open: a verified map link for the branch (`mapUrl`).

### Previous step (2026-11-04): product cards elevator / telecom / solar photo

- Branch: `ccr-2cd3266d-qpjs3p`.
- Done in this step («FINAL EXECUTION PROMPT — SIMLAND PRODUCT CARDS», surgical):
  - position 4 «کابل فشار ضعیف» → «کابل آسانسوری» (slug `elevator`, photo `source/products/elevator-cable.png`,
    symbol `p-elevator`: car on its rope between two guide rails); position 6 «کابل قدرت» → «کابل مخابراتی»
    (slug `telecom`, `telecom-cable.png`, `p-telecom`: signal node with waves both ways); «کابل سولار»: photo only
    (`solar-cable.png`, slug/name/icon/tone untouched). Tones stay with the positions (blue / green).
  - card texts for the two new cards are mine (the brief gave none): «مخصوص اتصال کابین و سیستم‌های کنترل
    آسانسور», «مناسب برای شبکه‌های ارتباطی و انتقال داده» — tell the user, replace if the client has wording.
  - `standardize-products.py`: a photo supplied as a transparent PNG keeps its own colours/alpha (only trimmed);
    the solar photo (opaque, black studio background) is matted like the original ten. The other seven masters
    and card images are byte-identical; old `aluminium` / `armoured` masters and images removed; `p-lv`, `p-bolt`
    removed (no other user).
  - size rule: one height for all; a photo wider than the layouts were drawn for (w/h × scale > 0.66) gets
    `.is-wide` at build: `max-width: 92%` + `object-fit: contain` (bottom centre), fitted, never cut (only the
    telecom fan, 0.79). Scoped on purpose: a global object-fit resampled «ابزار دقیق» a sub-pixel differently.
    Optional `scale` per photo in mapping.json (`--s`), only the elevator (0.86: a flat block much bulkier).
  - QA: `products.cjs` checks names, symbols (corner + mark), new photos, pictures as drawn (inside the box),
    one height except declared scale / 92% fit, 15 widths; a pixel diff of the seven other cards against the
    previous build.
- Delivered: `SIMLAND-site-2026-11-04-779e2dc.zip` + `SIMLAND-standalone-2026-11-04-779e2dc.html` (byte-identical to
  the build of 779e2dc). Tests: products 15/15 (320–1920 incl. 412/1280/1440), the seven other cards pixel-identical
  to the previous build at 375/768/1440/1920, catalog (375/1440), contact 11/11, nav-spy 8/8, motion-nav 9/9,
  why 9/9, responsive 11/11, interact (8 locked + 2 linked), fallback 2/2; delivered zip + standalone: products
  375/1440, catalog 375, resume-open — all PASS.
- **Next action:** wait for the user's verdict. Still open: a verified map link for the branch (`mapUrl`).

### Previous step (2026-11-04): instrumentation cable pages

- Branch: `ccr-2cd3266d-qpjs3p`.
- Done in this step («FINAL IMPLEMENTATION PROMPT — SIMLAND INSTRUMENTATION CABLE», then the user's
  «دستور تکمیلی قطعی» that replaced the product texts):
  - the home «کابل ابزار دقیق» card (slug `flexible-control`) links to `#/products/instrumentation`; one product
    `#/products/instrumentation/instrumentation-armored-cable`;
  - photo: the client's PNG `source/catalog/instrumentation-armored-cable.png` → lossless WebP 298×2072 (only the
    empty transparent margin trimmed, visible pixels identical); very slim, so its product-page frame is taller
    (`.pdetail-media.is-slim`, set by the build when height/width > 5);
  - texts (locked, word for word; the final directive wins over the first prompt): title «کابل ابزار دقیق زره دار»
    (with a space, as given), «کدهای فنی» `REY(ST)Y, REY(ST)YRY`, «کاربرد:» + paragraph, «ساختار:»
    `Cu/PVC/ISCR/OSCR/Bd/SWA/PVC`, accordion «توضیحات» (closed at first). The first prompt's provisional «نوع محصول»,
    «ویژگی‌ها» and «datasheet» note were dropped (the final directive defines the page; tell the user, offer to restore);
  - category-scoped look (`.pdetail[data-category='instrumentation']`): grey codes chip, section titles in the brand
    blue, the long structure code on one line down to 320 px. The armored page keeps its look;
  - panel hint now «برای تماس، روی شماره دلخواه ضربه بزنید» (first prompt's exact text; same single panel);
  - router: Back to the exact home address a catalogue page was opened from restores the scroll position
    (`homeHash` from hashchange `oldURL`), also when that address was `#products`.
- Grid stays 2 / 3 / 4 columns (the first prompt allowed 4–5; 4 kept so the armored page is unchanged).
- Delivered: `SIMLAND-site-2026-11-04-7526880.zip` (index.html + assets/resume/simland-resume.pdf + راهنما.txt with
  all five routes) and `SIMLAND-standalone-2026-11-04-7526880.html`, byte-identical to the build of commit 7526880.
- Tests (sequential): catalog 10/10 widths × both categories (320/360/375/390/430/768/1024/1280/1440/1536);
  products 12/12, nav-spy 8/8, motion-nav 9/9, why 9/9, responsive 11/11, résumé 11/11, interact (8 locked + 2 linked
  cards), fallback 2/2; contact 10/11 then 375 re-run 2/2 PASS (the «چرا سیم‌لند؟» seam check reads 3–4 against a
  limit of 3 — the same pre-existing hairline seen in earlier runs, not this change). On the delivered files:
  catalog at 375/1440 (zip folder + standalone) and resume-open (zip + standalone) PASS.
- **Next action:** wait for the user's verdict. Still open: a verified map link for the branch (`mapUrl`).

### Previous step (2026-11-03): armored cable pages + contact panel

- The home «کابل آرموردار» card links (whole card) to `#/products/armored`; category page + product page
  `#/products/armored/armored-copper-cable` from `assets/data/catalog.json`; product cards with a full-width
  «استعلام قیمت» bar; one reusable contact panel (`<dialog id="contact-panel">`) opened by every `[data-inquiry]`.
- Locked texts (commit 09fc1a7): «کابل تک رشته و چند رشته مسلح (زره دار)», `N2XRY, NYRY, N2XBY, NYBY`, «کاربرد:»,
  «ساختار:» `Cu/PVC/Bd/SWA/PVC`. Name «آرموردار» (brief wrote «آرمودار»; the approved card says «آرموردار»).

### Approved — do not change

- The locked hero picture `source/hero/infinity-hero.png`: framing, 2:1 aspect, position, scale. No zoom,
  camera, parallax or crop.
- The cleaned layers from phase 1: blade cut-outs, caps, root extensions, matte cleanup.
- Header design: glass pill with three items; «خانه» active. (Products and contact now scroll to their sections.)
- Hero copy and buttons:
  - title «جریان مطمئن، اتصال ماندگار»;
  - (2026-11-01, user's final directive) the H1 IS «کامل‌ترین مجموعه نمایندگی / سیم و کابل آرین ابهر در استان قم»
    (`.ht-line` ×2, `.accent` blue gradient 900, `.ht-place`); the old slogan «جریان مطمئن، اتصال ماندگار» and the
    line under it are removed everywhere (also `<title>`); size `clamp(1.375rem, 100cqi / 14.2, 3.6rem | 3.9rem ≥1200)`
    on `.hero-copy` (container `herocopy`), three lines only < 360 px;
  - buttons «مشاهده محصولات» (right) and «دریافت مشاوره» (left), below the picture.
- Single-file delivery (`dist/index.html`) plus the one linked file `dist/assets/docs/simland-catalog.pdf`
  (the client's PDF byte for byte; deploy `dist/` as a folder).
- No sound, no new background, transparency kept.
- Smoke colour: white with a very light grey, semi-transparent (made denser and fuller on 2026-10-31 at the user's request).

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
| `catalog.cjs` | `<dist> <outdir>` | Catalogue pages + contact panel: home card → category → product, grid columns, card, panel rows/close/scroll lock/focus, Back/Forward/Refresh/direct links, menu from a route, hero after return |
| `resume-open.cjs` | `<label> <url> [phone]` | Clicks the résumé button, checks the PDF that opens (SHA-256 / Drive copy), screenshot of the tab (`SHOT=dir`) |
| `resume.cjs` | `<http url of dist/index.html> <outdir>` | Résumé section, the PDF link (served bytes, new tab), the hero line; serve `dist/` first (`python3 -m http.server 8770`) |
| `nav-spy.cjs` | `<dist>` | Menu active item: load, menu/keyboard/hero jumps (no item passed on the way), wheel scrolling to each section and the end, rapid clicks, one active, items never move, reduced motion, `#contact` load |
| `contact.cjs` / `products.cjs` / `why.cjs` / `motion-nav.cjs` | `<dist> <outdir>` (`motion-nav`: `<dist> [<previous dist>]`) | Section layouts, links, entrances; run one at a time |
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

### Why section (done, tested)

- Reference: `source/why/reference.png` (mobile mock). Images: the client's PNGs `source/why/{shield,variety,
  headset,box}.png`; `tools/build-cutouts.py` removes isolated background specks (≤12/255 alpha, apart
  from the object), trims at alpha > 2, writes lossless WebP at the original resolution (visible pixels
  identical; checked by the script). They add ~2.7 MB to the single file (dist ~6.2 MB).
- `build-pages.mjs` renders the cards (`WHY` list, `<!-- why -->`). Markup: `.why-card > .why-in > .why-body
  + .why-art`.
- CSS: one column (max 720 px) below 1200 px, cards 1/3 picture left, 2/4 mirrored (text against the outer
  edge); from 1200 px `@container why (min-width: 1040px)` gives four equal cards, picture on top, centred
  text. Picture areas have a fixed size; the image is absolutely placed with `object-fit: contain`.
  Card internals scale with `cqi`; narrow phones (<320 px card) get a tighter variant.
- Transition: background starts at the products' end colour (#f5fbfa) and turns bluer; two hairline SVG
  curves (non-scaling strokes) at the top and bottom.
- Motion: `home.js` adds `.why-anim` and reveals cards once (IntersectionObserver); off with reduced motion.
- QA: `tools/qa/why.cjs` (9 widths): one column / four in a row, alternation, image whole and undistorted
  and not enlarged past its pixels, no text overflow/overlap, sections adjacent, no overlap with products.

### Contact section (done, tested)

- References: `source/contact/reference-desktop.png`, `reference-mobile.png` (design only, never shown).
  Asset: `source/contact/phone.png` -> `assets/images/contact/phone.webp` (lossless, original resolution)
  via `tools/build-cutouts.py` (was `build-why-images.py`; now handles both sections).
- Data: `assets/js/site-config.js` (`phones[]` with `number`, `address.text`, `address.mapUrl`), rendered
  by `contactCards()` in `build-pages.mjs`: number -> `<a href="tel:…">` over the whole card; empty number
  -> inactive `div` with «شماره تماس به‌زودی»; address -> text + «کپی آدرس» button (clipboard, with a
  fallback and a status message), or a map link once `mapUrl` is set.
- CSS: one column below an 880 px container (order: label, title, text, three cards, phone), two columns
  from 880 px (copy right, phone left). Number size `clamp(1.2rem, 7.6cqi, 1.75rem)` (11 digits = 6.4 em
  in Estedad; proportional digits). Phone width capped at 1075/dpr (537 px at 2x, 358 px at 3x) so it is
  never upscaled. Entrance reveal (`contact-anim`), off with reduced motion.
- QA: `tools/qa/contact.cjs` (11 widths 320–1920): order/columns, image whole/undistorted/not enlarged,
  tel link hit-tested on icon/number/arrow, inactive second card, exact address, copy to clipboard,
  keyboard focus ring, no overflow, visible after entrance, join colour step ≤ 3, contact is the last
  section. `interact.cjs` now also checks «دریافت مشاوره» lands on the contact title.

### Surgical update (done, tested)

- Product names: `source/mapping.json` keeps `slug`/`photo` (the image) and `tone` with each position;
  `name`, `text`, `icon`, `category` now follow what the image shows (client's labelled reference photo,
  ArianCable): 1 کنترل افشان, 2 سیم و کابل ساختمانی, 3 آرموردار, 4 فشار ضعیف, 5 ابزار دقیق, 6 قدرت,
  7 نسوز, 8 آلومینیومی, 9 سولار, 10 جوش. Slugs (file names) no longer equal the product names.
- Menu: `<a href="#top|#products|#contact" data-scroll>`; `home.js` `goTo()` scrolls (smooth unless reduced
  motion), updates the hash with replaceState, focuses the section title (tabindex -1, no ring); a direct
  `#products`/`#contact` load re-lands after `document.fonts.ready`.
- Entrances: `[data-reveal]` (right | left | up | rise) + `.reveal-on` + one IntersectionObserver;
  product sides from the real row (offsetTop/offsetLeft, recomputed on resize), why sides by layout;
  delays via `--rd`. `.products` has `overflow-x: clip` so cards sliding in never widen the page.
- QA: `tools/qa/motion-nav.cjs <dist> [<previous dist>]` (9 widths): buttons identical to the previous build
  except order, menu by mouse/touch/keyboard, hero CTAs, direct #hash loads, no overflow while moving,
  nothing left transformed, reduced motion shows everything. products/why QA wait for the entrances.

### Precision refinement (done, tested)

- Icons (`src/index.html` symbols, `mapping.json` `icon`): `p-conductor` (1 + 6 stranded conductor
  cross-section) for کابل آلومینیومی, `p-lv` (feeder, busbar, three outgoing circuits, «LV») for کابل فشار ضعیف,
  `p-precision` (measuring reticle) for کابل ابزار دقیق. The corner icon and the watermark use the same
  symbol. `p-leaf`, `p-network`, `p-bars` removed (no other user).
- «تنوع کامل محصولات»: `source/why/variety.png` (client's PNG) replaces the reels (removed); card has
  `data-art="variety"`; in one column its image gets `padding: 6%` so its visible size matches the other
  three (measured: 375 px 8.3k px² vs 6.8–8.8k; 768 px 29.4k vs 28.6–37.1k); no padding in the row of four.
- Contact: `site-config.js` now has `groups[]` (`label`, `tone`, `numbers[]`) + `address`. Sales card
  (`.ccard-multi`) has one `a.ccard-line` per number; the office card is a whole-card link (the green card
  that used to say «به‌زودی»); numbers shown grouped by `phoneGroups()` (4-3-4 mobile, 3-4-4 landline).
- QA: `contact.cjs` checks the three tel: links, grouping, LTR isolation, row height, labels.

### Precision fixes & electrical motion (done, tested)

- Contact: `.ccard-line` is now an inner card (1 px `--tone-line` border, 16 px radius, light gradient,
  6/9–14 px padding, call button `.ccard-go-sm` inside); `.ccard-lines` gap 8–10 px; numbers `nowrap`, and
  inside a list narrower than 310 px (320–340 phones) the inner number is `max(1.2rem, 6.9cqi)` (it wrapped
  by 1 px at 320). Office and address cards untouched. `contact.cjs` checks each inner card (border, radius,
  background, inside the group card, number/button inside it, no overflow, equal size, gap 6–14 px).
- Menu (`home.js` «the menu follows the page»): `setActive()` is the only writer (class + `aria-current="true"`).
  IO line `rootMargin: '-35% 0px -64% 0px'` over `.hero`/#products/#why/#contact (why → محصولات) + IO on a
  1 px `.page-end` marker appended to #contact (end of page → contact; needed on tall screens). Click on
  `[data-scroll]` → `startJump(dest)`: destination active at once, observers ignored until the page rests
  (passive scroll listener only during a jump; rest = 120 ms without scroll + two still frames; waits up to
  1 s for a smooth scroll to begin). Labels reserve their bold width (`::before { content: attr(data-label) }`
  in an inline-grid) so items never move; bar fades/scales in 0.25–0.3 s. QA: `tools/qa/nav-spy.cjs`
  (load, menu ×3, keyboard, hero button, wheel to products / why / contact / end / top, rapid clicks,
  one active always, item boxes constant, reduced motion, #contact load) — pass 320…2560.
- Hero (`live-hero.js`): `power(P)` and `sparks(P)` composited with `over()` after the caps, × `uEase`.
  Wires: `tools/build-power-lines.py` fits y = ax²+bx+c to each wire's own dark pixels (column centroids,
  seeds only locate them; rms 0.07–0.11 px), writes `assets/hero/power.json` (8 wires: R1 earth + R2–R5 to
  the right, L1 earth + L2–L3 to the house; flow `from`→`to` x; gain 0.65 for earth wires) and
  `power.png` (visibility mask: band ±12 px around visible wire, blurred σ2.5, zero over non-wire objects,
  σ0.6). `powerCode()` writes the curves into the shader as constants; `uPulse[4]` = two heads per wire from
  `pulseHeads()` (speeds 150/185 px/s ±10%, own periods 1.35–2.15× travel, own phases); comet = Gaussian head
  ahead, exp tail behind; core width max(0.75, 1.15·scale) screen px, halo exp(−d/(2.4+3·scale)) tapered
  4–11 px; colours: core blue (0.10,0.46,1) → cyan (0.66,0.92,1) at the head, halo (0.20,0.56,1) — white
  would vanish on the white sky. Sparks: `sparkState()` one burst per 2 s slot ± 0.3 s (gaps 1.43–2.59 s),
  random conductor (EMIT0 (243,682) / EMIT1 (238,792), ellipse radii), flash on an outer strand on the
  left side + 2–5 streaks (110–280 px/s, decelerating, slight drop, life 0.14–0.36 s). Pixels outside the
  wire band and the copper box are identical to the previous build (checked by diff).
- Docs: README «هیروی زنده», «منو», contact; this file.

### Catalogue pages (done, tested)

- Data `assets/data/catalog.json` (categories: id, name, accent, description, homeCard = mapping.json slug;
  products: id, category, name, image, imageAlt, optional type / codesText / description, and `sections`
  [{id, title, text | items | code, collapsible?}] in page order; see its `_doc`).
- `build-pages.mjs`: `catalogPages(single)` → `<main class="route-view" data-route data-title hidden>` blocks after
  the home `<main id="top">` (`<!-- catalog-pages -->`); one-file page: photos once in `#media-data` (JSON of data
  URIs), `<img data-media>` filled by home.js when the page is shown. `contactPanel()` → `<dialog id="contact-panel">`
  (`<!-- contact-panel -->`). `productCards()`: the card whose slug is a category's homeCard gets a real CTA link,
  `.pcard.is-linked` stretches it over the card (`::after`).
- `home.js`: `showRoute()` on load and hashchange (home hidden while a route is shown; `homeY` restored when coming
  back, or the #section named; title; menu shows «محصولات»; route h1 focused); menu clicks on a route push the
  section hash and show home; scroll-spy observers ignore changes while a route is shown (`routeView`); panel:
  `[data-inquiry]` → `showModal()`, close on ×/Escape/backdrop (`e.target === panel`), `html.panel-open` locks scroll,
  focus back to the opener; no `<dialog>` → `#contact`.
- CSS: «catalogue pages» and «the contact panel» blocks at the end of home.css (container queries `rv`, `agrid`,
  `acard`, `cpanel`; sheet below 600 px).
- Photo: `source/catalog/armored-copper-cable.png` → `assets/images/catalog/armored-copper-cable.webp` (lossless, 428×1693
  after trimming, 1357 invisible specks removed). References kept in `source/catalog/reference-*`.
- QA `tools/qa/catalog.cjs`: both categories (`CAT=` to pick one) at 320/360/375/390/430/768/1024/1280/1440/1536;
  locked texts compared with the rendered h1/h2/p/li text; accordion slides open and shut (mouse, touch, Enter, Space).

### Résumé, sparks, hero line (done, tested)

- PDF: downloaded from the user's Google Drive link (Drive name `simland-catalog-under-30mb.pdf`, Ghostscript-
  compressed by the user; 102 A4 pages, 28,724,812 bytes, SHA-256 b26c8ccd…20701b8; it is the Arian Abhar
  Cable catalogue/résumé). Kept byte for byte as `assets/docs/simland-catalog.pdf` (Git LFS rule
  `sites/simland/**/*.pdf` in the root `.gitattributes`); `build-pages.mjs` copies it to
  `dist/assets/docs/` and checks the hash. Button: `a.btn.btn-primary.resume-cta`, relative href, `_blank`,
  `rel="noopener noreferrer"`, `type="application/pdf"`, sr-only text naming it a PDF of Arian Abhar opening
  in a new tab. In full Chromium the new tab shows the built-in PDF viewer (checked); the headless shell
  has no viewer and downloads it instead, so `resume.cjs` launches `channel: 'chromium'`.
- Section `#resume` (`src/index.html`, `home.css` «résumé and catalogue»): background starts with why's end
  (#f2f8ff, green glow at 0 0) and ends with contact's start (green glow at 0 100%), so neither neighbour
  changed. Container `resume`: < 760 px stacked (folder `order: -1`, `clamp(170px, 58cqi, 300px)`);
  ≥ 760 px grid 1.12fr/0.88fr, folder left, `max-width 410px` (never past its 1233 px at 3x), lifted
  `clamp(26px, 4.4cqi, 58px)` above the card. Arrow icon hidden < 330 px container. Reveal: card `up`,
  folder `rise`. Image: `source/resume/folder.png` → `build-cutouts.py` → `assets/images/resume/folder.webp`
  (1037 invisible specks removed, visible pixels identical). Nav: `resume` → «محصولات».
- Sparks (`sparks(P, col)` in `live-hero.js`): sizes in picture px × k, k = clamp(0.6 / uCss, 1.35, 2.3)
  (`uCss` = CSS px per picture px, new uniform set in `resize()`); hot point σ 5k with re-strike (55 %),
  bloom 12k/22k, 2–3 jagged 4-segment filaments (16–38k long, redrawn every 40 ms, 0.18 s), 3–7 sparks
  (130–280k px/s, decelerating, gravity), copper reflection (col.rgb × blue tint × exp(−r/18k)), all ×
  window that is 0 at the evaluation box (90 + 70k): box edge ≤ 1 level, outside 0 (checked by diff).
- Join résumé → contact: on phones/tablets the card's lower shadow (0 34px 64px -44px) reaches past the
  44 px bottom padding; the contact section used to paint over its tail, leaving a 6–7 level line.
  `.resume { z-index: 1 }` lets the tail fade over the contact's top instead (card pixels identical,
  checked): step 7 → 4 at 375, 6 → 3 at 768, 2 on desktop. A fully clean join needs ~10 px more bottom
  padding on phones or a shorter shadow: not done, the user locked the section's look (2026-10-31).
- Meta description now carries the new hero line too (the old sentence is nowhere in the site).
- Hero line: `.hero-lede` navy 600, clamp(1rem, 4.3vw, 1.14rem) / 1.18rem ≥ 600 / clamp(1.2rem, 1.45vw,
  1.42rem) ≥ 1200; `.lede-lead` 700; `.lede-brand` #0a66e2 800 nowrap; `.lede-place` #2a3f66.
- QA: new `tools/qa/resume.cjs` (http URL of dist; PDF bytes/type, section order/adjacency, image whole and
  not enlarged, texts exact, no overflow, new tab with the PDF, hero line exact/unbroken/clear) at 11 widths
  320–2560. `contact.cjs` now expects the résumé right before the contact; `nav-spy.cjs` checks the résumé
  → «محصولات».

### Smoke made more visible (user request, same day; done, tested)

- `plume()` in `live-hero.js` only: optical depth 3.4 → 6.0, evaporation time 15 → 22 s, spread
  0.17 → 0.21 px per px of height (radius at the mouth unchanged, so it still leaves the mouth exactly),
  billow size F0 16 → 18 px, shadow tone (0.71,0.73,0.77) → (0.64,0.665,0.705), lit tone ~unchanged.
  Denser smoke showed the old marbled «veins» (strong domain warp + derivative relief), so warp 0.6 → 0.42,
  fine octave 0.26 → 0.2, density modulation 0.8 → 0.62 (base 0.62 → 0.68), relief 0.28 → 0.08.
- Checked at 1366 / 768 / 375 (t = 6 and 16 s): pixels differ only in picture x 264–610 above the mouths
  (y < 144); nothing below the mouths changes. Software-WebGL frame +3 % (409 vs 396 ms at 1366).

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
- the other two scroll to `#products` and `#contact` (since the surgical update).

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
