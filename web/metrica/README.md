# METRICA — post-hero sections

`index.html` is the standalone deliverable: the Tools & Subscription and Why METRICA sections. It is generated; edit the sources and rebuild.

## Layers (per card or panel)

1. **Surface**: a hand-built SVG in `skins/`, one small file per panel, about 40 KB in total. Each one draws the silhouette (measured from the reference), body gradient, ribbons, folds, rims, neon strokes and glows. The plain glass tool cards are a single CSS face (`.mtr-face`) on the measured rim box. Shared filters, gradients and icons sit in the hidden `.mtr-defs` SVG in `index.src.html`.
2. **Artwork**: the supplied 3D PNGs (`assets/`), placed on the boxes measured from the reference (`tools/layout_spec.json`).
3. **Text**: real HTML. Size and position are fitted to the reference text (`tools/fit_text.py`).
4. **Details**: the pill, gold/navy buttons, arrow discs and icons, all in CSS or SVG.
5. **Controls**: real `<button>`s on top. Every decorative layer has `pointer-events: none`.

Each skin's `viewBox` is the component's crop in reference pixels (`tools/geom.py`). Edit the SVG directly; the build checks that the viewBox still matches.

## Rebuild

```
python3 tools/gen_layout.py    # after changing components.json / layout_spec.json -> layout.css
python3 build.py               # writes the standalone index.html
```

## Controls (destinations pending)

None of these navigate anywhere yet. Attach handlers by `id` or `data-mtr-action`.

| id | data-mtr-action | data attribute on the card |
|---|---|---|
| `b-sub` | `choose-plan` | `data-mtr-block="subscription"` |
| `btn-project`, `btn-analysis`, `btn-marketing`, `btn-cashflow`, `btn-contractors` | `open-tool` | `data-mtr-tool` |
| `b-free` | `start-trial` | `data-mtr-tool="free-trial"` |
| `btn-econ`, `btn-estimate`, `btn-proj`, `btn-tools` | `open-feature` | `data-mtr-feature` |
| `b-cta` | `start-metrica` | — |

Each card button (`btn-*`) covers its whole card, so the arrow disc and the card body are both click targets.
