# Scalar Coil Puck (Node Type D): experimental

* Bipolar pulse carrier at `fc` (IN1 and IN2 pulses are offset half a period
  via the LEDC hpoint), with a burst envelope at `fe`. There is no net DC.
* Duty is capped at 0.35 (`SafetyLimits::maxCoilDuty`). The NTC latches the
  drive off at 45 °C at the coil former.
* A bifilar pancake (Tesla-style) winding largely cancels the coil's net
  magnetic field. What remains, and any interaction with the centre crystal,
  is a **research question**. Log field measurements (gaussmeter / search
  coil) from `firmware/testbeds/bifilar_resonance_test` before drawing
  conclusions.
