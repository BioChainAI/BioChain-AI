// identity-registry.js against an in-memory Firebase stand-in: what a new
// identity writes (no seed, in Firestore or localStorage), forgetSeed, and the
// re-exports from crypto-core.js.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { sdk } from "./support/env.mjs";

const IR = await import("../../src/identity/identity-registry.js");
const C = await import("../../src/identity/crypto-core.js");
const PATH = (uid) => `users/${uid}/identity/main`;

beforeEach(() => { sdk.reset(); localStorage.clear(); });

test("identity-registry re-exports the derivation from crypto-core (same objects)", () => {
  assert.equal(IR.computeIdentityId, C.computeIdentityId);
  assert.equal(IR.computeGeoVector, C.computeGeoVector);
  assert.equal(IR.LATTICE_SPACES, C.KEY_LATTICES);
});

test("registerIdentity writes the derived ID and no seed", async () => {
  const seed = "a phrase that must not be stored";
  const rec = await IR.registerIdentity("U1", seed);
  const expected = await C.computeIdentityId(seed, "U1");
  assert.equal(rec.identityId, expected.identityId);
  assert.equal("identitySeed" in rec, false);

  const stored = sdk.store.get(PATH("U1"));
  assert.equal(stored.identityId, expected.identityId);
  assert.equal(stored.geoVector, expected.geoVector.vector64);
  assert.equal("identitySeed" in stored, false);
  for (const w of sdk.writes) assert.ok(!JSON.stringify(w).includes(seed), "the seed appears in no write");

  const local = localStorage.getItem("biochain_identity");
  assert.ok(local, "a local backup is written");
  assert.ok(!local.includes(seed), "the seed is not in the local backup");
  assert.equal(JSON.parse(local).identityId, expected.identityId);
});

test("registerIdentity refuses a second commit", async () => {
  await IR.registerIdentity("U1", "first");
  await assert.rejects(IR.registerIdentity("U1", "second"), /already committed/);
});

test("forgetSeed removes a stored seed field and nothing else", async () => {
  sdk.store.set(PATH("U2"), { identityId: "0x1", identitySeed: "old phrase", geoVector: "G", committed: true });
  localStorage.setItem("biochain_identity", JSON.stringify({ version: 1, uid: "U2", identityId: "0x1", identitySeed: "old phrase" }));

  assert.equal(await IR.forgetSeed("U2"), true);
  assert.deepEqual(sdk.store.get(PATH("U2")), { identityId: "0x1", geoVector: "G", committed: true });
  // exactly one write: an update whose only field is the removal (the rules allow nothing else)
  assert.deepEqual(sdk.writes, [{ op: "update", path: PATH("U2"), data: { identitySeed: "<deleteField>" } }]);
  const local = JSON.parse(localStorage.getItem("biochain_identity"));
  assert.equal("identitySeed" in local, false);
  assert.equal(local.identityId, "0x1");
});

test("forgetSeed writes nothing when no seed is stored", async () => {
  sdk.store.set(PATH("U3"), { identityId: "0x3", geoVector: "G" });
  assert.equal(await IR.forgetSeed("U3"), false);
  assert.equal(await IR.forgetSeed("nobody"), false);
  assert.deepEqual(sdk.writes, []);
});

test("forgetLocalSeed removes only the seed from the local backup, without Firestore access", () => {
  localStorage.setItem("biochain_identity", JSON.stringify({ version: 1, uid: "U5", identityId: "0x5", identitySeed: "x" }));
  IR.forgetLocalSeed();
  assert.deepEqual(JSON.parse(localStorage.getItem("biochain_identity")), { version: 1, uid: "U5", identityId: "0x5" });
  localStorage.removeItem("biochain_identity");
  IR.forgetLocalSeed();                                   // no backup: nothing happens
  assert.equal(localStorage.getItem("biochain_identity"), null);
  assert.deepEqual(sdk.writes, []);
});

test("forgetSeed removes a seed from a local backup written by another account", async () => {
  localStorage.setItem("biochain_identity", JSON.stringify({ version: 1, uid: "OTHER", identityId: "0x9", identitySeed: "x" }));
  await IR.forgetSeed("U4");
  assert.deepEqual(JSON.parse(localStorage.getItem("biochain_identity")), { version: 1, uid: "OTHER", identityId: "0x9" });
});
