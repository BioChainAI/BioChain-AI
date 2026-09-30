# Harmonic Cocoon orchestrator: backend + AI core + frontend in one image.
# Multi-arch: builds for linux/amd64 (PC hub) and linux/arm64 (Raspberry Pi 4/5).
#
#   docker build -f deploy/orchestrator_docker/Dockerfile -t cocoon-orchestrator .
#   (run from the biochain_cocoon/ directory, which is the build context)
#
# Standard library only: no pip install layer, tiny attack surface.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    COCOON_HTTP_HOST=0.0.0.0 \
    COCOON_HTTP_PORT=8640 \
    COCOON_DB=/data/cocoon.db \
    COCOON_TRANSPORT=udp

RUN useradd --system --uid 10001 --home /app cocoon \
 && mkdir -p /data && chown cocoon /data

WORKDIR /app
# Only what the orchestrator needs at runtime. Firmware and hardware stay out of the image.
COPY orchestrator/backend/cocoon_backend  orchestrator/backend/cocoon_backend
COPY orchestrator/ai_core/cocoon_ai        orchestrator/ai_core/cocoon_ai
COPY orchestrator/frontend                orchestrator/frontend
COPY protocols                            protocols
COPY standalone_presets                   standalone_presets
COPY deploy/database_migrations           deploy/database_migrations

USER cocoon
WORKDIR /app/orchestrator/backend
EXPOSE 8640/tcp 47632/udp
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD python3 -c "import urllib.request,sys; urllib.request.urlopen('http://127.0.0.1:8640/api/status', timeout=2)" || exit 1
ENTRYPOINT ["python3", "-m", "cocoon_backend"]
