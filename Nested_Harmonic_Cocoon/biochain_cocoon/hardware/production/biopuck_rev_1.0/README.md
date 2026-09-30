# Biopuck PCB rev 1.0

One round 60 mm, 4-layer board serves every node type. Population options
select the node: the audio amp, LED driver, motor driver, or coil driver
footprints are fitted or left empty. See the `variant` column in `BOM.csv`.

## Contents (as they are produced)

| file | status |
|---|---|
| `BOM.csv` | ✅ reviewed draft, with second sources |
| `fab_notes.md` | ✅ stack-up, DRC, assembly notes |
| `biopuck_rev_1.0.kicad_pro/.kicad_sch/.kicad_pcb` | ⏳ KiCad 8 project, drawn from `../../prototypes/biopuck_breadboard/netlist.csv` |
| `gerbers/`, `biopuck_rev_1.0-pos.csv` | ⏳ generated from KiCad (Plot + Fabrication outputs); never hand-edited |

## Block diagram

```
USB-C (5 V, CC 5.1 kΩ) ─┬─ TPS62162 3V3 buck ── ESP32-S3-WROOM-1-N8R2 ── NTC / button / status LED
                        ├─ [A] MAX98357A ── speaker connector (JST-PH 2)
                        ├─ [B] CH224K PD trigger 12 V ── PT4115 ── LED connector (JST-PH 2)
                        ├─ [C] DRV8833 ── 2× motor connector (JST-SH 2)
                        └─ [D] CH224K 12 V ── DRV8871 ── coil connector (JST-XH 2)
```

## Design rules carried from the prototypes

* I2S traces kept short and over solid ground; the audio amp gets a star ground.
* PWM power loops (LED, coil) routed on the far side from the RF keep-out.
  The antenna overhangs the board edge by the module's recommended clearance.
* Every power path has a polyfuse. The coil and LED variants have an NTC footprint next to the load connector.
* The test pads for the testbeds (shunt amp, search-coil input) are on the bottom.
