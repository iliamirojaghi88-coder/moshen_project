#!/usr/bin/env bash
# Rebuilds the recovery kit from a moshen_project checkout:
#   inventory JSON -> Persian HTML -> PDF -> payload (git-tracked .claude layer only) -> ZIP.
#   bash docs/claude-code-recovery/build-kit.sh
# Needs python3, node + playwright (Chromium), zip, tar, sha256sum, and `npm ci` done at the repo root (fonts).
set -euo pipefail
KIT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$KIT/../.." && pwd)"
cd "$KIT"

python3 build/build_inventory.py
python3 build/render_report.py
node build/html_to_pdf.cjs build/out/report.html dist/claude-code-recovery-report.pdf

stage_root="$(mktemp -d)"
trap 'rm -rf -- "${stage_root:?}"' EXIT
stage="$stage_root/claude-code-recovery-kit"
mkdir -p "$stage/payload/project"
cp -a README.md tools-inventory.json restore.sh restore.py verify.sh build-kit.sh build tests templates "$stage/"
for f in test-results.json TEST-RESULTS.md; do [[ -f "$f" ]] && cp -a "$f" "$stage/"; done
cp -a dist/claude-code-recovery-report.pdf "$stage/"
rm -rf -- "${stage:?}/build/out"
find "$stage" -name __pycache__ -type d -prune -exec rm -rf {} +

# Only git-tracked files: ignored local copies (settings.local.json, fetched skills) never ship.
git -C "$REPO" ls-files -z -- .claude .mcp.json skills-lock.json \
  | (cd "$REPO" && tar --null -T - -cf -) | tar -xf - -C "$stage/payload/project"

python3 tests/run_tests.py --secret-scan "$stage"   # refuses to ship anything that looks like a credential
(cd "$stage/payload" && find project -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum > MANIFEST.sha256)

rm -f dist/claude-code-recovery-kit.zip
(cd "$stage_root" && zip -qrX "$KIT/dist/claude-code-recovery-kit.zip" claude-code-recovery-kit)
echo "kit: $KIT/dist/claude-code-recovery-kit.zip ($(du -h "$KIT/dist/claude-code-recovery-kit.zip" | cut -f1))"
