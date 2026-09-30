#!/usr/bin/env python3
"""
Flat spiral (pancake) coil calculator: inductance, resistance, wire length,
turn count, and LC resonance for a measured capacitance.

Inductance uses Wheeler's flat-spiral approximation (about 5 % for w > 0.2·r):
    L[µH] = r² N² / (8 r + 11 w)      r = mean radius [in], w = winding width [in]
A series bifilar coil of two interleaved N-turn windings is treated as one
2N-turn spiral. That is an approximation; measure the real coil.

    python3 coil_calc.py [--id 20] [--od 90] [--wire 0.644] [--insul 0.03] [--cap-nf 4.7]
"""
import argparse
import math

RHO_CU = 1.72e-8          # Ω·m at 20 °C
MM_PER_IN = 25.4


def calc(id_mm, od_mm, wire_mm, insul_mm, bifilar=True):
    pitch = wire_mm + 2 * insul_mm
    width = (od_mm - id_mm) / 2
    turns_total = int(width / pitch)
    turns_each = turns_total // 2 if bifilar else turns_total
    n = turns_each * (2 if bifilar else 1)
    r_in = (id_mm + od_mm) / 4 / MM_PER_IN
    w_in = width / MM_PER_IN
    L_uH = r_in ** 2 * n ** 2 / (8 * r_in + 11 * w_in)
    length_m = n * math.pi * ((id_mm + od_mm) / 2) / 1000
    area = math.pi * (wire_mm / 2000) ** 2
    R = RHO_CU * length_m / area
    return {"turns_per_wire": turns_each, "turns_series": n, "L_uH": L_uH, "R_ohm": R, "wire_m": length_m}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--id", type=float, default=20.0)
    ap.add_argument("--od", type=float, default=90.0)
    ap.add_argument("--wire", type=float, default=0.644, help="copper diameter mm (22 AWG = 0.644)")
    ap.add_argument("--insul", type=float, default=0.03, help="enamel thickness per side, mm")
    ap.add_argument("--cap-nf", type=float, default=None, help="measured self/tank capacitance for resonance")
    ap.add_argument("--single", action="store_true", help="single-wire spiral instead of bifilar")
    a = ap.parse_args()
    r = calc(a.id, a.od, a.wire, a.insul, bifilar=not a.single)
    print("turns per wire    %d" % r["turns_per_wire"])
    print("series turns      %d" % r["turns_series"])
    print("inductance        %.1f µH (Wheeler, ±5–10 %%)" % r["L_uH"])
    print("DC resistance     %.2f Ω" % r["R_ohm"])
    print("wire length       %.1f m (per series path)" % r["wire_m"])
    print("L/R time const.   %.1f µs" % (r["L_uH"] / r["R_ohm"]))
    if a.cap_nf:
        f = 1 / (2 * math.pi * math.sqrt(r["L_uH"] * 1e-6 * a.cap_nf * 1e-9))
        print("LC resonance      %.1f kHz with %.2f nF" % (f / 1000, a.cap_nf))


if __name__ == "__main__":
    main()
