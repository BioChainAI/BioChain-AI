#!/usr/bin/env bash
# Download the datasheets listed in datasheets.csv and record their checksums.
set -euo pipefail
cd "$(dirname "$0")"
tail -n +2 datasheets.csv | while IFS=, read -r part url; do
  out="${part}.pdf"
  if [ -f "$out" ]; then echo "have  $out"; continue; fi
  echo "fetch $out"
  curl -fsSL -o "$out" "$url" || { echo "  failed: $url"; rm -f "$out"; }
done
sha256sum ./*.pdf > SHA256SUMS 2>/dev/null || true
echo "done; checksums in SHA256SUMS"
