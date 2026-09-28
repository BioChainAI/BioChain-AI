// Firestore security-rules tests — run against the local emulator.
//
//   cd tests/rules && npm install
//   npx firebase emulators:exec --only firestore --project biochain-rules-test "node rules.test.mjs"
//
// Covers: single-use sequenced transfers (no ownership replay), no self-granted
// roles, one-way key revocation, and rater roles checked against real grants.
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { readFileSync } from "node:fs";

const env = await initializeTestEnvironment({
  projectId: "biochain-rules-test",
  firestore: { rules: readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8"), host: "127.0.0.1", port: 8080 },
});
let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); pass++; console.log("  ✓", name); }
  catch (e) { fail++; console.log("  ✗", name, "—", e.message.split("\n")[0]); }
}
const db = (uid) => env.authenticatedContext(uid).firestore();
const ts = "2026-01-01T00:00:00Z";

await env.withSecurityRulesDisabled(async (c) => {
  const f = c.firestore();
  await setDoc(doc(f, "config/rootAdmins"), { uids: ["root"] });
  await setDoc(doc(f, "biochains/C1"), { growerUid: "A", ownerUid: "A", lineage: [], lastTransferId: null, status: "grown" });
  await setDoc(doc(f, "keyRegistry/KA"), { keyId: "KA", ownerUid: "A", status: "active", role: "MEMBER" });
});

console.log("Item 1 — ownership replay");
const A = db("A"), B = db("B"), C = db("C");
await t("A→B send at seq 0", () => assertSucceeds(setDoc(doc(A, "transfers/T1"), { chainId: "C1", fromUid: "A", toUid: "B", status: "pending", price: 0, chainSeq: 0 })));
await t("send with wrong chainSeq denied", () => assertFails(setDoc(doc(A, "transfers/Tx"), { chainId: "C1", fromUid: "A", toUid: "B", status: "pending", price: 0, chainSeq: 7 })));
await t("send without chainSeq denied", () => assertFails(setDoc(doc(A, "transfers/Ty"), { chainId: "C1", fromUid: "A", toUid: "B", status: "pending", price: 0 })));
await t("B accepts T1", () => assertSucceeds(updateDoc(doc(B, "transfers/T1"), { status: "accepted" })));
await t("B takes ownership without advancing seq denied", () => assertFails(updateDoc(doc(B, "biochains/C1"), { ownerUid: "B", lastTransferId: "T1" })));
await t("B takes ownership (seq 0→1)", () => assertSucceeds(updateDoc(doc(B, "biochains/C1"), { ownerUid: "B", lastTransferId: "T1", transferSeq: 1 })));
await t("B→C send at seq 1", () => assertSucceeds(setDoc(doc(B, "transfers/T2"), { chainId: "C1", fromUid: "B", toUid: "C", status: "pending", price: 0, chainSeq: 1 })));
await t("C accepts T2", () => assertSucceeds(updateDoc(doc(C, "transfers/T2"), { status: "accepted" })));
await t("C takes ownership (seq 1→2)", () => assertSucceeds(updateDoc(doc(C, "biochains/C1"), { ownerUid: "C", lastTransferId: "T2", transferSeq: 2 })));
await t("ATTACK: B replays old T1 to reclaim", () => assertFails(updateDoc(doc(B, "biochains/C1"), { ownerUid: "B", lastTransferId: "T1", transferSeq: 3 })));
await t("ATTACK: B replays T1 with seq 1", () => assertFails(updateDoc(doc(B, "biochains/C1"), { ownerUid: "B", lastTransferId: "T1", transferSeq: 1 })));
// round trip: C→A, then A→... B tries T1 again (fromUid A == owner A)
await t("C→A send at seq 2", () => assertSucceeds(setDoc(doc(C, "transfers/T3"), { chainId: "C1", fromUid: "C", toUid: "A", status: "pending", price: 0, chainSeq: 2 })));
await t("A accepts T3", () => assertSucceeds(updateDoc(doc(A, "transfers/T3"), { status: "accepted" })));
await t("A takes ownership (seq 2→3)", () => assertSucceeds(updateDoc(doc(A, "biochains/C1"), { ownerUid: "A", lastTransferId: "T3", transferSeq: 3 })));
await t("ATTACK: B replays T1 (sender A is owner again)", () => assertFails(updateDoc(doc(B, "biochains/C1"), { ownerUid: "B", lastTransferId: "T1", transferSeq: 4 })));
await t("owner cannot bump transferSeq directly", () => assertFails(updateDoc(doc(A, "biochains/C1"), { transferSeq: 9 })));
await t("create chain with nonzero transferSeq denied", () => assertFails(setDoc(doc(A, "biochains/C2"), { growerUid: "A", ownerUid: "A", transferSeq: 5 })));
await t("create chain normally", () => assertSucceeds(setDoc(doc(A, "biochains/C2"), { growerUid: "A", ownerUid: "A", transferSeq: 0 })));

console.log("Item 2 — self-granted roles");
const M = db("M");
await t("ATTACK: identity created with role ADMIN", () => assertFails(setDoc(doc(M, "users/M/identity/main"), { identityId: "0x1", identitySeed: "s", geoVector: "g", role: "ADMIN" })));
await t("ATTACK: identity created with certificate", () => assertFails(setDoc(doc(M, "users/M/identity/main"), { identityId: "0x1", identitySeed: "s", geoVector: "g", certificate: { role: "ADMIN" } })));
await t("identity created without role", () => assertSucceeds(setDoc(doc(M, "users/M/identity/main"), { identityId: "0x1", identitySeed: "s", geoVector: "g" })));
await t("ATTACK: role added to identity later", () => assertFails(updateDoc(doc(M, "users/M/identity/main"), { role: "ADMIN" })));
await t("ATTACK: member writes own roleGrant", () => assertFails(setDoc(doc(M, "roleGrants/M"), { subjectUid: "M", role: "ADMIN", grantedByUid: "M" })));
await t("ATTACK: member writes config/rootAdmins", () => assertFails(setDoc(doc(M, "config/rootAdmins"), { uids: ["M"] })));
await t("ATTACK: member reads another identity", () => assertFails(getDoc(doc(db("B"), "users/M/identity/main"))));
const R = db("root");
await t("root admin grants OPERATOR", () => assertSucceeds(setDoc(doc(R, "roleGrants/O"), { subjectUid: "O", role: "OPERATOR", grantedByUid: "root" })));
await t("root admin grants ADMIN to G", () => assertSucceeds(setDoc(doc(R, "roleGrants/G"), { subjectUid: "G", role: "ADMIN", grantedByUid: "root" })));
await t("granted admin G can grant", () => assertSucceeds(setDoc(doc(db("G"), "roleGrants/X"), { subjectUid: "X", role: "OPERATOR", grantedByUid: "G" })));
await t("ATTACK: OPERATOR promotes self to ADMIN", () => assertFails(setDoc(doc(db("O"), "roleGrants/O"), { subjectUid: "O", role: "ADMIN", grantedByUid: "O" })));
await t("ATTACK: admin forges grantedByUid", () => assertFails(setDoc(doc(R, "roleGrants/Y"), { subjectUid: "Y", role: "OPERATOR", grantedByUid: "G" })));
await t("grant with bogus role denied", () => assertFails(setDoc(doc(R, "roleGrants/Y"), { subjectUid: "Y", role: "GOD", grantedByUid: "root" })));
await t("admin reads another identity", () => assertSucceeds(getDoc(doc(R, "users/M/identity/main"))));

console.log("Item 3 — revocation is one-way");
await t("owner revokes active key", () => assertSucceeds(updateDoc(doc(A, "keyRegistry/KA"), { status: "revoked", revokedEpoch: "EPOCH.1" })));
await t("ATTACK: owner reactivates revoked key", () => assertFails(updateDoc(doc(A, "keyRegistry/KA"), { status: "active" })));
await t("ATTACK: revoked → retired", () => assertFails(updateDoc(doc(A, "keyRegistry/KA"), { status: "retired" })));
await t("create key born revoked denied", () => assertFails(setDoc(doc(A, "keyRegistry/KB"), { keyId: "KB", ownerUid: "A", status: "revoked", role: "MEMBER" })));
await t("ATTACK: member mints key stamped ADMIN", () => assertFails(setDoc(doc(A, "keyRegistry/KC"), { keyId: "KC", ownerUid: "A", status: "active", role: "ADMIN" })));
await t("member mints MEMBER key", () => assertSucceeds(setDoc(doc(A, "keyRegistry/KD"), { keyId: "KD", ownerUid: "A", status: "active", role: "MEMBER" })));
await t("operator mints OPERATOR key", () => assertSucceeds(setDoc(doc(db("O"), "keyRegistry/KO"), { keyId: "KO", ownerUid: "O", status: "active", role: "OPERATOR" })));
await t("ATTACK: set bogus status on active key", () => assertFails(updateDoc(doc(A, "keyRegistry/KD"), { status: "active-ish" })));

console.log("Item 4 — rater role must be real");
await t("ATTACK: member rates claiming ADMIN", () => assertFails(setDoc(doc(M, "ratings/C1_M"), { chainId: "C1", raterUid: "M", raterRole: "ADMIN", stars: 5 })));
await t("member rates as MEMBER", () => assertSucceeds(setDoc(doc(M, "ratings/C1_M"), { chainId: "C1", raterUid: "M", raterRole: "MEMBER", stars: 5 })));
await t("ATTACK: member upgrades role on update", () => assertFails(updateDoc(doc(M, "ratings/C1_M"), { raterRole: "ADMIN" })));
await t("ATTACK: rating moved to another chain", () => assertFails(updateDoc(doc(M, "ratings/C1_M"), { chainId: "C2" })));
await t("member edits stars", () => assertSucceeds(updateDoc(doc(M, "ratings/C1_M"), { stars: 3 })));
await t("operator rates as OPERATOR", () => assertSucceeds(setDoc(doc(db("O"), "ratings/C1_O"), { chainId: "C1", raterUid: "O", raterRole: "OPERATOR", stars: 4 })));
await t("root rates as ADMIN", () => assertSucceeds(setDoc(doc(R, "ratings/C1_root"), { chainId: "C1", raterUid: "root", raterRole: "ADMIN", stars: 4 })));

await env.cleanup();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
