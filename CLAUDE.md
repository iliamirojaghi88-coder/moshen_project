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
- `library/` — fetched assets + `ledger.json`. `library/products/<id>/` holds built products with previews.
- `labs/3d-product/` — technical test scene: real GLB + HDRI in Three.js inside HyperFrames.
- `styles/` — three reusable style systems (tokens + motion grammar). Techniques only.
- `references/ANALYSIS.md` — technique breakdown of the user's reference videos. The videos are style references only: never rebuild their scenes, people, characters or copy.
- `render-profiles.json` — output presets (default 1080×1920, 30 fps, H.264 + AAC, −14 LUFS / −1 dBTP).
- `scripts/` — `setup-motion-env.sh` (idempotent setup, SessionStart hook), `tts-fa.sh` (Piper), `captions-fa-from-script.py`, `audio-master.sh` (denoise, duck, SFX, loudness, AAC), `qc-video.sh` (spec, black/frozen frames, loudness, sync), `analyze-reference.sh`.

## Assets: rules

1. Search before making anything: `node tools/assets/assets.mjs search "<subject>" [--commercial]`. Sources: `met`, `cleveland` (real museum objects, CC0, measured dimensions), `openverse` (real CC photos), `polyhaven`, `ambientcg` (CC0 PBR textures, HDRIs, scanned models), `khronos` (reference glTF), `sketchfab` (scans; download needs `SKETCHFAB_API_TOKEN`), `material`, `lucide` (icons).
2. `fetch <source>:<id>` writes the file + a ledger row (source URL, licence, commercial use, attribution, resolution). Every asset starts `pending`; only `status … approved` assets go into a real video.
3. Priority: user's own product files → manufacturer model → licensed 3D model → real photo → custom model built from real references (label it as such) → AI imagery only with the user's explicit OK.
4. Never present a different or generic object as the user's product. No cartoon/placeholder assets in real output. Respect NC / SA / attribution flags from the ledger.

## Rendering rules

- Keep every asset local inside the project folder — renders never fetch from a CDN.
- Three.js / canvas: draw from `e.detail.time` in `hf-seek` (HyperFrames) or `useCurrentFrame()` (Remotion); register async loads on `window.__hf.buildReady`. No rAF clock, no `Math.random()`/`Date.now()`.
- Remotion on this container needs `--gl=swangle` (set in `remotion.config.ts`).
- After editing a composition: `npx hyperframes check` + `snapshot --at <s>`, or `npx remotion still`. Look at the frames.
- Persian captions: `hyperframes transcribe <audio> --engine whisper --model medium --language fa`; when the script is known, `scripts/captions-fa-from-script.py` keeps its exact wording. A user-supplied voice file is used as-is; never generate a replacement voice unasked.
- Full renders only with the user's OK. `hyperframes cloud render` and `publish` bill/publish — never without explicit approval.
- Run `scripts/qc-video.sh <mp4>` on every render before delivering.
