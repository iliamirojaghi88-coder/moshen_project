# Asset library

Everything a scenario can need — characters, animations, 3D objects,
textures, HDRIs, icons, motion elements — behind one search:

```bash
npm run assets -- find "<what the shot needs>" [--kind model|character|animation|icon|texture|hdri|element] [--online]
npm run assets -- install <key> [<key> ...]       # download → convert → optimise → preview → QC → ledger
npm run assets -- gallery                          # library/index.html (searchable previews)
npm run assets -- verify                           # every ledger file present?
npm run assets -- catalog build                    # refresh the offline catalogues
```

## How `find` decides

1. **Library first** — installed assets (`library/ledger.json`), ranked above everything else.
2. **Offline catalogues** (`library/catalog/*.json`, metadata only, ≈5 000 entries): Poly Haven models / textures / HDRIs (CC0), Microsoft Rocketbox characters (117) and animations (471) (MIT), Khronos glTF samples, 3dicons (CC0), Fluent 3D emoji (MIT), HyperFrames registry blocks (456 motion elements).
3. **Local SVG icon packs** (no install): Phosphor (6 weights incl. duotone), Tabler, Material Symbols, Lucide (~15 000 icons).
4. **Online** (`--online`, or automatically when nothing local fits): Sketchfab, Openverse, The Met, ambientCG.
5. Nothing suitable → custom build (`tools/3d/`) or, only with the user's explicit OK, a generated asset (`tools/ai/`).

Query words weigh more than synonyms (`phone` also tries `mobile, smartphone`), so
results stay on-topic. `install` skips keys already present and rejects a GLB whose
SHA-256 matches an existing asset (no duplicates).

## Layout and ledger

```
library/
  catalog/<source>.json         offline catalogue (git)
  characters/rocketbox/<id>/    <id>.glb (LFS) · preview.jpg · meta.json
  animations/rocketbox-anim/<clip>/<clip>.glb (LFS)
  models/polyhaven/<id>/        <id>.glb (LFS) · preview.jpg · meta.json
  icons/3dicons|fluent3d/<id>/  transparent PNGs (LFS)
  LICENSES/                     notices that must travel with MIT assets
  ledger.json                   one row per asset
  index.html                    gallery
```

Each ledger row: key, kind, category, tags, source page, licence (SPDX, commercial,
attribution), format, files, preview, stats (triangles, textures, bones, morph
targets, real-world size in metres), `qc` (automatic checks), status.

Status: `ready` = automatic QC passed (loads, textured, plausible size; characters:
≥50 bones, ≥52 face shapes, human height) and the preview was reviewed;
`approved` = the user approved it; `pending` = fetched but not checked;
`rejected` = never use (kept so it isn't re-downloaded).

## Characters (Microsoft Rocketbox, MIT)

Realistic, fully rigged (80-bone Biped, five-finger hands), with 52 ARKit
blendshapes under standard names (`eyeBlinkLeft`, `mouthSmileLeft`, `jawOpen` …)
and 15 visemes (`viseme_PP` … for lip-sync). All share one skeleton, so any
animation clip drives any character:

```js
const char = await loader.loadAsync("library/characters/rocketbox/Business_Female_01/Business_Female_01.glb");
const clip = (await loader.loadAsync("library/animations/rocketbox-anim/f_gestic_talk_neutral_01/f_gestic_talk_neutral_01.glb")).animations[0];
const mixer = new THREE.AnimationMixer(char.scene);
mixer.clipAction(clip).play();
// deterministic: in hf-seek / useCurrentFrame → mixer.setTime(t)
```

Keep `library/LICENSES/rocketbox-MIT.txt` with any distributed project files
(MIT requires the notice; it does not require on-screen credit).

## Storage

Binary assets (`*.glb`, icon PNGs, HDRIs) are stored with **Git LFS**
(`.gitattributes`). Models use 1K WebP textures, characters 2K — enough for
1080×1920 and small enough to keep the repo light. Re-install any asset at a
higher resolution with `install <key> --res 2k --force`.

## Known gaps (free, commercially safe sources)

- Modern smartphones/tablets, cars and medical devices: not in the CC0 catalogues;
  Sketchfab has them (needs `SKETCHFAB_API_TOKEN`), or build custom in Blender.
- Photoreal digital humans (MetaHuman-grade): no free source with a commercial licence;
  Rocketbox is realistic game-grade.
