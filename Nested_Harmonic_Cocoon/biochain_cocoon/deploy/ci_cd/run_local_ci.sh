#!/usr/bin/env bash
# Run the same checks as CI locally (no Docker / PlatformIO needed for these).
set -euo pipefail
cd "$(dirname "$0")/../.."
echo "== firmware host tests";       make -s -C firmware/tests
echo "== preset schemas";            python3 protocols/validate.py
echo "== generated presets";         python3 standalone_presets/compile_presets.py --check
echo "== AI core";                   python3 -m unittest discover -s orchestrator/ai_core/tests
echo "== orchestrator backend";      python3 -m unittest discover -s orchestrator/backend/tests
if command -v pio >/dev/null; then
  for n in biopuck_audio photonic_light haptic_emdr scalar_coil mesh_gateway; do
    echo "== pio build $n"; pio run -s -d "firmware/nodes/$n" -e esp32s3
  done
else
  echo "(pio not installed: skipping ESP32 builds)"
fi
echo "ALL CHECKS PASSED"
