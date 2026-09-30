import math
import unittest

from helpers import cocoon_backend  # noqa: F401
from cocoon_backend.pi6 import MasterClock, Pi6Scheduler, pump_token


class Pi6(unittest.TestCase):
    def test_twelve_markers_per_cycle(self):
        c = MasterClock(2.0)
        c.advance(0.0)
        markers = c.advance(1.0)             # 2 cycles
        self.assertEqual(len(markers), 24)
        self.assertEqual(markers[0], (0, 1))
        self.assertEqual(markers[11], (1, 0))

    def test_glide_integrates_exactly(self):
        c = MasterClock(10.0)
        c.advance(0.0)
        c.set_frequency(4.0, 6000)           # linear 10 → 4 Hz over 6 s: 42 cycles
        for i in range(1, 601):
            c.advance(i * 0.01)
        self.assertAlmostEqual(c.turns, 42.0, places=6)
        self.assertEqual(c.fe, 4.0)

    def test_rate_cap(self):
        c = MasterClock(40.0)                # 480 markers/s
        s = Pi6Scheduler(c, max_rate_hz=12.0)
        s.due(0.0)
        n = sum(len(s.due(i * 0.02)) for i in range(1, 501))   # 10 s
        self.assertLessEqual(n, 121)
        self.assertGreaterEqual(n, 100)

    def test_pump_token(self):
        self.assertEqual(pump_token(3, 11), "PUMP.3.11")


if __name__ == "__main__":
    unittest.main()
