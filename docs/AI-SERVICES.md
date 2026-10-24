# AI services: Gemini + Gemini Omni Flash

Both run through the **Gemini API** with Google's official SDK `@google/genai`
(pinned in `package.json`). One API key covers both. No MCP, plugin or extra
CLI is needed. The bridge is `tools/ai/gemini.mjs`; models and prices live in
`tools/ai/models.json`.

| Role | Model | Billing |
|---|---|---|
| Scenario analysis, sequencing, prompt writing | `gemini-3.8-flash` | free tier available |
| Character sheets / reference-guided images | `gemini-3.1-flash-image` (drafts: `gemini-nano-banana-2.1`, best: `gemini-3-pro-image`) | paid only, ≈ $0.03–0.24 per image |
| Video generation / editing ("Omni Flash") | `gemini-omni-1.1-flash` — 3–10 s clips, 9:16, 720p default, image-to-video, first/last frame, subject references, extend up to 40 s | paid only, ≈ $0.10 per second (720p) |

"Omni Flash" = Google **Gemini Omni Flash** (`ai.google.dev/gemini-api/docs/omni`).
Alibaba's unrelated *Qwen Omni Flash* is a text/vision model and is not used.

## Setup (once, by the account owner)

1. Create a key at <https://aistudio.google.com/apikey>.
2. For image/video models, enable billing on that key's Google Cloud project
   (AI Studio → *Get API key* → *Set up billing*). Text-only planning works on
   the free tier.
3. Store it as **`GEMINI_API_KEY`** in the cloud environment settings
   (environment menu in the session title bar → *Edit* → Network secrets /
   environment variables). Locally: export it in your shell. Never commit it;
   `.env` is git-ignored.
4. Verify (free, lists models only): `npm run ai -- check`

## Workflow

```bash
npm run ai -- plan scenario.txt --out plan.json          # free tier: sequences, shots, asset list, prompts, tool per asset
npm run assets -- search "<query from plan>"              # real assets first
npm run ai -- image "<prompt>" --name hero-sheet --ref ref.png --approve-cost
npm run ai -- video "<prompt>" --name shot-03 --ref hero-sheet/image-1.png --aspect 9:16 --approve-cost
```

- `image` / `video` refuse to run without `--approve-cost`, and the flag is only
  passed after the user approves that specific generation and its estimate.
- Outputs go to `library/ai/<name>/` with a ledger row (`ai: true`, model,
  prompt, references, status `pending`). Generated media carries SynthID.
- Generated imagery is for original characters and abstract visuals only —
  never a substitute for a real product, place or person.
- Limits from Google: English prompts are best supported; editing *uploaded*
  videos is blocked in the EEA/CH/UK; recognisable people can't be uploaded.
