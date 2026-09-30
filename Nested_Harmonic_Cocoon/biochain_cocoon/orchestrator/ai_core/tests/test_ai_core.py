import math
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from cocoon_ai import (BiostateEstimator, BioState, RuleGuide, ZoneMapper, band_of,
                       hyperbolic_distance, state_quaternion, target_quaternion, lorentz_lift)
from cocoon_ai.guide import GuideConfig


def frame(t, rr_mean=800, rr_jitter=20, eeg=None, gsr=None, zones=None):
    rr = [rr_mean + (rr_jitter if i % 2 else -rr_jitter) for i in range(8)]
    f = {"t": t, "source": "test", "rr_ms": rr}
    if eeg:
        f["eeg_bands"] = eeg
    if gsr is not None:
        f["gsr_us"] = gsr
    if zones:
        f["zone_gsr_us"] = zones
    return f


class Bands(unittest.TestCase):
    def test_band_of(self):
        self.assertEqual(band_of(2), "delta")
        self.assertEqual(band_of(7.83), "theta")
        self.assertEqual(band_of(10), "alpha")
        self.assertEqual(band_of(40), "gamma")


class Biostate(unittest.TestCase):
    def test_high_hrv_reads_calm_low_hrv_reads_stressed(self):
        calm = BiostateEstimator().update(frame(0, rr_jitter=40))    # RMSSD 80 ms
        stressed = BiostateEstimator().update(frame(0, rr_jitter=6))  # RMSSD 12 ms
        self.assertGreater(calm.calm, 0.8)
        self.assertLess(stressed.calm, 0.1)

    def test_eeg_dominant_and_depth(self):
        e = BiostateEstimator(eeg_alpha=1.0)
        s = e.update(frame(0, eeg={"delta": 1, "theta": 6, "alpha": 2, "beta": 1, "gamma": 0}))
        self.assertEqual(s.dominant, "theta")
        self.assertGreater(s.depth, 0.6)
        self.assertIn("eeg", s.sources)

    def test_zone_resistance(self):
        e = BiostateEstimator(gsr_alpha=1.0)
        e.update(frame(0, zones={"heart": 2.0, "throat": 2.0}))
        e.update(frame(1, zones={"heart": 2.6, "throat": 2.0}))
        r = e.zone_resistance()
        self.assertAlmostEqual(r["heart"], 0.3, places=6)
        self.assertEqual(r["throat"], 0.0)


class Hyperbolic(unittest.TestCase):
    def test_distance_is_a_metric_on_samples(self):
        a = target_quaternion("delta"); b = target_quaternion("alpha"); c = target_quaternion("gamma")
        self.assertAlmostEqual(hyperbolic_distance(a, a), 0.0, places=6)
        self.assertAlmostEqual(hyperbolic_distance(a, b), hyperbolic_distance(b, a), places=9)
        self.assertLessEqual(hyperbolic_distance(a, c), hyperbolic_distance(a, b) + hyperbolic_distance(b, c) + 1e-9)

    def test_stressed_state_is_farther_from_theta(self):
        calm = BioState(calm=0.9, arousal=0.25, bands={"delta": .1, "theta": .5, "alpha": .2, "beta": .1, "gamma": .1})
        stressed = BioState(calm=0.1, arousal=0.9, bands={"delta": .05, "theta": .05, "alpha": .1, "beta": .6, "gamma": .2})
        t = target_quaternion("theta")
        self.assertLess(hyperbolic_distance(state_quaternion(calm), t),
                        hyperbolic_distance(state_quaternion(stressed), t))

    def test_lift_on_hyperboloid(self):
        L = lorentz_lift(target_quaternion("alpha"))
        # unit q ⇒ (1 − |v|²)/w² = w²/w² = 1: the lift lies on the unit hyperboloid
        self.assertAlmostEqual(L[0] ** 2 - (L[1] ** 2 + L[2] ** 2 + L[3] ** 2), 1.0, places=9)


class Guide(unittest.TestCase):
    def test_paces_then_leads_toward_target(self):
        g = RuleGuide()
        g.reset("theta", modalities=("audio",))
        e = BiostateEstimator(eeg_alpha=1.0)
        fes = []
        for i in range(12):
            # user slowly follows: alpha-dominant → theta-dominant
            w = i / 11
            s = e.update(frame(i * 10, rr_jitter=30, eeg={"delta": .1, "theta": .2 + .5 * w, "alpha": .6 - .4 * w, "beta": .1, "gamma": 0}))
            cmds = g.step(s, i * 10)
            fes.append(cmds[0].fe)
        self.assertEqual(fes[0], 10.0)                 # paced at alpha
        self.assertEqual(fes[-1], 6.0)                 # arrived at theta default
        self.assertTrue(all(b <= a for a, b in zip(fes, fes[1:])))   # monotone lead

    def test_decision_interval_rate_limits(self):
        g = RuleGuide(); g.reset("alpha", modalities=("audio",))
        s = BiostateEstimator().update(frame(0))
        self.assertTrue(g.step(s, 0))
        self.assertEqual(g.step(s, 5), [])
        self.assertTrue(g.step(s, 10))

    def test_resistance_escalates_and_respects_consent(self):
        cfg = GuideConfig(patience=2)
        g = RuleGuide(cfg); g.reset("theta", photosensitive_consent=False)
        e = BiostateEstimator(eeg_alpha=1.0)
        stuck = {"delta": 0, "theta": .1, "alpha": .2, "beta": .6, "gamma": .1}
        last = None
        for i in range(12):
            last = g.step(e.update(frame(i * 10, rr_jitter=8, eeg=stuck)), i * 10)
        self.assertEqual(g.s.rung, 3)
        by = {c.modality[0]: c for c in last}
        self.assertGreater(by["haptic"].amp, 0)
        self.assertEqual(by["photonic"].amp, 0.0)      # no consent → light stays off
        self.assertIn("no photosensitive consent", by["photonic"].rationale)
        self.assertGreater(by["coil"].amp, 0)
        self.assertEqual(by["audio"].fc, 396.0)        # stressed → root carrier

    def test_deterministic(self):
        def run():
            g = RuleGuide(); g.reset("delta")
            e = BiostateEstimator()
            return [c.as_dict() for i in range(10) for c in g.step(e.update(frame(i * 10, rr_jitter=10 + i)), i * 10)]
        self.assertEqual(run(), run())

    def test_update_geo_json_is_schema_valid(self):
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "..", "protocols"))
        import validate
        g = RuleGuide(); g.reset("alpha")
        for c in g.step(BiostateEstimator().update(frame(0)), 0):
            self.assertEqual(validate.validate("shd-ccp_update_geo.schema.json", c.to_update_geo()), [])


class Zones(unittest.TestCase):
    def test_hysteresis(self):
        z = ZoneMapper(hold_updates=2)
        self.assertIsNone(z.update({"heart": 0.2}))
        self.assertEqual(z.update({"heart": 0.2}), "heart")
        self.assertEqual(z.update({"heart": 0.1, "throat": 0.12}), "heart")   # within hysteresis
        self.assertIsNone(z.update({"heart": 0.0, "throat": 0.0}))


if __name__ == "__main__":
    unittest.main()
