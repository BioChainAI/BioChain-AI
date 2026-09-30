# Haptic EMDR Puck (Node Type C)

* Mode `3` (bilateral): left/right windowed taps alternate once per cycle
  (`fe` ≈ 0.5–1.5 Hz is typical for bilateral stimulation).
* Other modes: both motors pulse together at `fe`.
* `-DCOCOON_HAPTIC_SIDE=1|2` makes a puck drive only its left or right motor,
  for placements such as a puck on each hand or shoulder. pi6 keeps the pair
  in strict antiphase.
* Never auto-starts at power-on. The DRV8833 sleeps whenever the amplitude is ~0.
* Intended as a practitioner-guided tool. See `docs/architecture/SAFETY.md`.
