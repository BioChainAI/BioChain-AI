# deploy/

| folder | what it ships |
|---|---|
| `firmware_ota/` | build every puck image; push over Wi-Fi to one puck or a canary-staged fleet |
| `orchestrator_docker/` | Docker image, compose file, and systemd unit for the hub (PC or Raspberry Pi) |
| `database_migrations/` | numbered SQLite migrations, applied automatically at orchestrator start |
| `ci_cd/` | GitHub Actions pipeline (canonical copy) + local CI runner |

See also `../../Deployment.md` for the end-to-end rollout checklist.
