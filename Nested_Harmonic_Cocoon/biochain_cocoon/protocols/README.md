# protocols/

The data contracts that tie pucks, orchestrator, presets and the BioChain
bridge together.

```
schemas/                        JSON Schema (draft 2020-12)
  shd-ccp_update_geo.schema.json   geometric instruction (API/JSON form)
  pi6_handshake.schema.json        phase sync marker
  standalone_preset.schema.json    offline sequences in standalone_presets/
  biofeedback_frame.schema.json    wearable/sensor input to the AI core
  node_announce.schema.json        puck discovery + telemetry (decoded view)
  session_receipt.schema.json      BioChain bridge receipt (digests only)
docs/
  shd-ccp_wire_format.md        the 52-byte binary packet: byte map, CRC, golden vector
  pi6_handshake.md              master clock, markers, slew, rate cap, pump-clock mapping
  biochain_kernel_mapping.md    cocoon packets → BioChain 64-bit SHD-CCP kernel words
validate.py                     stdlib validator; `python3 protocols/validate.py` checks every preset
```

**Versioning.** The binary packet has a version byte (currently 1). A
layout change bumps the version, the golden vector in both test suites, and
this folder's docs, all in one commit.
