# BioChain AI

A **standalone, decoupled platform** for the BioMesh architecture — the
traceability + engram system built on the **SHD-CCP data protocol**. Biochains
are grown in a growth substrate, certified with signing-key attestations,
transferred free with full lineage, and rated in a measured marketplace.
Everything is traceable by construction: certifications are revocable
attestations, transfers are signed records that are never deleted, and every
event is chronicled to an append-only audit log.

This platform runs on its own Firebase project (`biochain-ai`) and shares **no
data, rules, or runtime** with Owl Academy — Owl Academy remains the reference
implementation and is never modified.

## Where to start

| If you want to… | Read |
|---|---|
| Understand what BioChain does, how to use it, and the roadmap | [`index.html`](index.html) — the landing page ([live site](https://biochainai.github.io/BioChain-AI/)) |
| Verify the migration is fully accounted for | [`MIGRATION_PLAN.md`](MIGRATION_PLAN.md) — the authoritative plan + acceptance checklist |
| Actually perform / repeat the deployment | [`Tutorials/Migration/`](Tutorials/Migration/README.md) — the step-by-step scaffold ([browsable page](Tutorials/Migration/index.html)) |
| Understand the protocol core | [`protocol/README.md`](protocol/README.md) |
| Build or run the Harmonic Cocoon entrainment subsystem (standalone; optional BioChain bridge) | [`Nested_Harmonic_Cocoon/`](Nested_Harmonic_Cocoon/README.md) |

## Architecture (four layers)

```
Layer 4  Console / UI ......... console/  (operator + member pages)
Layer 3  BioMesh services ..... src/biomesh/ + src/identity/
Layer 2  Protocol core ........ protocol/  (SHD-CCP kernel, codex engine, mesh, pump)
Layer 1  Data / rules ......... firestore.rules + src/firebase/
```

## Status

All four layers are in the repository and served by GitHub Pages:

- **Layer 1** — `firestore.rules`, `firestore.indexes.json`, `firebase.json` and
  `src/firebase/{config,auth,firestore}.js`, bound to the `biochain-ai` project.
- **Layer 2** — the Python protocol reference in `protocol/` (kernel, codex
  engine, mesh, engram shards, pump clock), each with a deterministic self-test.
- **Layer 3** — `src/biomesh/` (grow, verify, publish, transfer, rate) and
  `src/identity/` (identity, signing keys, roles, epochs). The biochain codec and
  its verifiers are `src/biomesh/biomesh-core.js`, generated from Owl Academy's
  reference implementation (`scripts/biomesh-core.js`, MIT) by
  `tools/sync-from-owl.mjs` at the commit pinned by `OWL_COMMIT` in that script
  and recorded, with each file's SHA-256, in `src/biomesh/VENDOR.json`; it is
  never edited here. `src/biomesh/biomesh.js` re-exports it and adds the
  Firestore services. `crypto-core.js` holds the Firebase-free signing-key and
  identity primitives, so they run in Node as well as the browser.
- **Layer 4** — `console/` (Operations Console, Language Studio, Lattice Forge)
  and `login.html`. After sign-in, `login.html` follows `?redirect=` only to a
  page under the folder it is served from (`/BioChain-AI/` on Pages, an origin
  shared with Owl Academy); any other value goes to the Operations Console
  (`src/util/site-destination.js`).

`verifyIntegrity` checks a record's self-consistency (parity, each chunk against
its leaf, the Merkle root, the chiral weave and the engram stream) and fails at
the first mismatch. `verifyIntegrityStrict` checks the whole shdccp/2 contract of
RFC 07 (BioChainAI/SHD-CCP-core) in order — parity, canonical stream, crystal
packets, leaves and root, weaves and chainId, derived fields — and names the first
check that fails. It runs in shadow mode (`STRICT_ENFORCE = false` in
`src/biomesh/biomesh.js`): the console pages show its verdict ("strict ok",
"legacy", "failed at …", "self-consistent only, failed at …"), publishing refuses
a record that fails it, and accept, extend and trace refuse on it only once the
flag is turned on. Records that fail are labelled, never deleted. The Operations
Console's Audit tab (ADMIN) runs it over every record, read-only, and offers a
JSON report.

### Tests and CI

`.github/workflows/biochain-ci.yml` runs on every pull request and push to main
that touches `src/`, `console/`, `protocol/`, `tests/`, `tools/`, `firestore.rules`,
`firebase.json`, `login.html` or `index.html`. Actions are pinned to commits;
jobs run with a read-only token (`contents: read`), checkouts do not persist it,
and nothing deploys.

| Job | What it checks | Run it locally |
|---|---|---|
| rules | the trust scenarios in `tests/rules/scenarios/` against the Firestore emulator | `cd tests/rules && npm ci && npm test` (Java 21) |
| unit | `crypto-core.js` signatures and goldens, identity and signing-key writes, the scenario files; the generated core against `src/biomesh/VENDOR.json` and against the code it replaced; the RFC 07 contract vectors (`tests/vendor/`); the app layer's strict verdicts, kinds and audit | `BC_REQUIRE_HISTORY=1 node --test "tests/unit/*.test.mjs"` (needs git history) |
| protocol | every `protocol/*.py` self-test, and the contract vectors against `stream_packet` and the BIOSEED/1 rule | `python3 -B -I tests/protocol/run_selftests.py` |
| owl-sync | regenerates the generated files in `src/biomesh/` (`biomesh-core.js`, `biomesh-engine-check.js`, `VENDOR.json`) from a checkout of Owl Academy at the pinned commit and compares (network) | `node tools/sync-from-owl.mjs --owl <Owl-Academy checkout> --check` |
| static | storage policy, CDN version and integrity pins, audit-log kinds against the rules; the generated files against `src/biomesh/VENDOR.json` and `OWL_COMMIT` (hashes, headers, rewrites; offline) | `node tests/static/run-all.mjs` and `node tools/sync-from-owl.mjs --verify` |
| cdn | each pinned CDN file still matches its integrity value (network) | `node tests/static/cdn-live.mjs` |

Rules changes are deployed by a maintainer
(`firebase deploy --only firestore:rules --project biochain-ai`); CI never
deploys. The live end-to-end checklist in `MIGRATION_PLAN.md` is run by hand.

## Trust model

Client-side ECDSA crypto with Firestore rules as the backstop. Rules pin
grower/owner identity on create, free-only transfers, recipient-only resolution,
ownership-moves-only-via-accepted-transfer (joined server-side, sequenced per
chain so each transfer is single-use and cannot be replayed), and no deletes
where history must survive. Attestations are ECDSA P-256 signatures that any
signed-in user can verify against the key registry, and they are revocable —
revoking a signing key invalidates every attestation it signed, everywhere, at
once, and revocation is one-way (a revoked key cannot be reactivated).

A signing key is generated in the browser. Its private half is stored in the
owner-only `users/{uid}/signingKeys/{keyId}` record and its public half in
`keyRegistry/{keyId}`. The identity seed is used once, in the browser, to derive
the Identity ID and is not stored; the audit log accepts only entries that name
their author's own uid and a known event kind.

Roles come only from records users cannot write for themselves:
`config/rootAdmins` (console-managed) and `roleGrants/{uid}` (ADMIN-written).
The rules check the role stamped on signing keys and ratings against those
records, so a role — and the rating weight it carries — cannot be self-claimed.

## Licence

MIT, Copyright (c) 2026 Schism-Labs-AI (`LICENSE`). Parts come from Owl Academy
(MIT, Copyright (c) 2026 Ebayednoob) and SHD-CCP-core's contract vectors
(CC0-1.0); `NOTICE` lists them.
