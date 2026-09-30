# Enclosure DFM spec (SLA and injection moulding)

| rule | SLA (short runs) | injection moulding |
|---|---|---|
| material | tough / ABS-like resin, matte | PC-ABS (UL94 V-0), skin-safe colourant |
| nominal wall | 2.0 mm | 2.0 mm ± 0.1, uniform |
| draft | n/a | ≥ 1° on all walls parallel to the pull; 2° on textured faces |
| ribs | ≤ 0.6 × wall | ≤ 0.6 × wall, to avoid sink |
| bosses | M2.5 heat-set inserts | self-tapping bosses, OD = 2.2 × screw |
| lid seal | snap + 0.3 mm clearance | snap fit, 0.5 mm undercut with 30° lead-in |
| surface | user-contact faces smooth and rounded (R ≥ 2 mm) | same; texture MT-11010 outside only |

Node specifics:

* **Audio:** downfiring grille (perforation ≥ 25 % open area), with an acoustic mesh behind it.
* **Photonic:** PMMA or PC lens window, 650 nm transmission ≥ 90 %. No IR/UV sources are used.
  The lens sits 2 mm proud so the LEDs cannot be touched.
* **Haptic:** a soft-touch TPE overmould on the contact face transmits vibration and adds comfort.
* **Coil:** ≥ 3 mm of plastic between winding and skin, with the crystal cradle open to view.
  Mark the outer face "Experimental coil: not a medical device".

Every production shell keeps the USB-C port, the BOOT/consent pin-hole, and a
vent path over the regulator.
