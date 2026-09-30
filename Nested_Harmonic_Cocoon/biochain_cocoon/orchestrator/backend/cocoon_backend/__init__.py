"""
cocoon_backend: the Harmonic Cocoon Central Orchestrator.

Standard library only. Runs on a laptop, a Raspberry Pi hub, or in the
Docker image under deploy/orchestrator_docker. The optional BioChain bridge
(biochain_bridge.py) activates only when COCOON_BIOCHAIN_BRIDGE=1; the
cocoon is fully functional without it.
"""
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
COCOON_ROOT = os.path.normpath(os.path.join(_HERE, "..", "..", ".."))
_AI_CORE = os.path.join(COCOON_ROOT, "orchestrator", "ai_core")
_PROTOCOLS = os.path.join(COCOON_ROOT, "protocols")
for _p in (_AI_CORE, _PROTOCOLS):
    if _p not in sys.path:
        sys.path.insert(0, _p)

__version__ = "1.0.0"
