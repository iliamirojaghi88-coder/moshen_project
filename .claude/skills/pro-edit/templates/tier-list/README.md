# Tier list (Bad / Good / Great) — from the "compare tools" reel, 2026-11-01

A ranking reel: per category, three "?" cards that flip to a tool logo on each spoken «این» (bad → good → great),
category title slams in, crown + shockwave + sparkles on "great", follow/comment CTA at the end.
Two cuts from one build: the owner in a pop-out box at the bottom, or motion-only (no face, heavier FX).

## Files
| File | Does |
|---|---|
| `build_panel.py` | writes the HyperFrames page (1080x1920 opaque canvas) from the cut: `--noface` writes `../panel_noface/` (bigger stage, spoken word slammed big, screen shake, sweeps, scanlines) |
| `make_fx.py` | `fx.json` for the box cut: popout layout + AI matte, flashes, glitches, ~39 SFX, music |
| `make_fx_noface.py` | `fx_noface.json` for the motion-only cut: punch-in on every reveal, ~117 SFX, louder music |

## Use
1. Copy `build_panel.py` to `mp-studio/work/<project>/panel/`, the two `make_fx*` to `.../edit/`.
2. Edit `CATS` (title, kicker, the source time of each «این», the 3 tools) and `STARTS` (source starts of each category's
   first range + the CTA range). Tools: `brand:<simple-icons slug>`, `lucide:<icon>`, or `mono:<letters>` with colours.
3. `build_panel.py` → `npx hyperframes render -o renders/panel.mp4 --fps 30 -q delivery` (same with `--noface` in `panel_noface/`).
4. Box cut: `rvm_matte.py` on the base → `make_fx.py` → `finish.py --spec fx.json`.
   Motion-only: base_noface = panel_noface film + `showwaves` visualizer of the voice (y 1650) + the cut's audio → `make_fx_noface.py` → finish.

## Rules learned
- Cards sit where the owner points: check a frame at each reveal; bad left → great right (TIERS x).
- GSAP `fromTo` `immediateRender:false` goes in the TO vars, or a hidden burst shows at t=0.
- Box geometry for this camera: `scale 0.9, box_y 1180, box_h 680, anchor_y 540` (eyebrows on the box top); the panel draws a
  neon rim just outside the box that flashes green on "great".
- Tools must be the owner's (or the reference's) picks — never invent tiers.
