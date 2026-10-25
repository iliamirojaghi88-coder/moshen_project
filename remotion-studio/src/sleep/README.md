# «چرا بعد از ۸ ساعت خواب هنوز خسته‌ای؟» — Remotion + R3F

Composition `SleepFilm` (1080×1920, 30 fps, 2085 frames = narration length 69.49 s).

```bash
cd remotion-studio
python3 src/sleep/audio/build_mix.py public/sleep/voice.mp3 public/sleep   # music + SFX + mix (−14 LUFS)
npx remotion render SleepFilm out/sleep-explainer.mp4 --concurrency=1 --crf=18   # ~2.7 s/frame on CPU (SwiftShader)
../scripts/qc-video.sh out/sleep-explainer.mp4
```

- `phrases.json` — the locked script split at the narration's own pauses (ffmpeg `silencedetect`,
  −35 dB / 0.15 s); word times are distributed by length inside each phrase. Whisper is not
  needed (and `whisper-cli` crashes with SIGILL on this CPU).
- `Film.tsx` — the eight scenes, camera paths, character states, typography plan. Everything
  is a pure function of `t`; `FilmProbe` renders any list of times for quick checks.
- `Hero.tsx` — Rocketbox `Male_Adult_02` (MIT) with Rocketbox clips. The avatar GLB bakes the
  armature into the pelvis while the clips keep it separate, so `Hero` re-inserts an armature
  node per clip. Face: ARKit blendshapes (blink, squint, brows, jaw, smile).
- `Bedroom.tsx`, `geometry.ts`, `Clock.tsx`, `Science.tsx` — procedural set (duvet that drapes
  over the sleeper, pillows, pleated curtains, modern alarm clock, brain, energy meter,
  timeline bar, flow lines) using Poly Haven CC0 PBR textures and models (side table, plant).
- Icons — `tools/3d/icon3d.py` from Phosphor fill SVGs (MIT): hourglass, seal-check, clock,
  sun, moon, first-aid, lightning.
- Audio — narration used as-is (gain + limiter only); music and SFX are synthesised in
  `audio/build_mix.py` (no third-party audio).
- `ClipSheet` / `HeadProbe` — debug compositions (pose sheets of a clip; head-bone positions).

Known limits: Rocketbox is realistic game-grade (no hair simulation, no eye-rub contact solver);
postprocessing (bloom) is off because the first frame of each tab rendered black with it.
