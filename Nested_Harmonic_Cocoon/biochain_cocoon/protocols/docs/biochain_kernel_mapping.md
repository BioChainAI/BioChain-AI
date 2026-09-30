# Cocoon ↔ BioChain SHD-CCP kernel mapping

Two protocols share the name "SHD-CCP":

| | cocoon **shd-ccp** | BioChain **SHD-CCP kernel** |
|---|---|---|
| purpose | real-time control transport | traceability / engram packet ABI |
| size | 52 bytes, floats, CRC-16 | 64-bit word, fixed-point, even parity |
| defined in | `protocols/docs/shd-ccp_wire_format.md` | `protocol/shdccp_kernel.py` (repo root) |

The optional bridge (`orchestrator/backend/cocoon_backend/biochain_bridge.py`,
enabled with `COCOON_BIOCHAIN_BRIDGE=1`) folds every cocoon event into kernel
words. It uses Form IDs that the codex ISA leaves unused (0 HALT, 1 GEAR,
2 PRIME, 9 crystal are taken):

## FORM 12 ENTRAIN (from `update_geo`)

| kernel field | bits | value |
|---|---|---|
| form | 4 | 12 |
| spin | 3 | cocoon `mode` (0–5) |
| quaternion | 32 | `quat_encode(amp, x/2 m, y/2 m, z/2 m)`: the spatial focus and intensity |
| payload16 | 16 | IEEE binary16 of `fc` |
| freq | 5 | index of nearest `fe` in the 32-entry table (0.5 … 45 Hz, including 7.83) |
| amp | 3 | ramp class: 250, 1000, 2500, 5000, 8000, 15000, 30000, 60000 ms |

The fold is lossy by design. It is a canonical *fingerprint* of the command, not a replay format.

## FORM 13 SYNC (from each macro pi6 marker)

| field | value |
|---|---|
| spin | 0 |
| quaternion | (cos θ/2, 0, 0, sin θ/2), θ = sector·π/6 |
| payload16 | cycle mod 65536 |
| freq | sector (0–11) = BioChain pump sector |
| amp | 0 |

## FORM 14 BIOFRAME (from each biofeedback frame)

`crystallize(canonical_json(frame), form=14)`, the kernel's own XOR/rotate
fold. Raw values never leave the device; the fold and a running SHA-256 do.

## The receipt (`session_receipt.schema.json`)

* `kernel_words`: every word, in order.
* `xor_holonomy`: XOR of all words (BioChain's commutative holonomy).
* `chiral_holonomy`: the ordered quaternion product of the words' cores. It
  catches reordering, which the XOR holonomy cannot (see pump_clock.py's chiral layer).
* `coherence`: hyperbolic distance of the user's state quaternion to the
  target, at start and end, and the minimum. It uses the Lorentz lift from
  `engram_shard.py`, so it lives in the same metric space as BioChain engrams.
* `kernel_verified`: `true` when BioChain's `protocol/` was importable and every
  word round-tripped through the reference `pack`/`unpack`. The crystallize
  golden (`crystallize(0..59) = 9841D88D8B003CEA`) must match.
* Extra (stored beside the receipt): `engram_text`, a canonical text summary
  sized for the console's `growBiochain()`, and, when `codex_engine` is
  importable, a real `BIOSEED/1` claim (seed, codex hash, Merkle root, holonomy).

## Publishing is the user's act

The bridge never talks to Firestore and never holds keys. To anchor a session
on BioChain, the user opens the receipt (`GET /api/sessions/<id>/receipt`),
pastes `engram_text` into the console's Lattice Forge, grows it, and publishes it
under their own signing key. BioChain's trust model (attestations, lineage,
revocation) then applies unchanged.
