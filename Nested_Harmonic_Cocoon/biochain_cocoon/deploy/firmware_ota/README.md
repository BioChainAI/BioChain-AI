# firmware_ota/: over-the-air updates

| file | purpose |
|---|---|
| `build_all.sh [version]` | builds every node image into `dist/<version>/` with `SHA256SUMS` |
| `ota_push.py` | pushes an image to one puck (`--node`) or a fleet (`--fleet`), canary first |
| `fleet.example.json` | fleet layout template; copy it to `fleet.json` (git-ignored) |

Rules:
1. OTA works only on pucks built with Wi-Fi credentials. ESP-NOW-only pucks
   are flashed over USB.
2. Set `OTA_PASSWORD` for any deployment outside a bench. ArduinoOTA supports
   it (add `ArduinoOTA.setPassword()` via a build flag in your override).
3. Stop sessions before pushing. A rebooting puck falls silent, and its
   neighbours carry on.
4. The two-slot partition table (`min_spiffs.csv`) keeps the previous image.
   A failed boot rolls back automatically.
