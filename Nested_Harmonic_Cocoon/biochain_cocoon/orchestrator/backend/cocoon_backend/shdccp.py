"""
shd-ccp binary codec (Python side). Byte-for-byte identical to
firmware/shared_core/protocol/shdccp_packet.cpp. Both sides pin the same
golden vector (see tests/test_shdccp.py and firmware/tests/test_packet.cpp).

Note on names: BioChain's protocol/ also defines an "SHD-CCP" 64-bit kernel
word. The cocoon's shd-ccp is the continuous-control *transport* packet. The
bridge (biochain_bridge.py) maps one onto the other; see
protocols/docs/biochain_kernel_mapping.md.
"""
import math
import struct
from dataclasses import dataclass, asdict

PACKET_SIZE = 52
BROADCAST = 0xFFFF
VERSION = 1
_FMT = "<2sBBHHBBHfffffIfffH"   # 50 bytes before the CRC
assert struct.calcsize(_FMT) == 50

CMD = {"update_geo": 1, "pi6": 2, "play_preset": 3, "stop": 4, "announce": 5, "heartbeat": 6, "telemetry": 7}
CMD_NAME = {v: k for k, v in CMD.items()}
MODALITY = {"audio": 1, "photonic": 2, "haptic": 4, "coil": 8}
MODE = {"binaural": 0, "isochronic": 1, "monaural": 2, "bilateral": 3, "pulse": 4, "continuous": 5}
MODE_NAME = {v: k for k, v in MODE.items()}
NODE_TYPE = {1: "sonic_ambisonic", 2: "photonic", 3: "haptic_emdr", 4: "scalar_coil"}
FLAG_PHOTO_CONSENT = 1
FLAG_STANDALONE = 2


def crc16_ccitt(data):
    crc = 0xFFFF
    for b in data:
        crc ^= b << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021) & 0xFFFF if crc & 0x8000 else (crc << 1) & 0xFFFF
    return crc


@dataclass
class Packet:
    cmd: int = 1
    seq: int = 0
    node: int = BROADCAST
    modality: int = 15
    mode: int = 1
    flags: int = 0
    fc: float = 432.0
    fe: float = 10.0
    amp: float = 0.0
    pan: float = 0.0
    phase: float = 0.0
    ramp_ms: int = 0
    x: float = 0.0
    y: float = 0.0
    z: float = 0.0
    aux: int = 0

    def encode(self):
        body = struct.pack(_FMT, b"HC", VERSION, self.cmd, self.seq & 0xFFFF, self.node & 0xFFFF,
                           self.modality & 0xFF, self.mode & 0xFF, self.flags & 0xFFFF,
                           self.fc, self.fe, self.amp, self.pan, self.phase, int(self.ramp_ms) & 0xFFFFFFFF,
                           self.x, self.y, self.z, self.aux & 0xFFFF)
        return body + struct.pack("<H", crc16_ccitt(body))

    @classmethod
    def decode(cls, data):
        if len(data) < PACKET_SIZE:
            raise ValueError("too_short")
        data = bytes(data[:PACKET_SIZE])
        if data[:2] != b"HC":
            raise ValueError("bad_magic")
        if data[2] != VERSION:
            raise ValueError("bad_version")
        if crc16_ccitt(data[:50]) != struct.unpack("<H", data[50:])[0]:
            raise ValueError("bad_crc")
        (_, _, cmd, seq, node, modality, mode, flags, fc, fe, amp, pan, phase, ramp,
         x, y, z, aux) = struct.unpack(_FMT, data[:50])
        if not all(math.isfinite(v) for v in (fc, fe, amp, pan, phase, x, y, z)) or cmd not in CMD_NAME:
            raise ValueError("bad_value")
        return cls(cmd, seq, node, modality, mode, flags, fc, fe, amp, pan, phase, ramp, x, y, z, aux)

    def as_dict(self):
        d = asdict(self)
        d["cmd_name"] = CMD_NAME.get(self.cmd, "?")
        return d


def modality_mask(names):
    m = 0
    for n in names:
        m |= MODALITY[n]
    return m


def modality_names(mask):
    return [n for n, b in MODALITY.items() if mask & b]


def from_update_geo(d, seq=0, node=BROADCAST):
    """JSON update_geo (schema-validated) → Packet."""
    pos = d.get("pos") or (0.0, 0.0, 0.0)
    return Packet(cmd=CMD["update_geo"], seq=seq, node=node,
                  modality=modality_mask(d.get("modality") or list(MODALITY)),
                  mode=MODE[d.get("mode", "isochronic")],
                  flags=FLAG_PHOTO_CONSENT if d.get("photosensitive_consent") else 0,
                  fc=float(d["fc"]), fe=float(d["fe"]), amp=float(d["amp"]), pan=float(d.get("pan", 0.0)),
                  ramp_ms=int(d.get("ramp_ms", 5000)), x=pos[0], y=pos[1], z=pos[2])
