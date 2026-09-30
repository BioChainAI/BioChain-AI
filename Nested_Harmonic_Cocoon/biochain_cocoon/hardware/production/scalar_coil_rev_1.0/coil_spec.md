# Scalar coil rev 1.0: bifilar pancake winding spec

> **Status: experimental research instrument.** The system concept describes
> "scalar waves" and chakra alignment. Neither has an established physical or
> physiological mechanism. This coil is specified so that its electrical and
> magnetic behaviour is **measurable and reproducible**, and experiments can
> then test claims rather than assume them.

## Geometry

| parameter | value |
|---|---|
| form | flat (pancake) spiral, bifilar (two wires side by side), Tesla series connection |
| inner diameter | 20 mm (crystal cradle) |
| outer diameter | 90 mm |
| wire | 22 AWG (0.644 mm) enamelled copper, grade 2 |
| turns | 2 × 24 (limited by (OD−ID)/2 ÷ wire pitch 0.704 mm) |
| connection | end of A → start of B; drive across start A / end B |
| former | `../../prototypes/bifilar_spooler_jig/spooler_jig.scad`, varnish-potted |
| crystal | natural quartz or amethyst point, 15–20 mm, in the centre cradle, logged per unit |

## Expected electrical values (`coil_calc.py`, verify on an LCR meter)

Run `python3 coil_calc.py` for the table. At the defaults: L ≈ 113 µH series (48 turns),
R ≈ 0.44 Ω, ≈ 8.3 m of wire in the series path (≈ 4.2 m per strand). The bifilar construction raises the self-capacitance
into the nF range, and the self-resonance must be measured
(`firmware/testbeds/bifilar_resonance_test`).

## Drive limits (enforced in firmware)

* Carrier `fc` 40–1500 Hz (the `shd-ccp` carrier range). The testbed sweeps up to 20 kHz.
* Duty ≤ 0.35, bipolar with no DC (IN1 and IN2 pulses offset by half a period).
* DRV8871 ILIM ≈ 2 A. The thermal cutoff trips at 45 °C at the former.
* Field exposure: at these currents the field at 5 cm is orders of magnitude
  below ICNIRP general-public reference levels. Log the measured values anyway.
