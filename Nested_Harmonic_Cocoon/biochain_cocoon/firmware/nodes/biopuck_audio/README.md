# Biopuck Audio (Node Type A)

Implements `docs/architecture/biopuck_audio_firmware_architecture.md`.

* **Core 0:** ESP-NOW/UDP intake → `NodeRuntime` → FreeRTOS queue.
* **Core 1:** `GeometricAudioEngine::render()` → I2S DMA, 256-frame buffers (5.8 ms).
* Modes: `0` binaural (headphones), `1` isochronic (omni speaker, default), `2` monaural.
* The amplifier's SD pin stays low until the first rendered buffer, so there is no power-on pop.
* Parameter changes glide over `ramp_ms` (minimum 250 ms). Mode changes dip
  through silence for 20 ms.
* Telemetry: the last `pi6` correction (radians) and the MCU die temperature go
  out in the Announce packet every 2 s.

Wiring: `hardware/prototypes/biopuck_breadboard/wiring.md`.
