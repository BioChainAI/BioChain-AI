# Chapter 04 — Protocol Core & BioMesh Services

**Goal:** the SHD-CCP protocol core copied and self-verified, and the
grow/certify/transfer/rate service (`biomesh.js`) rewired onto the new substrate.

## 4.1 Copy the protocol core (verbatim)

This is the traceability + engram engine. It moves without modification.

```bash
mkdir -p protocol
cp ../Owl-Academy/BioChain-AI/BioChain_Enterprise/shdccp_kernel.py  protocol/
cp ../Owl-Academy/BioChain-AI/BioChain_Enterprise/codex_engine.py   protocol/
cp ../Owl-Academy/BioChain-AI/BioChain_Enterprise/biochain_mesh.py  protocol/
cp ../Owl-Academy/BioChain-AI/BioChain_Enterprise/pump_clock.py     protocol/
cp ../Owl-Academy/BioChain-AI/BioChain_Enterprise/engram_shard.py   protocol/
cp ../Owl-Academy/BioChain-AI/BioChain_Enterprise/README.md         protocol/
```

Then prove it (no dependencies, pure stdlib):

```bash
cd protocol
python3 shdccp_kernel.py     # → 8/8 checks,  golden ABI hash printed
python3 codex_engine.py      # → 11/11 checks
python3 biochain_mesh.py     # → 11/11 checks (~3s)
python3 pump_clock.py        # → 13/13 checks
cd ..
```

If all four pass, the entire SHD-CCP protocol, codex VM, mesh economy, and pump
timing are present and correct in the standalone repo. **This single step is the
whole "maintains the traceability + engram system" requirement, proven.**

> Reference-stack exception: these files keep `seal`/`Archon`/`CERT` internally
> (Chapter 02). Note the correspondence in `protocol/README.md`; do not rename —
> it would change the golden hashes.

## 4.2 Port the BioMesh service (`biomesh.js`)

`scripts/biomesh.js` → `src/biomesh/biomesh.js`. This is the largest single port
(~700 lines), but the transformation is mechanical:

1. **Rewire imports** to the new layout:
   ```js
   import { getDocument, setDocument, updateDocument, addToCollection,
            queryCollection, where, orderBy, limit } from "../firebase/firestore.js";
   import { readIdentity }              from "../identity/identity-registry.js";
   import { getEpoch }                  from "../identity/epoch-service.js";
   import { signWithKey, verifyAttestation } from "../identity/signing-key.js";
   import * as CC                        from "../identity/crypto-core.js";
   ```
2. **Rename collections** per Chapter 02: `biochainTransfers`→`transfers`,
   `biomeshCodices`→`codices`, `biochainRatings`→`ratings`,
   `chronicles`→`auditLog`.
3. **Rename calls**: `signWithMinorTome`→`signWithKey`,
   `verifySealBlock`→`verifyAttestation`, `resolveTier`→`resolveRole`,
   `readRegistrar`→`readIdentity`, `getTick`→`getEpoch`.
4. **Rename fields on written docs**: `pairSeal`→`pairAttestation`,
   `raterTier`→`raterRole`, `ownerGenesisId`→`ownerIdentityId`,
   `sealId`→`keyId` where it refers to the signing key.
5. **Transfer tag**: `BIOMESH-XFER/1`→`TRANSFER/1`. Keep `GROWN/1`, `GROWTH/1`,
   `PAIR/1`, `CODEX/1` (protocol constants — do not rename).

The **pure** functions (`growBiochain`, `recreateText`, `verifyIntegrity`,
`engramStreamFromText`, `parseBiochainStream`, `successScore`, …) need only the
import/collection edits — their math is untouched, which is why the bit-identity
proofs in Chapter 05 still hold.

## 4.3 Port the identicon renderer

`scripts/sigil-renderer.js` → `src/biomesh/identicon.js`. Rename
`renderSealSigil`→`renderKeyIdenticon`, `sealManifoldFromVector`→
`identiconManifold`. It renders a unique SVG per signing key (keyed by `keyId` /
`keyVector`) — the visual fingerprint used in the console and Language Studio.

## 4.4 Rating weight after the role rename

`successScore` weights stars by role. Keep the semantics, new names:

```
ADMIN ×3 · OPERATOR ×2 · MEMBER ×1   (was Archon/Instructor/Acolyte)
```

Automatic components (measured compression value, verified integrity) are
recomputed from the record and remain uncheatable; social stars stay capped at
half the score.

## Exit gate

- [ ] `protocol/` present; all four self-tests green; golden ABI hash matches source.
- [ ] `src/biomesh/biomesh.js` imports only from `../firebase/**` and `../identity/**`.
- [ ] No `biochainTransfers` / `biomeshCodices` / `chronicles` / `signWithMinorTome` / `resolveTier` left in `src/`.
- [ ] `identicon.js` ported.

→ Continue to [Chapter 05 — Security rules & verification](05-rules-and-verification.md).
