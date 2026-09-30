# orchestrator_docker/

Packages the orchestrator (backend + AI core + frontend + schemas + presets +
migrations) so it runs identically on a PC or a Raspberry Pi hub.

```bash
cd Nested_Harmonic_Cocoon/biochain_cocoon
cp deploy/orchestrator_docker/cocoon.env.example deploy/orchestrator_docker/cocoon.env   # set COCOON_API_TOKEN
docker compose -f deploy/orchestrator_docker/docker-compose.yml up -d --build
# UI → http://<hub>:8640/     demo simulator: add `--profile sim` (port 8641)
```

* `network_mode: host` is required because the mesh uses LAN UDP broadcast.
* The data volume `/data` holds the SQLite DB (profiles, sessions, biofeedback),
  which is **sensitive health data**. Back it up encrypted, or not at all.
* Without Docker: `cocoon-orchestrator.service` is a hardened systemd unit.
* Multi-arch build: `docker buildx build --platform linux/amd64,linux/arm64 -f deploy/orchestrator_docker/Dockerfile .`
