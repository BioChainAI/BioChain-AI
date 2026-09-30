# 02: Photonic Puck (Node B)

> ⚠️ Do not look directly into the LED array during testing. 650 nm is visible
> red and not hazardous at these powers, but it is bright. Photosensitivity: see `SAFETY.md`.

**Parts:** DevKit / rev 1.0 variant B, PT4115 module (Rs = 0.33 Ω), 3× 650 nm
1 W LEDs on a 20 mm star, a heatsink, an epoxy-bead 10 k NTC, a USB-C PD 12 V
trigger, and a lens.

1. Mount the LEDs on the heatsink with thermal paste. Epoxy the NTC within 5 mm of the star.
2. Wire the PT4115: VIN from the 12 V trigger, DIM ← GPIO5, and LED+/− to the string.
3. NTC divider to GPIO4 (10 k to 3V3).
4. Flash `firmware/nodes/photonic_light`.
5. **Self-test:** with no consent, the default preset leaves the LEDs **dark**
   (it is audio-only, and anything pulsed at 3–60 Hz is gated). Hold BOOT for
   3 s: serial prints `consent GRANTED`. Send a manual photonic command from the
   Control Suite (continuous mode) and confirm the light ramps smoothly.
6. **Thermal test:** run continuous at full allowed intensity for 20 min. The
   heatsink should stay below 55 °C. If the 60 °C cutoff trips, add heatsink area.
