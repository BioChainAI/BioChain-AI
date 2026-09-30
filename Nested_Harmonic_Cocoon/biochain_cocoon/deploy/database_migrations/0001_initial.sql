-- 0001: initial schema: profiles, sessions, biofeedback, events, node positions.
-- Applied by orchestrator/backend/cocoon_backend/store.py (or migrate.py) in filename order.

CREATE TABLE profiles (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    created         REAL NOT NULL,
    prefs_json      TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE sessions (
    id              TEXT PRIMARY KEY,               -- uuid4 hex
    profile_id      INTEGER REFERENCES profiles(id),
    started         REAL NOT NULL,
    ended           REAL,
    target_band     TEXT,
    preset_id       INTEGER,
    policy          TEXT,
    config_json     TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX idx_sessions_profile ON sessions(profile_id, started);

CREATE TABLE biofeedback (
    session_id      TEXT NOT NULL REFERENCES sessions(id),
    t               REAL NOT NULL,
    frame_json      TEXT NOT NULL
);
CREATE INDEX idx_biofeedback_session ON biofeedback(session_id, t);

CREATE TABLE events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      TEXT,
    t               REAL NOT NULL,
    kind            TEXT NOT NULL,                  -- command | guide | pi6 | node | note
    payload_json    TEXT NOT NULL
);
CREATE INDEX idx_events_session ON events(session_id, id);

CREATE TABLE node_positions (
    node_id         INTEGER PRIMARY KEY,
    x               REAL NOT NULL,
    y               REAL NOT NULL,
    z               REAL NOT NULL,
    label           TEXT
);
