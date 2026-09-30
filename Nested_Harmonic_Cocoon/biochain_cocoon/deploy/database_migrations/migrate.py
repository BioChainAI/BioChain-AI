#!/usr/bin/env python3
"""
Apply the numbered *.sql migrations in this folder to a cocoon SQLite DB.

    python3 deploy/database_migrations/migrate.py [--db PATH] [--status]

Idempotent: applied filenames are recorded in `schema_migrations`. Each
migration runs in its own transaction. The orchestrator calls the same
apply() at startup, so manual runs are only needed for inspection or for
upgrading a DB offline (e.g. a backup restored onto a new hub).
"""
import argparse
import glob
import os
import re
import sqlite3
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))


def migrations():
    return sorted(glob.glob(os.path.join(HERE, "[0-9][0-9][0-9][0-9]_*.sql")))


def applied(conn):
    conn.execute("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied REAL NOT NULL)")
    return {r[0] for r in conn.execute("SELECT name FROM schema_migrations")}


def apply(conn, verbose=False):
    done = applied(conn)
    ran = []
    for path in migrations():
        name = os.path.basename(path)
        if name in done:
            continue
        with open(path) as f:
            sql = f.read()
        try:
            conn.execute("BEGIN")
            # Strip `--` comments first (they may contain ';'), then split statements.
            # Migrations must not put '--' or ';' inside string literals.
            for body in (s.strip() for s in re.sub(r"--[^\n]*", "", sql).split(";")):
                if body:
                    conn.execute(body)
            conn.execute("INSERT INTO schema_migrations VALUES (?, ?)", (name, time.time()))
            conn.execute("COMMIT")
        except Exception:
            conn.execute("ROLLBACK")
            raise
        ran.append(name)
        if verbose:
            print("applied", name)
    return ran


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=os.environ.get("COCOON_DB", "cocoon.db"))
    ap.add_argument("--status", action="store_true")
    a = ap.parse_args()
    conn = sqlite3.connect(a.db, isolation_level=None)
    if a.status:
        done = applied(conn)
        for p in migrations():
            n = os.path.basename(p)
            print("[%s] %s" % ("x" if n in done else " ", n))
        return 0
    ran = apply(conn, verbose=True)
    print("up to date" if not ran else "%d migration(s) applied" % len(ran))
    return 0


if __name__ == "__main__":
    sys.exit(main())
