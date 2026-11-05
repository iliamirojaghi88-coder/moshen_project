# Features — what each one does (read before an edit)

One line per tool, in the order an edit uses them. `$PE` = `.claude/skills/pro-edit`, `$VU` = `.claude/skills/video-use/helpers`,
`E` = `mp-studio/work/<project>/edit`. Owner preferences live in `mp-studio/assets/brand.md`; looks in `styles.md`.

## 1. Setup and handoff
| Tool | Does |
|---|---|
| `mp-studio/app/handoff.py open/show/set/wait <project>` | talks to MP Studio: brief, brand, clip roles, review status |
| `$PE/hw.py` | picks FFmpeg + encoder (NVENC → Quick Sync → x264) |
| `$PE/fonts.py` | lists / organizes fonts in `mp-studio/fonts` |

## 2. Read and cut
| Tool | Does |
|---|---|
| `$VU/transcribe_batch.py` + `pack_transcripts.py` | local Whisper → `takes_packed.md` (phrases with times) |
| `$PE/cutplan.py --write` | first cut from measured silence (pace tight/natural) + suspicious words (retakes, false starts) |
| `$VU/render.py edl.json --draft/--preview/--fps 30` | renders the cut (grade, aspect 9:16); `--no-subtitles --no-loudnorm` for a finish base |
| `$PE/joins.py` | re-listens around every cut, flags clipped words (CPU fallback built in) |
| `$PE/avsync.py` | lip-sync check against the raw takes (run on the base, not the boxed layout) |
| `$PE/storyboard.py` / `storyframe.py` | Studio review: plan + cut table + one mock-up card per line, no render |
| `$PE/gestures.py` | finds pointing / open palm / counting so graphics land at the hand |

## 3. Look
| Tool | Does |
|---|---|
| `$PE/grade_match.py <photo or video> <base> <out.cube>` | LUT that matches a reference's colour (`--strength`, `--split` teal/warm) |
| `templates/grade_split_clean.txt` | ffmpeg graph: LUT + person and wall graded apart via the AI matte (owner-approved cinematic) |
| `subject-cutout/rvm_matte.py` | best person matte for the whole cut (white = person); needed for pop-out boxes on any wall |
| `subject-cutout/matte.py` / `cutout.py` | faster matte / cut-out layers for short windows |
| `audio/voice_clean.py` | denoise, de-ess, EQ, compression — **off for this owner** (original voice) |

## 4. Graphics
| Tool | Does |
|---|---|
| `templates/ass-motion` (`captions.py`, `ass_motion.py`) | Persian captions (emphasis / word / boxed / glass), cards, counters, CTAs as animated .ass |
| `templates/motion-kit/kit.py` | HyperFrames scenes: glass cards, icons (Lucide + `brand:` Simple Icons), tabs, charts, chat, notifications |
| `templates/motion-kit/depth.py` | graphics behind AND in front of the speaker: logo orbit, Claude window, 3D chart, reel fan, wipe, pixel title |
| `templates/split-explainer` | UI-mock panel on top, speaker below, a visual per sentence |
| `templates/tier-list` | Bad / Good / Great ranking cards + a motion-only no-face version |
| `hyperframes` skills / registry | ~450 ready blocks; `npx hyperframes check / snapshot / render` |

## 5. Finish (`$PE/finish.py E -o out.mp4 --spec fx.json [--preview]`, spec path relative to E)
| Key | Does |
|---|---|
| `base` | the cut to finish (base.mp4, base_clean.mp4 …) |
| `layout` popout / split | speaker in a rounded box with the head breaking out / panel on top; `panel` = a HyperFrames film behind |
| `matte` bluekey / video | person mask for the pop-out head and cut-outs |
| `cutouts`, `shift`, `grades` | background treatments, slide the picture down, timed looks (warm/dark/wipe) |
| `zooms`, `zoom_center` | push-ins and punches (not with a pop-out matte) |
| `flash`, `glitch`, `vignette`, `grain` | white pulse, RGB-split glitch, edge darkening, film grain |
| `transitions` | whip / zoomblur / leak / shake on a cut — 1–3 per reel on topic changes, each with a sound |
| `progress` | thin accent bar filling over the video (list reels) |
| `broll`, `front_video`, `behind_video`, `front`, `behind` | cutaways, alpha layers over / under the speaker, .ass layers |
| `voice` | `{"highpass": 0, "compress": false}` = untouched original voice (owner default) |
| `music`, `sfx_dir`, `sfx` | ducked music bed; timed whoosh/impact/pop/click/ding/riser/glitch/swipe_up |

## 6. Sound assets
| Tool | Does |
|---|---|
| `audio/sfx.py mp-studio/assets/sfx` | generates the SFX kit (no downloads) |
| `audio/music_bed.py` | simple generated music bed when the owner gives no track |
| `beats.py` | beat map of a track, so big moves land on downbeats |

## 7. Check and deliver
| Tool | Does |
|---|---|
| `$PE/safezone.py` | every 0.25 s: text in Instagram's hidden zones, overlaps, nothing moving ≥ 2 s |
| `$PE/qc_sheet.py --no-sheet` | delivery line: codec · size · length · LUFS · peak · MB |
| `$PE/export_insta.py master -o out [--speed 1.2]` | Instagram export (1080x1920, 30 fps, −14 LUFS); `--speed` keeps pitch |
| `$PE/lite_edit.py prepare/storyboard/render` | the two-command lite pipeline for other agents |

## Usual deliverables for this owner
cinematic + natural-light versions, both also at 1.2x, a motion-only no-face cut when asked, and the content doc (Claude Docs →
PDF next to the videos) — all in `mp-studio/output/<project>/`.

## 9. Edit styles (MP Studio → «سبک ادیت», `brand.edit_style`)
| Tool | Does |
|---|---|
| `fav-edit-video` | base for the style skills: brief, cut, captions, sound, safe areas, encoded-export review (runtime: `.favstash-studio/runtime`) |
| `fav-adaptive-glass` / `fav-paper-grid` / `fav-breakout-card` / `fav-text-over-footage` | finished looks on top of `fav-edit-video` (glass panels, paper grid + UI artifacts, head pop-out card, one line over B-roll) |
| `fav-motion-effects` | 33 named motion effects (kinetic hook, gravity drop, timeline, orbit, frame break…) |
| `fav-product-motion-ads` | vertical motion ad built in code from the product itself, no camera footage |
| `fav-find-ideas`, `fav-write-script` | proven reels to adapt; hooks and scripts in the owner's voice |
| `anidoodle` | code-drawn stills, loops and films in 32 styles |
| `arta-reels` | Farsi-first reels without running subtitles (own folder `mp-studio/vendor/arta-edit-studio/`) |
