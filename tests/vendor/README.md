# Vendored test data

Files the tests use that are owned by other repositories. Each is a byte-for-byte copy, pinned by SHA-256 in
`VENDOR.json`, which also records the source repository, commit and licence.

| Folder | From | Used by |
| --- | --- | --- |
| `shdccp2-contract/` | BioChainAI/SHD-CCP-core, `contract_vectors/suites/` and `contract_vectors/LICENSE`: the seven RFC 07 suites of main at 150a50f (source `shdccp2-contract`), and eight added after it (source `shdccp2-contract-s2`), copied from SHD-CCP-core's commit eaea3ba, not yet merged: `attest1_profile`, `engram1_keys`, `merkle_rules_same_bytes`, `rng_mulberry32`, `shdccp2_limits`, `shdccp2_tamper` and `shdccp2_tamper_open` (normative there; `shdccp2_tamper_open` at the first failing checks of RFC 07 section 17's option (a)), and `attest1_profile_open` (draft). `rfc6962_lists` is not copied: nothing here implements RFC 6962 trees yet | `tests/unit/contract-vectors.test.mjs` (every codec case through `src/biomesh/biomesh-core.js` and `biomesh.js`, the strict verifier on the tamper suites, the ATTEST/1 cases through `src/identity/crypto-core.js`) and `tests/protocol/test_contract_vectors.py` (the Python kernel's `stream_packet` on every packet vector, its `crystallize` on the kernel-normalised packets, and `codex_engine`'s BIOSEED/1 rule) |

Notice: `shdccp2-contract/` is CC0-1.0 (its `LICENSE`, decision D5c); only the vector files and that `LICENSE` are
copied, none of SHD-CCP-core's GPL-3.0 code.

Checks:

```sh
node --test tests/unit/vendor.test.mjs        # offline: every file listed, every SHA-256 matches
```

To refresh a source: copy the new files, update their `sha256` (and the source's `commit`) in `VENDOR.json`, and run
the tests listed under `usedBy`. `.gitattributes` keeps these files' bytes as they are (no line-ending conversion).
