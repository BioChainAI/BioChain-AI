# orchestrator/: Central Control Panel and AI engine

```
backend/   cocoon_backend: SessionEngine, pi6 MasterClock, mesh transports, DBAP spatial fan-out,
           SQLite store, HTTP API, simulator, optional BioChain bridge
ai_core/   cocoon_ai: BiostateEstimator, hyperbolic state geometry, RuleGuide policy, ZoneMapper
frontend/  Cocoon Desktop: sign in with your BioChain account, a personal desktop of add-on modules
```

Python 3.10+, **standard library only** (`pyserial` only for the USB gateway transport).

```bash
cd orchestrator/backend
python3 -m cocoon_backend --sim --no-auth   # no hardware, no sign-in: 6 virtual pucks + a synthetic user
python3 -m cocoon_backend --sim             # same, with BioChain sign-in (localhost is a Firebase authorized domain)
# open http://127.0.0.1:8640/
python3 -m cocoon_backend              # real mesh over UDP (see deploy/orchestrator_docker/cocoon.env.example)
COCOON_BIOCHAIN_BRIDGE=1 python3 -m cocoon_backend --sim   # plus BioChain session receipts
```

Tests: `python3 -m unittest discover -s orchestrator/ai_core/tests` and
`python3 -m unittest discover -s orchestrator/backend/tests`.
