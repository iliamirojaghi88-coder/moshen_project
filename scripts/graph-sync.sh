#!/usr/bin/env bash
# Keeps graphify-out/ (the project knowledge graph, git-ignored) in step with the
# working tree. Local AST only: no LLM, no network. graphify hashes the indexed
# files against graphify-out/manifest.json, re-extracts only what changed, prunes
# deleted files, and writes nothing when nothing changed (~0.6 s). A missing graph
# (fresh container, new clone) is built from scratch (~4 s).
#
#   graph-sync.sh           update            (Stop hook, async)
#   graph-sync.sh --hooks   + git hooks       (setup: post-commit/checkout/merge/rewrite)
#
# Never fails its caller: on any error the previous graph stays as it was.
cd "$(dirname "$0")/.." || exit 0
command -v graphify >/dev/null 2>&1 || exit 0
if [[ "${1:-}" == --hooks ]]; then graphify hook install >/dev/null 2>&1 || true; fi
GRAPHIFY_NO_TIPS=1 timeout 300 nice -n 10 graphify update . >"${TMPDIR:-/tmp}/graphify-sync.log" 2>&1 || true
exit 0
