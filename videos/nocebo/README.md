# nocebo — «تلقین و اثر نوسیبو»

81 s vertical science film (1080×1920, 30 fps) built on the user's ElevenLabs voice and four
reference clips. Brief and numbers: `SPEC.md`; review notes: `REVIEW.md`.

## Rebuild

The user's originals live in `source/` (Git LFS). Processed shots in `assets/video/` are not in
git (≈210 MB); rebuild them, then the score, then render:

```bash
# Python deps: numpy, opencv-python-headless (footage); uharfbuzz, fonttools (3D type);
# numpy, scipy, soundfile (+ torch, transformers for MusicGen) (sound)
python -I tools/prep_footage.py source assets/video          # trim, retime, grade, VFX, grain
python -I tools/shape_text.py Estedad-VF.ttf assets/data/glyphs.js \
  "talghin=850=تلقین" "asar=780=اثر" "nosibo=820=نوسیبو"         # only if titles change
python -I tools/music_gen.py <music-dir>                      # preview music bed (MusicGen, local)
python -I tools/mix_score.py <music-dir> ../../.claude/skills/media-use/audio/assets/sfx \
  assets/audio/voice.mp3 assets/audio/score.wav
npx hyperframes check && npx hyperframes render --quality draft -o renders/raw.mp4
tools/master.sh renders/raw.mp4 renders/final.mp4             # -14 LUFS / -1.5 dBTP, AAC
bash ../../scripts/qc-video.sh renders/final.mp4
```

## Layout

- `compositions/s1…s8` — one scene per sequence of the brief.
- `assets/js/neuro.js` — procedural neurons, pathway builder, tissue shader with travelling signals.
- `assets/js/liquid.js` — the S2 liquid field (swells, shiver, rings).
- `assets/js/type3d.js` — extruded Persian words from HarfBuzz outlines (`assets/data/glyphs.js`).
- `tools/` — footage prep, text shaping, music generation, score mix, mastering.
- Fonts: Estedad (OFL, `assets/fonts/OFL-Estedad.txt`). Library hits in the score: Pixabay
  licence via the media-use bundle.
