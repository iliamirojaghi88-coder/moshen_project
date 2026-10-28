---
name: playwright
description: Browser automation, visual debugging and UI verification with Playwright. Use to open a URL or local page, click/type/navigate, capture screenshots, read console errors, or confirm a rendered UI looks right. The Playwright CLI and library are pre-installed; a Playwright MCP server (browser_* tools) is also registered for driving a live browser directly.
---

# Playwright — browser automation & UI verification

Playwright is installed globally (CLI + `require('playwright')`) and Chromium is
pre-installed in this environment. A Playwright **MCP server** is also registered,
so `browser_*` tools are available in every chat for interactive browsing.

## Two ways to use it

1. **MCP tools (interactive)** — prefer these to drive a live browser step by step:
   navigate, click, type, snapshot the accessibility tree, screenshot, read console.
2. **CLI / script (repeatable)** — for automated checks and screenshots in CI-style runs.

## Environment specifics (important here)

- Chromium binary: `/opt/pw-browsers/chromium`. `chromium.launch()` needs no options.
- Always launch headless with `--no-sandbox` for raw Chrome binaries
  (Puppeteer/Lighthouse): `--headless --no-sandbox`.
- Do **not** run `playwright install` — it would fetch a mismatched browser.
  The pre-installed Chromium already matches the pre-installed Playwright.

## Quick recipes

Screenshot a page from a one-off script (works from any directory):

```js
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  await p.goto(process.argv[2], { waitUntil: 'networkidle' });
  await p.screenshot({ path: process.argv[3], fullPage: true });
  await b.close();
})();
```

```bash
node shot.js "https://example.com" out.png
```

CLI helpers:

```bash
npx playwright --version
npx playwright screenshot --full-page "https://example.com" out.png
npx playwright codegen "https://example.com"     # record interactions
```

## When to reach for it

Verifying a HyperFrames/Remotion preview in a real browser, checking a rendered
HTML composition, capturing a frame to look at, or reproducing a UI bug visually.
For looking at rendered video frames prefer the project's own `snapshot`/`still`
tooling; use Playwright for arbitrary web pages and live UI.
