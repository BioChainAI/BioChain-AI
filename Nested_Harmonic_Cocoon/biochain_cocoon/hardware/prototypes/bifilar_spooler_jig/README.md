# bifilar_spooler_jig/

`spooler_jig.scad` is a parametric two-part jig for winding flat bifilar
(Tesla-style) pancake coils.

1. Render `part="bottom"` and `part="top"` in OpenSCAD and export the STLs. Print in PETG.
2. Lay two enamelled wires side by side and anchor both starts in the hub slot.
3. Crank slowly and keep both wires flat. The gap only fits them side by side.
4. When done, wick thin CA glue or coil varnish through the windows, let it cure, and remove the top flange.
5. Series-connect as in `production/scalar_coil_rev_1.0/coil_spec.md`: the
   end of wire A joins the start of wire B.

Keep `inner_d`, `outer_d` and `wire_d` in sync with `coil_calc.py` inputs.
