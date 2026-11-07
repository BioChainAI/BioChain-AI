// crypto-core.js: signature strictness and low-S, the key fingerprint, the
// ATTEST/1 payload, and the identity and key-vector derivation goldens.
// The goldens were computed with the implementation at c975161 (before the
// identity derivation moved here from identity-registry.js), so they also pin
// that the move changed no output.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "../../src/identity/crypto-core.js";

// A fixed P-256 public key, an ATTEST/1 payload signed by its private half,
// and the same signature in its high-S and low-S forms (s and n − s).
const V = {
  publicJwk: { kty: "EC", crv: "P-256", x: "_uQ2wcAMew4TEOUDVLGy6W8sJxpw3vx4CP4Wk3c5JL0", y: "4mykQkfhyuqvjUryKm35gtjvFFTDo_nH4nLqkd4vmuk", ext: true },
  keyId: "K-00a569f694f7c38e6432e9f8",
  keyVector: "B9B7338D436EDDA2",
  content: "GROWN/1|BC-golden|root|0.1|0.2|720",
  contentHash: "cae1ce26344c1c20a5c3ac8069bf7b65cf37bae97cf0e15dd80e6f4daf2bb526",
  epochToken: "EPOCH.163000",
  payload: "ATTEST/1|K-00a569f694f7c38e6432e9f8|B9B7338D436EDDA2|cae1ce26344c1c20a5c3ac8069bf7b65cf37bae97cf0e15dd80e6f4daf2bb526|EPOCH.163000",
  highS: "b89bae7725b81b09ea96ef67ce2e146e4362c5be5bd5f79af5379cf4d87756cfbdba7343a1b53896c158e321f36352c6cdfd70b93cbde924f0d2ab56b9862bc3",
  lowS: "b89bae7725b81b09ea96ef67ce2e146e4362c5be5bd5f79af5379cf4d87756cf42458cbb5e4ac76a3ea71cde0c9cad38eee989f46a59b56002e71f6c42dcf98e",
};
const HALF_N = C.P256_N >> 1n;
const sOf = (hex) => BigInt("0x" + hex.slice(64));

test("ATTEST/1 payload golden", async () => {
  assert.equal(await C.sha256Hex(V.content), V.contentHash);
  assert.equal(
    C.attestationPayload({ keyId: V.keyId, keyVector: V.keyVector, contentHash: V.contentHash, epochToken: V.epochToken }),
    V.payload,
  );
});

test("key fingerprint: K- plus the first 24 hex digits of SHA-256(x|y)", async () => {
  assert.equal(await C.keyIdFromPublic(V.publicJwk), V.keyId);
  assert.match(V.keyId, /^K-[0-9a-f]{24}$/);
  // only x and y take part
  assert.equal(await C.keyIdFromPublic({ x: V.publicJwk.x, y: V.publicJwk.y }), V.keyId);
});

test("key vector golden (defaults and explicit params)", async () => {
  assert.equal(C.canonicalParams({}), '{"lattice":"E8","hilbertDim":64,"modulus":240,"manifold":"clifford","coherency":0.75,"torsion":0.5}');
  assert.deepEqual(await C.deriveKeyVector("0x0123456789ABCDEF", {}, "EPOCH.163000"),
    { vector64: "B9B7338D436EDDA2", coords: { x: 1.593567, y: 0.03035, z: 0.278668 }, entropy: 1.5366 });
  assert.deepEqual(
    await C.deriveKeyVector("0x0123456789ABCDEF", { lattice: "R24", coherency: 0.2, torsion: 1.25, manifold: "trefoil" }, "EPOCH.163000"),
    { vector64: "691AF235DC949CC2", coords: { x: -0.938478, y: 0.025898, z: 4.130722 }, entropy: 4.0976 });
});

test("computeIdentityId goldens", async () => {
  const gold = [
    { seed: "my seed phrase", uid: "U1", lattice: "E8", identityId: "0x0D450E41BC04837A",
      geoVector: { vector64: "3C29AEAE666615A2", coords: { x: 0.920695, y: -0.1777, z: 1.318627 }, entropy: 1.5286, lattice: "E8" } },
    { seed: "Golden Seed 01", uid: "Zq8YbXk2Lr", lattice: "R8", identityId: "0xE41BF52BD2EA4EF0",
      geoVector: { vector64: "5D6F93BA3A93FDBE", coords: { x: 0.374645, y: 0.743708, z: 2.482064 }, entropy: 2.5318, lattice: "R8" } },
    { seed: "ünïcødé ✓ 种子", uid: "uid-123", lattice: "R24", identityId: "0xB585F34F03B5AE93",
      geoVector: { vector64: "96CDE64DB73DB586", coords: { x: 3.892415, y: 0.238382, z: 1.654253 }, entropy: 3.8738, lattice: "R24" } },
    { seed: "  padded seed  ", uid: "U1", lattice: undefined, identityId: "0x4C22325E16AA4AF0",
      geoVector: { vector64: "7D4E92B1CCC8DC28", coords: { x: 0.082882, y: -0.215812, z: 1.601434 }, entropy: 1.5944, lattice: "E8" } },
  ];
  for (const g of gold) {
    const r = await C.computeIdentityId(g.seed, g.uid, g.lattice);
    assert.equal(r.identityId, g.identityId, g.seed);
    assert.deepEqual(r.geoVector, g.geoVector, g.seed);
    assert.deepEqual(await C.computeGeoVector(g.seed, g.lattice), g.geoVector);
  }
  // the seed is trimmed; an empty seed is refused
  assert.equal((await C.computeIdentityId("padded seed", "U1")).identityId, "0x4C22325E16AA4AF0");
  await assert.rejects(C.computeIdentityId("   ", "U1"), /Identity seed is empty/);
});

test("one lattice table for keys and identities", () => {
  assert.equal(C.LATTICE_SPACES, C.KEY_LATTICES);
  assert.deepEqual(Object.keys(C.KEY_LATTICES), ["E8", "R8", "R24"]);
});

test("verification accepts the signature in both its low-S and high-S forms", async () => {
  assert.ok(sOf(V.highS) > HALF_N && sOf(V.lowS) <= HALF_N);
  assert.equal(await C.verifyPayload(V.publicJwk, V.payload, V.lowS), true);
  assert.equal(await C.verifyPayload(V.publicJwk, V.payload, V.highS), true);
  assert.equal(await C.verifyPayload(V.publicJwk, V.payload + "x", V.lowS), false);
});

test("toLowS maps s to n − s only when s > n/2", () => {
  const hex = (u8) => Buffer.from(u8).toString("hex");
  assert.equal(hex(C.toLowS(Buffer.from(V.highS, "hex"))), V.lowS);
  assert.equal(hex(C.toLowS(Buffer.from(V.lowS, "hex"))), V.lowS);
  assert.throws(() => C.toLowS(new Uint8Array(63)), /64-byte/);
});

test("verification accepts only 128 lowercase hex digits", async () => {
  const bad = [
    V.lowS.toUpperCase(),                         // uppercase
    V.lowS.match(/../g).join(":"),               // separators
    V.lowS + "zz-not-hex",                        // trailing junk
    V.lowS + "00",                                // too long
    V.lowS.slice(0, 126),                         // too short
    " " + V.lowS,                                 // whitespace
    "0x" + V.lowS.slice(2),                       // prefix
    "",
    null,
    undefined,
    12345,
    Buffer.from(V.lowS, "hex"),                   // bytes, not hex
  ];
  for (const sig of bad) assert.equal(await C.verifyPayload(V.publicJwk, V.payload, sig), false, String(sig).slice(0, 20));
  assert.equal(C.SIGNATURE_HEX.test(V.lowS), true);
});

test("signPayload returns low-S, lowercase, 128-digit signatures that verify", async () => {
  const { publicJwk, privateJwk } = await C.generateKeypair();
  for (let i = 0; i < 40; i++) {
    const msg = `ATTEST/1|K-test|0000000000000000|${i}|EPOCH.1`;
    const sig = await C.signPayload(privateJwk, msg);
    assert.match(sig, C.SIGNATURE_HEX);
    assert.ok(sOf(sig) <= HALF_N, "s must be in the low half");
    assert.equal(await C.verifyPayload(publicJwk, msg, sig), true);
    // the high-S twin of a fresh signature also verifies
    const twin = sig.slice(0, 64) + (C.P256_N - sOf(sig)).toString(16).padStart(64, "0");
    assert.equal(await C.verifyPayload(publicJwk, msg, twin), true);
  }
});
