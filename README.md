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
  `src/identity/` (identity, signing keys, roles, epochs). `crypto-core.js` holds
  the Firebase-free signing-key and identity primitives, so they run in Node as
  well as the browser.
- **Layer 4** — `console/` (Operations Console, Language Studio, Lattice Forge)
  and `login.html`.

`verifyIntegrity` checks a record's self-consistency (parity, each chunk against
its leaf, the Merkle root, the chiral weave and the engram stream) and fails at
the first mismatch.

### Tests and CI

`.github/workflows/biochain-ci.yml` runs on every pull request and push to main
that touches `src/`, `console/`, `protocol/`, `tests/`, `firestore.rules`,
`firebase.json`, `login.html` or `index.html`. Actions are pinned to commits;
jobs run with a read-only token (`contents: read`), checkouts do not persist it,
and nothing deploys.

| Job | What it checks | Run it locally |
|---|---|---|
| rules | the trust scenarios in `tests/rules/scenarios/` against the Firestore emulator | `cd tests/rules && npm ci && npm test` (Java 21) |
| unit | `crypto-core.js` signatures and goldens, identity and signing-key writes, the scenario files | `node --test "tests/unit/*.test.mjs"` |
| protocol | every `protocol/*.py` self-test | `python3 -B -I tests/protocol/run_selftests.py` |
| static | storage policy, CDN version and integrity pins, audit-log kinds against the rules | `node tests/static/run-all.mjs` |
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
