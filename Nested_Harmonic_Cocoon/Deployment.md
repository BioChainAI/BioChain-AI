# Harmonic Cocoon: deployment checklist

## 0. Verify the source
- [ ] `biochain_cocoon/deploy/ci_cd/run_local_ci.sh` passes (or CI is green on the branch)

## 1. Build pucks
- [ ] Read `biochain_cocoon/docs/architecture/SAFETY.md`
- [ ] Assemble each puck per `docs/hardware_assembly/` (bring-up first: `00_common_bringup.md`)
- [ ] Unique `COCOON_NODE_ID` per puck (audio 1–100, photonic 101–200, haptic 201–300, coil 301–400)
- [ ] Wi-Fi builds (for UDP + OTA): credentials only in the git-ignored `platformio_override.ini`
- [ ] Coil pucks: resonance/thermal sweep logged from `testbeds/bifilar_resonance_test`

## 2. Stand up the hub
- [ ] `cp deploy/orchestrator_docker/cocoon.env.example cocoon.env` and set a long `COCOON_API_TOKEN`
- [ ] `docker compose -f deploy/orchestrator_docker/docker-compose.yml up -d --build` (or the systemd unit)
- [ ] ESP-NOW-only pucks: flash `firmware/nodes/mesh_gateway`, set `COCOON_TRANSPORT=serial`
- [ ] Open `http://<hub>:8640/`: every puck is online; drag each to its physical position

## 3. First session
- [ ] Create a profile. Record photosensitive consent only after the user has read the warning
- [ ] Start a short alpha session, audio only. Confirm the rationale log and a smooth fade-out on Stop

## 4. Updates
- [ ] `deploy/firmware_ota/build_all.sh <version>` → `ota_push.py --fleet fleet.json` (canary first)
- [ ] Database migrations apply automatically on hub restart (`migrate.py --status` to inspect)

## 5. Optional: BioChain synchronisation
- [ ] `COCOON_BIOCHAIN_BRIDGE=1`; mount BioChain-AI `protocol/` at `BIOCHAIN_PROTOCOL_PATH` for kernel cross-checks
- [ ] After a session: `GET /api/sessions/<id>/receipt` → paste `engram_text` into the BioChain console's
      Lattice Forge → grow → publish under your own signing key
