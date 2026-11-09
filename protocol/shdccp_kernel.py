#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Ebayednoob (Owl-Academy); changes Copyright (c) 2026 Schism-Labs-AI. See NOTICE.
"""
SHD-CCP Kernel Protocol — the 64-bit packet ABI ("pseudo-FPGA" standard).

This is the wire contract everything in BioChain Enterprise locks down to.
One packet = one 64-bit word, field layout fixed by the Kernel Group Design:

    field                width  class     grid zone
    ─────────────────────────────────────────────────────────
    Structural Form ID   4 bit  HALO      North Halo (row 0)   opcode / seed form
    Parity               1 bit  HALO      North Halo (row 0)   even parity, all other 63 bits
    Spin Class           3 bit  STANDARD  South band            quantum-spin / model-order
    Comp. Quaternion    32 bit  CORE      rows 2–5              4 × 8-bit fixed-point (w,x,y,z)
    Payload Scale       16 bit  STANDARD  green band            uint16 (FP16 view available)
    Frequency ID         5 bit  STANDARD  South Halo (row 7)    propulsion / selector
    Amplitude ID         3 bit  STANDARD  South Halo (row 7)    propulsion / selector
    ─────────────────────────────────────────────────────────
    total               64 bit            Total Allocation: 64 / 64

Canonical bit positions (MSB..LSB of the 64-bit word — the 8×8 Einstein-tile
grid is a *presentation* of this word, never a second source of truth):

    63..60 form | 59 parity | 58..56 spin | 55..24 quaternion (w,x,y,z × int8)
    23..8 payload16 | 7..3 freq | 2..0 amp

Determinism rules (the Form-3 discipline, protocol-mandated):
  • quaternion components are exact fixed-point: value = code/127, code ∈ [-127,127]
    (code -128 is forbidden and normalizes to -127) — no free floats on the wire.
    This clamp governs the kernel's ABI and codex words only (pack, crystallize,
    codex_engine): a shdccp/2 biochain stream (RFC 07 in BioChainAI/SHD-CCP-core,
    the JS grow cell in src/biomesh/) keeps a 0x80 crystal byte raw, and
    stream_packet() writes that packet;
  • payload is a raw uint16; an IEEE-754 binary16 view is provided for display,
    but consensus logic reads the integer;
  • parity is even parity over the other 63 bits — one flipped bit anywhere
    invalidates the packet.

Pure standard library. `python3 shdccp_kernel.py` runs the ABI self-test
(captured in shdccp_kernel_output.txt).

Copied from Owl-Academy's BioChain-AI/BioChain_Enterprise/ (MIT, Copyright (c)
2026 Ebayednoob); this repository's copy is the maintained one. See NOTICE.
"""

import hashlib
import random
import struct

MASK64 = 0xFFFFFFFFFFFFFFFF

# SHA-256 of the 256-packet determinism stream in the self-test (check 6). Any
# change to the field layout, packing or parity changes it.
GOLDEN_ABI_HASH = "882a841362ae14e793d361c782f884148f71b2e930fcc81d24134e6bfa199ef6"

FIELDS = {  # name: (msb_shift, width)
    "form":    (60, 4),
    "parity":  (59, 1),
    "spin":    (56, 3),
    "quat":    (24, 32),
    "payload": (8, 16),
    "freq":    (3, 5),
    "amp":     (0, 3),
}


# ─── field packing ───────────────────────────────────────────────────────────

def _get(word, name):
    shift, width = FIELDS[name]
    return (word >> shift) & ((1 << width) - 1)


def _set(word, name, value):
    shift, width = FIELDS[name]
    m = (1 << width) - 1
    if not 0 <= value <= m:
        raise ValueError("%s=%d exceeds %d bits" % (name, value, width))
    return (word & ~(m << shift) & MASK64) | (value << shift)


def _parity_of(word):
    return bin(word & ~(1 << 59) & MASK64).count("1") & 1


def pack(form, spin, quat_codes, payload16, freq, amp):
    """Build a valid packet. quat_codes = (w,x,y,z) int8 codes in [-127,127]."""
    q = 0
    for c in quat_codes:
        if c == -128:
            c = -127                      # forbidden code normalizes
        if not -127 <= c <= 127:
            raise ValueError("quaternion code out of range: %d" % c)
        q = (q << 8) | (c & 0xFF)
    w = 0
    w = _set(w, "form", form)
    w = _set(w, "spin", spin)
    w = _set(w, "quat", q)
    w = _set(w, "payload", payload16)
    w = _set(w, "freq", freq)
    w = _set(w, "amp", amp)
    w = _set(w, "parity", _parity_of(w))  # even parity over the other 63 bits
    return w


def unpack(word):
    """Decode + integrity-check. Raises ValueError on parity failure."""
    if _get(word, "parity") != _parity_of(word):
        raise ValueError("parity check failed: packet %016X is corrupt" % word)
    q = _get(word, "quat")
    codes = []
    for i in (24, 16, 8, 0):
        c = (q >> i) & 0xFF
        codes.append(c - 256 if c >= 128 else c)
    return {
        "form": _get(word, "form"), "spin": _get(word, "spin"),
        "quat_codes": tuple(codes), "payload16": _get(word, "payload"),
        "freq": _get(word, "freq"), "amp": _get(word, "amp"),
    }


def packet_hex(word):
    return "%016X" % word


# ─── quaternion fixed point (exact rational view: code/127) ──────────────────

def quat_encode(components):
    """floats in [-1,1] → int8 codes (lossy, bounded: |err| ≤ 1/254)."""
    return tuple(max(-127, min(127, int(round(c * 127)))) for c in components)


def quat_decode(codes):
    return tuple(c / 127.0 for c in codes)


# ─── payload FP16 view (display only — consensus reads the raw uint16) ───────

def payload_from_f16(value):
    return struct.unpack("<H", struct.pack("<e", value))[0]


def payload_to_f16(payload16):
    return struct.unpack("<e", struct.pack("<H", payload16))[0]


# ─── crystallization: bytes → packet (the bioseed-chain element) ─────────────

def crystallize(chunk, form=9, spin=0):
    """Deterministic XOR/rotate fold of a byte chunk into one kernel packet.
    The quaternion core carries the 32-bit crystal; payload16 carries the
    chunk length; freq/amp carry a 8-bit checksum split 5/3."""
    acc = 0x9E3779B97F4A7C15                       # φ-derived odd constant
    for b in chunk:
        acc = (((acc << 7) | (acc >> 57)) & MASK64) ^ (b * 0x100000001B3 & MASK64)
    crystal = (acc ^ (acc >> 32)) & 0xFFFFFFFF
    codes = []
    for i in (24, 16, 8, 0):
        c = (crystal >> i) & 0xFF
        codes.append(c - 256 if c >= 128 else c)
    csum = sum(chunk) & 0xFF
    return pack(form, spin, tuple(codes), len(chunk) & 0xFFFF, csum >> 3, csum & 7)


def crystal32(chunk):
    """The 32-bit crystal of a chunk: the fold crystallize() uses (RFC 07 section 5.1)."""
    acc = 0x9E3779B97F4A7C15
    for b in chunk:
        acc = (((acc << 7) | (acc >> 57)) & MASK64) ^ (b * 0x100000001B3 & MASK64)
    return (acc ^ (acc >> 32)) & 0xFFFFFFFF


def stream_packet(chunk):
    """The shdccp/2 crystal packet of one chunk (RFC 07 section 5), as a 64-bit word.

    Form 9, spin 0, the four crystal bytes written RAW into bits 55..24,
    payload16 = len(chunk) (mod 2^16), freq/amp = the byte sum mod 256 split 5/3,
    and even parity over the other 63 bits. This is the packet the JS grow cell
    (src/biomesh/biomesh-core.js crystallize) writes into a biochain stream, so
    every shdccp/2 chainId commits to it.

    It differs from crystallize(chunk) only when a crystal byte is 0x80: pack()
    rewrites the int8 code -128 as -127 (0x81). That clamp governs the kernel's
    ABI and codex words only (decision D6); shdccp/2 packets keep 0x80 raw. About
    1.5 % of real 720-byte chunks have a 0x80 crystal byte. Use stream_packet,
    not crystallize, to reproduce a shdccp/2 stream."""
    csum = sum(chunk) & 0xFF
    w = (9 << 60) | (crystal32(chunk) << 24) | ((len(chunk) & 0xFFFF) << 8) | ((csum >> 3) << 3) | (csum & 7)
    return w | (_parity_of(w) << 59)


# ─── ABI self-test ───────────────────────────────────────────────────────────

def main():
    rng = random.Random(64)
    results = []

    def check(name, ok, detail=""):
        results.append((name, ok))
        print("  [%s] %s%s" % ("PASS" if ok else "FAIL", name, (" — " + detail) if detail else ""))

    print("SHD-CCP KERNEL PROTOCOL — ABI self-test")
    print("field map: " + " | ".join("%s@%d:%db" % (k, v[0], v[1]) for k, v in FIELDS.items()))
    print()

    # 1. pack/unpack identity over 10k random packets
    ok = True
    for _ in range(10000):
        f = rng.randrange(16); s = rng.randrange(8)
        qc = tuple(rng.randint(-127, 127) for _ in range(4))
        p = rng.randrange(65536); fr = rng.randrange(32); am = rng.randrange(8)
        d = unpack(pack(f, s, qc, p, fr, am))
        if (d["form"], d["spin"], d["quat_codes"], d["payload16"], d["freq"], d["amp"]) != (f, s, qc, p, fr, am):
            ok = False
            break
    check("pack → unpack identity (10,000 random packets)", ok)

    # 2. parity detects every single-bit flip
    w = pack(5, 3, (12, -34, 56, -78), 720, 17, 4)
    flips_caught = 0
    for bit in range(64):
        try:
            unpack(w ^ (1 << bit))
        except ValueError:
            flips_caught += 1
    check("parity catches all 64 single-bit flips", flips_caught == 64, "%d/64" % flips_caught)

    # 3. quaternion quantization bound (|err| ≤ 1/254) + forbidden-code normalization
    worst = 0.0
    for _ in range(10000):
        c = rng.uniform(-1, 1)
        worst = max(worst, abs(c - quat_decode(quat_encode((c,) * 4))[0]))
    check("quaternion fixed-point error ≤ 1/254", worst <= 1 / 254 + 1e-12, "worst %.6f" % worst)
    check("code −128 normalizes to −127", unpack(pack(0, 0, (-128, 0, 0, 0), 0, 0, 0))["quat_codes"][0] == -127)

    # 4. FP16 payload view round-trips representable values
    ok = all(payload_to_f16(payload_from_f16(v)) == v for v in (0.0, 1.0, 720.0, 240.0, 0.5, -2.0))
    check("payload FP16 view round-trips representable values", ok)

    # 5. crystallization: deterministic, chunk-sensitive
    c1 = crystallize(b"the torsional pump turns")
    c2 = crystallize(b"the torsional pump turns")
    c3 = crystallize(b"the torsional pump turnS")
    check("crystallize is deterministic", c1 == c2, packet_hex(c1))
    check("crystallize is input-sensitive (1-byte change)", c1 != c3,
          "%s ≠ %s" % (packet_hex(c1), packet_hex(c3)))

    # 6. golden determinism hash — any drift in the ABI changes this line
    stream = b"".join(pack(i & 15, i & 7, ((i * 37) % 255 - 127, 0, i & 127, -(i & 63)),
                           (i * 991) & 0xFFFF, i & 31, i & 7).to_bytes(8, "big")
                      for i in range(256))
    golden = hashlib.sha256(stream).hexdigest()
    print("\n  golden ABI hash: %s" % golden)
    check("golden ABI hash equals the pinned value", golden == GOLDEN_ABI_HASH,
          "pinned %s…" % GOLDEN_ABI_HASH[:16])

    # 7. stream_packet: the shdccp/2 packet (raw crystal bytes, RFC 07 section 5)
    golden_chunk = bytes(range(60))
    check("stream_packet(bytes 0..59) = 9841D88D8B003CEA (the cross-language golden)",
          packet_hex(stream_packet(golden_chunk)) == "9841D88D8B003CEA")
    has_x80 = lambda c: any(((crystal32(c) >> i) & 0xFF) == 0x80 for i in (24, 16, 8, 0))
    plain, x80 = [], []
    while len(plain) < 1000 or len(x80) < 4:
        c = bytes(rng.randrange(256) for _ in range(rng.randrange(1, 64)))
        (x80 if has_x80(c) else plain).append(c)
    check("stream_packet equals crystallize on chunks without a 0x80 crystal byte",
          all(stream_packet(c) == crystallize(c) for c in plain[:1000]), "1,000 random chunks")
    raw_ok = all(stream_packet(c) != crystallize(c)
                 and _get(stream_packet(c), "quat") == crystal32(c)
                 and _get(crystallize(c), "quat") != crystal32(c)
                 and _get(stream_packet(c), "parity") == _parity_of(stream_packet(c))
                 for c in x80[:4])
    check("stream_packet keeps a 0x80 crystal byte raw; crystallize writes 0x81", raw_ok,
          "%s ≠ %s" % (packet_hex(stream_packet(x80[0])), packet_hex(crystallize(x80[0]))))

    passed = sum(1 for _, r in results if r)
    print("\n%d/%d ABI checks passed — Total Allocation: 64 / 64 bits" % (passed, len(results)))
    return passed == len(results)


if __name__ == "__main__":
    main()
