---
name: unslop
description: Clean "AI slop" out of a codebase - remove dead code, unused imports/variables/exports, redundant or obvious comments, needless wrapper functions and over-abstraction, and normalize inconsistent styling. Use when asked to de-slop, de-bloat, tidy, remove dead code, strip noisy comments, or tighten AI-generated code. Deletion-first and behavior-preserving.
---

# unslop — anti-bloat / dead-code cleaner

Make code smaller and clearer **without changing behavior**. Favor deletion over
addition. This is a refactoring pass, not a feature pass.

## What counts as "slop"

- Dead code: unreachable branches, unused imports, variables, functions, exports.
- Redundant comments that restate the code (`// increment i`), commented-out code,
  and boilerplate banners.
- Needless indirection: one-line wrappers, pass-through functions, premature
  abstraction, duplicated blocks that should be one.
- Inconsistent styling: mixed quote/spacing conventions, unsorted/duplicated
  Tailwind-style class lists, redundant type annotations.
- Defensive cruft: try/catch that only re-throws, checks for conditions that
  can't happen.

## Workflow

1. **Scope.** Work on the current diff or a named path — never a blind repo-wide
   rewrite. Confirm the target if ambiguous.
2. **Detect, then delete.** Run the project's own tooling first; let it find the
   dead code rather than guessing:
   - JS/TS: `npx knip` or `npx ts-prune` (unused exports), `npx eslint . --fix`,
     the project's formatter (`prettier`/`biome`).
   - Python: `ruff check --select F401,F811,F841 --fix` (unused imports/vars),
     `vulture` for dead code.
   Fall back to targeted `grep` for a symbol's references before removing it.
3. **Verify each removal is safe.** A symbol is only dead if it has no remaining
   references (search the whole project, including dynamic/string usage, configs,
   and tests). When unsure, leave it and note it.
4. **Simplify, don't rewrite.** Collapse obvious duplication and drop needless
   wrappers, but preserve public APIs, exported names, and observable behavior.
5. **Prove behavior is unchanged.** Run the project's typecheck, lint, and tests
   after the pass. Report what ran and what passed.

## Rules

- Behavior-preserving only. No new features, no renamed public APIs, no changed
  output — unless the user explicitly asks.
- Keep comments that explain *why* (intent, caveats, links); cut comments that
  restate *what*.
- One focused commit: "unslop: remove dead code / de-bloat <area>".
- If a removal is risky or load-bearing in a non-obvious way, keep it and flag it
  instead of deleting on a guess.
