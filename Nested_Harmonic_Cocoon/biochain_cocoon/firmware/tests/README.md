# firmware/tests: host unit tests

`make -C firmware/tests` compiles `shared_core` with the host compiler
(`-Wall -Wextra -Werror`) and runs:

| suite | what it proves |
|---|---|
| `test_geometric_engine.cpp` | oscillator/clock frequency accuracy; binaural L/R = fc ∓ fe/2; isochronic and glides are click-free (bounded per-sample delta); pi6 slew converges with no jump; mode swaps dip through silence; pulse/bilateral shapes |
| `test_packet.cpp` | CRC-16/CCITT check value; **golden wire vector** (shared with Python); every single-bit flip rejected; router addressing, replay window, watchdog, safety clamps; photosensitive gate; compiled preset table and player |
| `test_node_runtime.cpp` | standalone → connected → watchdog fallback; photonic consent in presets; announce packet |

No framework dependency: `test_harness.h` is ~30 lines.
