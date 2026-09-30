-- 0003: data-retention support. Profiles can opt into automatic deletion of
-- raw biofeedback after N days; session summaries and receipts are kept.

ALTER TABLE profiles ADD COLUMN biofeedback_retention_days INTEGER;   -- NULL = keep
CREATE INDEX idx_biofeedback_t ON biofeedback(t);
