# SPEC — «تلقین و اثر نوسیبو» (Nocebo effect)

The person's brief (8 sequences, script, typography per sequence) is the storyline; this spec turns
its adjectives into numbers. Script text is used verbatim, never edited.

```text
GOAL:    the viewer leaves asking "how often did I feel something only because I expected it?" and
         comments; on the way they learn the word «تلقین» and the term «اثر نوسیبو».
OUTPUT:  HyperFrames, 1080 x 1920, 30 fps, H.264 + AAC, -14 LUFS / -1 dBTP (render-profiles.json).
TIME:    81.0 s x 30 = 2430 frames. The voice (ElevenLabs, 78.1 s, used as-is) starts at 0.30 s;
         every cue below is voice time + 0.30. No fixed BPM: the voice is the clock.
```

## LOOK

- **Two grounds, one film.** Dark: deep navy `#070C16` → `#0E1B33`, never flat black, always with a
  lit subject (footage, tissue, liquid, metal). Bright: lab white `#E8ECEF` cyclorama and the lab
  footage. The brief's light plan is followed per sequence (table in SHOTS).
- **Ink**: warm white `#F3F1EC` on dark; lab navy `#13213A` on bright. **Cold blue** `#8FB4E3` for
  secondary / imagined words. **Amber** `#F2B36B` is rationed: one word or one object per shot
  («فکر», «درد», the dots of «تلقین», «شدیدتر», «واقعی», «احساسش»), plus the neural signals.
- **Type**: Estedad (variable, 100–900, OFL), local woff2. Hero single words 190–230 px; key
  phrases 96–124 px; the final question 92 px on two lines. Nothing under 56 px. Weight carries
  meaning: imagined = 300, physical = 800–900. Line height 1.25. All text inside y 230–1330 px.
- **3D type**: HarfBuzz-shaped Estedad outlines (tools/shape_text.py) extruded 0.18 em with a
  0.012 em bevel: «تلقین» navy satin (roughness 0.42) with amber dots on a white set;
  «اثر نوسیبو» champagne metal (metalness 1, roughness 0.3, `#D7A66A`) in a dark studio.
- **Footage**: graded per sequence in tools/prep_footage.py (hook: −0.45 EV, contrast 1.22, blue
  lift; natural → cool → cold across S2; lab +0.08 EV; dark-cinema −0.12 EV). Grain 2.2 %, vignette
  10–42 % by look. 720p sources upscaled with Lanczos + 0.35 unsharp. Retimes are
  motion-compensated (minterpolate, mci/aobmc) to 30 fps.
- **Materials**: tissue = warm grey `#C8C6C2`, roughness 0.5, clearcoat 0.3, sheen 0.5, fibrous
  normal noise; liquid = near-black `#05080D`, roughness 0.06, clearcoat 1; floors matte 0.9.
- **Light & depth**: key upper-left, rim from behind (cool `#7FA6FF`), fog for depth, DOF with
  focus racks as a storytelling tool (S5). No bloom, no lens flares, no particles as decoration.
```

## OBJECTS (all built for this film)

- **Neuron** (assets/js/neuro.js): seeded soma, forked tapered dendrites (4 levels), myelinated
  axon with nodes of Ranvier and boutons; signals are narrow warm bands travelling along the axon
  arc coordinate (no glow, emissive ≤ 0.95).
- **Liquid field** (S2): a dark liquid surface under two softbox strips. Nausea = long rolling
  swells + camera roll ±3°; pain = a tense shiver, then sharp concentric rings on «درد».
- **Refraction waves on the man** (S2 footage VFX): swaying air around him (nausea), refraction
  rings leaving the forehead on each throb (pain), then overexposure to white.
- **Expectation filament** (S4): one 3D fibre linking «انتظار ذهنی» to «واکنش واقعی», drawn on,
  one amber pulse travelling down it.
- **Studio sets**: white cove for «تلقین»; black studio with glossy floor for «اثر نوسیبو», a
  slow-turning graphite neuron sculpture behind it.

## MOTION

- Arrivals `expo.out` / `power4.out` 0.45–0.9 s; camera `power2.inOut`; exits `power3.in`,
  40–50 % of the entrance. Titles land and hold dead still; the world behind keeps moving.
- Twelve text treatments, none repeated: depth arrival (S1), liquid displacement settling (S2a),
  thin-to-struck pair (S2b), 3D glyph assembly (S3), focus reveal (S4a), perspective rise (S4b),
  focus rack synced to DOF (S5a), weight + size growth (S5b), light-sweep reveal on metal (S6),
  blur-in per word (S7a), grey-to-ink per word (S7b), masked rise per spoken word (S8).
- Transitions (each with a cause): hard cut on «واقعاً» (S1), cuts on sentence ends (S2), bleach to
  white into the bright set (S2→S3), zoom-through the word (S3→S4), signal-led cut (S4), focus pull
  out of the footage into the 3D net (S4→S5), dip to black and strip-light reveal (S5→S6), match
  cut brain → man's head (S7), blur swap into the dark end view (S7→S8).

## SHOTS (film time)

| # | Time | Picture | Text (lands on) | Light |
|---|------|---------|-----------------|-------|
| S1 | 0.00–3.47 | 5157 neural net, pulse followed (src 0–3.15) | «فقط با یه فکر؟» depth arrival, «فکر» amber, 1.15–1.9 | dark, deep blue |
| | 3.47–5.75 | hard cut on «واقعاً» to the man's worried face, tight (src 3.0–4.5) | line holds to 4.4, blur-out | dark, deep blue |
| S2 | 5.75–8.55 | man calm, medium (src 0–1.5) | — | natural |
| | 8.55–11.60 | liquid field: swells begin, camera rolls | «حالت تهوع» 9.89, settles by 10.6 | natural → cooler |
| | 11.60–14.30 | man uneasy, push-in, swaying air VFX | — | cool |
| | 14.30–16.60 | liquid tense, ring on «درد» 15.86 | «انتظار» 15.10, «درد» 15.86 amber | cold |
| | 16.60–19.00 | man, hand to forehead, throb rings, bleach to white | text holds to 17.6 | cold → white |
| S3 | 19.00–22.60 | white cove, glyphs of «تلقین» fly in from depth and lock at 21.11, amber dots land last | «تلقین» | bright, minimal |
| S4 | 22.60–29.10 | 5161 brain in the lab, section reveal on «اثر واقعی» | — | bright lab |
| | 29.10–34.30 | 5158 myelinated fibres, signals on «واقعاً رخ می‌دن» | — | bright lab → darker |
| | 34.30–37.50 | 5161 dark neuron, amber branches + filament draws | «انتظار ذهنی» 34.66 focus reveal | dark cinema |
| | 37.50–40.10 | 5158 amber neurons, pulse arrives | «واکنش واقعی» 37.60 perspective rise | dark cinema |
| S5 | 40.10–53.70 | 3D neural pathway, dolly; DOF rack on «توجه» 44.62; activity rises from 48.4 | «توجه بیشتر» 44.62, «احساس شدیدتر» 48.66 | dark, cool |
| S6 | 53.70–61.00 | black studio, graphite neuron turning; strip light sweeps the metal letters | «اثر نوسیبو» 58.58 | dark, luxe |
| S7 | 61.00–64.40 | 5157 brain in dark space (src 4.1–6.0) | «یک فکر» 62.74 | dark → lifting |
| | 64.40–69.00 | man reversed: worry eases to calm (src 4.4→0.6) | «یک احساس واقعی» 65.44 | natural, bright |
| S8 | 69.00–81.00 | dark view along one neural pathway, one slow pulse | «چند بار فقط با انتظار، / واقعاً احساسش کردی؟» per spoken word 71.5–78.2, hold to 81 | dark, cinematic |

## SOUND

Voice untouched at 0 dB relative (mastered to −14 LUFS overall). Music bed: dark, scientific,
mysterious, 70–80 BPM pulse, sitting ~−20 dB under the voice, near-silent under «تلقین» and
swelling under «اثر نوسیبو». Effects only on visible actions, no repeated whoosh: sub pulse on the
neural pulse (S1), cut hit on «واقعاً», liquid swell (S2a), ring hit on «درد», air-pressure bleach
(S2→S3), glyph landings (S3, soft clicks, three takes), signal ticks (S4/S5), light-sweep shimmer
(S6), low swell into the question (S8).

## BANNED

Dark void with small floating elements; glow, bloom, neon, lens flares, particles as decoration;
purple/blue gradients; everything centred and fading in at once; every text with the same fade or
scale; text moving while read; HUD readouts, corner labels, frame borders; cartoon, plastic or
stock icon looks; ready-made 3D models; per-letter splitting of Persian words in the DOM (breaks
joining — 3D glyphs come from HarfBuzz instead); repeated whooshes; AI-artifact frames of the
source clips (5157 3.2–4.0 s, 5158 4.0–4.4 s, 5161 4.9–5.3 s, 5163 4.6–5.9 s are never used).

## QA

Frames to check: 0.0 (thumbnail), 1.9 (hook line), 3.5 (cut), 10.6, 15.9, 18.9 (bleach), 21.3
(«تلقین» locked), 27.5, 35.6, 38.4, 45.5, 51.5, 58.9, 63.2, 66.6, 78.3, 80.9. Each: text readable
at 360 px wide, nothing under 168 px or below 1330 px, faces natural, neurons stable.
