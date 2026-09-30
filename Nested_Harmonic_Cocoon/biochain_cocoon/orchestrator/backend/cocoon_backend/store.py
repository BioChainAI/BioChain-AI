"""SQLite persistence. Schema is owned by deploy/database_migrations/."""
import importlib.util
import json
import os
import sqlite3
import threading
import time
import uuid

from . import COCOON_ROOT

_MIGRATE = os.path.join(COCOON_ROOT, "deploy", "database_migrations", "migrate.py")


def _load_migrator():
    spec = importlib.util.spec_from_file_location("cocoon_migrate", _MIGRATE)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class Store:
    def __init__(self, path=":memory:"):
        if path != ":memory:":
            os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        self.conn = sqlite3.connect(path, isolation_level=None, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA journal_mode=WAL") if path != ":memory:" else None
        self.conn.execute("PRAGMA foreign_keys=ON")
        self.lock = threading.Lock()
        with self.lock:
            _load_migrator().apply(self.conn)

    def _x(self, sql, args=()):
        with self.lock:
            return self.conn.execute(sql, args)

    # profiles ------------------------------------------------------------
    def create_profile(self, name, prefs=None):
        cur = self._x("INSERT INTO profiles (name, created, prefs_json) VALUES (?, ?, ?)",
                      (name, time.time(), json.dumps(prefs or {})))
        return cur.lastrowid

    def set_photosensitive_consent(self, profile_id, granted):
        self._x("UPDATE profiles SET photosensitive_consent=?, photosensitive_consent_at=? WHERE id=?",
                (1 if granted else 0, time.time() if granted else None, profile_id))

    def profiles(self):
        return [dict(r) for r in self._x("SELECT * FROM profiles ORDER BY id")]

    def profile(self, pid):
        r = self._x("SELECT * FROM profiles WHERE id=?", (pid,)).fetchone()
        return dict(r) if r else None

    # sessions ------------------------------------------------------------
    def start_session(self, profile_id, target_band, preset_id, policy, config):
        sid = uuid.uuid4().hex
        self._x("INSERT INTO sessions (id, profile_id, started, target_band, preset_id, policy, config_json) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (sid, profile_id, time.time(), target_band, preset_id, policy, json.dumps(config)))
        return sid

    def end_session(self, sid):
        self._x("UPDATE sessions SET ended=? WHERE id=?", (time.time(), sid))

    def sessions(self, limit=50):
        return [dict(r) for r in self._x("SELECT * FROM sessions ORDER BY started DESC LIMIT ?", (limit,))]

    def add_biofeedback(self, sid, frame):
        self._x("INSERT INTO biofeedback VALUES (?, ?, ?)", (sid, frame.get("t", time.time()), json.dumps(frame)))

    def biofeedback(self, sid):
        return [json.loads(r[0]) for r in self._x("SELECT frame_json FROM biofeedback WHERE session_id=? ORDER BY t", (sid,))]

    def log(self, sid, kind, payload):
        self._x("INSERT INTO events (session_id, t, kind, payload_json) VALUES (?, ?, ?, ?)",
                (sid, time.time(), kind, json.dumps(payload)))

    def events(self, sid=None, since_id=0, limit=200):
        if sid:
            rows = self._x("SELECT * FROM events WHERE session_id=? AND id>? ORDER BY id LIMIT ?", (sid, since_id, limit))
        else:
            rows = self._x("SELECT * FROM events WHERE id>? ORDER BY id LIMIT ?", (since_id, limit))
        return [{**{k: r[k] for k in ("id", "session_id", "t", "kind")}, "payload": json.loads(r["payload_json"])}
                for r in rows]

    # receipts ------------------------------------------------------------
    def save_receipt(self, sid, receipt):
        self._x("INSERT OR REPLACE INTO session_receipts (session_id, created, receipt_json) VALUES (?, ?, ?)",
                (sid, time.time(), json.dumps(receipt)))

    def receipt(self, sid):
        r = self._x("SELECT receipt_json FROM session_receipts WHERE session_id=?", (sid,)).fetchone()
        return json.loads(r[0]) if r else None

    # node positions ------------------------------------------------------
    def save_node_position(self, node, pos, label=None):
        self._x("INSERT OR REPLACE INTO node_positions VALUES (?, ?, ?, ?, ?)", (node, pos[0], pos[1], pos[2], label))

    def node_positions(self):
        return [(r["node_id"], (r["x"], r["y"], r["z"])) for r in self._x("SELECT * FROM node_positions")]

    # retention -----------------------------------------------------------
    def apply_retention(self, now=None):
        """Delete raw biofeedback older than each profile's retention window."""
        now = now or time.time()
        n = 0
        for p in self.profiles():
            days = p.get("biofeedback_retention_days")
            if days:
                cur = self._x("DELETE FROM biofeedback WHERE t < ? AND session_id IN "
                              "(SELECT id FROM sessions WHERE profile_id=?)", (now - days * 86400, p["id"]))
                n += cur.rowcount
        return n
