# Integration overview: a standalone cocoon, synchronised with BioChain AI

## 1. Two systems, one seam

```
┌──────────────────────────── Nested Harmonic Cocoon (standalone) ────────────────────────────┐
│                                                                                              │
│  wearables ──biofeedback──▶ ORCHESTRATOR (hub: Pi / PC / Docker)                            │
│   HRV EEG GSR               ├─ ai_core: BiostateEstimator → RuleGuide (hyperbolic distance)  │
│                             ├─ backend: SessionEngine · MasterClock · pi6 · DBAP · SQLite    │
│                             └─ frontend: Control Suite (spatial mapper, rationale log)      │
│                                   │ shd-ccp (52 B, CRC)   ▲ announce / telemetry            │
│                                   ▼ UDP or ESP-NOW        │                                  │
│   PUCKS  A sonic · B photonic · C haptic · D coil ── shared_core: EntrainmentClock, safety,  │
│          boot standalone → connected → watchdog fallback     geometric engine, presets       │
│                                                                                              │
└──────────────────────────────┬───────────────────────────────────────────────────────────────┘
                               │  OPTIONAL bridge (COCOON_BIOCHAIN_BRIDGE=1): artefacts only
                               ▼
┌──────────────────────────── BioChain AI ecosystem ───────────────────────────────────────────┐
│  protocol/shdccp_kernel.py (64-bit words) · pump_clock.py (π/6 sectors, chiral holonomy)    │
│  engram_shard.py (Lorentz lift, hyperbolic placement) · codex_engine.py (grow → BIOSEED/1)  │
│  console/ Lattice Forge → growBiochain() → publish under the user's own signing key         │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Standalone guarantee.**
* Pucks run their presets with no hub at all.
* The hub runs with no BioChain: no imports from outside `biochain_cocoon/`,
  no network calls, and no Firebase.
* `biochain_cocoon/` can be copied out of this repository and still pass its
  whole test suite. The one BioChain-dependent test (the reference-kernel
  cross-check) skips itself when `protocol/` is absent.

## 2. What "synchronise" means, concretely

| layer | cocoon | BioChain | seam |
|---|---|---|---|
| **time** | pi6 master clock: 12 π/6 sectors per macro cycle | pump clock: 12 π/6 sectors per cycle | the same sector index; SYNC kernel words; `PUMP.<cycle>.<sector>` tokens |
| **packets** | shd-ccp transport (52 B) | SHD-CCP kernel word (64 bit) | ENTRAIN / SYNC / BIOFRAME forms 12–14 (`protocols/docs/biochain_kernel_mapping.md`) |
| **geometry** | user state → unit quaternion → Lorentz lift → d_H to target | engram → quaternion → Lorentz lift → hyperbolic shard placement | the same lift and quadrance: session trajectories and engrams share one metric space |
| **integrity** | CRC-16 per packet | parity per word · XOR + chiral holonomy per chain | the receipt carries both holonomies over the session's words |
| **identity/trust** | none needed on the LAN (API token) | ECDSA attestations, lineage, revocation | the user publishes the receipt's `engram_text` with their own key; the bridge never holds keys |
| **AI** | `GuidePolicy` interface (rule-based today) | hyperbolic AI models | a BioChain-trained policy plugs in by implementing `reset()` / `step()`; it receives the same BioState, and hyperbolic distance is its natural loss |

## 3. Data flow in a guided session

1. `POST /api/session/start {target: "theta"}`: the engine resets the Guide
   and opens a session row. If the bridge is on, it also opens a `SessionRecorder`.
2. Wearables `POST /api/biofeedback` about once per second. The frames are
   schema-validated, stored locally, and folded into BioState. With the bridge
   on, each frame is also crystallized into a BIOFRAME word.
3. Every 10 s the Guide decides: pace → lead → (resistance → escalate) → arrive.
   Each decision is logged with a rationale and the hyperbolic distance.
4. Commands are fanned out spatially (DBAP), sent as shd-ccp, and folded into ENTRAIN words.
5. At 50 Hz the engine advances the master clocks and emits pi6 markers
   (folded into SYNC words) and heartbeats.
6. `POST /api/session/stop`: fade out. The bridge builds the receipt: kernel
   words, holonomies, biofeedback digest, coherence, and `engram_text`. A
   BIOSEED/1 claim is added when BioChain's protocol is importable.
7. The user may publish the engram to BioChain through the console.

## 4. Privacy boundary

Raw biofeedback stays in the hub's SQLite (`deploy/database_migrations`,
with optional per-profile retention). Anything that crosses to BioChain is a
digest, a fold, or a derived coherence number, and it only crosses when the user
acts.
