# 01: Biopuck Audio (Node A)

**Parts:** ESP32-S3-DevKitC-1 (or rev 1.0 variant A), MAX98357A breakout, a
3 W 4–8 Ω full-range speaker (40–50 mm), a JST-PH pigtail, and the enclosure
(`enclosure_test_prints`, `node="audio"`).

1. Solder headers to the MAX98357A. Leave GAIN floating (9 dB).
2. Wire it per `wiring.md` → Node A. Keep the I2S wires under 10 cm and twist
   BCLK with a ground wire.
3. Speaker: solder to OUT+/OUT−. Do **not** connect either output to ground (BTL output).
4. Flash `firmware/nodes/biopuck_audio`.
5. **Self-test:** at power-on the default preset starts silently and glides
   in over 5 s. There should be no pop, because SD stays low until the first clean buffer.
6. **DAC sandbox (optional):** flash `firmware/testbeds/i2s_dac_sandbox` and send
   `s` for a 40 → 1500 Hz sweep and `p` for the pop test. Check `r` for render time
   (expect < 10 % of the 5.8 ms budget).
7. Mount the speaker downfiring onto the grille, with foam gasket and acoustic mesh.
