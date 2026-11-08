# Biochain: Harmonic Cocoon

A modular, mesh-networked, full-body entrainment platform. Pucks deliver
spatial sound, 650 nm light, bilateral haptics and (experimentally) bifilar-coil
fields. An AI Guide closes the loop on biofeedback. Everything is locked to
one geometric clock through the `pi6` handshake.

**Standalone by design.** This folder has no runtime dependency on the rest of
the BioChain-AI repository. An optional bridge synchronises sessions with the
BioChain ecosystem (SHD-CCP kernel words, pump-clock sectors, hyperbolic
engram geometry, and user-published biochains). See
`docs/architecture/integration_overview.md`.

```
firmware/             ESP32-S3 C++: shared_core · nodes (A audio, B photonic, C haptic, D coil, gateway) · testbeds · tests
hardware/             prototypes (wiring, OpenSCAD jigs/enclosures) · production (PCB spec, coil spec, DFM) · datasheets
orchestrator/         backend (Python stdlib) · ai_core (the Guide) · frontend (Cocoon Desktop: BioChain sign-in, add-on modules)
deploy/               firmware_ota · orchestrator_docker · database_migrations · ci_cd
protocols/            JSON schemas + wire/pi6/kernel-mapping specs + validator
standalone_presets/   offline sequences (compiled into firmware)
docs/                 architecture (incl. original concept specs, SAFETY) · hardware_assembly · api_reference
```

## Try it in two minutes (no hardware)

```bash
cd orchestrator/backend && python3 -m cocoon_backend --sim             # sign in with your BioChain account
cd orchestrator/backend && python3 -m cocoon_backend --sim --no-auth   # or skip sign-in (loopback only)
# open http://127.0.0.1:8640/
```

## Verify everything

```bash
deploy/ci_cd/run_local_ci.sh
```

This runs the firmware host tests (19), schema and generated-code checks, the
AI core tests (13), the orchestrator tests (52: including sign-in, roles, desktops and isolation), and, if PlatformIO is
installed, all 8 ESP32-S3 builds.

Read `docs/architecture/SAFETY.md` before building or using any puck.
