---
name: strix-security
description: Run authorized application security auditing and penetration testing with the `strix` agent (usestrix/strix) - scan your own code or a target you are authorized to test for vulnerabilities. Use for defensive security review of systems you own or have written permission to test. Requires Docker (present) and a user-supplied LLM API key.
---

# strix-security — authorized security auditing

`strix` (the `strix-agent` package, from usestrix/strix, Apache-2.0) is an
autonomous AI penetration-testing agent. It is installed as a CLI. It runs its
agents inside a Docker sandbox and needs an LLM provider key.

## Authorization first — non-negotiable

Only ever run strix against code or systems the user **owns or has explicit
written permission to test**. Before any scan, confirm the target is in scope and
authorized. Never scan third-party sites, shared infrastructure, or anything you
can't confirm is the user's. This tool is for defensive review of your own work.

## One-time configuration (user supplies the key)

```bash
export STRIX_LLM="gemini/gemini-2.5-flash"   # or openrouter/..., vercel_ai_gateway/...
export LLM_API_KEY="<your-key>"              # strix saves config to ~/.strix/cli-config.json
```

Docker is available in this environment; the first run pulls the sandbox image.

## Usage

```bash
strix --target ./app-directory          # audit a local codebase you own
strix -n --target ./app-directory        # non-interactive (scripts / CI)
```

Results are written to `strix_runs/<run-name>/`. Review findings before acting;
treat the agent's output as leads to verify, not final truth.

## Boundaries

- Do not launch a scan automatically or on a schedule without the user asking.
- Do not point it at a target whose authorization you haven't confirmed.
- Keep findings private to the user; don't post them to external services.
