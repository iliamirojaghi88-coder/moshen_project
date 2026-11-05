# Video Editor — instructions for Claude

> **moshen_project integration** (vendored from `ThePudge/mp-video-skillset`, see `mp-studio/UPSTREAM.md`).
> This repo runs in Claude Code cloud sessions: always **Path A**. The root `CLAUDE.md` wins on any conflict:
> final renders only after the owner's explicit approval; Drive upload (`cloud/deliver.py`), `learn-update` pushes,
> link downloads of other people's videos and any paid/online service only with the owner's explicit OK.
> Default delivery = the file in `mp-studio/output/` sent in the chat (`scripts/qc-video.sh` first).
> Not vendored here (Windows/PC only): `MP Studio.exe`, its launcher/installer, `insta-login-research`.

The owner sends **raw videos of themself** (mostly Persian, sometimes English) and Claude edits them.
Claude is the editor; MP Studio (`MP Studio.exe`, http://127.0.0.1:8765) is an optional visual tool
for cutting by text and previewing.

## Two paths (pick one at the start of every session)
Check: `test -f .mp-cloud-ready` (or `MP_HEADLESS=1`, or Linux without a display) => **Phone / Cloud**; otherwise
Windows with `.venv/Scripts/python.exe` => **PC / Windows**. They are independent; never mix them.

### Path A - Phone only / cloud (headless)
The owner has only a phone: a Claude Code cloud session (browser or the Code tab of the Claude app). No window, no MP Studio button.
1. First run in a fresh container: `bash cloud/setup.sh` (add `--with-pro`, `--with-motion` only when needed), then
   `.venv-cloud/bin/python cloud/doctor.py`. Use `.venv-cloud/bin/python` (= `sys.executable`) for everything.
   `mp-studio/work/capabilities.json` says which features work; if one is UNAVAILABLE say so in one line and use its fallback.
2. Input: the owner attaches a video or gives an allowed link -> `python cloud/fetch_input.py SOURCE` (no cookies, no logins, size/duration caps).
3. One job per input x style: `python cloud/jobs.py new FILE --style lite|fav-... --label NAME` (id = `<slug>-<hash>__<style>`).
   The transcript is cached per input, so 4 styles of one video transcribe once. `jobs.py status` / `resume <job>` after a failure.
   Run long commands with `run_in_background`; every step has a timeout (`MP_STEP_TIMEOUT`, default 1500 s). CPU only: never assume a GPU.
4. Style: `brand.edit_style` auto or unknown -> use the `style-scout` skill (web search + the transcript) and show the choice.
5. Plan -> `jobs.py run <job>`, do the judgment step (`LITE_TODO.md`), `jobs.py run <job> --until storyboard`, then
   `python mp-studio/app/handoff.py present <job>` and PUT ITS OUTPUT IN THE CHAT: plan, cut table, storyboard stills (view them, send
   key ones), and a sample (`jobs.py render <job>` = preview, delivered with `cloud/deliver.py`). Then ask: approve or what to change?
6. **Approval gate.** Only after the user clearly says yes in chat (e.g. «تأیید», "approved"): `handoff.py approve <job> --note "..."`.
   Changes -> `handoff.py revise <job> --note "..."`, redo, present again. A plan edited after approval invalidates it.
   `jobs.py render <job> --final` / `lite_edit.py render --final` refuse otherwise. Never run `approve` on your own.
7. Delivery: `python cloud/deliver.py send output/<job>/<file>.mp4` -> private Google Drive link, shared with `MP_DELIVER_EMAIL`, deleted after
   the TTL (`deliver.py purge`). Give the user the printed `link`. Never present a container path as a download link. If Drive secrets are
   missing, run `deliver.py auth-help` and tell the user what to add as environment secrets (never ask them to paste secrets in chat).
8. Never print secrets (`MP_GDRIVE_*`, tokens, cookies) in chat, logs or files; inputs/outputs stay out of Git (already gitignored).
9. Not available in the cloud: Studio window, `handoff.py wait`, Instagram login (`insta-login-research`), GPU encoders, `MP Studio.exe`.

### Path B - PC / Windows only
Everything below this heading (Environment, MP Studio first, ...) is the Windows path: the owner at their PC with `MP Studio.exe`.
The Instagram-login research feature (`insta-login-research`, `mp-studio/tools/ig_session.py`) exists only here.

## Environment (PC / Windows)
- Python: always `.venv/Scripts/python.exe` (never system Python). Created on the first run of `MP Studio.exe` (or Studio → Home → install).
  If `.venv` is missing, tell the owner to double-click `MP Studio.exe` — don't install packages yourself.
- FFmpeg/ffprobe on PATH. GPU Whisper uses `int8` (older NVIDIA cards can't do float16); CPU fallback is automatic.
- No API keys needed. Transcription is local Whisper. `ELEVENLABS_API_KEY` in `.env` switches video-use to hosted Scribe (better filler detection, uploads audio). Keys go in `.env` only — it is gitignored.

## MP Studio first (every edit)
The owner works in **MP Studio** (one app window: setup, uploads, brand & style, fonts, review, outputs).
Don't ask in chat for what Studio collects; hand work back and forth with `mp-studio/app/handoff.py`:
1. `.venv/Scripts/python.exe mp-studio/app/handoff.py open <project>` — starts the server if needed and opens the
   window once (never more often). Tell the owner in one line: add the files and the brief, then press
   «ارسال به Claude». Start `handoff.py wait <project> --for ready` with **run_in_background**; it wakes
   you with the brief + brand as JSON. Then `handoff.py set <project> working`.
2. Plan → **storyboard in Studio BEFORE any render**, not a chat essay: cut EDL + corrected captions +
   `cards.json` (layout/move per spoken line) + `plan.md`, then `pro-edit/storyboard.py <edit> --cards … --plan …`
   **without `--video`** (stills + audio straight from the raw takes, seconds). `handoff.py set <project> review`,
   one-line note in chat, then `wait --for approved,changes` in the background. Heavy work (panels, depth,
   finish, QC renders) only after approval.
   The brief's `mode` says which pipeline the owner picked: `pro` (this one) or `lite` (`pro-edit/lite_edit.py`,
   see `mp-studio/AGENTS.md`) — if `lite`, run lite mode even in Claude.
3. `changes` → apply `mp-studio/work/<project>/review/decision.json` (per-card notes), redo only those cards, review
   again. `approved` → `set rendering`, final render + `<video>.caption.txt` beside it in `mp-studio/output/`, `set done`.
**The owner's Studio buttons only save** («ذخیره و آماده برای Claude», «تأیید», «تغییرات»); then they paste
a sentence here, e.g. «پروژه‌ی «X» رو ادیت کن», «…: تأیید کردم، نسخه نهایی رو بساز», «…: یادداشت‌های بازبینی رو
اعمال کن». On any of these, first run `.venv/Scripts/python.exe mp-studio/app/handoff.py show <X>` (brief, brand,
review decision, status) and continue from that status — never ask for what it already contains.
Brand & style: `mp-studio/assets/brand.json` (Studio writes it). A project can override any style/voice key in
`mp-studio/work/<project>/settings.json` (Studio → Brand & style → «فقط پروژه‌ی …», or Voice → «استفاده در ادیت‌های این پروژه»);
the `brand` that `handoff.py show` prints is already merged — always use that, never brand.json alone.
motion-kit (`kit.py`, `depth.py`) merges it too when its spec/output lives under `mp-studio/work/<project>/`. If the owner answers in chat instead ("approved"),
stop the waiting task and `handoff.py set <project> approved|changes` so Studio shows the same state.
Send Persian text to the Studio API from Python (urllib/json), never `curl -d` in Git Bash: the shell
mangles it to "????".

## Which tool for what
Short list of every feature (one line each, in edit order): `.claude/skills/pro-edit/FEATURES.md` — read it first.

| Task | Use |
|---|---|
| Quick dependable edit in two commands (also what other agents use, see `mp-studio/AGENTS.md`) | `pro-edit/lite_edit.py prepare / render` |
| Edit raw footage into a finished video (the default for any edit request) | `pro-edit` skill — token-lean pro pipeline; it drives the skills below |
| Cutting engine and its hard rules (cuts, retakes, fillers, grade, subtitles, overlays) | `video-use` skill (used by `pro-edit`) |
| Motion graphics: titles, lower-thirds, animated captions, logo intro/outro | `hyperframes` skills (HTML/GSAP, ~450 ready blocks in `hyperframes-registry`) or `remotion-best-practices` (React); both fetched by setup |
| Owner drops notes/feedback/tutorials/examples in `mp-studio/learn/inbox/` to improve the skills | `learn-update` skill → edits skills, logs in `mp-studio/learn/LOG.md`, commits (push only when the owner asks) |
| Copy the style of reference videos (files in `mp-studio/input/<project>/ref/` or a pasted link), incl. a 0–10 s hook microscope | `motion-reference` skill → `mp-studio/work/<project>/ref_style.md`; no ref folder → pro-edit picks a look from `pro-edit/styles.md` |
| Owner sends a voice note / voice-over (no footage) → full motion-graphics reel | `voice-motion` skill (motion-kit + pro-edit captions/audio) |
| Pro UI motion: futuristic / Apple-style glass cards, SVG icons, segmented tabs, counters, charts, chat, notifications | `pro-edit/templates/motion-kit` (`kit.py`, scene list → HyperFrames) |
| Simple cards, counters, CTAs, or any motion when HyperFrames isn't installed | `pro-edit/templates/ass-motion` (animated libass, Persian-safe) |
| Graphics passing behind AND in front of the speaker: logo orbit, Claude window from behind the head, 3D growth chart, reel fan, before/after studio wipe, pixel title | `pro-edit/templates/motion-kit/depth.py` (`depth.json` → `base_depth.mp4`) |
| Editorial / news look, article highlights, cinematic camera, 3D phone, physics drop, Lottie | motion-kit components + `editorial` theme + `"camera": true` (README there) |
| Clean the voice: room noise, hum, mouth clicks, harsh «س», thin/boomy tone, uneven level | `pro-edit/audio/voice_clean.py` (presets light/clean/strong/podcast) — also MP Studio → صدا with before/after preview |
| Text behind the speaker, dimmed / blurred / replaced background | `subject-cutout` skill (local person cutout via `npx hyperframes remove-background`) |
| Edit style chosen in MP Studio («سبک ادیت», `brand.edit_style` from `handoff.py show`): glass panels / paper grid / head pop-out card / text over footage / 33 motion effects | `fav-edit-video` (base) + the matching style skill: `fav-adaptive-glass`, `fav-paper-grid`, `fav-breakout-card`, `fav-text-over-footage`, `fav-motion-effects`; runtime in `.favstash-studio/runtime` (HyperFrames + GSAP, `node .claude/skills/fav-edit-video/scripts/init-workspace.mjs --workspace . --install`) |
| Ad or launch film for a product, app or giveaway, no camera footage | `fav-product-motion-ads` (style of `fav-edit-video`) |
| Find what to make next / hooks and scripts from a saved reel | `fav-find-ideas`, `fav-write-script` (use with the content skills; no posting) |
| Code-drawn illustration, animated story, explainer or web animation in 32 styles (no image or video generation) | `anidoodle` skill (first render installs npm packages + Chromium; ask first) |
| Farsi talking-head reel with NO running subtitles: full-frame story edit or illustration-panel split edit | `arta-reels` skill → vendored `mp-studio/vendor/arta-edit-studio/` (own venv; ask before its large installs) |
| One-off operations: trim, convert, resize, extract audio, quick effects | `kinocut` MCP server (`.mcp.json`) |
| Hooks, scripts, on-screen text, captions/hashtags, covers, repurposing | content skills (`viral-hook-writer`, `reel-scripter`, `on-screen-text-writer`, `caption-and-hashtags`, …) |
| Owner wants to cut visually themself | the app: projects in `mp-studio/input/<project>/`, edit decisions in `mp-studio/work/<project>/cuts.json` (word ids `clip:word`) |

`fav-*` publishing: the pack's `publish-and-analyze` skill and FavStash account were deliberately NOT added (account + scheduled posting). When `brand.edit_style` is `auto`, pick the best style yourself; otherwise use the chosen one.

`content-factory` mentions Apify / Composio / Runway / auto-posting: never connect or post without the owner asking.
HyperFrames skills also offer HeyGen cloud features (`heygen ...`, cloud render, publish) and post-render feedback reports:
use only the free local commands unless the owner asks. Telemetry is off (`HYPERFRAMES_NO_TELEMETRY=1` in `.claude/settings.json`).

## Folders (gitignored, per machine)
- `mp-studio/input/<project>/` raw takes — never modify; their order + roles (main / retake / broll) are in
  `mp-studio/work/<project>/clips.json` (Studio → پروژه, drag to reorder) and in `handoff.py show` → `clips`
- `mp-studio/work/<project>/` proxies, transcripts, video-use `edit/` dirs
- `mp-studio/output/<project>/` renders
- `mp-studio/assets/` logo, music, brand.md
- `mp-studio/input/<project>/ref/` optional reference videos for that project (never edited or transcribed as takes)
- `mp-studio/fonts/` every font file (free + bought); files gitignored, `mp-studio/fonts/README.md` shared

For video-use, pass `--edit-dir mp-studio/work/<project>/edit` so its files stay out of `mp-studio/input/`.

## Working rules
- Voice pass first (transcript only, cheap), then look at frames only at cut points. Prefer contact sheets/timeline views over many single frames — images cost the most tokens.
- Confirm the edit plan in plain language before rendering.
- Persian text: files are UTF-8 (`PYTHONUTF8=1` is set in `.claude/settings.json`).
