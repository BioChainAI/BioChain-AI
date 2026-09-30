import unittest

from helpers import cocoon_backend  # noqa: F401
from cocoon_backend.shdccp import Packet, crc16_ccitt, from_update_geo, PACKET_SIZE

# Must equal kGoldenHex + crc in firmware/tests/test_packet.cpp
GOLDEN = ("4843010107002a0001010000" "0000c643" "00008040" "cdcc4c3f" "00000000" "00000000"
          "983a0000" "0000803f" "000000bf" "00000000" "0000" "be02")


class Codec(unittest.TestCase):
    def golden(self):
        return Packet(cmd=1, seq=7, node=42, modality=1, mode=1, fc=396.0, fe=4.0, amp=0.8,
                      ramp_ms=15000, x=1.0, y=-0.5, z=0.0)

    def test_crc_check_value(self):
        self.assertEqual(crc16_ccitt(b"123456789"), 0x29B1)

    def test_golden_vector_matches_firmware(self):
        self.assertEqual(self.golden().encode().hex(), GOLDEN)

    def test_roundtrip_and_every_bit_flip_rejected(self):
        b = self.golden().encode()
        self.assertEqual(len(b), PACKET_SIZE)
        d = Packet.decode(b)
        self.assertEqual((d.fc, d.ramp_ms, d.node, d.y), (396.0, 15000, 42, -0.5))
        caught = 0
        for bit in range(PACKET_SIZE * 8):
            c = bytearray(b)
            c[bit // 8] ^= 1 << (bit % 8)
            try:
                Packet.decode(bytes(c))
            except ValueError:
                caught += 1
        self.assertEqual(caught, PACKET_SIZE * 8)

    def test_from_update_geo(self):
        p = from_update_geo({"cmd": "update_geo", "fc": 432, "fe": 7.83, "amp": 0.5, "mode": "binaural",
                             "modality": ["audio", "photonic"], "photosensitive_consent": True, "pos": [0, 1, 0]})
        self.assertEqual((p.modality, p.mode, p.flags, p.y), (3, 0, 1, 1.0))


if __name__ == "__main__":
    unittest.main()
