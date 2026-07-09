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
| Verify the migration is fully accounted for | [`MIGRATION_PLAN.md`](MIGRATION_PLAN.md) — the authoritative plan + acceptance checklist |
| Actually perform / repeat the deployment | [`Tutorials/Migration/`](Tutorials/Migration/README.md) — the step-by-step scaffold ([browsable page](Tutorials/Migration/index.html)) |
| Understand the protocol core | `protocol/README.md` (added in Phase 2) |

## Architecture (four layers)

```
Layer 4  Console / UI ......... console/  (operator + member pages)
Layer 3  BioMesh services ..... src/biomesh/ + src/identity/
Layer 2  Protocol core ........ protocol/  (SHD-CCP kernel, codex engine, mesh, pump)
Layer 1  Data / rules ......... firestore.rules + src/firebase/
```

## What's in this commit (Phase 0 — foundation)

Staged for review before the code port:

- `firestore.rules` — standalone security rules (enterprise naming)
- `firestore.indexes.json`, `firebase.json` — Firestore/emulator config
- `src/firebase/{config,auth,firestore}.js` — bound to the `biochain-ai` project
- `MIGRATION_PLAN.md` — complete plan, naming standard, file manifest, checklist
- `Tutorials/Migration/` — the reusable deployment scaffold

The Layer 2–4 port (protocol core, services, console) executes in Phases 2–4 per
the plan.

## Trust model

Client-side ECDSA crypto with Firestore rules as the backstop. Rules pin
grower/owner identity on create, free-only transfers, recipient-only resolution,
ownership-moves-only-via-accepted-transfer (joined server-side), and no deletes
where history must survive. Attestations are real, publicly verifiable, and
revocable — revoking a signing key invalidates every attestation it signed,
everywhere, at once.
