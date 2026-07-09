/**
 * Crypto Core — pure, Firebase-free cryptographic primitives for signing keys.
 * ----------------------------------------------------------------------------
 * Runs in the browser (global `crypto`) and in Node 20+ (`globalThis.crypto`).
 * Contains NO Firebase imports so it can be unit-tested headlessly.
 *
 *  • Key vector: the geometric fingerprint of a signing key, derived from
 *    (identityId ‖ Hilbert/manifold params ‖ epoch token) via SHD-CCP 4×4×4
 *    compression.
 *  • ECDSA P-256: real, publicly-verifiable, unforgeable signatures. The signing
 *    key holds the private key (owner-only); the public key is mirrored to the
 *    key registry so anyone can verify an attestation and trace it to the owner.
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
function hexToBuf(hex) {
  const clean = hex.replace(/[^0-9a-f]/gi, "");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out.buffer;
}

export async function sha256Hex(str) {
  return bufToHex(await subtle().digest("SHA-256", enc.encode(String(str))));
}

// ─── Lattice / Hilbert-space profiles ──────────────────────────────────────────
export const KEY_LATTICES = {
  E8:  { name: "E8 Lie Algebra",  modulus: 240,    phi: 1.618033988749 },
  R8:  { name: "ℝ⁸ Octonionic",   modulus: 128,    phi: 2.618033988749 },
  R24: { name: "ℝ²⁴ Leech Grid",  modulus: 196560, phi: 4.236067977499 },
};
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

// φ-folded SHD-CCP 4×4×4 compression → {vector64 hex, coords, entropy}
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

export async function generateKeypair() {
  const kp = await subtle().generateKey(ALGO, true, ["sign", "verify"]);
  return {
    publicJwk:  await subtle().exportKey("jwk", kp.publicKey),
    privateJwk: await subtle().exportKey("jwk", kp.privateKey),
  };
}
async function importPriv(jwk) { return subtle().importKey("jwk", jwk, ALGO, false, ["sign"]); }
async function importPub(jwk)  { return subtle().importKey("jwk", jwk, ALGO, false, ["verify"]); }

export async function signPayload(privateJwk, payloadStr) {
  return bufToHex(await subtle().sign(SIGN, await importPriv(privateJwk), enc.encode(payloadStr)));
}
export async function verifyPayload(publicJwk, payloadStr, sigHex) {
  try { return await subtle().verify(SIGN, await importPub(publicJwk), hexToBuf(sigHex), enc.encode(payloadStr)); }
  catch { return false; }
}

/** keyId is the public-key fingerprint — deterministic, collision-resistant. */
export async function keyIdFromPublic(publicJwk) {
  return "K-" + (await sha256Hex(`${publicJwk.x}|${publicJwk.y}`)).slice(0, 24);
}

// ─── Canonical attestation payload (versioned, so verifiers are unambiguous) ────
export const attestationPayload = ({ keyId, keyVector, contentHash, epochToken }) =>
  ["ATTEST/1", keyId, keyVector, contentHash, epochToken].join("|");
