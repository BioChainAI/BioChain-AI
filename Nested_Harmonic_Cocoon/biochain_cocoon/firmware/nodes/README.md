# nodes/: production puck firmware

One PlatformIO project per puck type. Each links `shared_core` through
`lib_deps = symlink://../../shared_core` and adds only its actuator code.

| node | spec type | actuator | control rate | boots into |
|---|---|---|---|---|
| `biopuck_audio/` | A: Sonic Ambisonic | I2S DAC (MAX98357A / PCM5102A) | 44.1 kHz sample-accurate | default preset (Deep Sleep Theta) |
| `photonic_light/` | B: Photonic | 650 nm LED array via constant-current driver | 1 kHz envelope, 19.5 kHz PWM | default preset; **dark** in the 3–60 Hz band unless consent is set |
| `haptic_emdr/` | C: Haptic EMDR | 2× ERM/LRA via DRV8833 | 1 kHz | silent until commanded |
| `scalar_coil/` | D: Electromagnetic / Scalar (experimental) | bifilar pancake coil via DRV8871 | 1 kHz envelope, fc carrier | default preset |

## Shared behaviour (from `shared_core/network_stack/node_runtime.h`)

* **Standalone first.** Every node except haptics starts the default preset at
  power-on and runs with no orchestrator present.
* **Connected on first packet.** The first valid `shd-ccp` packet addressed to
  the node stops the local preset and hands control to the orchestrator.
* **Watchdog fallback.** After 8 s without packets (the orchestrator also sends
  a heartbeat), the node falls back to the default preset.
* **pi6 lock.** Every modality reads one `EntrainmentClock`. A `pi6` packet
  slews it into phase with the master over ~50 ms.
* **Photosensitive consent.** Hold the BOOT button for 3 s to toggle it. The
  setting is stored in NVS and applies to presets flagged
  `photosensitive_consent_required`. Mesh sessions carry consent per packet
  (`flags` bit 0), which the orchestrator only sets after the user confirms.

## Build

```bash
pip install platformio
pio run -d firmware/nodes/biopuck_audio                 # build
pio run -d firmware/nodes/biopuck_audio -t upload       # USB flash
pio run -d firmware/nodes/biopuck_audio -e esp32s3_ota -t upload   # OTA
```

Node IDs are compile-time defaults (`-DCOCOON_NODE_ID`): audio 1–100,
photonic 101–200, haptic 201–300, coil 301–400. For Wi-Fi (UDP fallback + OTA),
add `-DCOCOON_WIFI_SSID=\"...\" -DCOCOON_WIFI_PASS=\"...\"` in a local
`platformio_override.ini` (git-ignored). Never commit credentials.
