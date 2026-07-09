# Chapter 03 — Firebase Project & Identity Substrate

**Goal:** a live `biochain-ai` Firebase project with rules deployed, and the
identity/signing-key substrate ported and wired to it.

## 3.1 Provision the project

The project config is already committed at `src/firebase/config.js`:

```js
projectId: "biochain-ai",
authDomain: "biochain-ai.firebaseapp.com",
// …supplied keys…
```

In the Firebase console for **biochain-ai**:

1. **Authentication → Sign-in method →** enable **Google**. Add your deploy
   domains to *Authorized domains* (the GitHub Pages host, plus `localhost` for
   local testing).
2. **Firestore Database →** create the database (production mode — the rules in
   this repo are the gate).

## 3.2 Install tooling & deploy rules

```bash
npm install -g firebase-tools      # once
firebase login
firebase use biochain-ai           # or: firebase use --add

# Deploy the staged rules + indexes (already in the repo root)
firebase deploy --only firestore:rules,firestore:indexes
```

`firebase.json` already points at `firestore.rules` and `firestore.indexes.json`.
The composite index for `transfers (toUid, status)` deploys with it.

## 3.3 Set the bootstrap admin

Before porting `access-control.js`, decide who is ADMIN. In the ported
`src/identity/access-control.js`, set:

```js
export const ROOT_ADMIN_UIDS = [
  "<YOUR_FIREBASE_UID>",   // resolves to ADMIN even with no certificate
];
```

Find your UID in **Firebase console → Authentication → Users** after your first
sign-in. This is the lockout safety valve called out in the plan's risk table.

## 3.4 Port the identity substrate

Port these five modules using the Chapter 02 table. They are self-contained ES
modules; port in this dependency order and they slot together:

| Order | Source | Target | Notes |
|---|---|---|---|
| 1 | `seal-crypto.js` | `src/identity/crypto-core.js` | Pure ECDSA P-256 + SHD-CCP vector math. Rename `seal*`→`key*`/`attestation*`. **Do not touch the math.** |
| 2 | `schumann-oracle.js` | `src/identity/epoch-service.js` | `tick`→`epoch`. Keep NOAA-Kp math with its existing soft-fail to local base. |
| 3 | `spire-registrar.js` | `src/identity/identity-registry.js` | Cosmological ID → Identity ID. Change localStorage key `owlAcademy_codex` → `biochain_identity`. |
| 4 | `genesis-registrar.js` | `src/identity/access-control.js` | Roles ADMIN/OPERATOR/MEMBER; `ROOT_ADMIN_UIDS`; `resolveRole`; priority `certified/reviewed/draft`. |
| 5 | `minor-tome.js` | `src/identity/signing-key.js` | Collections `minorTomes`→`signingKeys`, `seals`→`keyRegistry`; fns per Chapter 02. |

### What each one does (so you can sanity-check the port)

- **crypto-core** — generates ECDSA P-256 keypairs, signs/verifies payloads,
  derives the geometric `keyVector` (`SHD-CCP(identityId ‖ params ‖ epoch)`),
  computes `keyId = "K-" + sha256(pub.x|pub.y)[:24]`. Firebase-free → unit-test
  it in Node.
- **epoch-service** — turns a timestamp (+ optional NOAA Kp) into a shared
  `epochToken` so keys minted in the same window share a cohort. Firebase-free.
- **identity-registry** — derives the immutable **Identity ID** from an identity
  seed via SHD-CCP 4×4×4 compression XOR'd with the uid hash; writes
  `users/{uid}/identity/main`.
- **access-control** — HMAC role certificates; `resolveRole(uid)` →
  ADMIN/OPERATOR/MEMBER; `ROOT_ADMIN_UIDS` self-validate as ADMIN.
- **signing-key** — `createSigningKey` writes the private key to
  `users/{uid}/signingKeys/{keyId}` and mirrors the public key to
  `keyRegistry/{keyId}`; `signWithKey`/`verifyAttestation` produce and check
  attestation blocks; revoke/retire flip status so every attestation a key signed
  stops verifying at once.

## 3.5 Smoke test the substrate (headless)

`crypto-core` and `epoch-service` are Firebase-free, so prove them in Node before
wiring anything to Firestore:

```bash
node --input-type=module -e '
import * as CC from "./src/identity/crypto-core.js";
const kp = await CC.generateKeypair();
const id = await CC.keyIdFromPublic(kp.publicJwk);
const sig = await CC.signPayload(kp.privateJwk, "hello");
console.log("keyId", id, "verify", await CC.verifyPayload(kp.publicJwk, "hello", sig));
'
# → keyId K-… verify true
```

## Exit gate

- [ ] Google auth + Firestore enabled on `biochain-ai`.
- [ ] `firebase deploy --only firestore:rules,firestore:indexes` succeeded.
- [ ] `ROOT_ADMIN_UIDS` contains your real UID.
- [ ] Five identity modules ported; crypto-core smoke test prints `verify true`.

→ Continue to [Chapter 04 — Protocol core & BioMesh services](04-protocol-and-biomesh.md).
