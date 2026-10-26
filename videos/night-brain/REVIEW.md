# Review — night-brain (final render)

Delivered: `delivery/night-brain_1080x1920_30fps.mp4` — H.264 High, yuv420p,
1080×1920, 30 fps constant, 59.7 s, AAC 48 kHz 192 kb/s, ~15 Mb/s video.
Rendered once with `npx hyperframes render --fps 30 --quality high` (42 min,
software GL), then the audio was normalised (two-pass loudnorm) with the video
stream copied, untouched.

## Checked

- `scripts/qc-video.sh … --audio-ref assets/audio/voiceover.mp3` — **PASSED**:
  resolution, 30 fps, codecs, yuv420p, A/V drift 0 s, −14.0 LUFS, −1.2 dBTP,
  no black frames, no frozen stretches, voice offset 0.000 s against the
  original narration.
- Frames of the delivered file every 2 s, plus full-resolution crops: Persian
  text sharp, joined and RTL; ZWNJ correct; no caption on a face or on the
  subject; everything inside the 170–1340 px band.
- `npx hyperframes check`: no errors (remaining warnings: track density,
  canvas touching the frame edge — both expected).
- Loudness over time: voice −11…−14 LUFS momentary, bed ~15 dB below it, the
  music tail carries 56.6–59.7 s and fades out; no word is cut (speech ends at
  56.57 s). Sound was measured, not heard.

## Known limits

- The two OmniFlash clips were generated separately: the face and the shade of
  blue of the pajamas differ slightly between them. They are kept apart (3D
  sequences sit between them) and the "memory" prints use frames of the hook
  clip only.
- The master ends at 59.7 s instead of 60.0 s: the last 0.3 s of the planned
  fade were pure black and failed the black-frame check, so they were trimmed.
- Re-rendering needs the CPU budget above (~0.55 frames/s for the 3D shots).
