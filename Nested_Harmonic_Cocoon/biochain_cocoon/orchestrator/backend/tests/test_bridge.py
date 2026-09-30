import math
import os
import unittest

from helpers import cocoon_backend  # noqa: F401
from cocoon_backend import biochain_bridge as B
from cocoon_backend.config import Config
from cocoon_backend.shdccp import Packet

REF = Config().biochain_protocol_path            # ../../protocol when inside the BioChain-AI repo


class KernelWords(unittest.TestCase):
    def test_crystallize_golden_matches_biochain(self):
        # Pinned in BioChain's MIGRATION_PLAN.md: crystallize(0..59) = 9841D88D8B003CEA
        self.assertEqual("%016X" % B.crystallize(bytes(range(60))), "9841D88D8B003CEA")

    def test_parity_and_forms(self):
        w = B.entrain_word(Packet(cmd=1, fc=396.0, fe=4.0, amp=0.8, mode=1, ramp_ms=15000, x=1.0))
        self.assertEqual(w >> 60, B.FORM_ENTRAIN)
        self.assertEqual(B._parity(w), (w >> 59) & 1)
        self.assertEqual(B.FREQ_TABLE[(w >> 3) & 31], 4.0)
        self.assertEqual(B.RAMP_TABLE[w & 7], 15000)
        s = B.sync_word(5, 3)
        self.assertEqual((s >> 60, (s >> 3) & 31, (s >> 8) & 0xFFFF), (B.FORM_SYNC, 3, 5))

    def test_sync_words_rotate_by_pi_over_6(self):
        q = B.word_quat(B.sync_word(0, 1))
        self.assertAlmostEqual(2 * math.acos(q[0]), math.pi / 6, places=2)

    @unittest.skipUnless(os.path.isfile(os.path.join(REF, "shdccp_kernel.py")), "BioChain protocol/ not present")
    def test_cross_check_against_reference_kernel(self):
        rec = B.SessionRecorder("x" * 32, 0.0, protocol_path=REF)
        rec.record_packet(Packet(cmd=1, fc=432.0, fe=7.83, amp=0.4, ramp_ms=5000, y=0.4))
        for k in range(12):
            rec.record_pi6(0, k)
        rec.record_biofeedback({"t": 1.0, "source": "t", "hr_bpm": 60})
        r, extra = rec.receipt(10.0)
        self.assertTrue(r["kernel_verified"])
        self.assertEqual(extra["bioseed_claim"]["format"], "BIOSEED/1")

    def test_receipt_standalone_without_reference(self):
        rec = B.SessionRecorder("y" * 32, 0.0, protocol_path="/nonexistent")
        rec.record_pi6(0, 1)
        rec.record_distance(0.9)
        rec.record_distance(0.3)
        r, extra = rec.receipt(5.0)
        self.assertFalse(r["kernel_verified"])
        self.assertNotIn("bioseed_claim", extra)
        self.assertIn("COHERENCE DH START 0.9000 END 0.3000", extra["engram_text"])


if __name__ == "__main__":
    unittest.main()
