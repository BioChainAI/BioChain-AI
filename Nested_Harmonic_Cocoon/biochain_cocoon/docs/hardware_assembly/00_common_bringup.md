# 00: Common bring-up

**Tools:** temperature-controlled iron (≈ 330 °C for leaded, 360 °C for
lead-free), flux, 0.5 mm solder, flush cutters, multimeter, ESD mat and strap,
USB-C cable, and a bench supply with current limit (optional).

1. **Inspect** the DevKit / rev 1.0 board. Set the bench supply to 5 V with a
   300 mA limit for first power-on.
2. **Power only:** 3V3 rail within 3.25–3.35 V, and idle current under 120 mA.
3. **Host tests pass** on your machine: `make -C firmware/tests`.
4. **Flash:** `pio run -d firmware/nodes/<node> -t upload`. Set a unique
   `-DCOCOON_NODE_ID` per puck in `platformio_override.ini`.
5. **Serial check** (`pio device monitor`): `[cocoon] node <id> fw 1.0.0 booting`.
6. **Standalone check:** the status LED blinks slowly (standalone), and the node
   runs its default preset (not haptics).
7. **Mesh check:** start `python3 -m cocoon_backend` on the hub. The puck
   appears in the Cocoon Desktop's Mesh health module within 2 s and the LED turns solid (connected).
8. **Label** the enclosure with the node id and record MAC → id in the fleet sheet.
