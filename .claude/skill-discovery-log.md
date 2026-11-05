# Skill discovery log

One row per `npx skills find` search, so a need is not searched twice. Check first:
`grep -i <keyword> .claude/skill-discovery-log.md`. Decisions: installed · proposed · not needed · rejected.
Audit = skills.sh partner audits (ath / socket / snyk).

| Date | Need | Query | Candidates (installs · stars · licence · audit) | Decision |
|---|---|---|---|---|
| 2026-11-05 | Skill discovery itself | — | `vercel-labs/skills@find-skills` (official; MIT; markdown only; audit safe / safe 0 alerts / medium) | **installed** (project + global), see docs/AGENT-SKILLS-fa.md |
| 2026-11-05 | Lottie for web/app UI: dotLottie player, runtime theming, After Effects export checklist. (Lottie inside a video is already covered: `remotion-to-hyperframes/references/lottie.md` + HyperFrames Lottie adapter.) | `lottie animation` | `iart-ai/web-animation-skills@lottie-animation` (2.7K · 79★ · MIT · pushed 2026-06 · 180-line SKILL.md + 1 reference, no scripts · safe/safe/low); `freshtechbro/claudedesignskills@lottie-animations` (3.1K · 1.25K★ · MIT · pushed 2025-11 · 692-line SKILL.md + 2 stdlib-only Python scripts, file writes only · safe/safe/low) | **proposed** iart-ai (lighter, no scripts, maintained; low stars noted). Not installed: no current task needs it; install only with the user's OK |
| 2026-11-05 | Blender (bpy) modelling/rendering | `blender` | `affaan-m/ecc@blender-motion-state-inspection` (7.7K); `roble3/cc-blender-skill@blender-modeling/materials/export/rendering` (1.7-2.9K); `freshtechbro/claudedesignskills@blender-web-pipeline` (3.7K) | **not needed**: `tools/3d/` covers the pipeline. Search only, candidates not reviewed |
| 2026-11-05 | ffmpeg editing/analysis | `ffmpeg` | `digitalsamba/claude-code-video-toolkit@ffmpeg` (12.9K); `fabriqaai/ffmpeg-analyse-video-skill` (1.6K) | **not needed**: `media-use`, `scripts/audio-master.sh`, `scripts/qc-video.sh` cover it. Search only, candidates not reviewed |
