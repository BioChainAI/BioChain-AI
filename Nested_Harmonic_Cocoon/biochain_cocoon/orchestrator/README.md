# orchestrator/: Central Control Panel and AI engine

```
backend/   cocoon_backend: SessionEngine, pi6 MasterClock, mesh transports, DBAP spatial fan-out,
           SQLite store, HTTP API, simulator, optional BioChain bridge
ai_core/   cocoon_ai: BiostateEstimator, hyperbolic state geometry, RuleGuide policy, ZoneMapper
frontend/  Control Suite: single page, no build step, served by the backend
```

Python 3.10+, **standard library only** (`pyserial` only for the USB gateway transport).

```bash
cd orchestrator/backend
python3 -m cocoon_backend --sim        # no hardware: 6 virtual pucks + a synthetic user
# open http://127.0.0.1:8640/, pick a target band, then Start guided session
python3 -m cocoon_backend              # real mesh over UDP (see deploy/orchestrator_docker/cocoon.env.example)
COCOON_BIOCHAIN_BRIDGE=1 python3 -m cocoon_backend --sim   # plus BioChain session receipts
```

Tests: `python3 -m unittest discover -s orchestrator/ai_core/tests` and
`python3 -m unittest discover -s orchestrator/backend/tests`.
