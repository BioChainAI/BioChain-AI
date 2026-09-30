# Mesh Gateway (hub accessory)

Not a therapy puck. It is a USB bridge that lets the orchestrator (Pi/PC) reach
ESP-NOW-only pucks. Flash it to any ESP32-S3, plug it into the hub, and run:

```bash
COCOON_TRANSPORT=serial COCOON_SERIAL_PORT=/dev/ttyACM0 python3 -m cocoon_backend
```

The gateway checks each frame's CRC in both directions. Framing is SLIP
(RFC 1055), matching `cocoon_backend/mesh.py`.
