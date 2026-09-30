"""
Optional bridge: Harmonic Cocoon ↔ BioChain AI ecosystem.

The cocoon runs standalone. This module is loaded only when
COCOON_BIOCHAIN_BRIDGE=1, and it only *produces artefacts*. It never writes
to BioChain's Firestore or holds BioChain keys. The user publishes a receipt
through the BioChain console, with their own signing key, exactly like any
other biochain. BioChain's trust model is therefore untouched.

What synchronises
─────────────────
1. **Wire → kernel words.** Every dispatched cocoon packet folds into one
   64-bit BioChain SHD-CCP kernel word (same bit layout and even parity as
   protocol/shdccp_kernel.py), using forms unused by the codex ISA:
       FORM 12  ENTRAIN  (update_geo)   FORM 13  SYNC (pi6)   FORM 14  BIOFRAME
   The layout is documented in protocols/docs/biochain_kernel_mapping.md.
2. **Clock.** The pi6 sectors are BioChain pump-clock sectors
   (PUMP.<cycle>.<sector>). SYNC words carry the sector in the Frequency-ID
   field and the rotation quaternion of the marker angle (cos θ/2, 0, 0, sin θ/2)
   in the core, so the session's chiral holonomy advances by exactly π/6 per sync.
3. **Engram geometry.** The Guide's state quaternions are lifted onto H³ with
   the same Lorentz lift BioChain uses for engram shard placement. The receipt
   carries the session's coherence trajectory as hyperbolic distances, and
   BioChain-side hyperbolic models can consume it directly.
4. **Traceability.** At session end the receipt holds the kernel words, the
   XOR holonomy, the chiral (ordered quaternion product) holonomy, a SHA-256
   digest of the biofeedback log, and `engram_text`, a canonical summary the
   BioChain console can `growBiochain()` and publish. If BioChain's protocol/
   directory is reachable, the words are cross-checked against the reference
   kernel (`kernel_verified`) and a real BIOSEED/1 claim is grown from the
   engram text with codex_engine.grow().

Raw biometrics never leave the device. Only digests and derived coherence
numbers go into the receipt.
"""
import hashlib
import importlib
import json
import math
import os
import struct
import sys

MASK64 = 0xFFFFFFFFFFFFFFFF
FORM_ENTRAIN, FORM_SYNC, FORM_BIOFRAME = 12, 13, 14
FIELDS = {"form": (60, 4), "parity": (59, 1), "spin": (56, 3), "quat": (24, 32),
          "payload": (8, 16), "freq": (3, 5), "amp": (0, 3)}

# 32-entry entrainment table for the 5-bit Frequency ID (Hz). Covers the bands
# and the named frequencies the presets use; the nearest entry is chosen.
FREQ_TABLE = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0, 7.83, 8.0,
              9.0, 10.0, 10.5, 11.0, 12.0, 13.0, 14.0, 16.0, 18.0, 20.0, 24.0, 30.0, 33.0, 36.0, 40.0, 45.0]
# 3-bit Amplitude ID carries the ramp class (ms)
RAMP_TABLE = [250, 1000, 2500, 5000, 8000, 15000, 30000, 60000]
ROOM_RADIUS_M = 2.0


# ─── kernel word (independent re-implementation of protocol/shdccp_kernel.py) ──

def _set(w, name, v):
    s, width = FIELDS[name]
    m = (1 << width) - 1
    if not 0 <= v <= m:
        raise ValueError("%s=%d exceeds %d bits" % (name, v, width))
    return (w & ~(m << s) & MASK64) | (v << s)


def _parity(w):
    return bin(w & ~(1 << 59) & MASK64).count("1") & 1


def pack(form, spin, quat_codes, payload16, freq, amp):
    q = 0
    for c in quat_codes:
        c = -127 if c == -128 else c
        if not -127 <= c <= 127:
            raise ValueError("quaternion code out of range: %d" % c)
        q = (q << 8) | (c & 0xFF)
    w = 0
    for k, v in (("form", form), ("spin", spin), ("quat", q), ("payload", payload16), ("freq", freq), ("amp", amp)):
        w = _set(w, k, v)
    return _set(w, "parity", _parity(w))


def quat_encode(components):
    return tuple(max(-127, min(127, int(round(c * 127)))) for c in components)


def quat_codes_of(word):
    q = (word >> 24) & 0xFFFFFFFF
    return tuple(((q >> s) & 0xFF) - 256 if (q >> s) & 0xFF >= 128 else (q >> s) & 0xFF for s in (24, 16, 8, 0))


def f16(x):
    return struct.unpack("<H", struct.pack("<e", x))[0]


def crystallize(chunk, form=9, spin=0):
    """Same fold as the kernel's crystallize(); golden: crystallize(bytes(range(60))) = 9841D88D8B003CEA."""
    acc = 0x9E3779B97F4A7C15
    for b in chunk:
        acc = (((acc << 7) | (acc >> 57)) & MASK64) ^ (b * 0x100000001B3 & MASK64)
    crystal = (acc ^ (acc >> 32)) & 0xFFFFFFFF
    codes = []
    for i in (24, 16, 8, 0):
        c = (crystal >> i) & 0xFF
        codes.append(c - 256 if c >= 128 else c)
    csum = sum(chunk) & 0xFF
    return pack(form, spin, tuple(codes), len(chunk) & 0xFFFF, csum >> 3, csum & 7)


def nearest(table, x):
    return min(range(len(table)), key=lambda i: abs(table[i] - x))


def entrain_word(pkt):
    """cocoon update_geo Packet → FORM 12 kernel word (lossy by design, canonical)."""
    clamp = lambda v: max(-1.0, min(1.0, v))  # noqa: E731
    quat = quat_encode((clamp(pkt.amp), clamp(pkt.x / ROOM_RADIUS_M), clamp(pkt.y / ROOM_RADIUS_M),
                        clamp(pkt.z / ROOM_RADIUS_M)))
    return pack(FORM_ENTRAIN, pkt.mode & 7, quat, f16(pkt.fc), nearest(FREQ_TABLE, pkt.fe),
                nearest(RAMP_TABLE, pkt.ramp_ms))


def sync_word(cycle, sector):
    """pi6 marker → FORM 13 word; core = rotation quaternion of θ = sector·π/6."""
    th = sector * math.pi / 6
    return pack(FORM_SYNC, 0, quat_encode((math.cos(th / 2), 0.0, 0.0, math.sin(th / 2))),
                cycle & 0xFFFF, sector, 0)


# ─── quaternion holonomy (as protocol/pump_clock.py) ─────────────────────────

def qmul(a, b):
    w1, x1, y1, z1 = a
    w2, x2, y2, z2 = b
    return (w1*w2 - x1*x2 - y1*y2 - z1*z2, w1*x2 + x1*w2 + y1*z2 - z1*y2,
            w1*y2 - x1*z2 + y1*w2 + z1*x2, w1*z2 + x1*y2 - y1*x2 + z1*w2)


def qnorm(a):
    n = math.sqrt(sum(c * c for c in a)) or 1.0
    return tuple(c / n for c in a)


def word_quat(word):
    codes = quat_codes_of(word)
    if not any(codes):
        return (1.0, 0.0, 0.0, 0.0)      # null core = identity rotation
    return qnorm(tuple(c / 127.0 for c in codes))


# ─── optional reference cross-check ──────────────────────────────────────────

def load_reference(protocol_path):
    """Import BioChain's pinned protocol modules if the directory exists. Returns (kernel, codex) or (None, None)."""
    if not protocol_path or not os.path.isfile(os.path.join(protocol_path, "shdccp_kernel.py")):
        return None, None
    if protocol_path not in sys.path:
        sys.path.insert(0, protocol_path)
    try:
        return importlib.import_module("shdccp_kernel"), importlib.import_module("codex_engine")
    except Exception:  # pragma: no cover
        return None, None


class SessionRecorder:
    """Collects one session's kernel words and coherence; emits the receipt."""

    def __init__(self, session_id, started, preset_id=None, protocol_path=None):
        self.session_id = session_id
        self.started = started
        self.preset_id = preset_id
        self.words = []
        self.distances = []
        self.pump_ticks = 0
        self.bio = hashlib.sha256()
        self.bio_count = 0
        self.kernel, self.codex = load_reference(protocol_path)
        self.target = None
        self.notes = []

    def record_packet(self, pkt):
        if pkt.cmd == 1:
            self.words.append(entrain_word(pkt))

    def record_pi6(self, cycle, sector):
        self.words.append(sync_word(cycle, sector))
        self.pump_ticks += 1

    def record_biofeedback(self, frame):
        blob = json.dumps(frame, sort_keys=True, separators=(",", ":")).encode()
        self.bio.update(blob)
        self.bio_count += 1
        self.words.append(crystallize(blob, form=FORM_BIOFRAME))

    def record_distance(self, d):
        self.distances.append(float(d))

    def _verify_against_kernel(self):
        if not self.kernel:
            return False
        for w in self.words:
            d = self.kernel.unpack(w)             # raises on parity failure
            if self.kernel.pack(d["form"], d["spin"], d["quat_codes"], d["payload16"], d["freq"], d["amp"]) != w:
                return False
        return self.kernel.crystallize(bytes(range(60))) == crystallize(bytes(range(60)))

    def engram_text(self, ended):
        h = "%016X" % self._xor()
        lines = ["COCOON SESSION %s" % self.session_id,
                 "TARGET %s PRESET %s" % (self.target or "-", self.preset_id if self.preset_id is not None else "-"),
                 "SPAN %.0f S PUMP TICKS %d BIOFRAMES %d" % (ended - self.started, self.pump_ticks, self.bio_count),
                 "HOLONOMY %s" % h]
        if self.distances:
            lines.append("COHERENCE DH START %.4f END %.4f MIN %.4f" % (self.distances[0], self.distances[-1], min(self.distances)))
        lines.append("WORDS " + " ".join("%016X" % w for w in self.words[:4000]))
        return "\n".join(lines) + "\n"

    def _xor(self):
        h = 0
        for w in self.words:
            h ^= w
        return h

    def receipt(self, ended):
        chiral = (1.0, 0.0, 0.0, 0.0)
        for w in self.words:
            chiral = qnorm(qmul(word_quat(w), chiral))
        text = self.engram_text(ended)
        r = {
            "session_id": self.session_id,
            "started": self.started,
            "ended": ended,
            "preset_id": self.preset_id,
            "kernel_words": ["%016X" % w for w in self.words],
            "xor_holonomy": "%016X" % self._xor(),
            "chiral_holonomy": [round(c, 9) for c in chiral],
            "biofeedback_digest": self.bio.hexdigest(),
            "coherence": {
                "start": self.distances[0] if self.distances else 0.0,
                "end": self.distances[-1] if self.distances else 0.0,
                "min_distance": min(self.distances) if self.distances else 0.0,
            },
            "pump_ticks": self.pump_ticks,
            "kernel_verified": self._verify_against_kernel(),
        }
        extra = {"engram_text": text}
        if self.codex:
            try:
                claim = self.codex.grow(text.encode(), self.codex.build_codex(1, 240))
                extra["bioseed_claim"] = {k: claim[k] for k in ("format", "seed", "codexHash", "merkleRoot", "holonomy", "origBytes")}
            except Exception as e:  # pragma: no cover
                extra["bioseed_claim_error"] = str(e)
        return r, extra
