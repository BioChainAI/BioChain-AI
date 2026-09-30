# Design decisions log

Where the implementation refines or corrects the concept specs.

| # | decision | why |
|---|---|---|
| D1 | **Phase accumulators everywhere, stored in turns.** The isochronic modulator in the Biopuck pseudo-code used `millis()`. | `millis()` is 1 ms quantised and jumps when the clock is corrected. A phase accumulator is exact, and it is the thing pi6 slews. |
| D2 | **Binaural beat phase = entrainment phase.** φ_L = φ_c − φ_e/2, φ_R = φ_c + φ_e/2, with φ_e/2 accumulated continuously. | Makes pi6 meaningful for binaural audio. A naive `ent/2` on a wrapped phase jumps half a turn every cycle. This bug was caught by the unit test and fixed. |
| D3 | **pi6 carries the master phase at transmission.** `aux` holds the sector crossed. | The control loop sees a marker up to one tick late, and sending the bare marker angle pulled pucks up to 0.08 turn backwards. This was measured and fixed. The error is now 0.15° worst case. |
| D4 | **pi6 rate cap.** Every n-th marker, with n = ⌈12·fe/12⌉. | Sending all 12 markers at 40 Hz gamma would be 480 packets/s. |
| D5 | **Per-modality pi6 clock groups** (macro vs haptic). | Bilateral haptic pacing (≈1 Hz) must not be slewed onto the audio phase (e.g. 6 Hz). |
| D6 | **DBAP instead of higher-order ambisonics.** | Pucks are placed irregularly on and around a body. HOA needs a regular array, while DBAP is exact for arbitrary layouts and cheap. |
| D7 | **Safety below the application.** Clamps sit in the router and runtime, not in node code. | No packet or preset can bypass them, whatever the orchestrator sends. |
| D8 | **Photosensitive gate at 3–60 Hz.** | The 650 nm pulsing spec includes 10 Hz alpha and 40 Hz gamma, both in the risk band. Light stays dark without explicit, recorded consent. |
| D9 | **Bipolar coil drive via LEDC hpoint.** An earlier draft inverted IN2, which put DC through the coil at zero duty. | Zero duty now means coast. Current alternates with no DC component. |
| D10 | **The bridge produces artefacts only.** | It preserves BioChain's trust model (user-signed publication) and the cocoon's standalone guarantee. |
| D11 | **Python standard library only** in the orchestrator. | Matches the BioChain protocol's discipline; trivial to run on a Pi; small Docker image; nothing to audit. |
| D12 | **Mesh gateway node** added (5th firmware target). | A Pi/PC cannot speak ESP-NOW. A USB gateway bridges the spec's preferred low-latency mesh. |
