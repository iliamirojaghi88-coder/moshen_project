# Cloud / phone-only path

For people who only have a phone: open a Claude Code cloud session (claude.ai/code or the Code tab in the Claude app) on this
repository. Nothing here needs your own computer or the MP Studio window. The Windows path is unchanged (see the main README).

## Flow
```
setup.sh -> doctor.py -> fetch_input.py -> jobs.py new/run -> (Claude: captions) -> jobs.py run --until storyboard
   -> handoff.py present (chat: plan, cut table, stills, sample) -> user says "approved" -> handoff.py approve
   -> jobs.py render --final -> deliver.py send (private Drive link)
```

| File | Job |
|---|---|
| `setup.sh` | idempotent Ubuntu installer: ffmpeg+libass, Python 3.10-3.12 venv `.venv-cloud`, Persian fonts, Whisper `small` (int8, CPU), yt-dlp, skills; `--with-pro`, `--with-motion`; writes `.mp-cloud-ready` |
| `doctor.py` | health check + capability table (`lite`, pro features, `motion_hyperframes`, `delivery_drive`) -> `mp-studio/work/capabilities.json` |
| `fetch_input.py` | attach/link -> `mp-studio/input/_incoming/<hash>.<ext>`; no cookies, size/duration caps, private addresses refused |
| `jobs.py` | one job = input x style, own folders, shared transcript cache, resume, status, clean, lock + step timeouts |
| `deliver.py` | private Google Drive upload, shared with `MP_DELIVER_EMAIL`, expiry + `purge` |
| `mcp.cloud.json` | optional kinocut MCP config for Linux (`--with-pro` installs it) |

## Environment secrets (set once in the cloud environment settings, never in chat or Git)
`MP_GDRIVE_CLIENT_ID`, `MP_GDRIVE_CLIENT_SECRET`, `MP_GDRIVE_REFRESH_TOKEN`, `MP_DELIVER_EMAIL` (optionally `MP_GDRIVE_FOLDER_ID`,
`MP_WHISPER_MODEL`, `MP_STEP_TIMEOUT`). Run `python cloud/deliver.py auth-help` for the steps; `python cloud/deliver.py selftest` to verify.

## Approval gate
`handoff.py approve` writes `approval.json` with a hash of the cut list, captions, motion, plan and settings. `render --final` runs only if that
hash still matches. Any later edit needs a new approval. In headless mode `handoff.py wait` and window opening are disabled.

## Limits and fallbacks
- CPU only. Whisper `small` by default (`medium` needs more RAM). One job step at a time (lock); each step has a timeout, long ones belong in the background.
- Disk guard: a job needs ~3x its input size free; `jobs.py clean <job>` drops proxies/intermediates.
- Features that need Chrome/Node (HyperFrames motion), person matte (CPU, slow) or face tracking are reported by `doctor.py` as OK/DEGRADED/UNAVAILABLE
  with the fallback (ASS motion captions, boxed layouts, fixed punch-ins).
- Instagram login is **not** offered in the cloud (PC only: `insta-login-research`).
- Drive can only expire access for named users; the file itself is deleted by `deliver.py purge` after the TTL (run at the start/end of a session).

## Verified so far
The lite path (prepare -> storyboard -> present -> refused unapproved final -> preview -> approve -> final) and the approval/staleness checks were
exercised with `MP_HEADLESS=1` on Windows. `setup.sh` and the Linux code paths have not been run on a real Ubuntu cloud container yet: run
`bash cloud/setup.sh` there and read `doctor.py` before trusting pro/motion.
