# 04: Scalar Coil Puck (Node D), experimental

**Parts:** DevKit / rev 1.0 variant D, DRV8871 breakout (ILIM 30 k), 12 V PD
trigger, a coil wound on the `bifilar_spooler_jig`, an NTC bead, a crystal, and the enclosure (`node="coil"`).

1. **Wind** the coil per `hardware/production/scalar_coil_rev_1.0/coil_spec.md`
   (2 × 24 turns, 22 AWG). Pot with varnish and let it cure 24 h.
2. **Series-connect:** the end of strand A to the start of strand B. Measure:
   L ≈ 113 µH ± 15 %, R ≈ 0.44 Ω (`python3 coil_calc.py`). Record both in the unit log.
3. Tape the NTC to the former. Wire DRV8871 OUT1/OUT2 to the coil ends.
4. **Characterise first:** flash `firmware/testbeds/bifilar_resonance_test`,
   capture the CSV sweep with a search coil on GPIO5, and file it under
   `firmware/testbeds/bifilar_resonance_test/results/`.
5. Flash `firmware/nodes/scalar_coil`.
6. **Self-test:** the default preset drives at ≤ 0.35 duty. The coil must stay
   below 40 °C after 30 min. Check with a scope across a 0.1 Ω shunt that there is
   no DC component (the IN1 and IN2 pulses alternate).
7. Seat the crystal in the cradle and log its type and mass.
