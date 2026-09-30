# Fabrication notes: Biopuck rev 1.0

* **Stack-up:** 4 layers, 1.6 mm, 1 oz outer / 0.5 oz inner: L1 signal, L2 GND, L3 PWR (3V3 / 5V / 12V pours), L4 signal.
* **Min track/space:** 0.15/0.15 mm; vias 0.3/0.6 mm; no via-in-pad except under U3/U6/U7 thermal pads (filled + capped).
* **Finish:** ENIG (fine-pitch QFN and module castellations).
* **Silkscreen:** node variant box on the top (A/B/C/D) with the fitted variant ticked at assembly.
* **Panel:** 2×3 with mouse bites; tooling holes + fiducials on the rails.
* **Assembly test (per board):** (1) 3V3 rail within 3.25–3.35 V; (2) flash `firmware/tests`-equivalent
  factory image; (3) variant self-test: audio sweep / LED ramp / motor tap / coil 1 s at 10 % duty with the NTC reading sane;
  (4) record the MAC → node id in the fleet sheet.
