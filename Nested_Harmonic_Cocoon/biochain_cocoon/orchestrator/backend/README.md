# backend/: cocoon_backend

| module | role |
|---|---|
| `shdccp.py` | 52-byte wire codec (byte-identical to the firmware; shared golden vector) |
| `pi6.py` | `MasterClock` (exact glide integration), `Pi6Scheduler` (rate-capped markers), pump tokens |
| `mesh.py` | `UdpTransport`, `SerialGatewayTransport` (SLIP), `LoopbackBus` |
| `registry.py` | live pucks from Announce packets, and their positions |
| `spatial.py` | DBAP spatial fan-out for irregular puck layouts |
| `session.py` | `SessionEngine`: tick loop, clock groups, Guide integration, consent, 90 min ceiling |
| `store.py` | SQLite, with schema from `deploy/database_migrations` |
| `auth.py` | BioChain-credential sign-in: stdlib RS256 Firebase ID-token verification, cocoon roles, allowlist |
| `desktop.py` | add-on module catalog, per-user desktop layouts, templates |
| `api.py` | HTTP API + Cocoon Desktop static files, role- and owner-scoped (`docs/api_reference/orchestrator_api.md`) |
| `sim.py` | virtual pucks (with crystal drift) + synthetic user |
| `biochain_bridge.py` | optional: kernel words, holonomies, receipts, engram text |
| `config.py` | environment-variable configuration |
