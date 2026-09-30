import os
import sqlite3
import tempfile
import unittest

from helpers import Store, cocoon_backend  # noqa: F401
import importlib.util


class Migrations(unittest.TestCase):
    def test_idempotent_and_complete(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "c.db")
            Store(path)
            Store(path)                     # second open applies nothing, raises nothing
            conn = sqlite3.connect(path)
            names = [r[0] for r in conn.execute("SELECT name FROM schema_migrations ORDER BY name")]
            self.assertEqual(names, ["0001_initial.sql", "0002_consent_and_receipts.sql", "0003_retention.sql"])
            cols = [r[1] for r in conn.execute("PRAGMA table_info(profiles)")]
            self.assertIn("photosensitive_consent", cols)
            self.assertIn("biofeedback_retention_days", cols)

    def test_retention_deletes_only_old_raw_biofeedback(self):
        s = Store(":memory:")
        pid = s.create_profile("p")
        s._x("UPDATE profiles SET biofeedback_retention_days=1 WHERE id=?", (pid,))
        sid = s.start_session(pid, "alpha", None, "rule", {})
        s.add_biofeedback(sid, {"t": 0.0, "source": "old"})
        s.add_biofeedback(sid, {"t": 10 * 86400.0, "source": "new"})
        self.assertEqual(s.apply_retention(now=10 * 86400.0 + 5), 1)
        self.assertEqual([f["source"] for f in s.biofeedback(sid)], ["new"])


if __name__ == "__main__":
    unittest.main()
