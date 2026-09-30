# The pi6 geometric handshake

## Problem

Entrainment is a *phase* phenomenon. If two audio pucks drift apart, a binaural
or isochronic field smears. If light and sound drift, the audio-visual pairing
is lost. Hard clock resets fix drift but cause audible clicks and felt skips.

## Mechanism

1. **Local geometric timing.** Every puck integrates its own entrainment phase
   (`EntrainmentClock`) at `fe`, including glides. All of its modalities read that phase.
2. **Master geometry.** The orchestrator integrates the same `fe(t)` exactly
   (piecewise: linear glide, then constant) in `MasterClock`.
3. **Markers.** When the master phase crosses a multiple of π/6 (30°), a
   `pi6` packet *may* be sent. `aux` is the sector crossed (0–11), and `phase`
   is the master phase **at transmission**. The control loop notices a
   crossing up to one tick late (20 ms at 50 Hz, which is 0.16 turn at 7.83 Hz),
   so sending the bare marker angle would pull every puck backwards.
4. **Slew, never jump.** The puck computes the shortest signed error
   Δθ ∈ (−½, ½] turn and spreads it evenly over the slew window (default 50 ms) as
   a small change in phase increment. The largest per-sample step is
   `fe/fs + ½/(0.05·fs)`, which is inaudible (proved in `test_geometric_engine.cpp`).
5. **Rate cap.** Syncing every marker costs 12·fe packets/s (480/s at 40 Hz),
   so the scheduler sends every n-th marker with n = ⌈12·fe / max_rate⌉
   (default max 12/s).
6. **Clock groups.** `pi6` is per modality. Audio, light and coil share the
   macro `fe`. Haptic bilateral pacing (≈0.5–1.2 Hz) has its own clock and its
   own `pi6` stream, so the macro phase never drags the bilateral rhythm.

## Measured (orchestrator/backend/tests/test_session.py)

Five virtual pucks with crystal errors up to ±480 ppm (about 20× worse than a
real ESP32 crystal), 7.83 Hz, 60 s:

| | worst phase error |
|---|---|
| with pi6 | **0.00041 turn (0.15°)** |
| without pi6 | 0.5 turn (180°, fully decoherent) |

## BioChain pump-clock alignment

BioChain's `protocol/pump_clock.py` defines logical time as 12 π/6 sectors
per cycle (720 frames, 60 per sector), token `PUMP.<cycle>.<sector>.<middle>.<inner>`.
The cocoon's 12 pi6 sectors are the same 12 sectors. `pi6.pump_token()` gives
`PUMP.<cycle>.<sector>`, and the bridge folds every macro pi6 marker into a
FORM 13 SYNC kernel word whose quaternion core rotates by π/6 about z. A
session's chiral holonomy therefore advances by exactly one sector per sync.
See `biochain_kernel_mapping.md`.
