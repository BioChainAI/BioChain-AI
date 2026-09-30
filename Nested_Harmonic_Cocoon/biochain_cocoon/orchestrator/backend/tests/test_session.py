import unittest

from helpers import rig, run
from cocoon_backend.sim import SyntheticUser


def phase_err(a, b):
    return abs((a - b + 0.5) % 1.0 - 0.5)


class Session(unittest.TestCase):
    def test_nodes_register_from_announce(self):
        eng, pucks, clk, wall, store, reg = rig()
        run(eng, pucks, clk, wall, 0.5)
        nodes = reg.nodes(wall.t)
        self.assertEqual(len(nodes), 6)
        self.assertTrue(all(n["online"] for n in nodes))
        self.assertEqual({n["type"] for n in nodes}, {"sonic_ambisonic", "photonic", "haptic_emdr", "scalar_coil"})

    def test_pi6_holds_drifting_pucks_in_phase(self):
        eng, pucks, clk, wall, *_ = rig(drift=True)
        run(eng, pucks, clk, wall, 1.0)
        eng.send_update_geo({"cmd": "update_geo", "fc": 432, "fe": 7.83, "amp": 0.3, "ramp_ms": 0,
                             "modality": ["audio", "photonic", "coil"]})
        worst = []
        audio = [p for p in pucks if p.type in (1, 2, 4)]
        run(eng, pucks, clk, wall, 60.0,
            on_step=lambda t: t > 5 and worst.append(max(phase_err(p.phase_turns, eng.clocks["macro"].turns % 1.0) for p in audio)))
        self.assertLess(max(worst), 0.002)      # < 0.72° across all macro pucks for a minute (measured ≈ 0.15°)

    def test_without_pi6_the_same_drift_accumulates(self):
        eng, pucks, clk, wall, *_ = rig(drift=True)
        eng.cfg.pi6_max_rate_hz = 1e-9           # effectively disable sync
        for s in eng.pi6.values():
            s.max_rate_hz = 1e-9
        run(eng, pucks, clk, wall, 1.0)
        eng.send_update_geo({"cmd": "update_geo", "fc": 432, "fe": 7.83, "amp": 0.3, "ramp_ms": 0,
                             "modality": ["audio", "photonic", "coil"]})
        run(eng, pucks, clk, wall, 60.0)
        audio = [p for p in pucks if p.type in (1, 2, 4)]
        spread = max(phase_err(a.phase_turns, b.phase_turns) for a in audio for b in audio)
        self.assertGreater(spread, 0.05)

    def test_haptic_clock_is_independent(self):
        eng, pucks, clk, wall, *_ = rig(drift=False)
        run(eng, pucks, clk, wall, 0.5)
        eng.send_update_geo({"cmd": "update_geo", "fc": 432, "fe": 6.0, "amp": 0.3, "ramp_ms": 0, "modality": ["audio"]})
        eng.send_update_geo({"cmd": "update_geo", "fc": 432, "fe": 0.7, "amp": 0.3, "ramp_ms": 0,
                             "mode": "bilateral", "modality": ["haptic"]})
        run(eng, pucks, clk, wall, 10.0)
        haptic = next(p for p in pucks if p.type == 3)
        self.assertAlmostEqual(haptic.fe, 0.7)
        self.assertLess(phase_err(haptic.phase_turns, eng.clocks["haptic"].turns % 1.0), 0.01)

    def test_spatial_focus_attenuates_far_pucks(self):
        eng, pucks, clk, wall, *_ = rig(drift=False)
        run(eng, pucks, clk, wall, 0.5)
        n = eng.send_update_geo({"cmd": "update_geo", "fc": 432, "fe": 8, "amp": 0.6, "ramp_ms": 0,
                                 "modality": ["audio"], "pos": [-0.6, 0.6, 0.3]})
        self.assertEqual(n, 3)                    # one packet per audio puck
        run(eng, pucks, clk, wall, 0.1)
        amps = {p.node: p.amp for p in pucks if p.type == 1}
        self.assertAlmostEqual(amps[1], 0.6, places=5)
        self.assertLess(amps[3], amps[2] + 1e-9)
        self.assertLess(amps[2], 0.6)

    def test_guided_session_end_to_end_with_bridge_receipt(self):
        eng, pucks, clk, wall, store, _ = rig(bridge=True, drift=True)
        run(eng, pucks, clk, wall, 0.5)
        sess = eng.start("theta", modalities=("audio", "haptic"))
        user = SyntheticUser(start_hz=11.0, tau_s=40.0)
        audio = next(p for p in pucks if p.type == 1)
        state = {"last": -1.0}

        def feed(t):
            user.step(0.01, audio.fe if audio.connected else user.f)
            if t - state["last"] >= 1.0:
                state["last"] = t
                eng.ingest_biofeedback(user.frame(wall.t))

        run(eng, pucks, clk, wall, 240.0, on_step=feed)
        self.assertEqual(eng.guide.s.fe, 6.0)       # led all the way to theta
        self.assertLess(user.f, 8.0)                # the synthetic user followed into theta
        guide_events = [e for e in store.events(sess["id"]) if e["kind"] == "guide"]
        self.assertGreater(len(guide_events), 10)
        self.assertTrue(all(e["payload"]["rationale"] for e in guide_events))
        out = eng.stop()
        r = out["receipt"]
        self.assertGreater(r["pump_ticks"], 100)
        self.assertLess(r["coherence"]["end"], r["coherence"]["start"])
        full = store.receipt(sess["id"])
        self.assertIn("engram_text", full)
        import validate
        self.assertEqual(validate.validate("session_receipt.schema.json", r), [])

    def test_consent_required_for_photonic_session(self):
        eng, pucks, clk, wall, store, _ = rig()
        pid = store.create_profile("tester")
        with self.assertRaises(PermissionError):
            eng.start("gamma", profile_id=pid, photosensitive_consent=True)
        store.set_photosensitive_consent(pid, True)
        self.assertTrue(eng.start("gamma", profile_id=pid, photosensitive_consent=True)["photosensitive_consent"])

    def test_manual_override_pauses_guide(self):
        eng, pucks, clk, wall, *_ = rig()
        eng.start("alpha", modalities=("audio",))
        run(eng, pucks, clk, wall, 0.1)
        eng.manual_command({"cmd": "update_geo", "fc": 528, "fe": 9, "amp": 0.3, "modality": ["audio"]})
        fe_before = eng.guide.s.fe
        run(eng, pucks, clk, wall, 25.0)
        self.assertEqual(eng.guide.s.fe, fe_before)   # guide did not act during the hold

    def test_session_ceiling(self):
        eng, pucks, clk, wall, store, _ = rig()
        sess = eng.start("alpha", modalities=("audio",))
        wall.t += 90 * 60 + 1
        eng.tick()
        self.assertIsNone(eng.session)
        self.assertTrue(any("ceiling" in e["payload"].get("msg", "") for e in store.events(sess["id"])))

    def test_rejects_invalid_command(self):
        eng, *_ = rig()
        with self.assertRaises(ValueError):
            eng.send_update_geo({"cmd": "update_geo", "fc": 432, "fe": 100, "amp": 0.3})


if __name__ == "__main__":
    unittest.main()
