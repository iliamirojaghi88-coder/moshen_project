# moshen_project — motion-graphics studio infrastructure

Two render engines (HyperFrames HTML→MP4 and Remotion React→MP4), a real-asset
research engine with a licence ledger, a Blender/glTF 3D pipeline, Persian
(RTL) text, voice and captions, and QC. Persian is a first-class target.

## Read first

- HyperFrames skills are vendored in `.claude/skills/` (from `heygen-com/hyperframes`). Start HyperFrames work with `/hyperframes`; also `/hyperframes-cli`, `/hyperframes-registry` (≈450 blocks), `/media-use`.
- Remotion work: the `remotion:*` plugin skills (`remotion-best-practices` first).
- Design work: the `frontend-design` plugin skill.

## Layout

- `videos/<name>/` — one HyperFrames project per real video (`npm run new -- videos/<name>`). `videos/starter-fa/` is the reference scaffold (RTL, Vazirmatn, local GSAP, Three.js via `hf-seek`).
- `remotion-studio/` — Remotion 4 workspace: `src/lib/fonts.ts` (Vazirmatn subsets), `src/components/PersianCaption.tsx`, `src/components/StudioObject.tsx` (R3F studio lighting). `npm run still:test` renders one frame.
- `tools/assets/assets.mjs` — Asset Research & Discovery engine (see below).
- `tools/ai/gemini.mjs` — Gemini API bridge (official `@google/genai`): `check`, `plan` (free-tier text: scenario → sequences → per-asset prompts), `image` and `video` (Gemini Omni Flash). Paid calls need `--approve-cost` and the user's explicit OK per generation. Key: injected by the environment's Network secret (`x-goog-api-key`), never held in the container; local fallback `GEMINI_API_KEY`. See `docs/AI-SERVICES.md`.
- `tools/3d/` — `rectify_photo.py` (flatten a product photo to a texture at real mm size), `pbr_from_photo.py` (basecolor/roughness/normal/height), `build_tile.py` (Blender: physically scaled slab + glaze, GLB export, Cycles still).
- `library/` — `catalog/` (offline metadata), `ledger.json` (provenance, licence, QC, usage), `LICENSES/`, built products in `products/`, a few committed characters/clips (LFS); downloads live in git-ignored `.cache/`.
- `labs/3d-product/` — technical test scene: real GLB + HDRI in Three.js inside HyperFrames.
- `sites/simland/` — SIMLAND home page (RTL, Estedad). Deliverable is the single self-contained `dist/index.html`. The hero is the client's locked picture made live in WebGL (`assets/js/live-hero.js`: blades turning in each rotor's plane, flow-map chimney smoke, masked plant sway) from layers cut by `tools/build-hero-layers.py`; `tools/build-pages.mjs` builds the page from `src/` + `assets/`; see its README.
- `styles/` — three reusable style systems (tokens + motion grammar). Techniques only.
- `references/ANALYSIS.md` — technique breakdown of the user's reference videos. The videos are style references only: never rebuild their scenes, people, characters or copy.
- `render-profiles.json` — output presets (default 1080×1920, 30 fps, H.264 + AAC, −14 LUFS / −1 dBTP).
- `scripts/` — `setup-motion-env.sh` (idempotent setup, SessionStart hook), `tts-fa.sh` (Piper), `captions-fa-from-script.py`, `audio-master.sh` (denoise, duck, SFX, loudness, AAC), `qc-video.sh` (spec, black/frozen frames, loudness, sync), `analyze-reference.sh`.

## Assets: rules (on-demand, per scenario — see docs/ASSET-LIBRARY.md)

1. For every shot need: `npm run assets -- find "<need>" [--kind model|character|animation|icon|texture|hdri|element]`. Order: library ledger → offline catalogues (`library/catalog/`: Poly Haven, Rocketbox characters + 471 clips, Khronos, 3dicons, HyperFrames blocks) → local SVG packs → online (`--online`: Sketchfab, Openverse, Met, ambientCG).
2. `npm run assets -- install <key> --project videos/<name>`: downloads into the git-ignored `library/.cache/`, converts/optimises to GLB, renders a preview, runs QC, records a ledger row, and copies only what the project uses into `videos/<name>/assets/`. No bulk downloads; nothing heavy enters git unless a project needs it (Git LFS).
3. Fit to the scenario: compare candidates visually (`tools/assets/contact_sheet.py`), adapt with `tools/3d/customize.py` (colour, finish, real size), make consistent 3D icons with `tools/3d/icon3d.py` (SVG → bevelled 3D, ceramic/glass/metal), or build custom in Blender (`tools/3d/`). Line icons only for UI/HUD; no cartoon/placeholder/vintage assets in modern scenarios.
4. Status: `ready` = automatic QC passed and preview reviewed; `approved` = user approved; `pending`; `rejected` (kept so it is never re-downloaded).
5. Priority: user's own product files → manufacturer model → licensed 3D model → real photo → custom build from real references (label it) → AI imagery only with the user's explicit OK. Never present a generic object as the user's product. Respect NC / SA / attribution flags; keep `library/LICENSES/` notices with MIT assets.

## Rendering rules

- Keep every asset local inside the project folder — renders never fetch from a CDN.
- Three.js / canvas: draw from `e.detail.time` in `hf-seek` (HyperFrames) or `useCurrentFrame()` (Remotion); register async loads on `window.__hf.buildReady`. No rAF clock, no `Math.random()`/`Date.now()`.
- Remotion on this container needs `--gl=swangle` (set in `remotion.config.ts`).
- After editing a composition: `npx hyperframes check` + `snapshot --at <s>`, or `npx remotion still`. Look at the frames.
- Persian captions: `hyperframes transcribe <audio> --engine whisper --model medium --language fa`; when the script is known, `scripts/captions-fa-from-script.py` keeps its exact wording. A user-supplied voice file is used as-is; never generate a replacement voice unasked.
- Full renders only with the user's OK. `hyperframes cloud render` and `publish` bill/publish — never without explicit approval.
- Run `scripts/qc-video.sh <mp4>` on every render before delivering.
