# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Schism-Labs-AI
"""The Python protocol against the RFC 07 contract vectors (tests/vendor/shdccp2-contract/, CC0-1.0).

  shdccp2_packet    stream_packet(chunk) gives every packet, crystal32, signed codes and fields, including the
                    chunks with a 0x80 crystal byte; crystallize(chunk) gives the kernel-normalised packet the
                    vectors record as informative (0x80 written as 0x81)
  shdccp2_chunk     stream_packet gives each chunk's packet, which opens its frame
  shdccp2_weave     crystal32 of every chunk
  shdccp2_record    the packets of every record whose stream is given in full: the 720-byte cut of the UTF-8 text,
                    stream_packet of each chunk, against the packets framed in the stream
  merkle_rules_same_bytes   codex_engine's BIOSEED/1 leaves and root of the same chunks; grow() tags its claims
                    format BIOSEED/1 and merkleRule bioseed1, and its leaves and root follow that rule

Usage (from anywhere):  python3 -B -I tests/protocol/test_contract_vectors.py
(tests/protocol/run_selftests.py runs it too). Exits 0 when every check passes.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "protocol"))

import codex_engine as CE  # noqa: E402
from shdccp_kernel import crystal32, crystallize, packet_hex, stream_packet, unpack  # noqa: E402

SUITES = ROOT / "tests" / "vendor" / "shdccp2-contract" / "suites"
CUT = 720


def suite(name):
    return json.loads((SUITES / ("%s.json" % name)).read_text(encoding="utf-8"))


def text_of(inp):
    if "text" in inp:
        return inp["text"]
    out = []
    for p in inp["text_parts"]:
        if isinstance(p, str):
            out.append(p)
        else:
            r = p["repeat"]
            out.append((r * (p["length"] // len(r) + 1))[:p["length"]])
    return "".join(out)


def chunks_of(text):
    data = text.encode("utf-8")
    return [data[i:i + CUT] for i in range(0, len(data), CUT)]


def frames(stream):
    """[(packet, residual)] of a framed shdccp/2 stream (RFC 07 section 4)."""
    out, p = [], 0
    while p < len(stream):
        packet, n = stream[p:p + 16], int(stream[p + 16:p + 24], 16)
        out.append((packet, stream[p + 24:p + 24 + 2 * n]))
        p += 24 + 2 * n
    return out


def has_x80(c32):
    return any(((c32 >> s) & 0xFF) == 0x80 for s in (24, 16, 8, 0))


def main():
    results = []

    def check(name, ok, detail=""):
        results.append((name, ok))
        print("  [%s] %s%s" % ("PASS" if ok else "FAIL", name, (" — " + detail) if detail else ""))

    print("RFC 07 contract vectors — Python protocol")

    # shdccp2_packet
    bad, x80, kernel_bad = [], 0, []
    for c in suite("shdccp2_packet")["cases"]:
        chunk, e, inf = bytes.fromhex(c["input"]["chunk_hex"]), c["expect"], c.get("informative", {})
        w = stream_packet(chunk)
        d = unpack(w)
        parity = (w >> 59) & 1
        fields = {"form": d["form"], "parity": parity, "spin": d["spin"], "payload16": d["payload16"],
                  "freq": d["freq"], "amp": d["amp"]}
        if (packet_hex(w) != e["packet"] or "%08X" % crystal32(chunk) != e["crystal32"]
                or list(d["quat_codes"]) != e["crystal_codes"] or fields != e["fields"]):
            bad.append(c["id"])
        if packet_hex(crystallize(chunk)) != inf.get("kernel_normalized_packet"):
            kernel_bad.append(c["id"])
        if inf.get("kernel_normalized_differs"):
            x80 += 1
            if packet_hex(crystallize(chunk)) == e["packet"]:
                bad.append(c["id"] + " (crystallize gives the shdccp/2 packet)")
    n = len(suite("shdccp2_packet")["cases"])
    check("shdccp2_packet: stream_packet gives every packet, codes and fields", not bad,
          "%d cases, %d with a 0x80 crystal byte%s" % (n, x80, "; " + ", ".join(bad[:5]) if bad else ""))
    check("shdccp2_packet: crystallize gives the kernel-normalised packet (informative)", not kernel_bad,
          ", ".join(kernel_bad[:5]))
    check("shdccp2_packet: at least 46 cases hold a 0x80 crystal byte", x80 >= 46, "%d" % x80)

    # shdccp2_chunk
    bad = [c["id"] for c in suite("shdccp2_chunk")["cases"]
           if packet_hex(stream_packet(bytes.fromhex(c["input"]["chunk_hex"]))) != c["expect"]["packet"]
           or not c["expect"]["frame"].startswith(c["expect"]["packet"])]
    check("shdccp2_chunk: stream_packet gives each chunk's packet", not bad, ", ".join(bad[:5]))

    # shdccp2_weave
    bad, nx = [], 0
    for c in suite("shdccp2_weave")["cases"]:
        got = ["%08X" % crystal32(bytes.fromhex(h)) for h in c["input"]["chunks_hex"]]
        nx += sum(1 for h in c["input"]["chunks_hex"] if has_x80(crystal32(bytes.fromhex(h))))
        if got != c["expect"]["crystal32"]:
            bad.append(c["id"])
    check("shdccp2_weave: crystal32 of every chunk", not bad, "%d chunks with a 0x80 crystal byte" % nx)

    # shdccp2_record
    bad, packets, records = [], 0, 0
    for c in suite("shdccp2_record")["cases"]:
        e = c["expect"]
        if "stream" not in e:
            continue
        records += 1
        want = [p for p, _ in frames(e["stream"])]
        got = [packet_hex(stream_packet(ch)) for ch in chunks_of(text_of(c["input"]))]
        packets += len(got)
        if got != want:
            bad.append(c["id"])
    check("shdccp2_record: the packets of every record given in full", not bad and records >= 19,
          "%d records, %d packets%s" % (records, packets, "; " + ", ".join(bad) if bad else ""))

    # merkle_rules_same_bytes: BIOSEED/1
    bad = []
    for c in suite("merkle_rules_same_bytes")["cases"]:
        chunks, e = chunks_of(text_of(c["input"])), c["expect"]["bioseed1"]
        leaves = [CE._chunk_hash(i, ch) for i, ch in enumerate(chunks)]
        if leaves != e["leafHashes"] or CE.merkle_root(leaves) != e["merkleRoot"]:
            bad.append(c["id"])
    check("merkle_rules_same_bytes: codex_engine's BIOSEED/1 leaves and root", not bad, ", ".join(bad[:5]))

    codex = CE.build_codex(order=2, chunk_size=CUT)
    bad = []
    for c in suite("merkle_rules_same_bytes")["cases"]:
        claim, e = CE.grow(text_of(c["input"]).encode("utf-8"), codex), c["expect"]["bioseed1"]
        if (claim.get("format"), claim.get("merkleRule")) != ("BIOSEED/1", "bioseed1"):
            bad.append(c["id"] + " (tags)")
        elif claim["leafHashes"] != e["leafHashes"] or claim["merkleRoot"] != e["merkleRoot"]:
            bad.append(c["id"])
    check("codex_engine.grow tags BIOSEED/1 / bioseed1 and commits under that rule", not bad, ", ".join(bad[:5]))

    passed = sum(1 for _, ok in results if ok)
    print("\n%d/%d contract-vector checks passed" % (passed, len(results)))
    return passed == len(results)


if __name__ == "__main__":
    sys.exit(0 if main() else 1)
