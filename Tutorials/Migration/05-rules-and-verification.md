# Chapter 05 — Security Rules & Verification

**Goal:** prove the rules enforce the trust model, and prove the protocol
integrity survived the move — bit-for-bit. This chapter is where "everything
accounted for" becomes evidence, not assertion.

## 5.1 The rules, in one breath

`firestore.rules` (repo root) is already the standalone enterprise version. It
pins exactly what Owl Academy pinned, minus the curriculum:

- **Identity** (`users/{uid}/identity/main`): write-once; `identityId`,
  `identitySeed`, `geoVector` frozen forever; role appendable.
- **Signing keys** (`users/{uid}/signingKeys/{keyId}`): owner-only; no delete.
- **Key registry** (`keyRegistry/{keyId}`): public read; owner create; status-only
  update (revoke/retire); no delete.
- **biochains**: grower==owner on create; owner may edit only listing/pairing;
  ownership moves **only** to the caller and **only** with an accepted `transfers`
  doc for that exact chain (joined server-side via `get()`); never deletable.
- **transfers**: creatable only by the current owner at `price == 0`; resolvable
  only by the addressed recipient; append-only.
- **codices**: creator-create, immutable.
- **ratings**: one per user per chain (doc-id enforced).
- **auditLog**: append-only; no client reads.

## 5.2 Prove the rules in the emulator

```bash
firebase emulators:start --only firestore,auth
```

Exercise these cases (via the console UI once it's up, or a small script). Each
**must** behave as marked:

| Attempt | Expected |
|---|---|
| Signed-in user grows a biochain with `growerUid == uid == ownerUid` | ✅ allowed |
| Create a transfer with `price > 0` | ❌ denied (free-only) |
| Create a transfer for a chain you don't own | ❌ denied |
| A non-recipient tries to accept a transfer | ❌ denied |
| Recipient accepts, then updates the chain's `ownerUid` to themselves with `lastTransferId` = that accepted transfer | ✅ allowed |
| Move ownership without an accepted transfer | ❌ denied |
| Delete any biochain / transfer / rating | ❌ denied |
| Read another user's `signingKeys` | ❌ denied |
| Read `auditLog` from a client | ❌ denied |
| Second rating by same user on same chain (different doc id) | ❌ denied (doc-id rule) |

## 5.3 Prove protocol integrity (the traceability + engram guarantee)

These are the proofs that the SHD-CCP core is intact after the move. Run them and
compare to the pinned constants.

**Python reference (from Chapter 04):**

```bash
cd protocol
python3 shdccp_kernel.py   # 8/8  + golden ABI hash == source
python3 codex_engine.py    # 11/11
python3 biochain_mesh.py   # 11/11
python3 pump_clock.py      # 13/13
cd ..
```

**Browser ↔ kernel bit-identity** — the claim that a node and a browser read the
same wire format. In a page that imports the ported `biomesh.js`:

```js
// crystallize(0..59) must equal the kernel's golden word
console.assert(BM.crystallizeGolden() === "9841D88D8B003CEA");
// engram token bit-identity with the reference
console.assert(BM.engramHex("GEODESIC") === "5c896a4801c9c24c");
```

**Lossless roundtrip** — grow then recreate must be byte-exact, and the integrity
verifier must pass every layer:

```js
const chain = await BM.growBiochain(sampleText);
console.assert(BM.recreateText(chain) === sampleText);           // lossless
const v = await BM.verifyIntegrity(chain);
console.assert(v.ok);   // parity → leaf → Merkle root → chiral weave
```

**Certification & lineage** — end to end on the live project (Chapter 06 stands
up the UI to drive this):

- Publish → `GROWN/1` attestation signed with a signing key →
  `verifyAttestation` traces back to the identity in `keyRegistry`.
- `revokeSigningKey` → the same attestation now fails verification everywhere.
- `traceBiochain(chainId)` replays certification + every transfer hop +
  full client-side recreation.

## 5.4 Decoupling audit

```bash
grep -rniE 'owl-academy|owlAcademy|mage_tower' src/ console/    # → nothing
grep -rn  '\.\./scripts/' src/ console/                        # → nothing
grep -rniE 'seal|tome|archon|acolyte|instructor|sigil|schumann|cosmological|familiar' src/ console/
# → only allowed domain terms; protocol/ is exempt (documented)
```

## Exit gate

- [ ] All emulator rule cases behave exactly as tabled.
- [ ] Four Python self-tests green; golden ABI hash matches source.
- [ ] `crystallize`/engram bit-identity + lossless roundtrip + `verifyIntegrity` pass in-browser.
- [ ] Decoupling audit is clean.

→ Continue to [Chapter 06 — Console, login & reuse](06-console-and-reuse.md).
