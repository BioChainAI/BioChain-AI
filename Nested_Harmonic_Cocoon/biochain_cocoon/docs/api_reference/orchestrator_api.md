# Orchestrator HTTP API

Base URL `http://<hub>:8640`. JSON in and out. When `COCOON_API_TOKEN` is set,
every non-GET request needs `Authorization: Bearer <token>`. Errors come back
as `{"error": "..."}` with 400 (validation), 401, 403 (consent), 404 or 413.

## Status and mesh

| method | path | body | returns |
|---|---|---|---|
| GET | `/api/status` | | version, session, guide snapshot, biostate, clock `{fe, phase_rad, pump}`, manual hold, stats, bridge flag, nodes_online |
| GET | `/api/nodes` | | `[{node, type, modality[], pos[3], phase_error_rad, temperature_c, standalone, online, last_seen}]` |
| PUT | `/api/nodes/{id}/position` | `{pos: [x,y,z], label?}` | `{ok}`; metres, +y toward the head |

## Presets

| GET | `/api/presets` | | the `standalone_presets/*.json` documents |
|---|---|---|---|
| POST | `/api/presets/{id}/play` | `{}` | `{ok}`; pucks run it locally (the same code path as offline) |

## Profiles and consent

| method | path | body | returns |
|---|---|---|---|
| GET | `/api/profiles` | | profiles |
| POST | `/api/profiles` | `{name, prefs?}` | `{id}` |
| PUT | `/api/profiles/{id}/consent` | `{photosensitive_consent: bool}` | profile (timestamped) |

## Sessions

| method | path | body | returns |
|---|---|---|---|
| POST | `/api/session/start` | `{target: delta\|theta\|alpha\|beta\|gamma, profile_id?, audio_mode?, modalities?[], photosensitive_consent?, preset_id?}` | session; 403 if consent is requested but not recorded on the profile |
| POST | `/api/session/stop` | `{fade_ms?}` | `{session_id, receipt?}` (receipt when the bridge is on) |
| GET | `/api/sessions` | | recent sessions |
| GET | `/api/sessions/{id}/receipt` | | `{receipt, engram_text, bioseed_claim?}` (bridge) |
| GET | `/api/events?since=<id>&session=<id>` | | event log: `command`, `guide` (with rationale and d_H), `note` |

## Control

| method | path | body | notes |
|---|---|---|---|
| POST | `/api/command` | shd-ccp `update_geo` JSON (`protocols/schemas/shd-ccp_update_geo.schema.json`) | manual override; pauses the Guide 30 s; `pos` triggers DBAP spatial fan-out |
| POST | `/api/stop_all` | `{fade_ms?}` | fades every puck out |
| POST | `/api/biofeedback` | a frame per `biofeedback_frame.schema.json` | returns the updated biostate; ignored when no session is running |

## Example: a wearable bridge

```bash
curl -s -X POST localhost:8640/api/biofeedback -H 'Content-Type: application/json' \
  -d '{"t": 1767225600.0, "source": "polar-h10", "rr_ms": [812, 790, 845, 830], "hr_bpm": 73}'
```
