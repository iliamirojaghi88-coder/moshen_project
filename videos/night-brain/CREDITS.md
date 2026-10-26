# Credits and licences — night-brain

## Must be credited where the video is published (CC BY)

Paste into the post's description or a pinned comment:

```
Music: "DreamDance 32 [ambient]" by Hardcore Scm — CC BY 3.0 — jamendo.com/track/1196239
SFX: "WWS Alarmclockticking" by Work With Sounds / Technical Museum of Slovenia — CC BY 4.0
SFX: "Heartbeat speedsup" by Bob Smaude — CC BY 4.0 (Wikimedia Commons)
```

## Everything in this project

| Asset | Files | Source | Licence |
| --- | --- | --- | --- |
| OmniFlash clips (hook, journal) | `assets/video/hook.mp4`, `journal.mp4`, `hook-eyes-closed.jpg` (frame of hook.mp4), `assets/tex/memory*.jpg` (graded frames of hook.mp4) | supplied by the user | user's own |
| Voiceover (ElevenLabs) | `assets/audio/voiceover.mp3` | supplied by the user, used as-is | user's own |
| Brain (cortex) | `assets/models/brain.glb` | FreeSurfer **fsaverage** pial surfaces + sulcal depth (Fischl et al. 1999), via nilearn / OSF svf8k | FreeSurfer Software License; derivative mesh built by `tools/3d/brain_from_templates.py` |
| Brain (cerebellum, brainstem) | same file | **MNI ICBM152 2009a** non-linear symmetric GM/WM maps (Fonov et al. 2011), bundled with nilearn | permissive (copyright notice retained below) |
| Studio HDRI | `assets/hdri/studio_small_09_1k.hdr` | Poly Haven | CC0 |
| Walnut veneer PBR | `assets/tex/walnut_veneer_*` | Poly Haven | CC0 |
| Clock, phone, laptop, desk calendar, photo prints, lamp, notebook | procedural (`assets/world/objects.js`) | built for this video from real proportions | — |
| Music bed | `assets/audio/music-bed.mp3` (first 64 s, loudness-normalised) | "DreamDance 32 [ambient]" — Hardcore Scm, Jamendo | **CC BY 3.0** |
| Clock ticking | `assets/sfx/clock-ticking.mp3` (first 12 s) | "WWS Alarmclockticking" — Work With Sounds / Technical Museum of Slovenia, Wikimedia Commons | **CC BY 4.0** |
| Heartbeat | `assets/sfx/heartbeat.mp3` | "Heartbeat speedsup" — Bob Smaude, Wikimedia Commons | **CC BY 4.0** |
| Other SFX (riser, impacts, whooshes, pop, clicks, typing, notification, sparkle) | `assets/sfx/*.mp3` | HyperFrames bundled library (Pixabay) — see `assets/sfx/BUNDLED-CREDITS.md` | Pixabay Content License |
| Font | `assets/fonts/Estedad-*.woff2` | Estedad — Amin Abedi | SIL OFL 1.1 (`assets/fonts/OFL.txt`) |
| Line icons | `assets/icons/*.svg` | Tabler Icons | MIT |
| Three.js, GSAP | `assets/vendor/` | npm | MIT / GreenSock standard licence |

### MNI ICBM152 notice

Copyright (C) 1993–2009 Louis Collins, McConnell Brain Imaging Centre, Montreal
Neurological Institute, McGill University. Permission to use, copy, modify, and
distribute this software and its documentation for any purpose and without fee
is hereby granted, provided that the above copyright notice appear in all
copies. The authors and McGill University make no representations about the
suitability of this software for any purpose. It is provided "as is" without
express or implied warranty.
