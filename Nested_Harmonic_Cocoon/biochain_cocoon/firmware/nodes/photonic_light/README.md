# Photonic Puck (Node Type B): 650 nm

* Level = `amp × smoothPulse(phase)` (raised sine; mode `5` = continuous).
* PWM at 19.5 kHz / 12-bit on the LED driver DIM pin. The perceived flicker
  is the entrainment envelope only.
* **Photosensitivity gate:** pulsed light between 3 and 60 Hz is forced to 0
  unless the packet carries the consent flag (mesh) or the device consent is
  set (standalone). This is enforced in `shared_core/safety`, below the application.
* NTC on the heatsink latches the LEDs off at 60 °C and re-arms at 55 °C.
* The Gamma 40 Hz preset (id 3) is the canonical audio-visual pairing. Light
  pulses fall on the audio isochronic peaks because both read the same
  pi6-locked phase.
