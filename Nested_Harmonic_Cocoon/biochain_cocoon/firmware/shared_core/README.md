# shared_core — stable firmware libraries

Code every puck links against. It is **portable C++17 with no Arduino or
ESP-IDF headers**, so the host can compile it and `firmware/tests/` can check
the math on a laptop or in CI. Hardware-specific glue lives only in the
`nodes/*/src/main.cpp` files and in `network_stack/transport_esp32.h`, which is
guarded by `#ifdef ARDUINO`.

| folder | contents |
|---|---|
| `geometric_engine/` | phase-accumulator oscillators, the `EntrainmentClock` (the macro phase every modality locks to), parameter ramps, `pi6` phase slew, and the audio renderer (binaural / isochronic / monaural) |
| `protocol/` | the binary `shd-ccp` wire struct (52 bytes, CRC-16/CCITT), encode/decode, and the compiled standalone presets |
| `network_stack/` | `PacketRouter` (validation, addressing, replay window, watchdog) and the ESP-NOW / UDP transports |
| `safety/` | hard output limits: photosensitive flicker band gating, amplitude caps, haptic/coil duty and session limits |

## Design rules

1. **Nothing streams waveforms.** A puck receives *geometric instructions*
   (carrier, entrainment rate, amplitude, pan, position, ramp) and computes
   every sample itself.
2. **One macro phase.** Every node type keeps an `EntrainmentClock`. Audio
   beats, light pulses, haptic alternation and coil bursts all read that same
   phase. When the orchestrator sends a `pi6` handshake, all modalities on all
   pucks realign together.
3. **Never jump the clock.** A `pi6` phase error is spread across a slew
   window (50 ms by default) as a small change in phase increment. This keeps
   the output free of clicks. Instant resets are not implemented anywhere.
4. **Standalone first.** If a node loses the orchestrator (watchdog timeout),
   it fades to its local preset sequence. The mesh is an enhancement, not a
   dependency.

> Correction to the original pseudo-code in `docs/architecture/biopuck_audio_firmware_architecture.md`:
> the isochronic modulator there reads `millis()`. That quantises the
> modulator to 1 ms and makes it jump when the clock is corrected. Here the
> modulator runs on its own phase accumulator (`EntrainmentClock`). That
> accumulator is also the phase the `pi6` handshake slews.
