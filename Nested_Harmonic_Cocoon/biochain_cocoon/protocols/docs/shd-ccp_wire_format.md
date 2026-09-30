# shd-ccp wire format v1

**Spatial Harmonic Data - Continuous Control Protocol.** The orchestrator
never streams waveforms. It sends *geometric instructions*, and each puck
synthesises its output locally. One packet is one instruction.

## Byte map (little-endian, 52 bytes)

| off | size | field | type | meaning |
|---:|---:|---|---|---|
| 0 | 2 | magic | `'H' 'C'` | frame marker |
| 2 | 1 | version | u8 | `1` |
| 3 | 1 | cmd | u8 | 1 update_geo · 2 pi6 · 3 play_preset · 4 stop · 5 announce · 6 heartbeat · 7 telemetry |
| 4 | 2 | seq | u16 | orchestrator sequence; `0` = restart marker |
| 6 | 2 | node | u16 | target node id; `0xFFFF` broadcast |
| 8 | 1 | modality | u8 | bitmask 1 audio · 2 photonic · 4 haptic · 8 coil |
| 9 | 1 | mode | u8 | 0 binaural · 1 isochronic · 2 monaural · 3 bilateral · 4 pulse · 5 continuous |
| 10 | 2 | flags | u16 | bit0 photosensitive consent · bit1 node is standalone (announce) |
| 12 | 4 | fc | f32 | carrier Hz (coil: PWM base Hz) |
| 16 | 4 | fe | f32 | entrainment Hz (pi6: macro frequency) |
| 20 | 4 | amp | f32 | 0–1 (announce: temperature °C) |
| 24 | 4 | pan | f32 | −1…+1 |
| 28 | 4 | phase | f32 | rad (pi6: master phase at transmission; announce: last pi6 correction) |
| 32 | 4 | ramp_ms | u32 | glide time (pi6: slew window; stop: fade) |
| 36 | 12 | x, y, z | 3×f32 | metres, user-centred: +x right, +y toward the head, +z up |
| 48 | 2 | aux | u16 | pi6: sector 0–11 · play_preset: preset id · announce: node type |
| 50 | 2 | crc | u16 | CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) over bytes 0–49 |

52 bytes fit one ESP-NOW frame (max 250 B) and one UDP datagram (port 47632).

## Receiver rules (firmware `packet_router.cpp`)

1. Reject: short frame, bad magic or version, bad CRC, non-finite float, unknown cmd.
   Every single-bit error is caught (verified exhaustively in both test suites).
2. Address filter: `node` must be broadcast or our id. `update_geo` and `pi6`
   also need `modality & our_modality`.
3. Freshness: accept only if `seq` is newer in 16-bit serial arithmetic, or `seq == 0`.
4. Safety clamp (`safety_limits.h`), below the application and not negotiable:
   amplitude caps per modality, `fe` ∈ [0.5, 45] Hz, carrier ∈ [40, 1500] Hz,
   minimum glide 250 ms, and pulsed light in 3–60 Hz forced dark unless flag bit 0 is set.
5. Any accepted packet feeds the 8 s watchdog. When the watchdog expires, the
   puck falls back to its standalone preset.

## Golden vector

`update_geo, seq 7, node 42, audio, isochronic, fc 396, fe 4, amp 0.8, ramp 15000, x 1, y −0.5`:

```
48 43 01 01 07 00 2a 00 01 01 00 00  00 00 c6 43  00 00 80 40  cd cc 4c 3f
00 00 00 00  00 00 00 00  98 3a 00 00  00 00 80 3f  00 00 00 bf  00 00 00 00
00 00  be 02
```

Pinned in `firmware/tests/test_packet.cpp` and `orchestrator/backend/tests/test_shdccp.py`.

## JSON form

`protocols/schemas/shd-ccp_update_geo.schema.json` is the human-facing form,
used by the HTTP API and the AI core. It keeps the field names of the original
Biopuck spec (`cmd`, `fc`, `fe`, `amp`, `pan`, `ramp_ms`) and adds `mode`,
`modality`, `pos` and `photosensitive_consent`.
