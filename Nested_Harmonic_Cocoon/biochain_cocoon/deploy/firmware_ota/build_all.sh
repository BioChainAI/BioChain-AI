#!/usr/bin/env bash
# Build every production node image and collect them with checksums in
# deploy/firmware_ota/dist/<version>/, ready for ota_push.py or a release upload.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
VERSION="${1:-$(git -C "$ROOT" describe --tags --always 2>/dev/null || echo dev)}"
OUT="$ROOT/deploy/firmware_ota/dist/$VERSION"
mkdir -p "$OUT"
for node in biopuck_audio photonic_light haptic_emdr scalar_coil mesh_gateway; do
  echo "==> $node"
  pio run -d "$ROOT/firmware/nodes/$node" -e esp32s3
  cp "$ROOT/firmware/nodes/$node/.pio/build/esp32s3/firmware.bin" "$OUT/$node.bin"
done
(cd "$OUT" && sha256sum *.bin > SHA256SUMS)
echo "images in $OUT"
