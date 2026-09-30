#!/usr/bin/env python3
"""
Two-user browser test of the Cocoon Desktop against a real hub.

The hub runs with real Firebase ID-token verification. The only stand-in is
Google: the Firebase JS SDK files are stubbed in the browser, and the tokens
are signed by a throwaway RSA key the hub trusts through COCOON_JWKS_URL.

    npm i playwright          # once (uses the system Chromium when available)
    python3 orchestrator/frontend/tests/run_e2e.py

Covers: sign-in gate → first-run template → start a session → add/remove/resize
modules → reload persists the layout → a second account sees the room busy and
the first user's biostate private → theme → sign-out. Fails on any console error.
"""
import json
import os
import subprocess
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.normpath(os.path.join(HERE, "..", "..", "backend"))
sys.path.insert(0, os.path.join(BACKEND, "tests"))
from rsa_testkit import TestKey  # noqa: E402


def main():
    work = tempfile.mkdtemp(prefix="cocoon-e2e-")
    key = TestKey(seed=77, kid="e2e")
    with open(os.path.join(work, "jwks.json"), "w") as f:
        json.dump({"keys": [key.jwk()]}, f)
    with open(os.path.join(work, "tokens.json"), "w") as f:
        json.dump({u: key.token(u, name=n) for u, n in
                   (("alice", "Alice Rivera"), ("bob", "Bob Chen"), ("owner-1", "Hub Owner"))}, f)
    env = dict(os.environ, COCOON_AUTH="firebase", COCOON_JWKS_URL="file://" + os.path.join(work, "jwks.json"),
               COCOON_OWNER_UIDS="owner-1", COCOON_DATA_DIR=os.path.join(work, "data"))
    port = "8699"
    hub = subprocess.Popen([sys.executable, "-m", "cocoon_backend", "--sim", "--port", port], cwd=BACKEND, env=env)
    try:
        time.sleep(2)
        out = subprocess.run(["node", os.path.join(HERE, "e2e_desktop.cjs"), work, "http://127.0.0.1:" + port],
                             capture_output=True, text=True, timeout=240)
        print(out.stdout, out.stderr)
        ok = out.returncode == 0 and "alice errors: [] bob errors: []" in out.stdout
        print("E2E", "PASSED" if ok else "FAILED", "- screenshots in", work)
        return 0 if ok else 1
    finally:
        hub.terminate()


if __name__ == "__main__":
    sys.exit(main())
