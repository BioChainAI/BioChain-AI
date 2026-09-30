# testbeds/: R&D sandboxes

Isolated firmware for proving hardware before anything reaches `nodes/`.
Testbeds may use `shared_core` read-only, but `nodes/` code never depends on
a testbed. Promote a finding by changing `shared_core` or a node, with tests.

| testbed | question it answers | output |
|---|---|---|
| `i2s_dac_sandbox/` | Does a new DAC/amp (e.g. PCM5102A vs MAX98357A) render the engine cleanly? THD, noise floor, pop-on-boot | serial CSV + audible sweep |
| `bifilar_resonance_test/` | Where is the coil + crystal's electrical resonance, and how hot does it run per duty? | serial CSV: freq, duty, current, temp |
| `mesh_latency_benchmarks/` | ESP-NOW packet loss / latency / jitter across N pucks, and pi6 residual error | serial CSV + summary |
