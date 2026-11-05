---
name: arta-reels
description: Farsi-first talking-head reel edits with no subtitles (Arta Edit Studio, MIT): reel-story (full-frame motion, cut-aways, stickers, giant words behind the speaker) and reel-split (UI illustration panel on top, speaker below). Use when the brief says «ریل بدون زیرنویس», "arta", "story edit", "split edit", or MP Studio's «سبک ادیت» is arta-reels.
---

# Arta reels (vendored, runs from its own folder)

Arta Edit Studio by Arta Bidkhori (https://github.com/Jenesyx/arta-edit-studio, MIT) lives in
`mp-studio/vendor/arta-edit-studio/`. It is a complete pipeline with its own Python venv, Node packages,
config and mood board, so **run everything from that folder**, not from the repo root.

## When to use it instead of pro-edit
- The owner wants **no running subtitles**, only key-word graphics, and Farsi-first text handling.
- `reel-story`: speaker stays full-frame, cut-aways to the owner's own B-roll, stickers/widgets on spoken words.
- `reel-split`: illustration/UI panel on top, speaker below, a new visual per spoken line.
- Otherwise use `pro-edit` (the default) or one of the `fav-*` style skills.

## Steps
1. `cd mp-studio/vendor/arta-edit-studio` and read `CLAUDE.md` there, then the skill you need:
   `.claude/skills/reel-story/SKILL.md` or `.claude/skills/reel-split/SKILL.md`
   (`reel-setup/SKILL.md` for first-time setup).
2. First time only, **ask the owner before installing** (sizes: PyTorch CPU a few hundred MB, Whisper large-v3 about 3 GB on first
   transcription, CPU transcription is slow): follow `reel-setup/SKILL.md` (own `.venv`, `npm install`, fonts, `reel.config.json`).
   Do not use this repo's `.venv` for it.
3. Put the take in `mp-studio/vendor/arta-edit-studio/raw/`, and follow the skill's own rules (it asks for the style brief
   before building). Finished video goes to that folder's `final/`; copy it to `mp-studio/output/` for MP Studio.
4. Brand colours, handle and fonts: take them from `handoff.py show <project>` (the merged brand) and write them into
   that folder's `reel.config.json`.

Everything stays local. `raw/`, `work/`, `final/`, `font/`, `.venv/` and `node_modules/` inside the vendor folder are git-ignored.
