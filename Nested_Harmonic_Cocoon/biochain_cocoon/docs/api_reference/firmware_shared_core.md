# firmware/shared_core API

All of it is in `namespace cocoon`, host-compilable C++17.

## geometric_engine/

| type | key members |
|---|---|
| `Ramp` | `setTarget(target, samples)`, `next()`, `value()`, `active()`: lands exactly on the target |
| `EntrainmentClock(tickRateHz, fe)` | `setFrequency(fe, rampTicks)`, `syncTo(masterTurns, slewTicks)`, `tick() → phase turns`, `lastError()` |
| `GeometricAudioEngine(sampleRate)` | `setParams(AudioParams, rampMs)`, `syncEntrainment(turns, slewMs)`, `render(int16_t* LR, frames)`, `renderFloat(...)` |
| `AudioParams` | `carrierHz, entrainHz, amplitude, pan, mode (Binaural/Isochronic/Monaural)` |
| `smoothPulse(phase, duty)` | windowed 0..1 pulse for light/coil |
| `bilateralLevel(phase, rightSide, tapWidth)` | alternating L/R taps |
| `phaseError(target, local)`, `pi6Sector(turns)`, `wrapTurns(t)` | phase helpers |

## protocol/

| | |
|---|---|
| `ShdCcpPacket`, `Command`, `Modality`, `NodeType`, `PacketFlags` | wire model |
| `encodePacket(p, out[52])`, `decodePacket(data, len, p) → DecodeResult` | codec |
| `PresetPlayer` | `start(preset, now)`, `update(now, out) → bool`, `running()` |
| `findPreset(id)`, `defaultPreset()`, `presetAt(i)` | generated from `standalone_presets/` |

## network_stack/

| | |
|---|---|
| `PacketHandler` | implement `onUpdateGeo`, `onPi6Sync`, `onPlayPreset`, `onStop` for a new actuator |
| `PacketRouter` | validation, addressing, replay window, safety, watchdog |
| `NodeRuntime(RuntimeConfig, handler, limits)` | standalone/connected state machine, presets, session ceiling, announce |
| `ArduinoNode::begin(runtime, options)` / `service(...)` | ESP32 glue: transports, OTA, consent button, status LED |
| `Esp32Transport` | ESP-NOW + UDP, lock-free ring from the Wi-Fi task |

## safety/

`SafetyLimits`, `applySafety(packet, modality, limits)`, and `ThermalGuard(adcPin, cutoffC)`.

## Adding a node type

1. Add a `NodeType` value and a modality bit (update the Python `shdccp.py`, the schemas and the wire doc).
2. Create `firmware/nodes/<name>/` from a sibling. Implement `PacketHandler`,
   drive the actuator from an `EntrainmentClock` in a pinned task, and call
   `ArduinoNode::service()` in `loop()`.
3. Add a clamp branch to `applySafety` and a test in `firmware/tests/`.
