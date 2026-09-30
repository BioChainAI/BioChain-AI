# datasheets/

Manufacturer PDFs are **not committed**: they are large, versioned by the
vendor, and often not redistributable. `fetch_datasheets.sh` downloads the set
listed in `datasheets.csv` into this folder (git-ignored) and records each
file's SHA-256, so everyone reads the same revision.

| part | role | used by |
|---|---|---|
| ESP32-S3 (WROOM-1) | MCU, Wi-Fi/BLE, ESP-NOW | all pucks |
| MAX98357A | I2S class-D amp | Node A |
| PCM5102A | I2S line-out DAC (headphone variant) | Node A, i2s_dac_sandbox |
| PT4115 | constant-current LED buck | Node B |
| DRV8833 | dual H-bridge | Node C |
| DRV8871 | H-bridge with current limit | Node D |
| INA219 | current/power monitor | bifilar_resonance_test |
| TPS62162 | 3V3 buck | rev 1.0 PCB |
| CH224K | USB-C PD trigger | Nodes B, D |

Add a part by appending to `datasheets.csv` (part, url) and re-running the script.
