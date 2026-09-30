# firmware/

C++17 for ESP32-S3 (primary) and Teensy 4.x (DSP alternative) pucks.

```
shared_core/   stable libraries: geometric engine, shd-ccp, pi6, safety, node runtime
nodes/         production application per puck type (A audio, B photonic, C haptic, D coil)
testbeds/      isolated R&D firmware (DAC sandbox, coil resonance, mesh latency)
tests/         host unit tests for shared_core; run in CI with just g++
```

Quick check on any machine:

```bash
make -C firmware/tests       # 18 tests: oscillators, pi6 slew, packet golden vector, safety, runtime
```

The golden packet vector in `tests/test_packet.cpp` is shared with the Python
codec in `orchestrator/backend`. If either side changes the wire format,
both test suites fail.
