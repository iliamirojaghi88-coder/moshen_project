# Upstream: MP Video Skillset

- Source: https://github.com/ThePudge/mp-video-skillset @ `d58a36dd1fb93665e464aaccea32f3a5ae6a1bf6` (MIT, © mohammadpour.bi).
  Third-party parts keep their licences: `.claude/licenses/mp-video-skillset-THIRD_PARTY_NOTICES.md`.
- GSAP skills: https://github.com/greensock/gsap-skills @ `aed9cfd3277740755f6bfc1155c7aa645403b760` (MIT,
  `.claude/licenses/gsap-skills-MIT.txt`): `gsap-core`, `gsap-timeline`, `gsap-plugins`, `gsap-utils`, `gsap-performance`
  (the five upstream's installer picks; React/Vue/ScrollTrigger skills are not useful for video).

## Where it went
| Upstream | Here |
|---|---|
| `.claude/skills/*` (33 skills + `LICENSE-ootto-content-skills`) | `.claude/skills/` (no name clashes with existing skills) |
| `mp-studio/` (app, fonts, learn, vendor/arta-edit-studio, cloud requirements) | `mp-studio/` |
| `cloud/` | `cloud/` |
| `CLAUDE.md`, `AGENTS.md` | `mp-studio/CLAUDE.md`, `mp-studio/AGENTS.md` (root `CLAUDE.md` is this project's) |
| `.claude/settings.json` env | merged into `.claude/settings.json` |
| `.mcp.json` kinocut (Windows `.venv/Scripts/kino.exe`) | `.mcp.json` -> `.claude/hooks/kinocut-mcp.sh` (Linux) |
| `.gitignore` | merged, scoped to `mp-studio/` |

## Not vendored
- `MP Studio.exe`, `mp-studio/tools/launcher/`, `setup.bat`, `start.bat`, `tools/bootstrap.ps1`, `requirements.txt`,
  `requirements-gpu.txt`: Windows desktop installer/launcher and CUDA wheels (cloud is Linux, CPU only).
- `insta-login-research` skill + `mp-studio/tools/ig_session.py`: PC only, reads the owner's logged-in browser cookies.
- `mp-studio/learn/notes/*/*.jpg`: frames of other creators' reels (notes and transcripts are kept).
- `mp-studio/docs/` (GUIDE for other agents, PUBLIC_RELEASE), `GEMINI.md`, `QWEN.md`, `.trae/`, `.claude-plugin/`: other agents / plugin packaging.
- Remotion skills: provided by the account's `remotion` plugin; `cloud/setup.sh` fetches `remotion-best-practices`
  (gitignored, no licence file) only if no copy exists. HyperFrames skills were already vendored in this repo.

## Local changes
- `cloud/setup.sh`: lock (one installer at a time), apt skipped when ffmpeg/fontconfig/git/curl exist, uv venv/install
  when available, pip upgrade only on a new venv, pro extras get a marker, `MP_WHISPER_MODEL=none` skips the model
  prefetch, `fc-cache` incremental, Remotion fallback only when missing, fixed libass probe (`grep -q` + `pipefail`
  falsely reported no libass and downloaded a static ffmpeg).
- Pointers to the root `CLAUDE.md` now point to `mp-studio/CLAUDE.md`; `learn-update` commits but no longer pushes to `main` by itself.
- `mp-studio/CLAUDE.md` starts with this project's precedence note.
- Bugs found by the install tests and fixed here:
  - `mp-studio/fonts/*.ttf`: isolated Arabic Presentation Forms added to the cmap with `scripts/font-fix-libass.py`
    (libass drew boxes/dropped isolated letters: Lalezar «حرفه‌ای» -> «حرفه□□», Vazirmatn «دربارۀ» -> «دربار»). Outlines unchanged.
  - `pro-edit/finish.py`, `mp-studio/app/engine.py`: `-/filter_complex FILE` is FFmpeg 7+ only; `platform_utils.filter_script_flag()`
    picks `-filter_complex_script` on FFmpeg 6 (Ubuntu 24.04).
  - `pro-edit/finish.py`: audio trimmed to the video stream length, not the container's (QC failed on 0.13 s A/V drift).
  - `mp-studio/app/handoff.py`: the approval fingerprint includes `edit/caption_fixes.json` (lite captions edited after
    approval were not detected).
  - `cloud/fetch_input.py`: `duration<=?N` (direct file links have no duration before download and were all rejected),
    duration checked with ffprobe after download; it and `motion-reference/ref_sheets.py` pass yt-dlp
    `--compat-options no-certifi` when `SSL_CERT_FILE` is set (TLS-inspecting proxy of cloud containers).
  - `pro-edit/templates/motion-kit/kit.py`: `localize_cdn()` copies pinned CDN `<script>` libraries (GSAP, Lottie, Three.js)
    into the project, so renders never fetch from a CDN (the physics drop's dynamic Rapier import still does).

To update: clone upstream into a temp dir, diff against these paths, re-apply the local changes above.
