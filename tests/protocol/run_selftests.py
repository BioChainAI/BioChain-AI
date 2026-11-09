"""Run the self-test of every protocol/*.py module and every tests/protocol/test_*.py
script, and fail if any check fails.

Usage (from anywhere):  python3 -B -I tests/protocol/run_selftests.py

Each module runs in its own interpreter, started with -B -I. Under -I the
script's directory is not on sys.path, so the child adds protocol/ explicitly
(the modules import one another by name). A module passes when its main()
returns True; the modules' own summary lines are printed as they run. A test
script (test_contract_vectors.py: the RFC 07 contract vectors) passes when it
exits 0.
"""
import subprocess
import sys
import time
from pathlib import Path

PROTOCOL = Path(__file__).resolve().parents[2] / "protocol"
TESTS = Path(__file__).resolve().parent

CHILD = (
    "import runpy, sys\n"
    "sys.path.insert(0, sys.argv[1])\n"
    "ns = runpy.run_path(sys.argv[2])\n"
    "sys.exit(0 if ns['main']() is True else 1)\n"
)


def main():
    modules = sorted(p for p in PROTOCOL.glob("*.py") if "def main(" in p.read_text(encoding="utf-8"))
    if not modules:
        print("no protocol self-tests found under", PROTOCOL)
        return 1
    failed = []
    for path in modules:
        print("== %s" % path.name, flush=True)
        t0 = time.monotonic()
        rc = subprocess.call([sys.executable, "-B", "-I", "-c", CHILD, str(PROTOCOL), str(path)], cwd=str(PROTOCOL))
        print("-- %s: %s (%.1f s)" % (path.name, "pass" if rc == 0 else "FAIL", time.monotonic() - t0), flush=True)
        if rc != 0:
            failed.append(path.name)
    scripts = sorted(TESTS.glob("test_*.py"))
    for path in scripts:
        print("== tests/protocol/%s" % path.name, flush=True)
        t0 = time.monotonic()
        rc = subprocess.call([sys.executable, "-B", "-I", str(path)], cwd=str(TESTS))
        print("-- %s: %s (%.1f s)" % (path.name, "pass" if rc == 0 else "FAIL", time.monotonic() - t0), flush=True)
        if rc != 0:
            failed.append(path.name)
    total = len(modules) + len(scripts)
    print("\n%d/%d protocol self-tests and test scripts passed%s" % (
        total - len(failed), total, "" if not failed else " — failed: " + ", ".join(failed)))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
