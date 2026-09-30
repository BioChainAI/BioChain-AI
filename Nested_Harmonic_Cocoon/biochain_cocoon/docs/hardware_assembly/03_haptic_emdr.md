# 03: Haptic EMDR Puck (Node C)

**Parts:** DevKit / rev 1.0 variant C, DRV8833 breakout, 2× 10 mm coin ERM
motors (3 V), soft TPE contact pads, and JST-SH pigtails.

1. Wire per `wiring.md` → Node C. The left motor is on AIN1, the right on BIN1.
2. Glue each motor to the inside of a contact pad. Keep the leads strain-relieved.
3. For a split pair (one motor per puck), build two pucks with
   `-DCOCOON_HAPTIC_SIDE=1` (left) and `=2` (right).
4. Flash `firmware/nodes/haptic_emdr`.
5. **Self-test:** nothing moves at power-on (by design). From the Cocoon Desktop's Manual override module,
   send a haptic command (fe 1.0 Hz, amp 0.4). You should feel alternating
   left/right taps, one per side per second, with soft onsets.
6. With two split pucks, check they stay in strict antiphase over 5 minutes (pi6 haptic clock).
