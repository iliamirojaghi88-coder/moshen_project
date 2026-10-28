---
name: skillui
description: Extract a design system from a live website, a local project, or a git repo - exact colors, typography, spacing, components, animations and tokens - using the `skillui` CLI. Pure static analysis, no API key. Use to reverse-engineer a site's look, capture brand tokens, or generate a design reference/SKILL for building UI that matches a target.
---

# skillui — design-system extractor

`skillui` is installed globally. It reads a site/project and writes a design-system
package (tokens + docs + optional screenshots) that Claude can read to reproduce a
look. It uses static analysis by default — **no API key, no AI call**.

## Commands

```bash
skillui --url https://linear.app        # crawl a live website
skillui --dir ./my-app                   # scan a local project directory
skillui --repo https://github.com/org/repo   # clone + scan a public repo
```

Useful flags: `--out <path>` (output dir), `--name <string>`, `--screens <n>`
(default 5, max 20), `--format design-md|skill|both` (default both),
`--mode ultra` (full visual extraction).

## Output

Writes `SKILL.md` + `CLAUDE.md` (Claude reads these automatically), `DESIGN.md`,
`tokens/` (`colors.json`, `spacing.json`, `typography.json`), `fonts/` (woff2),
`references/` (ANIMATIONS/LAYOUT/COMPONENTS/INTERACTIONS/VISUAL_GUIDE), and a
`<name>.skill` zip.

## Ultra mode (screenshots, animations, interactions)

`--mode ultra` needs Playwright + Chromium, which are already installed in this
environment, so point it at the pre-installed browser rather than re-installing:

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium \
  skillui --url https://stripe.com --mode ultra --out /tmp/stripe-ds
```

## When to use it

Before building UI that must match a reference brand or site, or when the user
asks to "extract", "clone the design of", "get the tokens from", or
"reverse-engineer the UI of" a URL. Treat the output as a reference to adapt into
this project's conventions, not code to paste verbatim; respect the source site's
licensing and trademarks.
