-- 0002: explicit consent records and BioChain bridge receipts.
-- Consent is stored per profile with a timestamp, never inferred. Receipts
-- hold only digests: raw biometrics stay in `biofeedback` on this device.

ALTER TABLE profiles ADD COLUMN photosensitive_consent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN photosensitive_consent_at REAL;

CREATE TABLE session_receipts (
    session_id      TEXT PRIMARY KEY REFERENCES sessions(id),
    created         REAL NOT NULL,
    receipt_json    TEXT NOT NULL,
    exported        INTEGER NOT NULL DEFAULT 0      -- 1 once pushed to BioChain by the user
);
