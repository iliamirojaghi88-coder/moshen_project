# REVIEW — preview v1 (low-res, for approval)

## Creative calls

- **Length follows the real voice**: the ElevenLabs file is 78.1 s, so the film is 81.0 s (voice
  from 0.30 s, 2.5 s hold on the final question). The brief's 60 s plan was scaled; the order and
  content of the eight sequences are unchanged. Script untouched; the voice file is used as-is.
- **Clips identified by content** (upload names differ from the brief): 5157 = `121968f5…`
  (network → brain), 5158 = `9cea544f…` (myelinated fibres), 5161 = `313464d9…` (lab brain →
  neuron), 5163 = `4076648b…` (young man). Only clean ranges are used; the AI morph/dissolve
  frames are excluded (5157 3.2–4.0 s, 5158 4.0–4.4 s, 5161 4.9–5.3 s, 5163 4.6–5.9 s).
- **The man carries S1, S2 and S7** from 6.6 s of clean footage: motion-compensated slow motion,
  different framings, and in S7 the worry clip reversed so he visibly calms down (worry → calm).
- **Custom 3D, built for this film** (no library models, icons or previous assets):
  - liquid field (S2): dark liquid under softbox strips — swells and a rolling horizon for nausea,
    a tense shiver then sharp rings on «درد» for pain; warm → cold light;
  - refraction VFX on the man (S2): swaying air (nausea), rings from the forehead on each throb,
    overexposure into white;
  - «تلقین» (S3): HarfBuzz-shaped Estedad glyphs extruded in navy satin, flying in from depth and
    locking into the joined word on the spoken word; amber dots land last; white cove with soft
    shadows and porcelain neurons in soft focus;
  - expectation filament (S4): one 3D fibre from «انتظار ذهنی» to «واکنش واقعی»; a pulse
    travels it and arrives on «تغییر بده»;
  - neural pathway (S5, S8): procedural neurons (lobed somas, flared tapered dendrites, myelinated
    axons with nodes of Ranvier, boutons), fibrous micro-normal, signals as travelling warm bands;
    DOF rack on «توجه», activity rising on «شدت»;
  - «اثر نوسیبو» (S6): champagne metal letters in a black studio, a strip light crossing them on
    the spoken term, a graphite neuron turning behind.
- **Typography**: twelve different treatments (depth arrival, liquid displacement, thin-then-struck,
  3D glyph assembly, focus reveal, perspective rise, DOF-synced focus, weight+size growth, light
  sweep on metal, per-word blur-in, grey-to-ink, masked rise per spoken word). Estedad variable,
  weight carries meaning (imagined = light, physical = heavy).

## Measured vs. looked at

- `npx hyperframes check`: passes, 0 errors.
- Looked at: beat sheet, all 7 seams, phone-width sheet (360 px), plus per-scene snapshots during
  the build. Every line is readable at 360 px.
- `scripts/qc-video.sh` on the preview: 1080×1920, 30 fps, H.264/AAC, **−14.0 LUFS, −1.4 dBTP**,
  no frozen stretches, A/V drift 0 s, narration sync 0.000 s against the voice placed at 0.30 s.
  It flagged two short dips to black (53.7 s, 69.0 s, ≈0.3 s each): deliberate transitions, but
  too dark for a reel — already lifted in the source, so the final render has no black frames
  (this preview still shows them).
- Sound: the mix was **measured** (per-3 s levels against the voice, spectrogram, loudness, true
  peak), **not heard**. The bed sits ≈ 6–15 dB under the voice and ducks 8 dB while he speaks.
  Please listen.

## Warnings kept on purpose

- `dead_stretch` at 19.1–22.6, 40.2–44.4, 53.8–61.0: false positives — these are WebGL scenes
  (glyph assembly, camera dolly, light reveal) that the checker does not see moving.
- `nested_media_start_basis_ambiguous`: clip starts are local to their scene by design.
- `text_occluded` in S8: words sit below their masks until spoken, by design.
- `SVGLoader.createShapes` deprecation: harmless; the shapes it builds are correct.

## Weakest shots / with more time

- **Music** is a free local MusicGen bed (4 sections arranged to the edit). It is the weakest part.
  Recommended for the final: Lyria 3.5 via the project's Gemini key (≈ $0.08 per track) — only with
  your OK — or a track you supply.
- **S8 background**: the closing pathway is dark and busy behind the question; a slower, sparser
  framing would make the last line land harder.
- **S5 close-up end**: as the camera pushes in, cell bodies get large and slightly smooth.
- The 720p sources are upscaled; faces hold up, fine fibres are slightly soft.
