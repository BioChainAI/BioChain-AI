// signing-key.js against an in-memory Firebase stand-in: key creation, status
// changes (registry first, in one batch; only from active), and attestation
// verification with the strict signature form.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { sdk } from "./support/env.mjs";

const SK = await import("../../src/identity/signing-key.js");
const UID = "U1";

beforeEach(() => {
  sdk.reset();
  sdk.store.set(`users/${UID}/identity/main`, { identityId: "0x0D450E41BC04837A", geoVector: "3C29AEAE666615A2" });
});

async function newKey() {
  const k = await SK.createSigningKey(UID, {}, "test key");
  sdk.writes.length = 0;
  return k;
}

test("createSigningKey writes the owner record, the registry entry and an audit entry", async () => {
  const k = await SK.createSigningKey(UID, {}, "test key");
  assert.match(k.keyId, /^K-[0-9a-f]{24}$/);
  const own = sdk.store.get(`users/${UID}/signingKeys/${k.keyId}`);
  const reg = sdk.store.get(`keyRegistry/${k.keyId}`);
  assert.equal(own.status, "active");
  assert.equal(own.ownerUid, UID);
  assert.equal(own.keyId, k.keyId);
  assert.ok(own.privateJwk && own.privateJwk.d);
  assert.equal(reg.status, "active");
  assert.equal("privateJwk" in reg, false);
  const audit = sdk.writes.find((w) => w.op === "add" && w.path.startsWith("auditLog/"));
  assert.equal(audit.data.kind, "signing-key.create");
  assert.equal(audit.data.uid, UID);
});

test("revoke writes the registry first, in one batch with the owner record", async () => {
  const k = await newKey();
  await SK.revokeSigningKey(UID, k.keyId);
  const batch = sdk.writes.filter((w) => w.op === "batch");
  assert.equal(batch.length, 1);
  assert.deepEqual(batch[0].ops.map((o) => o.path), [`keyRegistry/${k.keyId}`, `users/${UID}/signingKeys/${k.keyId}`]);
  assert.equal(batch[0].ops[0].data.status, "revoked");
  assert.match(batch[0].ops[0].data.revokedEpoch, /^EPOCH\.\d+$/);
  assert.deepEqual(Object.keys(batch[0].ops[1].data).sort(), ["status", "updatedAt"]);
  assert.equal(sdk.writes.some((w) => w.op === "update"), false, "no unbatched status write");
  assert.equal(sdk.store.get(`keyRegistry/${k.keyId}`).status, "revoked");
  assert.equal(sdk.store.get(`users/${UID}/signingKeys/${k.keyId}`).status, "revoked");
  const audit = sdk.writes.find((w) => w.op === "add");
  assert.deepEqual([audit.data.kind, audit.data.uid], ["signing-key.revoked", UID]);
});

test("a key that is not active cannot change status, and nothing is written", async () => {
  const k = await newKey();
  await SK.revokeSigningKey(UID, k.keyId);
  sdk.writes.length = 0;
  await assert.rejects(SK.retireSigningKey(UID, k.keyId), /is revoked; only an active key/);
  await assert.rejects(SK.revokeSigningKey(UID, k.keyId), /is revoked; only an active key/);
  assert.deepEqual(sdk.writes, []);
});

test("an unknown key or another owner's key is refused", async () => {
  const k = await newKey();
  await assert.rejects(SK.revokeSigningKey(UID, "K-000000000000000000000000"), /not found/);
  await assert.rejects(SK.revokeSigningKey("U2", k.keyId), /not found/);
  assert.deepEqual(sdk.writes, []);
});

test("an owner record already non-active is left as is; the registry is still updated", async () => {
  const k = await newKey();
  sdk.store.set(`users/${UID}/signingKeys/${k.keyId}`, { ...sdk.store.get(`users/${UID}/signingKeys/${k.keyId}`), status: "revoked" });
  await SK.retireSigningKey(UID, k.keyId);
  const batch = sdk.writes.find((w) => w.op === "batch");
  assert.deepEqual(batch.ops.map((o) => o.path), [`keyRegistry/${k.keyId}`]);
  assert.equal(sdk.store.get(`keyRegistry/${k.keyId}`).status, "retired");
});

test("attestations verify while the key is active and only in the strict signature form", async () => {
  const k = await newKey();
  const block = await SK.signWithKey(UID, k.keyId, "some content");
  assert.match(block.sig, /^[0-9a-f]{128}$/);
  assert.equal((await SK.verifyAttestation(block)).valid, true);
  assert.equal((await SK.verifyAttestationAgainstContent(block, "some content")).valid, true);
  assert.equal((await SK.verifyAttestationAgainstContent(block, "other content")).valid, false);
  assert.equal((await SK.verifyAttestation({ ...block, sig: block.sig.toUpperCase() })).valid, false);
  assert.equal((await SK.verifyAttestation({ ...block, sig: block.sig + "zz" })).valid, false);
  await SK.revokeSigningKey(UID, k.keyId);
  const after = await SK.verifyAttestation(block);
  assert.equal(after.valid, false);
  assert.equal(after.status, "revoked");
});
