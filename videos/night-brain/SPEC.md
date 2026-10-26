# night-brain — «چرا مغزت شب‌ها روشن می‌شه؟»

Vertical science reel, 1080×1920, 30 fps CFR, 60.0 s. The user's ElevenLabs
voiceover (56.76 s, used as-is) is the clock: every beat below is anchored to a
measured speech region (`silencedetect -36 dB / 120 ms`), not to guessed times.

## Sources

- `assets/video/hook.mp4` (OmniFlash 1, 8 s): walk-in 0–1.9 · face, eyes closed 2.0 · **eyes snap open 2.17** · macro push into the pupil 4.4–8.0, ends black.
- `assets/video/journal.mp4` (OmniFlash 2, 8 s): writing close-ups 0–3.5 (cool) · medium shot writing 3.5–5.5 · closes notebook, light turns gold, eyes closed 5.5–8.0.
- 3D: `assets/world/world.js` — one Three.js renderer; brain from real neuroimaging templates (`tools/3d/brain_from_templates.py`), procedural clock / phone / laptop / calendar / photo prints / lamp. Every frame is a pure function of time.

## Sequences (output time)

| # | Time | Voice | Picture | Light |
|---|------|-------|---------|-------|
| 1 | 0–6.8 | کل روز… مغزت تازه روشن می‌شه! | hook 0–2.0 → freeze on closed eyes with slow push 2.0–4.48 → eyes snap open 4.48 (media 2.13) → pupil dive 5.33 (media 4.40, ×2.45) | night blue |
| 2 | 6.35–13.1 | اشتباهات چند سال پیش، نگرانی‌های فردا… | 3D opens **inside the pupil** (mask follows the measured pupil), dolly to the brain; memory prints (his own frames), tomorrow's calendar swings in on «فردا», clock on «فکرهایی…», orbit trails | blue key/rim, orange accents, neural impulses |
| 3 | 13.1–20.0 | دلیلش چیه؟ روزها توجه مغزت درگیر کارها، صداها و اتفاقات اطرافته. | white flash → daylight studio; brain with attention filaments to laptop (close-up on «کارها»), phone buzz + notification on «صداها», cards pop on «اتفاقات» | neutral daylight, soft shadows |
| 4 | 20.0–27.0 | اما شب… افکار و نگرانی‌هات… جلب توجه | lights fall, laptop lid closes, phone goes dark, day objects sink; thoughts rise and close in, flare on «جلب توجه» | to deep blue |
| 5 | 27.0–35.3 | تازه وقتی نگران می‌شی… هوشیارتر نگه داره! / راهکار چیه؟ | modern clock hero, hands race 01:57→03:07 with ticking; pull back to the worry loop: orbit accelerates, brain pulses orange on the real heartbeat onsets; everything decelerates to a stop on «راهکار چیه؟» | cold → alarm orange → gold hint |
| 6 | 35.35–40.75 | قبل خواب… روی کاغذ بنویس. | journal 0–5.4 (real pen sound), slow push | cool → warming |
| 7 | 40.45–46.75 | نور محیط رو کم کن… چند دقیقه آروم باش. | 3D bedside: walnut, ceramic lamp dims on «کم کن» (switch click), his notebook and pen, phone face down → journal 5.3–8.0: notebook closed, eyes closed, gold light | warm gold, dimming |
| 8 | 46.4–53.6 | یادت باشه… شلوغی ذهنته. | brain in warm light, the thoughts go out one by one; burst on «شلوغی ذهنته» | gold, calm |
| 9 | 53.6–60.0 | تو هم شب‌ها ذهنت شلوغ می‌شه؟ تو کامنت‌ها بگو! | brain rises to the top third; end card type; 0.8 s fade at 59.2 | blue rim |

## Type

Estedad (OFL), RTL. Body 74 px Bold, emphasis 112 / 176 px Black. Accents:
blue `#7CC8FF`, orange `#FF9446`, gold `#FFC870` (deeper `#1D63D6` / `#D9581A`
on daylight). One group on screen at a time, words revealed on their spoken
time; placement per shot (top band over hair/sky, right column beside the
phone, low band over keyboard/chest) so no text sits on a face or the subject;
everything inside 170–1340 px. Captions are generated from the exact script by
`tools/build_captions.py` (edit there, not in `compositions/captions.html`).

## Sound

Voice 1.0 · music bed (CC BY) 0.13 under voice, up to 0.24 after the last word,
out by 60 s · effects 0.1–0.45, each placed so its measured peak lands on its
picture (riser→eyes open, impact on the snap, cinematic whoosh into the pupil,
notification on «صداها», ticking under the clock, heartbeat under «هوشیارتر»,
lamp switch on «کم کن»). Final mix normalised to −14 LUFS / −1 dBTP after render.
