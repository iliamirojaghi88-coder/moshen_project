---
name: context7
description: Fetch up-to-date, version-accurate documentation and code examples for libraries and frameworks via the Context7 MCP server. Use when you need current API docs, correct usage for a specific dependency version, or to avoid stale/hallucinated APIs. Add "use context7" to a request to pull live docs for the libraries involved.
---

# context7 — live documentation fetcher

Context7 (upstash/context7) pulls current, version-specific docs for thousands of
libraries into the chat, so answers match the real API instead of a stale memory.
It is registered as an **MCP server** (`@upstash/context7-mcp`) and is available in
every chat via its MCP tools.

## How to use

The context7 MCP exposes two tools:

- `resolve-library-id` — turn a library name (e.g. "next.js", "remotion",
  "playwright") into a Context7 library id.
- `get-library-docs` — fetch docs for that id, optionally scoped to a `topic`.

Flow: resolve the id, then fetch docs for the exact version/topic you need, and
use that to write code against the real current API.

## When to use it

- Before writing non-trivial code against a dependency whose current API you're
  unsure of (Remotion, Three.js, GSAP, a Vazirmatn/font API, etc.).
- When a user reports an API that "doesn't exist" or changed between versions.
- Any request that says "use context7".

## Keyless vs. keyed

It works keyless at a lower rate limit. For higher limits, the user can get a free
key at context7.com and re-register with `--api-key <key>`, or set the
`CONTEXT7_API_KEY` env var. No key is required for normal use.
