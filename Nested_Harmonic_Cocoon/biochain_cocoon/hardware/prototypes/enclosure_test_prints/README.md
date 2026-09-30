# enclosure_test_prints/

Rough FDM shells for fit-testing boards, speakers, LEDs, coils and the USB-C
port before committing to the production shell.

* `puck_enclosure_test.scad`: set `node` to audio, photonic, haptic or coil.
  Renders the shell and lid side by side.
* Print settings: PLA or PETG, 0.2 mm layers, 3 walls, 15 % infill, no supports
  (the USB cut-out bridges).
* Record each fit test as `notes/<date>_<node>.md` with photos. Carry the
  measured changes back into the parameters, not into ad-hoc STL edits.
