# hardware/

```
prototypes/                  R&D iterations and jigs; messy is fine here
  biopuck_breadboard/        dev-kit wiring for every node type (pin tables match firmware node_config.h)
  bifilar_spooler_jig/       parametric OpenSCAD jig for winding bifilar pancake coils
  enclosure_test_prints/     parametric OpenSCAD puck shell for FDM fit-testing
production/                  deployment-ready, reviewed, versioned
  biopuck_rev_1.0/           PCB spec, BOM, fab notes (KiCad project lands here)
  scalar_coil_rev_1.0/       coil winding spec + coil_calc.py (L, R, resonance)
  molded_enclosures/         enclosure DFM spec for SLA / injection moulding (STEP exports land here)
datasheets/                  index + fetch script for manufacturer PDFs (PDFs are not committed)
```

**Promotion rule.** Nothing moves from `prototypes/` to `production/` until
(1) the matching firmware testbed has logged results, (2) the pin map matches
`firmware/nodes/*/src/node_config.h`, and (3) the BOM has been reviewed for
second sources.

**Electrical safety.** Every puck runs from a 5 V USB-C supply (or a 1S Li-ion
cell with a protection IC). Nothing in the cocoon touches mains. Coils and LED
arrays carry NTC thermal cutoffs, and the firmware enforces them.
