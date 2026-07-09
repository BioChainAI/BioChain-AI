# Chapter 02 — The Naming Standard

**Goal:** turn "rebrand the system" into a mechanical, auditable find/replace. By
the end you can port any Layer 3/4 file by applying one table.

The authoritative table lives in [`MIGRATION_PLAN.md` §4](../../MIGRATION_PLAN.md#4-enterprise-naming-standard).
This chapter is the *operational* version: how to apply it and how to verify it.

## The rule of thumb

Replace anything that sounds like a fantasy guild; keep anything that is a real
technical or domain term.

- **Replace:** seal, tome, archon, instructor, acolyte, sigil, schumann,
  cosmological, familiar, biostrata, mage_tower.
- **Keep:** biochain, engram, codex, SHD-CCP, Merkle, chiral, holonomy,
  quaternion, pump, FLUX, CRYST.

## The map (condensed)

| Domain | Esoteric → Enterprise |
|---|---|
| Identity | Cosmological ID → **Identity ID**; Ledger Seed → **Identity Seed**; spire-registrar → **identity-registry**; genesis-registrar → **access-control** |
| Roles | ARCHON/INSTRUCTOR/ACOLYTE → **ADMIN/OPERATOR/MEMBER**; GENESIS_MASTER_UIDS → **ROOT_ADMIN_UIDS**; resolveTier → **resolveRole** |
| Signing | Minor Tome → **Signing Key**; Seal → **Attestation**; seal-crypto → **crypto-core**; sealId `S-…` → keyId `K-…`; signWithMinorTome → **signWithKey**; verifySealBlock → **verifyAttestation** |
| Registry | `seals/` → **`keyRegistry/`**; `users/{uid}/minorTomes/` → **`users/{uid}/signingKeys/`** |
| Visual | Sigil → **Identicon**; renderSealSigil → **renderKeyIdenticon** |
| Timing | Schumann Oracle → **Epoch Service**; tick → **epoch**; tickToken → **epochToken** |
| Data | `chronicles` → **`auditLog`**; `biochainTransfers` → **`transfers`**; `biochainRatings` → **`ratings`**; `biomeshCodices` → **`codices`**; `registrar/main` → **`identity/main`** |
| Concepts | Biostrata → **Growth Substrate**; Familiar → **Retrieval Agent**; `mage_tower/` → **`console/`** |

## Applying it to a file

Port module-by-module. For each source file:

1. Copy to its target path (see the manifest in the plan, §5).
2. Apply the identifier renames (symbols, collection strings, payload tags).
3. Rewrite import paths for the new `src/` layout.
4. Rerun the file's self-check (Chapters 04–05) before moving to the next.

Example — porting `minor-tome.js` → `src/identity/signing-key.js`:

```
mintMinorTome        → createSigningKey
signWithMinorTome    → signWithKey
verifySealBlock      → verifyAttestation
recallMinorTome      → revokeSigningKey
"users/${uid}/minorTomes/${sealId}"  → "users/${uid}/signingKeys/${keyId}"
"seals/${sealId}"                    → "keyRegistry/${keyId}"
payload tag "SEAL/1"                 → "ATTEST/1"
import ... "./spire-registrar.js"    → "./identity-registry.js"
import ... "./genesis-registrar.js"  → "./access-control.js"
import ... "./schumann-oracle.js"    → "./epoch-service.js"
```

## The reference-stack exception

Do **not** rename inside `protocol/*.py`. Those modules emit golden ABI/claim
hashes used as the reproducibility anchor; renaming their symbols would change
the hashes and break the self-tests. They keep `seal`/`Archon`/`CERT` internally,
by design, and the correspondence is documented in `protocol/README.md`. This is
the one place esoteric names are allowed to remain — because it is the *reference*,
not the live path.

## Verify

```bash
# Should return ONLY allowed domain terms (biochain, engram, codex, chiral…)
grep -rniE 'seal|tome|archon|acolyte|instructor|sigil|schumann|cosmological|familiar' src/ console/

# Should return nothing at all
grep -rniE 'owl-academy|owlAcademy|mage_tower' src/ console/
```

## Exit gate

- [ ] You can port a file using only the table (no guessing).
- [ ] Both `grep` audits above return clean (allowed terms only / nothing).
- [ ] You understand why `protocol/` is exempt.

→ Continue to [Chapter 03 — Firebase project & identity substrate](03-firebase-and-identity.md).
