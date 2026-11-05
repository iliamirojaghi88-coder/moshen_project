#!/usr/bin/env bash
# Read-only health check: PASS / FAIL / ABSENT (optional or needs moshen_project) for every item with a check.
#   bash verify.sh                       # checks the current directory
#   bash verify.sh --target /path/to/project
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
command -v python3 >/dev/null 2>&1 || { echo "python3 is required" >&2; exit 2; }
exec python3 "$here/restore.py" --verify "$@"
