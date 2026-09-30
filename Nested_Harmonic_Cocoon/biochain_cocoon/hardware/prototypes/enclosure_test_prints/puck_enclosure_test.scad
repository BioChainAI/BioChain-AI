// Puck enclosure: fit-test shell (FDM). Parametric per node type.
// The production shell is in ../../production/molded_enclosures/ (SLA / moulding).
// Units: mm.

node = "audio";     // "audio" | "photonic" | "haptic" | "coil"

D       = node == "coil" ? 110 : 86;   // outer diameter
H       = node == "audio" ? 34 : 26;   // total height
wall    = 2.0;
floor_t = 2.0;
lid_t   = 2.0;
pcb_d   = 60;                          // rev 1.0 round PCB
pcb_standoff = 4;
usb_w = 9.5; usb_h = 3.6;              // USB-C cut-out
$fn = 160;

module shell() {
    difference() {
        cylinder(d=D, h=H - lid_t);
        translate([0, 0, floor_t]) cylinder(d=D - 2 * wall, h=H);
        // USB-C port
        translate([D / 2 - wall - 1, -usb_w / 2, floor_t + pcb_standoff + 1.6]) cube([wall + 2, usb_w, usb_h]);
        // BOOT/consent button access (pin-hole)
        translate([-D / 2 - 1, 0, floor_t + pcb_standoff + 3]) rotate([0, 90, 0]) cylinder(d=2.2, h=wall + 2);
        if (node == "audio")    // speaker grille on the floor, omni-directional downfire
            for (r = [8:6:26]) for (a = [0:360 / floor(r):359])
                rotate(a) translate([r, 0, -1]) cylinder(d=2.4, h=floor_t + 2);
    }
    // PCB standoffs (M2.5 heat-set inserts)
    for (a = [45:90:315]) rotate(a) translate([pcb_d / 2 - 4, 0, floor_t])
        difference() { cylinder(d=6, h=pcb_standoff); cylinder(d=3.5, h=pcb_standoff + 1); }
}

module lid() {
    difference() {
        union() {
            cylinder(d=D, h=lid_t);
            translate([0, 0, -2]) difference() { cylinder(d=D - 2 * wall - 0.3, h=2); cylinder(d=D - 4 * wall, h=3); }
        }
        if (node == "photonic") translate([0, 0, -3]) cylinder(d=36, h=lid_t + 4);   // lens window
        if (node == "coil") translate([0, 0, -3]) cylinder(d=24, h=lid_t + 4);       // crystal cradle opening
    }
}

shell();
translate([D + 10, 0, lid_t]) rotate([180, 0, 0]) lid();
