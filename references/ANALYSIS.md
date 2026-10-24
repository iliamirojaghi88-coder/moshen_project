# Reference analysis

Source files (kept local, not committed — see `.gitignore`): `references/ref-{1,2,3}.mp4`.
Machine output per video: `references/analysis/ref-N/` — `specs.json`, `scenes.csv`
(cuts at scene-score > 0.30), `audio.txt` (EBU R128), `black.txt`, `contact-sheet.jpg`
(one frame / 2 s), `frames/shots/` (mid-frame of every shot). Re-run with
`scripts/analyze-reference.sh <video> <out>`.

| | Ref 1 | Ref 2 | Ref 3 |
|---|---|---|---|
| File | VID_20261024_203737 | VID_20261024_174608 | VID_20261022_230537 |
| Canvas | 720×1280, 9:16 | 1088×1904, 9:16 | 720×1264, ~9:16 |
| FPS / codec | 30 · H.264 + AAC 44.1k | 30 · H.264 + AAC 48k | 30 · H.264 + AAC 48k |
| Length | 29.4 s | 60.0 s | 46.2 s |
| Hard cuts | 5 | 9 | 6 |
| Loudness | −14.2 LUFS, LRA 3.0, peak −0.2 dBFS | −12.5 LUFS, LRA 4.0, peak +0.7 dBFS (clips) | −11.6 LUFS, LRA 1.8, peak +1.0 dBFS (clips) |
| Black frames | none | none | none |
| Style module | **C — Professional Video Editing** | **A — Cinematic Mixed Motion Graphics** | **B — Cinematic Storytelling** |

Module mapping is by content match with the brief's style descriptions (ref 1 is the
only one built on real footage + subtitles + B-roll, which is Style C's definition).
Swap it in `styles/*/style.json` (`reference` field) if you meant a different order.

Technique notes: two masters clip (true peak > 0 dBFS) — our mix target is −14 LUFS
integrated, −1 dBTP. Most "shots" are long continuous motion-graphic takes; the
editing rhythm comes from in-shot camera moves and element swaps every 1.5–3 s,
not from hard cuts.

---

## Ref 1 — talking-head explainer (dental implants)

**Structure (timecodes)**

| Time | Shot | Content |
|---|---|---|
| 0.0–0.3 | 1–2 | Device-frame intro flash |
| 0.3–3.0 | 3 | Presenter, mid shot, black studio. Giant red outline word **FALL** behind him. 3D jaw + implant model floats over his lap. Caption: «به عوامل مختلفی بستگی داره» |
| 3.0–9.3 | 3 | Cursor "drag" transition → white/mint board: red 3D anatomical body (SYSTEMIC), test tube with blood (DIABETES/دیابت قند خون), red blood cells, cigarette pack (SMOKING / مصرف دخانیات) — each enters on its spoken keyword |
| 9.3–21.5 | 4 | Back to presenter. Giant outline **EXERCISE**, 3D bodybuilder icon + «بدنسازی»; keyword captions «عدم رعایت»، «بهداشت دهانی»، «موارد»، «هست» |
| 21.5–28.1 | 5 | White board: circle diagram «بهداشت دهانی» with 3D toothbrush, mouthwash, floss on orbit nodes; «استفاده از کمپرس یخ» + ice bag; «24 Hour» |
| 28.1–29.4 | 6 | Presenter close «الزامیه» |

**Visual system**
- Canvas: footage sits inside a rounded device frame (≈ 24 px radius, 2 px light bevel) on a grey-mint ground `#e3efef`.
- Presenter plate: pure black studio `#000001`, royal-blue scrubs `#1f35aa`, skin key light from camera-left, soft fill, no visible background.
- Accent: blood red `#8a0f12`–`#b3121f`, used for 3D objects, caption highlight boxes and outline words. Neutrals `#d7d3cb`, `#75869f`.
- 3D objects: glossy subsurface-red materials (anatomy, blood, tube liquid), clear glass with refraction, plastic jaw with pink gums + white teeth, metal implant. Studio HDRI, soft contact shadows, slight DOF on background objects.
- Typography: Persian heavy sans (Vazirmatn/Peyda-like, 800–900), 2-line captions centred at chest height; one word per caption gets a red or teal block highlight («عدم» on red, «بهداشت دهانی» on teal). English labels in condensed display (Bebas/Anton-like) with a per-letter cascade that collapses and blurs ("DIABETES" letters tumble).
- Background words: 60 % frame-height outline/filled condensed caps in dark red at ~40 % opacity behind the presenter (FALL, EXERCISE).

**Motion & edit**
- Keyword-locked inserts that **lead** the word: measured with whisper word times vs frames — «سیستمیک» spoken 4.85 s, body on screen 4.6 s (−0.25 s); «دخانیات» spoken 8.33 s, cigarette pack enters 7.9 s (−0.4 s); «بدن(سازی)» 12.08 s, bodybuilder icon already up at 12.0 s. Rule: visual in 0.2–0.5 s before the word, label text types on the word.
- Transitions: cursor-grab "card swipe" (a hand cursor drags the frame up; next card rises from the bottom), exit by vertical motion-blur smear + fade (~0.3 s), letter-cascade labels (SYSTEMIC/SMOKING letters fall in one by one with blur), drawn ring arcs around objects, scale-pop on captions (110 % → 100 %, 120 ms).
- Camera: digital push-ins on the presenter between sentences (100 % → 112 %), cut back on the next sentence.
- Sound: dry voice upfront, quiet bed, whoosh on every card slide, pop on caption highlight.

## Ref 2 — "Nostalgic edit" social promo

**Structure**

| Time | Content |
|---|---|
| 0.0–1.5 | Paper desk top-down; photo of subject in tilted frame; red notification badge "140"; rapid jitter cuts |
| 1.5–7.5 | Engraved-illustration characters (businessman, «هیچ وقت چنین حرفی نمیزدم», "ROAD TO VIRAL") in rounded window cut-outs |
| 7.5–13 | Retro 3D camera + paper stickers «خاکی!»، «سبک ادیت NOSTALGIC»; eyeballs on fire — hard grade shift to warm/fire, light-leak transition |
| 13–19 | Magnet (V/F poles) attracting heart/follower tokens; tracked-out kinetic type «هر کی ساخت برای پیجش» |
| 19–25 | Photoreal hands holding phone (sepia); app icon pops on screen; maple leaf |
| 25–50 | Long continuous take on concrete/paper texture: engraved boy with phone + hearts, 3D phone "Explore" grid shattering, flat-shaded characters (follow, FULLY TRUSTED), giant hand pointing, retro TV with static («کامل»، «ویدیو رو»، «آموزش قدم به قدم»), footprints |
| 50–60 | Real footage of presenter (B/W, sunglasses, neon-green tie as the only saturated colour), speech bubble «ادیت», cardboard box «کامل ترین دوره در ایران» |

**Visual system**
- Palette: sepia/khaki ramp `#1d1912 #554635 #766248 #8d765b #a59581 #b8ad9c #c8bfb0 #eae7ce`; spot colours used once each: notification red, fire orange, neon green.
- Surfaces: concrete/plaster with dust specks, paper grain, vignette; everything sits on one physical "table" plane.
- Illustration language: copper-plate engraving hatching on characters and objects (line-shaded 3D look), mixed with flat grey characters with soft drop shadows; objects are extruded 3D with bevel (phone, TV, play button, magnet).
- Typography: Persian bold display with **kashida stretching** («هـــر کی ســاخت») as a deliberate style; small hand-lettered English accents ("FULLY TRUSTED", "ROAD TO VIRAL" in serif caps).

**Motion & edit**
- One continuous camera over a big canvas: slow drifts, push-ins, parallax between table, objects and shadows; scenes change by pans and by objects sliding in from frame edges.
- Particle bursts (hearts/followers) with physical arcs; shatter/explode of 3D phone; jitter/flicker for "nostalgic" segments; light leaks and film burn as transitions.
- Sound: music-driven, SFX on every object landing (paper, thud, glass).

## Ref 3 — sepia storytelling (motion-design course ad)

**Structure**

| Time | Content |
|---|---|
| 0.0–1.1 | Masked burglar character on brown paper, dotted path, «اگر منم» |
| 1.1–13.5 | Story beats as collage panels: Pride car «ماشینم پراید», location pin «محل زندگیم رباط», sad old man «بدبختی»; hourglass «یک روز / دو روز»; man at desk with money bags «در حال حاضر میلیاردرم»; crossed-out iPhone «بدون نیاز به iPhone ۲۰۰ میلیونی» → «موشن گرافیک» |
| 13.5–21 | Zoom-through into a black silhouette: faceless man with hat + red scarf «بدون چهره»، «تولید محتوا» |
| 21–26 | «بالای ۲ میلیارد فروش داشتم» "MO3TH" (3 as a 3D copper numeral), money sacks |
| 26–40 | Bright paper: embossed copper UI icons (checkbox, hand cursor, person at desk) «یاد گیریه موشن گرافیک خیلی سخته؟»; vertical timeline «سه روز / پنج روز / هفت روز»; rocket + clock on orbit diagram «یادگیریش راحته / انجامش هم راحته»; money-rain particle shot |
| 40–46 | Clean grey stage: man on sofa with laptop, CTA «کامنت بزاری "موشن"» |

**Visual system**
- Palette: burnt-sienna to parchment ramp `#140808 #381e15 #563022 #7b4930 #97694a #b29273 #c6bba2 #d7d6c3`, accent scarf red `#b3121f`, success green (one button).
- Lighting: hard key from top-right with a **palm-leaf gobo shadow** sweeping across the wall; warm bounce; strong vignette; large soft shadows under every object (objects float 2–4 cm off the paper).
- Materials: embossed/debossed copper-felt icons (rough knit texture, bevel, rim light), engraved-ink characters, paper with ink blots and coffee dots, glowing money (bloom).
- Typography: Persian bold/black sans, two weights per line (light question + black emphasis), drop shadow, letters slightly debossed into paper; Latin in condensed slab serif.

**Motion & edit**
- Camera: slow dolly with parallax between gobo shadow, paper and objects; zoom-through match cuts (into the black silhouette, into the money).
- Elements: pop-in with overshoot, red X stamps, check-box press with green glow, particle bursts, dotted path drawing on.
- Sound: narration-led, soft music bed, foley-like SFX (stamp, click, whoosh).
