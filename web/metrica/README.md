# METRICA — post-hero sections

`index.html` is the standalone deliverable: the Tools & Subscription and Why METRICA sections. It is generated; edit the sources and rebuild.

## Layers (per card or panel)

1. **Decoration**: a clean crop of the reference image (`decor/*.webp`, made by `tools/build_decor.py`). It covers the silhouette, rims, ribbons, folds, glows, buttons, pill, arrow discs and icons. The page's live text and art are cut out of it, and small gradient patches are drawn underneath.
2. **Artwork**: the supplied 3D PNGs (`assets/`), placed on the boxes measured from the reference (`tools/layout_spec.json`).
3. **Text**: real HTML. Size and position are fitted to the reference text (`tools/fit_text.py`).
4. **Controls**: real `<button>`s on top. Every decorative layer has `pointer-events: none`.

## Rebuild

```
python3 tools/build_decor.py   # after changing components.json / layout_spec.json
python3 tools/gen_layout.py    # writes layout.css
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
