// Bifilar pancake-coil winding jig: parametric. Print in PETG, 0.2 mm layers.
// Two wires are wound side by side into the spiral groove between the two
// flanges. The hub has a slot to anchor both wire starts and a hex bore
// for a hand crank or a drill at low speed.
//
// Units: mm. Match these to production/scalar_coil_rev_1.0/coil_spec.md.

inner_d      = 20;     // coil inner diameter (crystal cradle sits here)
outer_d      = 90;     // coil outer diameter
wire_d       = 0.65;   // 22 AWG enamelled copper incl. insulation
flange_t     = 3;      // flange thickness
gap          = 2 * wire_d + 0.25;  // space between flanges: two wires side by side + clearance
hex_af       = 6.35;   // 1/4" hex shank bore (across flats)
slot_w       = 1.6;    // wire-start anchor slot
$fn = 128;

module flange(with_hex=true) {
    difference() {
        cylinder(d=outer_d + 8, h=flange_t);
        if (with_hex) translate([0, 0, -1]) cylinder(d=hex_af / cos(30), h=flange_t + 2, $fn=6);
        // viewing windows to watch the spiral form
        for (a = [0:90:270]) rotate(a) translate([inner_d / 2 + (outer_d - inner_d) / 4 + 4, 0, -1])
            cylinder(d=(outer_d - inner_d) / 4, h=flange_t + 2);
    }
}

module hub() {
    difference() {
        cylinder(d=inner_d, h=gap);
        translate([0, 0, -1]) cylinder(d=hex_af / cos(30), h=gap + 2, $fn=6);
        translate([inner_d / 2 - 3, -slot_w / 2, -1]) cube([4, slot_w, gap + 2]);   // wire anchor
    }
}

// Print as two parts; the top flange sits on the hub, bolted with 3× M3.
module bolt_holes() {
    for (a = [0, 120, 240]) rotate(a) translate([inner_d / 2 - 3.2 - 1.5, 0, -1]) cylinder(d=3.2, h=50);
}

part = "bottom";   // "bottom" | "top"  (render each and export STL)
if (part == "bottom") difference() { union() { flange(); translate([0, 0, flange_t]) hub(); } bolt_holes(); }
else difference() { flange(); bolt_holes(); }
