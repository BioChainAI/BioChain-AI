// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ebayednoob (Owl-Academy); changes Copyright (c) 2026 Schism-Labs-AI. See NOTICE.
/**
 * Crypto Core — pure, Firebase-free cryptographic primitives for identities and signing keys.
 * ----------------------------------------------------------------------------
 * Runs in the browser (global `crypto`) and in Node 20+ (`globalThis.crypto`).
 * Contains NO Firebase imports so it can be unit-tested headlessly
 * (tests/unit/crypto-core.test.mjs).
 *
 *  • Identity ID: the account fingerprint, derived from (identity seed, uid) via
 *    SHD-CCP 4×4×4 compression (computeGeoVector / computeIdentityId; re-exported
 *    by identity-registry.js).
 *  • Key vector: the geometric fingerprint of a signing key, derived from
 *    (identityId ‖ Hilbert/manifold params ‖ epoch token) via the same
 *    compression.
 *  • ECDSA P-256: signatures over canonical payloads. The signing key's private
 *    half is kept in the owner-only key record; the public key is mirrored to
 *    the key registry so signed-in users can verify an attestation and trace it
 *    to the owner.
 */

const subtle = () => {
  const c = globalThis.crypto;
  if (!c || !c.subtle) throw new Error("WebCrypto unavailable in this environment");
  return c.subtle;
};
const enc = new TextEncoder();

// ─── hex helpers ──────────────────────────────────────────────────────────────
function bufToHex(buf) {
  const b = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, "0");
  return s;
}

/** A P-256 signature as produced by signPayload: r ‖ s, 64 bytes, as 128 lowercase hex digits. */
export const SIGNATURE_HEX = /^[0-9a-f]{128}$/;

/** Parse a signature string. Anything but exactly 128 lowercase hex digits returns null. */
function sigHexToBytes(hex) {
  if (typeof hex !== "string" || !SIGNATURE_HEX.test(hex)) return null;
  const out = new Uint8Array(64);
  for (let i = 0; i < 64; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export async function sha256Hex(str) {
  return bufToHex(await subtle().digest("SHA-256", enc.encode(String(str))));
}

// SHA-256 of the UTF-8 encoding of `input`, as 32 bytes (no String() coercion,
// so identity derivation hashes exactly what it always has).
async function sha256Bytes(input) {
  return new Uint8Array(await subtle().digest("SHA-256", enc.encode(input)));
}

// ─── Lattice / Hilbert-space profiles ──────────────────────────────────────────
// One table for signing keys and identities (identity-registry.js re-exports it
// as LATTICE_SPACES).
export const KEY_LATTICES = {
  E8:  { name: "E8 Lie Algebra",  modulus: 240,    phi: 1.618033988749 },
  R8:  { name: "ℝ⁸ Octonionic",   modulus: 128,    phi: 2.618033988749 },
  R24: { name: "ℝ²⁴ Leech Grid",  modulus: 196560, phi: 4.236067977499 },
};
export const LATTICE_SPACES = KEY_LATTICES;
export const MANIFOLDS = {
  clifford: { name: "Clifford Torus", base: "T²⊂S³" },
  s3:       { name: "3-Sphere S³",    base: "S³"     },
  trefoil:  { name: "Trefoil Knot",   base: "(2,3)-torus knot" },
};

// 32 → 64 bytes via holographic inverse (byte ‖ ¬byte)
function expandHolographic(b32) {
  const out = new Uint8Array(64);
  for (let i = 0; i < 32; i++) { out[i] = b32[i]; out[i + 32] = 0xff ^ b32[i]; }
  return out;
}

// φ-folded SHD-CCP 4×4×4 compression → {vector64 hex, coords, entropy}.
// With coherency 1 and torsion 0 every factor is exactly 1 or 0, so the result
// is the identity derivation's compression (tests/unit/crypto-core.test.mjs
// pins its goldens).
function shdccpCompress(bytes64, latticeKey, coherency, torsion) {
  const lat = KEY_LATTICES[latticeKey] || KEY_LATTICES.E8;
  const phi = lat.phi;
  let acc = 0n, cx = 0, cy = 0, cz = 0;
  for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) for (let z = 0; z < 4; z++) {
    const v = bytes64[x * 16 + y * 4 + z];
    const weight = (x + 1) * (y + 1) * (z + 1);
    acc = (acc * 31n + BigInt(v * weight)) & 0xffffffffffffffffn;
    // coherency biases the in-phase axes; torsion adds a twisting offset
    cx += v * Math.cos((x * phi + torsion * z) % (2 * Math.PI)) * (0.5 + coherency / 2);
    cy += v * Math.sin((y * phi + torsion * x) % (2 * Math.PI)) * (0.5 + coherency / 2);
    cz += v * Math.cos((z * phi * phi + torsion * y) % (2 * Math.PI));
  }
  const norm = Math.sqrt(cx * cx + cy * cy + cz * cz) || 1;
  return {
    vector64: acc.toString(16).toUpperCase().padStart(16, "0"),
    coords: {
      x: +(cx / norm * phi).toFixed(6),
      y: +(cy / norm * phi).toFixed(6),
      z: +(cz / norm * phi).toFixed(6),
    },
    entropy: +(Math.log2(Number(acc & 0xffffffn) + 1) * phi / 24).toFixed(4),
  };
}

// ─── Identity derivation ───────────────────────────────────────────────────────
//   identitySeed → SHA-256 → holographic 64 bytes → SHD-CCP 4×4×4 → geoVector[64]
//   uid          → SHA-256 → first 8 bytes                       → uidVector[64]
//   IdentityID   = "0x" + (geoVector ⊕ uidVector)
// The seed is an input only: callers keep it in memory and never store it.

function xorBlendHex(hexA, hexB) {
  const a = BigInt("0x" + hexA);
  const b = BigInt("0x" + hexB);
  return (a ^ b).toString(16).toUpperCase().padStart(16, "0");
}

/** Compute a geometric vector from an identity seed alone (live preview). */
export async function computeGeoVector(identitySeed, latticeKey = "E8") {
  const trimmed = (identitySeed || "").trim();
  if (!trimmed) throw new Error("Identity seed is empty");
  const hash32 = await sha256Bytes(trimmed);
  const bytes64 = expandHolographic(hash32);
  return { ...shdccpCompress(bytes64, latticeKey, 1, 0), lattice: latticeKey };
}

/** Compute the final Identity ID: the seed's geo vector XOR-blended with the uid hash. */
export async function computeIdentityId(identitySeed, uid, latticeKey = "E8") {
  const geo = await computeGeoVector(identitySeed, latticeKey);
  const uidHash = await sha256Bytes(uid);
  let uidHex = "";
  for (let i = 0; i < 8; i++) uidHex += uidHash[i].toString(16).padStart(2, "0");
  const identityId = "0x" + xorBlendHex(geo.vector64, uidHex.toUpperCase());
  return { identityId, geoVector: geo };
}

// ─── Signing-key vector ────────────────────────────────────────────────────────

/** Canonical, stable serialization of a signing key's three controllable aspects. */
export function canonicalParams(p = {}) {
  return JSON.stringify({
    lattice:   p.lattice   || "E8",
    hilbertDim: p.hilbertDim || 64,
    modulus:   p.modulus   || (KEY_LATTICES[p.lattice || "E8"].modulus),
    manifold:  p.manifold  || "clifford",
    coherency: typeof p.coherency === "number" ? p.coherency : 0.75,
    torsion:   typeof p.torsion   === "number" ? p.torsion   : 0.5,
  });
}

/** The geometric key vector: SHD-CCP( identityId ‖ params ‖ epochToken ). */
export async function deriveKeyVector(identityId, params, epochToken) {
  const p = JSON.parse(canonicalParams(params));
  const seedHash = await subtle().digest(
    "SHA-256",
    enc.encode(`${identityId}|${canonicalParams(params)}|${epochToken}`)
  );
  const bytes64 = expandHolographic(new Uint8Array(seedHash));
  return shdccpCompress(bytes64, p.lattice, p.coherency, p.torsion);
}

// ─── ECDSA P-256 ────────────────────────────────────────────────────────────
const ALGO = { name: "ECDSA", namedCurve: "P-256" };
const SIGN = { name: "ECDSA", hash: "SHA-256" };

/** Order n of the P-256 group, and n/2 (the low-S bound). */
export const P256_N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const P256_HALF_N = P256_N >> 1n;

export async function generateKeypair() {
  const kp = await subtle().generateKey(ALGO, true, ["sign", "verify"]);
  return {
    publicJwk:  await subtle().exportKey("jwk", kp.publicKey),
    privateJwk: await subtle().exportKey("jwk", kp.privateKey),
  };
}
async function importPriv(jwk) { return subtle().importKey("jwk", jwk, ALGO, false, ["sign"]); }
async function importPub(jwk)  { return subtle().importKey("jwk", jwk, ALGO, false, ["verify"]); }

function bytesToBigInt(bytes) {
  let v = 0n;
  for (const b of bytes) v = (v << 8n) | BigInt(b);
  return v;
}
function bigIntTo32Bytes(v) {
  const out = new Uint8Array(32);
  for (let i = 31; i >= 0; i--) { out[i] = Number(v & 0xffn); v >>= 8n; }
  return out;
}

/** Map a 64-byte r ‖ s signature to its low-S form (s ≤ n/2); a low-S input is returned unchanged. */
export function toLowS(sig64) {
  const sig = new Uint8Array(sig64);
  if (sig.length !== 64) throw new Error("expected a 64-byte P-256 signature");
  const s = bytesToBigInt(sig.subarray(32));
  if (s <= P256_HALF_N) return sig;
  const out = new Uint8Array(64);
  out.set(sig.subarray(0, 32), 0);
  out.set(bigIntTo32Bytes(P256_N - s), 32);
  return out;
}

/**
 * Signing and verification rules:
 *  • signPayload returns r ‖ s as 128 lowercase hex digits, with s normalised to
 *    the low half of the group order (s ≤ n/2).
 *  • verifyPayload accepts only that 128-digit lowercase hex form, and accepts
 *    both s and n − s (signatures made before low-S normalisation, or by other
 *    signers, keep verifying).
 *  • Never key, index or deduplicate anything by a signature, or by a hash of a
 *    block that contains one: (r, s) and (r, n − s) both verify for the same
 *    payload. Key by the signed payload, the content hash or the key id instead.
 */
export async function signPayload(privateJwk, payloadStr) {
  const raw = await subtle().sign(SIGN, await importPriv(privateJwk), enc.encode(payloadStr));
  return bufToHex(toLowS(raw));
}
export async function verifyPayload(publicJwk, payloadStr, sigHex) {
  const sig = sigHexToBytes(sigHex);
  if (!sig) return false;
  try { return await subtle().verify(SIGN, await importPub(publicJwk), sig, enc.encode(payloadStr)); }
  catch { return false; }
}

/** keyId is the public-key fingerprint — deterministic, collision-resistant. */
export async function keyIdFromPublic(publicJwk) {
  return "K-" + (await sha256Hex(`${publicJwk.x}|${publicJwk.y}`)).slice(0, 24);
}

// ─── Canonical attestation payload (versioned, so verifiers are unambiguous) ────
export const attestationPayload = ({ keyId, keyVector, contentHash, epochToken }) =>
  ["ATTEST/1", keyId, keyVector, contentHash, epochToken].join("|");
