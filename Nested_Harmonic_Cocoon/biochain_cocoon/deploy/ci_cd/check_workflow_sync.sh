#!/usr/bin/env bash
# Verify the live GitHub workflow matches the canonical copy in deploy/ci_cd/.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(git -C "$HERE" rev-parse --show-toplevel)"
diff -u "$HERE/cocoon-ci.yml" "$REPO/.github/workflows/cocoon-ci.yml" && echo "workflow in sync"
