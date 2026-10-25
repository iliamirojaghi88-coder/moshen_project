# چرا بعد از ۸ ساعت خواب هنوز خسته‌ای؟ — SPEC

1080×1920 · 30 fps · 69.49 s · H.264 + AAC · Persian RTL · narration is the clock.

## Sources (the user's, used as given)
- `assets/audio/voice.mp3` — ElevenLabs narration, 69.49 s, never re-timed or replaced.
- `assets/video/arman-wake.mp4` — approved Google Flow clip of Arman (8 s, 24 fps). Used once, 0–3.7 s
  (media 1.4 → 5.1 s: asleep → frown → eyes open on «خسته‌ای؟»). Muted (generated ambience).
- `assets/ref/arman-reference.jpg` — identity/wardrobe reference only.

## Timing map (whisper medium + silencedetect)
| Scene | Film time | Voice |
|---|---|---|
| S1 hook (Arman) | 0.00–3.40 | چرا بعد از هشت ساعت خواب هنوز خسته‌ای؟ (0.08–2.97) |
| S2 clock | 3.40–12.30 | هشت ساعت خوابیدی 3.32 · زنگ 4.89 · بیدار 6.21 · ولی انگار 7.19 · اصلاً 7.95 · نخوابیدی 8.35 · چرا؟ 9.37 · مگه… 10.18–12.07 |
| S3 brain | 12.30–19.30 | نکته 12.46 · مدت 13.94 · مهم نیست 14.86 · کیفیت 16.00 · زمان 16.65 · اهمیت دارن 17.98–18.92 |
| S4 reason 1 | 19.30–29.10 | دلیل اول 19.41 · چند 21.16 · بار 21.47 · قطع 22.29 · یادت بمونه 24.43 · کیفیت 26.66 · پایین 28.07 |
| S5 reason 2 | 29.10–38.70 | دلیل دوم 29.23 · نامنظم 31.50 · nights 32.66/33.30/33.92/34.52 · ساعت زیستی 35.50 · بریزه 37.92 |
| S6 reason 3 | 38.70–48.45 | دلیل سوم 38.79 · اینرسی خواب 40.16 · هوشیار 44.80 · موقتیه 47.57 |
| S7 remedies | 48.45–58.40 | چیکار کنی؟ 48.88 · منظم 52.13 · تاریک 54.27 · آروم 54.93 · نور طبیعی 56.28 |
| S8 doctor + end | 58.40–69.49 | پزشک 64.01 · خواب خوب 65.83 · هشت 67.08 · نیست 68.90 |

## Look
- Real-time PBR in one WebGL renderer (`assets/world/engine.js`): HDR 4× MSAA targets, per-shot
  bloom, half-res depth of field, AgX tone map + display "punch", vignette, PCG-seeded grain.
- Light per idea: cold navy (fatigue) → deep blue + controlled turquoise (quality) → cold with
  sparse red (interruptions) → navy night / gold day (body clock) → cold fog warming (inertia) →
  natural warm morning (remedies) → clean white (doctor) → navy + gold balance (end).
- Every object is built for the film (`build/`): the clock (lathe-turned steel, navy sunray
  dial with Persian numerals, domed crystal), the anatomical brain (named primary sulci —
  Sylvian, central, pre/postcentral, frontal, temporal, intraparietal — plus Gray–Scott
  secondary sulci, geodesic rounded gyri, tertiary dimples, foliated cerebellum; flesh-pink
  vertex colour with deep red sulcal floors and a vessel network; real-time tissue material
  with wet clearcoat and a red light-wrap standing in for subsurface scattering),
  the bedroom (cloth-simulated duvet, baked AO), extruded Persian numerals/words, the moon and
  sun maps, the glass vial, hypnogram, orrery and medical cross. No library models, no icons.

## Type (Vazirmatn 200–900, words animated whole so letters stay joined)
- Safe band y 168–1330; key phrases only; one emphasis colour per moment.
- Devices: «خسته‌ای؟» sags · «زنگ» rattles with the clock · «اصلاً نخوابیدی!» turns alarm-red ·
  «مدت» struck through, emphasis moves to «کیفیت» (teal) and «زمان» (amber) · «قطع» sliced ·
  «یادت بمونه» blurs away · vertical «کیفیت استراحتت» beside the vial · «نامنظم» stutters ·
  weekday cards per night · «به هم بریزه» falls out of line · «هوشیار» stays out of focus,
  «موقتیه» sharpens · «منظم» stamps on an even beat · «تاریک» dims itself, «آروم» in weight 200 ·
  «نور طبیعی» in gold · «پزشک» underlined · «نیست.» underlined in gold.
- Reasons share one lockup (دلیل + ordinal + gold rule), each revealed like its 3D numeral:
  ۱ steel rises · ۲ night/day halves meet · ۳ frosted glass clears.

## Sound
`build/sfx.py` → `assets/audio/sfx_cues.json` (57 cues, peak one frame after picture) →
`scripts/audio-master.sh` → `assets/audio/master.m4a` (−14 LUFS, −1.5 dBTP). Music bed: Kevin
MacLeod "Living Voyage" (CC BY 4.0), ducked under speech. Credits: `assets/sfx/CREDITS.md`.

## Rebuild
```bash
blender -b --factory-startup -P build/brain.py -- assets/models/brain.glb
blender -b --factory-startup -P build/bedroom.py -- assets/models/bedroom.glb
blender -b --factory-startup -P build/numerals.py -- <vazirmatn-900.ttf> assets/models/numerals.glb
blender -b --factory-startup -P build/words3d.py -- <vazirmatn-900.ttf> assets/models/words.glb
python3 build/textures.py assets/tex
python3 build/sfx.py <sources> && bash ../../scripts/audio-master.sh -v assets/audio/voice.mp3 \
  -m assets/audio/music_living-voyage.mp3 -s assets/audio/sfx_cues.json -o assets/audio/master.m4a --duck 0.3
npx hyperframes check && npx hyperframes render --quality delivery
```
`build/woff2ttf.py` turns the Vazirmatn WOFF into the TTF Blender needs; `build/fa_shape.py`
pre-shapes Persian for Blender, which neither joins nor lays out RTL.
