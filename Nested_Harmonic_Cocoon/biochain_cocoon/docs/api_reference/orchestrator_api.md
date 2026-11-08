# Orchestrator HTTP API

Base URL `http://<hub>:8640`. JSON in and out.

**Authentication.** Every route except `/api/health` and `/api/auth/config`
needs `Authorization: Bearer <token>`, where the token is either:

* a **Firebase ID token** for the user's BioChain account (the Cocoon Desktop
  handles this), or
* the hub's **service token** (`COCOON_API_TOKEN`), for wearables and scripts.

Roles (cocoon-local): **member**, **owner** (`COCOON_OWNER_UIDS`), and
**service**. See `docs/architecture/identity_and_isolation.md`.

Errors come back as `{"error": "..."}` with 400 (validation), 401 (sign-in),
403 (role / consent / allowlist), 404 (missing, or not yours), 409 (the cocoon
is in use by another account) or 413.

## Identity and desktop

| method | path | access | body | returns |
|---|---|---|---|---|
| GET | `/api/health` | public | | `{ok, version}` |
| GET | `/api/auth/config` | public | | `{mode, firebase: {apiKey, authDomain, projectId, appId}}` (no secrets) |
| GET | `/api/me` | member | | `{uid, email, name, picture, role, auth_mode, since}` |
| GET | `/api/modules` | member | | `{modules: [manifest…], templates: {id: {label, description}}}` (owner-only modules hidden from members) |
| GET | `/api/desktop` | member | | `{layout, first_run, updated}`; the first run returns the *personal* template |
| PUT | `/api/desktop` | member | layout (`protocols/schemas/desktop_layout.schema.json`) | `{ok, layout}`; validates module ids, sizes, singletons, role, settings ≤ 8 KB |
| POST | `/api/desktop/reset` | member | `{template: personal\|practitioner\|engineer}` | `{ok, layout}` |
| GET | `/api/accounts` | owner | | accounts that have signed in to this hub |

## Status and mesh

| method | path | body | returns |
|---|---|---|---|
| GET | `/api/status` | | version, session (`mine`), guide snapshot and biostate (hidden when the session is another account's), clock `{fe, phase_rad, pump}`, manual hold, stats, bridge flag, nodes_online |
| GET | `/api/nodes` | | `[{node, type, modality[], pos[3], phase_error_rad, temperature_c, standalone, online, last_seen}]` |
| PUT | `/api/nodes/{id}/position` | `{pos: [x,y,z], label?}` | `{ok}`; **owner**; metres, +y toward the head |

## Presets

| GET | `/api/presets` | | the `standalone_presets/*.json` documents |
|---|---|---|---|
| POST | `/api/presets/{id}/play` | `{}` | `{ok}`; pucks run it locally (the same code path as offline) |

## Profiles and consent

| method | path | body | returns |
|---|---|---|---|
| GET | `/api/profiles` | | your profiles (owners: all) |
| POST | `/api/profiles` | `{name, prefs?}` | `{id}` |
| PUT | `/api/profiles/{id}/consent` | `{photosensitive_consent: bool}` | profile (timestamped) |

## Sessions

| method | path | body | returns |
|---|---|---|---|
| POST | `/api/session/start` | `{target: delta\|theta\|alpha\|beta\|gamma, profile_id?, audio_mode?, modalities?[], photosensitive_consent?, preset_id?}` | session; 403 if consent is not recorded on the profile; 409 if another account's session is running |
| POST | `/api/session/stop` | `{fade_ms?}` | `{session_id, receipt?}`; **anyone signed in may stop** (safety) |
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
  -H "Authorization: Bearer $COCOON_API_TOKEN" \
  -d '{"t": 1767225600.0, "source": "polar-h10", "rr_ms": [812, 790, 845, 830], "hr_bpm": 73}'
```
