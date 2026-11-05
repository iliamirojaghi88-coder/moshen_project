#!/usr/bin/env bash
# Recovery-kit entry point (Linux, macOS, cloud; Windows: run `python restore.py` or use Git Bash/WSL).
# Dry run unless --apply is given. See README.md for the phase order.
#   bash restore.sh                    # plan only
#   bash restore.sh --apply --phase 0,1
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required to read tools-inventory.json (install it first: phase 0)" >&2
  exit 2
fi
exec python3 "$here/restore.py" "$@"
