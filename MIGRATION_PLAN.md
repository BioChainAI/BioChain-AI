# BioChain AI — Standalone Platform Migration Plan

**Goal:** stand up the BioMesh architecture (traceability + engram system on the
SHD-CCP data protocol) as a **standalone, decoupled platform** in the
`BioChain-AI` repository, on its own Firebase project (`biochain-ai`), with its
own security rules and **enterprise-ready naming** — while leaving Owl Academy
**completely untouched** as the reference implementation.

- **Source of truth (read-only):** `Owl-Academy/` — the working BioMesh system.
- **Target (new build):** `BioChain-AI/` — this repository.
- **Branch:** `claude/biochain-biomesh-architecture-l1raor` (both repos).
- **Companion:** `Tutorials/Migration/` — the step-by-step deployment scaffold
  that documents exactly how this migration is performed, reusable for the next
  product spun out of the same core.

> **Verification-first.** This document is written so you can walk it top to
> bottom and confirm *every* moving part of the source system has a home in the
> target. The [Acceptance Checklist](#9-acceptance-checklist) at the end is the
> sign-off gate before we flip real traffic on.

---

## 1. Decision record

These decisions were settled before planning and drive everything below.

| # | Decision | Choice | Consequence |
|---|---|---|---|
| D1 | Firebase project | **New dedicated project `biochain-ai`** (config supplied) | Own auth, rules, quota, and data — true decoupling. Owl Academy's `owl-academy-6bce2` is never touched. |
| D2 | Authority model | **Keep the 3-tier model, renamed** to `ADMIN / OPERATOR / MEMBER`, designed to collapse to owner/admin later | Maps 1:1 to the reference mesh (root admin + governor operators + edge members); no logic lost. |
| D3 | Visual identity | **Rebrand** — strip Academy/mage-tower chrome for a neutral enterprise skin | Console pages are re-hosted and re-themed, not linked back to Academy assets. |
| D4 | Naming | **Enterprise standard** — no `seal`, `tome`, `archon`, `sigil`, `schumann`, `familiar`, `cosmological` in the new surface | Full translation table in §4; reference-stack exception in §4.1. |
| D5 | Reference stack | **Python `protocol/` copied verbatim** from `BioChain_Enterprise/` | Renaming it would break its golden ABI/claim hashes; it stays as the pinned reference with a documented name-correspondence table. |

---

## 2. What is being migrated (architecture in four layers)

The system is not a monolith — it is four layers with a clean seam. Only Layer 3
carries any Owl Academy coupling, and that coupling is entirely *identity*, not
*domain logic*.

```
┌─ Layer 4  CONSOLE / UI ......... operator + member web pages (re-themed)
├─ Layer 3  BIOMESH SERVICES ..... grow · certify · transfer · rate · trace  (+ identity/keys it leans on)
├─ Layer 2  PROTOCOL CORE ........ SHD-CCP kernel · codex engine · engram shard · mesh · pump clock
└─ Layer 1  DATA / RULES ......... Firestore collections + security rules + project binding
```

| Layer | Owl Academy artifacts | Coupling to Academy | Migration effort |
|---|---|---|---|
| 1 — Data/Rules | `firestore.rules` (233 lines, ~80 are BioMesh) | Shared file with tomes/guilds/curriculum | **Rewrite clean** (done — see `firestore.rules`) |
| 2 — Protocol core | `BioChain-AI/BioChain_Enterprise/*.py` (5 modules) | **None** — pure stdlib, deterministic | **Copy verbatim** → `protocol/` |
| 3 — BioMesh services | `scripts/biomesh.js` + identity/key/crypto/epoch/identicon modules | Identity substrate only (names, not logic) | **Copy + rename + rewire imports** |
| 4 — Console/UI | `mage_tower/Biomesh_*.html` (5 files, ~3,800 lines) | Academy nav/theme/auth chrome | **Re-host + re-theme** |

**The reassurance:** the SHD-CCP wire format, engram crystallization, Merkle /
chiral commitments, GROWN certification, transfer lineage, and codex ABI are all
**mathematically pinned** and carry over bit-for-bit. The browser grow cell is
already verified byte-identical to the Python kernel (`crystallize(0..59) =
9841D88D8B003CEA` on both). Decoupling changes *names and hosting*, never the
protocol.

---

## 3. Target repository layout

```
BioChain-AI/
├── Index.html                      # existing landing (kept; relink to console)
├── login.html                      # NEW — auth entry point
├── firebase.json                   # ✅ staged — rules/indexes/emulator config
├── firestore.rules                 # ✅ staged — standalone enterprise rules
├── firestore.indexes.json          # ✅ staged — composite indexes
├── MIGRATION_PLAN.md               # ✅ this document
├── src/                            # ← was Owl Academy scripts/
│   ├── firebase/
│   │   ├── config.js               # ✅ staged — bound to biochain-ai
│   │   ├── auth.js                 # ✅ staged
│   │   └── firestore.js            # ✅ staged
│   ├── identity/                   # the decoupled identity substrate
│   │   ├── identity-registry.js    # ← spire-registrar.js
│   │   ├── access-control.js       # ← genesis-registrar.js
│   │   ├── signing-key.js          # ← minor-tome.js
│   │   ├── crypto-core.js          # ← seal-crypto.js
│   │   └── epoch-service.js        # ← schumann-oracle.js
│   ├── biomesh/
│   │   ├── biomesh.js              # ← scripts/biomesh.js
│   │   └── identicon.js            # ← sigil-renderer.js
│   └── ui/
│       ├── auth-guard.js           # ← scripts/auth-guard.js (redirect → /login.html)
│       └── node-network-bg.js      # ← scripts/ui/node-network-bg.js
├── console/                        # ← was mage_tower/
│   ├── Operations_Console.html     # ← Biomesh_Console.html
│   ├── Language_Studio.html        # ← Biomesh_Language_Growing.html
│   ├── Lattice_Forge.html          # ← Biomesh_Mind_Eye_3D.html
│   └── guides/
│       ├── Language_Studio_Guide.html   # ← Biomesh_Language_Growing_Guide.html
│       └── Lattice_Forge_Guide.html     # ← Biomesh_Mind_Eye_3D_Guide.html
├── protocol/                       # ← BioChain_Enterprise/ (verbatim reference)
│   ├── shdccp_kernel.py
│   ├── codex_engine.py
│   ├── biochain_mesh.py
│   ├── pump_clock.py
│   ├── engram_shard.py
│   └── README.md
└── Tutorials/
    ├── Tutorial_Explorer.html
    └── Migration/                  # the deployment scaffold (this migration, documented)
        ├── index.html
        ├── README.md
        └── 01..06-*.md
```

Legend: **✅ staged** = created in the current commit for review. Everything else
is specified here and executed in Phase 2–4.

---

## 4. Enterprise naming standard

The single most important artifact for review. Every esoteric term in the source
maps to a neutral, enterprise term in the target. Apply this table exactly when
porting Layer 3 and Layer 4.

### Identity & access

| Owl Academy (esoteric) | BioChain AI (enterprise) | Kind |
|---|---|---|
| Cosmological ID | **Identity ID** (`identityId`) | field |
| Ledger Seed | **Identity Seed** (`identitySeed`) | field |
| S.P.I.R.E. Registrar / `spire-registrar.js` | **Identity Registry** / `identity-registry.js` | module |
| `readRegistrar` / `computeCosmologicalId` | `readIdentity` / `computeIdentityId` | fn |
| Genesis Registrar / `genesis-registrar.js` | **Access Control** / `access-control.js` | module |
| Genesis Seed / Validation Certificate | **Role Certificate** | concept |
| Tier: `ARCHON` / `INSTRUCTOR` / `ACOLYTE` | Role: **`ADMIN` / `OPERATOR` / `MEMBER`** | enum |
| `GENESIS_MASTER_UIDS` | **`ROOT_ADMIN_UIDS`** | const |
| `resolveTier` / `stampPriority` | `resolveRole` / `contentPriority` | fn |
| priority `canonical/validated/experimental` | **`certified/reviewed/draft`** | enum |

### Signing & attestation

| Owl Academy | BioChain AI | Kind |
|---|---|---|
| Minor Tome / `minor-tome.js` | **Signing Key** / `signing-key.js` | module |
| Seal Crypto / `seal-crypto.js` | **Crypto Core** / `crypto-core.js` | module |
| Seal (a signed block) | **Attestation** | concept |
| `seals/{sealId}` registry | **`keyRegistry/{keyId}`** | collection |
| `users/{uid}/minorTomes/{sealId}` | **`users/{uid}/signingKeys/{keyId}`** | collection |
| `sealId` (`S-…`) / `sealVector` | `keyId` (`K-…`) / `keyVector` | field |
| `mintMinorTome` | `createSigningKey` | fn |
| `signWithMinorTome` / `verifySealBlock` | `signWithKey` / `verifyAttestation` | fn |
| `recallMinorTome` / `archiveMinorTome` | `revokeSigningKey` / `retireSigningKey` | fn |
| payload tag `SEAL/1` / format `owl-seal/1` | `ATTEST/1` / `attestation/1` | constant |
| Sigil / `sigil-renderer.js` / `renderSealSigil` | **Identicon** / `identicon.js` / `renderKeyIdenticon` | module/fn |

### Timing

| Owl Academy | BioChain AI | Kind |
|---|---|---|
| Schumann Oracle / `schumann-oracle.js` | **Epoch Service** / `epoch-service.js` | module |
| `getTick` / `computeTick` / `tick` | `getEpoch` / `computeEpoch` / `epoch` | fn/field |
| `tickToken` / `SCHU.<window>…` | `epochToken` / `EPOCH.<window>…` | field |

### BioMesh core & data

| Owl Academy | BioChain AI | Kind |
|---|---|---|
| `chronicles` | **`auditLog`** | collection |
| `biochainTransfers/{id}` | **`transfers/{id}`** | collection |
| `biochainRatings/{id}` | **`ratings/{id}`** | collection |
| `biomeshCodices/{hash}` | **`codices/{hash}`** | collection |
| `users/{uid}/registrar/main` | **`users/{uid}/identity/main`** | collection |
| Biostrata substrate | **Growth Substrate** | concept |
| Familiar | **Retrieval Agent** | concept |
| `pairSeal` | `pairAttestation` | field |
| transfer tag `BIOMESH-XFER/1` | **`TRANSFER/1`** | constant |
| `mage_tower/` | **`console/`** | directory |

**Kept intentionally** (domain-legitimate, not esoteric — do **not** rename):
`biochain`/`biochains`, `engram`/`engramStream`, `codex` (concept), `SHD-CCP`,
`Merkle root`, `chiral`/`holonomy`/`quaternion`, `pump`, `FLUX`/`CRYST`,
protocol commitment tags `GROWN/1` · `GROWTH/1` · `PAIR/1` · `CODEX/1`.

### 4.1 Reference-stack exception (D5)

`protocol/*.py` is copied **verbatim** and therefore still contains `seal`,
`Archon`, `CERT/2` internally. This is deliberate: those files emit **golden ABI
and claim hashes** used as the reproducibility anchor, and renaming their symbols
would change those hashes and break the self-tests (`8/8`, `11/11`, `11/11`,
`13/13`). They are the *reference*, not the live request path. The correspondence
is documented in `protocol/README.md` and the table above, so the enterprise
layer and the reference layer stay conceptually aligned. Revisit only if we ever
re-derive the reference stack from scratch.

---

## 5. Complete file manifest (source → target)

Every file that must move, with the transformation applied. This is the
"nothing left behind" ledger.

### Layer 1 — data & rules  *(status: ✅ staged)*

| Source (Owl Academy) | Target | Transform |
|---|---|---|
| `firestore.rules` (BioMesh + identity blocks only) | `firestore.rules` | Rewrite: drop tomes/majorTomes/artifacts/unlockRequests/tomeUnlocks/guilds/constellations; rename collections & role helpers per §4 |
| — | `firestore.indexes.json` | New: 1 composite index (`transfers` toUid+status) |
| — | `firebase.json` | New: rules/indexes/emulator config |
| `scripts/firebase/config.js` | `src/firebase/config.js` | Repoint to `biochain-ai` project |
| `scripts/firebase/auth.js` | `src/firebase/auth.js` | Verbatim |
| `scripts/firebase/firestore.js` | `src/firebase/firestore.js` | Verbatim |

### Layer 2 — protocol core  *(status: ⏭ Phase 2, verbatim copy)*

| Source | Target | Transform |
|---|---|---|
| `BioChain-AI/BioChain_Enterprise/shdccp_kernel.py` | `protocol/shdccp_kernel.py` | Verbatim |
| `…/codex_engine.py` | `protocol/codex_engine.py` | Verbatim |
| `…/biochain_mesh.py` | `protocol/biochain_mesh.py` | Verbatim |
| `…/pump_clock.py` | `protocol/pump_clock.py` | Verbatim |
| `…/engram_shard.py` | `protocol/engram_shard.py` | Verbatim |
| `…/README.md` | `protocol/README.md` | Verbatim + add name-correspondence note |

### Layer 3 — BioMesh services & identity  *(status: ⏭ Phase 3, rename + rewire)*

| Source | Target | Transform |
|---|---|---|
| `scripts/spire-registrar.js` | `src/identity/identity-registry.js` | Rename symbols/§4; drop `owlAcademy_codex` localStorage key → `biochain_identity` |
| `scripts/genesis-registrar.js` | `src/identity/access-control.js` | Roles ADMIN/OPERATOR/MEMBER; `ROOT_ADMIN_UIDS` (set the real admin UID); `resolveRole` |
| `scripts/seal-crypto.js` | `src/identity/crypto-core.js` | Rename `seal*`→`key*`/`attestation*`; keep ECDSA P-256 + SHD-CCP vector math intact |
| `scripts/minor-tome.js` | `src/identity/signing-key.js` | Rename fns/collections (`minorTomes`→`signingKeys`, `seals`→`keyRegistry`) |
| `scripts/schumann-oracle.js` | `src/identity/epoch-service.js` | `tick`→`epoch`; keep the NOAA-Kp math (or stub to a monotonic epoch — see note) |
| `scripts/biomesh.js` | `src/biomesh/biomesh.js` | Rewire imports to new module names/paths; rename collections per §4; `signWithMinorTome`→`signWithKey`; `resolveTier`→`resolveRole`; `chronicles`→`auditLog` |
| `scripts/sigil-renderer.js` | `src/biomesh/identicon.js` | Rename `renderSealSigil`→`renderKeyIdenticon` etc. |
| `scripts/auth-guard.js` | `src/ui/auth-guard.js` | Redirect target → `/login.html`; drop "Owl Academy" log strings |
| `scripts/ui/node-network-bg.js` | `src/ui/node-network-bg.js` | Verbatim (decorative) |

> **Epoch note:** `schumann-oracle.js` pulls the live NOAA planetary K-index to
> stamp a shared time window. It is Firebase-free and fully portable, but it is
> an *external network dependency*. Options for the standalone build: (a) keep it
> as-is; (b) keep the math but default to the local base when NOAA is
> unreachable (it already falls back); (c) replace with a pure monotonic epoch.
> Recommended: **(b)** — zero behavior change, no hard external dependency.

### Layer 4 — console/UI  *(status: ⏭ Phase 4, re-host + re-theme)*

| Source | Target | Transform |
|---|---|---|
| `mage_tower/Biomesh_Console.html` | `console/Operations_Console.html` | Rewire imports to `../src/**`; role gate `ARCHON`→`ADMIN`; re-theme; drop Academy nav |
| `mage_tower/Biomesh_Language_Growing.html` | `console/Language_Studio.html` | Same; "Familiar"→"Retrieval Agent" copy |
| `mage_tower/Biomesh_Mind_Eye_3D.html` | `console/Lattice_Forge.html` | Same; keep Three.js importmap; inline codec unchanged |
| `mage_tower/Biomesh_Language_Growing_Guide.html` | `console/guides/Language_Studio_Guide.html` | Copy edits per §4 |
| `mage_tower/Biomesh_Mind_Eye_3D_Guide.html` | `console/guides/Lattice_Forge_Guide.html` | Copy edits per §4 |
| — | `login.html` | New: Google sign-in + identity bootstrap (create `users/{uid}/identity/main`) |

**Explicitly NOT migrated** (Academy-only; stay in Owl Academy): `tomes`,
`majorTomes`, `artifacts`, `unlockRequests`, `tomeUnlocks`, `guilds`,
`constellations`; pages `Seal_Forge.html`, `Genesis_Forge.html`, `Registrar.html`,
`Instructor_Console.html`, `Unlock_Console.html`, `Store.html`, `Codex.html`,
`Familiars.html`, the whole `Library/`, `Proofs/`, `canon/`, curriculum. A
**Key Manager** page (to create/revoke `signingKeys`) is the one identity UI the
standalone build needs and is authored fresh in Phase 4, since Academy's
`Seal_Forge.html` is entangled with tome/curriculum flows.

---

## 6. Firestore collection map

| Owl Academy | BioChain AI | Rule posture (unchanged semantics) |
|---|---|---|
| `users/{uid}` | `users/{uid}` | owner-only |
| `users/{uid}/registrar/main` | `users/{uid}/identity/main` | write-once fingerprint; role appendable; immutable fields frozen |
| `users/{uid}/minorTomes/{sealId}` | `users/{uid}/signingKeys/{keyId}` | owner-only; no delete |
| `seals/{sealId}` | `keyRegistry/{keyId}` | public read; owner create; status-only update; no delete |
| `biochains/{chainId}` | `biochains/{chainId}` | grower==owner create; listing/pairing OR accepted-transfer update; no delete |
| `biochainTransfers/{id}` | `transfers/{id}` | owner create @ price 0; recipient resolve; no delete |
| `biomeshCodices/{hash}` | `codices/{hash}` | creator create; immutable |
| `biochainRatings/{id}` | `ratings/{id}` | one-per-user (doc-id enforced) |
| `chronicles` | `auditLog` | append-only; no client read |
| *tomes, majorTomes, artifacts, unlockRequests, tomeUnlocks, guilds, constellations* | **dropped** | Academy-only |

---

## 7. Dependency graph (target)

```
console/*.html
   └─ src/ui/auth-guard.js ─────────────┐
   └─ src/biomesh/biomesh.js            │
         ├─ src/firebase/firestore.js ──┤─→ src/firebase/config.js ─→ [biochain-ai]
         ├─ src/identity/identity-registry.js
         ├─ src/identity/epoch-service.js        (NOAA Kp, soft-fail)
         ├─ src/identity/signing-key.js
         │     └─ src/identity/crypto-core.js    (ECDSA P-256, pure)
         │     └─ src/identity/access-control.js (ROOT_ADMIN_UIDS, roles)
         └─ src/biomesh/identicon.js
protocol/*.py   (standalone; no browser coupling — the pinned reference)
```

No target module imports anything from Owl Academy. That absence **is** the
decoupling; the acceptance checklist verifies it mechanically.

---

## 8. Phased execution plan

| Phase | Scope | Gate to exit |
|---|---|---|
| **0 — Foundation** ✅ | Firebase infra + rules + config + this plan + scaffold docs | You review & approve naming (§4) and rules (`firestore.rules`) |
| **1 — Firebase project** | Enable Google auth + Firestore on `biochain-ai`; `firebase deploy --only firestore:rules,firestore:indexes`; test in emulator | Rules deploy clean; emulator smoke test passes |
| **2 — Protocol core** | Copy `protocol/*.py`; run the four self-tests | `8/8 · 11/11 · 11/11 · 13/13` all green; golden hashes match |
| **3 — Services & identity** | Port Layer 3 with §4 renames; unit-check pure fns (grow→recreate lossless; engram bit-identity) | Node headless test: `crystallize(0..59)=9841D88D8B003CEA`; grow/verify roundtrip lossless |
| **4 — Console/UI** | Re-host Layer 4; author `login.html` + Key Manager; re-theme | Sign in → create identity → create key → grow → certify → transfer → accept → rate, end to end on the live project |
| **5 — Hardening** | Add composite indexes as prompted; optional Cloud Function gate for server-side verify; docs pass | Acceptance checklist §9 fully ticked |

---

## 9. Acceptance checklist

Sign-off gate. "Everything accounted for" = every box ticked.

**Decoupling**
- [ ] `grep -ri "owl-academy\|owlAcademy\|mage_tower" src/ console/` returns nothing.
- [ ] No target file imports from `../scripts/` or any Owl Academy path.
- [ ] `src/firebase/config.js` points at `biochain-ai` and nothing else references a project id.
- [ ] Owl Academy repo is byte-unchanged (no commits to its working tree).

**Naming**
- [ ] `grep -ri "seal\|tome\|archon\|acolyte\|instructor\|sigil\|schumann\|cosmological\|familiar" src/ console/` returns only allowed domain terms (see §4 "kept"), and nothing in `protocol/` beyond the documented reference exception.
- [ ] Collections in `firestore.rules` match §6 exactly.

**Protocol integrity (the traceability + engram guarantee)**
- [ ] `python3 protocol/shdccp_kernel.py` → 8/8; golden ABI hash matches source.
- [ ] `python3 protocol/codex_engine.py` → 11/11.
- [ ] `python3 protocol/biochain_mesh.py` → 11/11.
- [ ] `python3 protocol/pump_clock.py` → 13/13.
- [ ] Browser grow cell: `crystallize(0..59) === "9841D88D8B003CEA"`.
- [ ] Engram bit-identity: token `"GEODESIC"` → `5c896a4801c9c24c`.
- [ ] Grow → `recreateText` roundtrip is lossless on a sample corpus.
- [ ] `verifyIntegrity` passes: parity → leaf → Merkle → chiral weave.

**End-to-end on the live `biochain-ai` project**
- [ ] Sign in → identity doc created at `users/{uid}/identity/main`.
- [ ] Create signing key → private key in `signingKeys/{keyId}`, public mirror in `keyRegistry/{keyId}`.
- [ ] Grow + certify (GROWN/1) → `verifyAttestation` traces to the identity.
- [ ] Free transfer (price 0) → recipient accept → ownership moves; rules reject a non-zero price and a non-recipient accept.
- [ ] Rate → success score computes; `auditLog` entries written; no client can read `auditLog`.
- [ ] Revoke a signing key → its attestations stop verifying everywhere.

**Deployment scaffold**
- [ ] `Tutorials/Migration/` walks a new engineer from empty repo to running platform.
- [ ] `README.md` orients a newcomer and links the plan + scaffold.

---

## 10. Risks & rollback

| Risk | Likelihood | Mitigation |
|---|---|---|
| Import-path breakage during Layer 3 rename | Med | The §5 manifest is exhaustive; port module-by-module and run the Node self-checks after each. |
| Missing composite index at runtime | Low | Firestore prints the exact index link; §11 pre-seeds the known one. |
| NOAA Kp dependency flaky | Low | Epoch service soft-fails to local base (option (b)). |
| Role gate lockout (no admin) | Med | Set `ROOT_ADMIN_UIDS` to your real Firebase UID **before** Phase 4; the master-UID path grants ADMIN even with no certificate. |
| Accidental writes to Owl Academy | Low | Work only in `BioChain-AI/`; the acceptance checklist verifies Owl Academy is unchanged. |

**Rollback:** the platform is greenfield in a repo that currently only serves a
static landing page. Any phase can be reverted by dropping its commit; nothing in
Owl Academy or the `biochain-ai` project depends on partial state. Firestore
rules can be rolled back via `firebase deploy` of the previous `firestore.rules`.

---

## 11. Appendix — required indexes & known queries

| Query (from `biomesh.js`) | Collection | Index |
|---|---|---|
| `listBiochains` — `orderBy(createdAt desc) limit` | `biochains` | single-field (auto) |
| `listIncoming` — `where toUid == && where status ==` | `transfers` | **composite** `toUid ASC, status ASC` (staged) |
| `listTransfersForChain` — `where chainId ==` | `transfers` | single-field (auto) |
| `listAllTransfers` — `orderBy(createdAt desc) limit` | `transfers` | single-field (auto) |
| `listRatings` — `where chainId ==` | `ratings` | single-field (auto) |

---

*Owl Academy stays exactly as it is. This plan only adds to `BioChain-AI/`.*
