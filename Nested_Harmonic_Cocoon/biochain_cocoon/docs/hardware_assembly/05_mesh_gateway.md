# 05: Mesh Gateway (hub accessory)

1. Any ESP32-S3 DevKit works. No extra parts are needed.
2. Flash `firmware/nodes/mesh_gateway` over the **native USB** port.
3. Plug it into the hub and find the port (`ls /dev/ttyACM*`).
4. Run the orchestrator with `COCOON_TRANSPORT=serial COCOON_SERIAL_PORT=/dev/ttyACM0`
   (install `pyserial`, the one optional dependency).
5. ESP-NOW-only pucks now appear in the Mesh health module of the Cocoon Desktop.
