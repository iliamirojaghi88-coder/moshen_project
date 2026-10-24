# moshen_project — HyperFrames motion-graphics studio

Videos are HyperFrames compositions (HTML + GSAP/Three.js, rendered to MP4 by the
`hyperframes` CLI). Persian (RTL) is a first-class target.

## Read first

The official HyperFrames skills are vendored in `.claude/skills/` (from
`heygen-com/hyperframes`). Start every video task with `/hyperframes`; use
`/hyperframes-cli`, `/hyperframes-registry` (≈450 ready blocks: captions, 3D,
transitions, charts) and `/media-use` (voice, music, SFX, icons) as needed.
Check freshness with `npm run skills:check`; refresh by re-copying `skills/*`
from the upstream repo.

## Layout

- `videos/<name>/` — one HyperFrames project per video (`npm run new -- videos/<name>`).
- `videos/starter-fa/` — reference: Persian RTL text, Vazirmatn, local GSAP, Three.js via `hf-seek`, Lucide icon.
- `scripts/setup-motion-env.sh` — idempotent environment setup (runs from the SessionStart hook in cloud sessions).
- `scripts/tts-fa.sh` — Persian narration with Piper (local, free).
- `scripts/captions-fa-from-script.py` — exact Persian caption text from the script + whisper timing.

## Rules

- Keep every asset local inside the video folder (`assets/vendor`, `assets/fonts`, …) — renders never fetch from a CDN.
- Persian fonts: copy Vazirmatn `arabic` + `latin` woff2 subsets from `node_modules/@fontsource/vazirmatn/files` with `unicode-range` faces, as in `starter-fa`.
- Three.js / canvas: draw from `e.detail.time` in an `hf-seek` listener; no rAF clock, no `Math.random()`/`Date.now()`.
- After editing a composition: `npx hyperframes check` and `npx hyperframes snapshot --at <s>`, then look at the frames.
- Persian captions: `hyperframes transcribe <audio> --engine whisper --model medium --language fa`; if the script is known, run `scripts/captions-fa-from-script.py` to keep its exact wording.
- `hyperframes render` (local) is free. `hyperframes cloud render` bills the HeyGen account — never run it, or `publish`, without the user's explicit OK.
