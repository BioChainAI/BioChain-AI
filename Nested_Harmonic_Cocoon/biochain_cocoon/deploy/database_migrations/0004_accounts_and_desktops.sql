-- 0004: Cocoon Desktop accounts, per-user desktops, and ownership.
-- Accounts are keyed by the Firebase uid, the one thing shared with the
-- BioChain console. Everything else here is cocoon-local and isolated.

CREATE TABLE accounts (
    uid             TEXT PRIMARY KEY,              -- Firebase Auth uid (or 'local' / 'service')
    email           TEXT,
    display_name    TEXT,
    role            TEXT NOT NULL DEFAULT 'member', -- owner | member (cocoon-local, never from BioChain)
    created         REAL NOT NULL,
    last_login      REAL NOT NULL
);

CREATE TABLE desktops (
    uid             TEXT PRIMARY KEY REFERENCES accounts(uid),
    layout_json     TEXT NOT NULL,
    updated         REAL NOT NULL
);

ALTER TABLE profiles ADD COLUMN owner_uid TEXT;
ALTER TABLE sessions ADD COLUMN owner_uid TEXT;
CREATE INDEX idx_profiles_owner ON profiles(owner_uid);
CREATE INDEX idx_sessions_owner ON sessions(owner_uid, started);
