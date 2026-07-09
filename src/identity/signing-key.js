/**
 * Signing Key — personal, revocable ECDSA credentials.
 * ----------------------------------------------------------------------------
 * Any user may create a signing key and control its three aspects:
 *   1. Hilbert-space params (lattice / dimension / modulus)
 *   2. Manifold selection (manifold + coherency + torsion)
 *   3. Epoch timing (the creation window token)
 *
 * A signing key carries an ECDSA keypair: the PRIVATE key lives only in the
 * owner-only users/{uid}/signingKeys/{keyId} doc; the PUBLIC key is mirrored to
 * the signed-in-readable keyRegistry/{keyId} so anyone can verify an attestation
 * and trace it back to the owner. Revoking/retiring flips status → every
 * attestation it signed stops verifying ("issue, then revoke validity").
 */

import { getDocument, setDocument, updateDocument, addToCollection, queryCollection } from "../firebase/firestore.js";
import { readIdentity } from "./identity-registry.js";
import { resolveRole, contentPriority } from "./access-control.js";
import { getEpoch } from "./epoch-service.js";
import * as CC from "./crypto-core.js";

export { KEY_LATTICES, MANIFOLDS } from "./crypto-core.js";

/** Create a new signing key owned by `uid`. */
export async function createSigningKey(uid, params = {}, label = "") {
  const id = await readIdentity(uid);
  if (!id || !id.identityId) throw new Error("Commit your Identity first.");
  let role = "MEMBER";
  try { role = await resolveRole(uid); } catch (_) {}
  const epoch = await getEpoch();
  const { publicJwk, privateJwk } = await CC.generateKeypair();
  const keyId = await CC.keyIdFromPublic(publicJwk);
  const kv = await CC.deriveKeyVector(id.identityId, params, epoch.token);
  const createdAt = new Date().toISOString();
  const cleanParams = JSON.parse(CC.canonicalParams(params));

  // owner-only doc — holds the private key
  await setDocument(`users/${uid}/signingKeys/${keyId}`, {
    keyId, label: label || "Signing Key", params: cleanParams,
    keyVector: kv.vector64, coords: kv.coords, entropy: kv.entropy,
    epochToken: epoch.token, epoch, identityId: id.identityId, ownerUid: uid,
    role, priority: contentPriority(role), status: "active", createdAt,
    publicJwk, privateJwk,
  });
  // public mirror — verification surface, NO private key
  await setDocument(`keyRegistry/${keyId}`, {
    keyId, ownerUid: uid, identityId: id.identityId, role,
    keyVector: kv.vector64, coords: kv.coords, params: cleanParams,
    epochToken: epoch.token, epoch, publicJwk, status: "active",
    label: label || "Signing Key", createdAt,
  });
  await addToCollection("auditLog", { kind: "signing-key.create", uid, keyId, identityId: id.identityId, epochToken: epoch.token });

  return { keyId, label: label || "Signing Key", params: cleanParams, keyVector: kv.vector64, coords: kv.coords, entropy: kv.entropy, epoch, role, status: "active", createdAt };
}

/** List the caller's own signing keys (private key stripped for safety). */
export async function listSigningKeys(uid) {
  const rows = await queryCollection(`users/${uid}/signingKeys`, []);
  return rows.map(({ privateJwk, ...safe }) => safe)
             .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

async function setStatus(uid, keyId, status) {
  const epoch = await getEpoch();
  await updateDocument(`users/${uid}/signingKeys/${keyId}`, { status });
  await updateDocument(`keyRegistry/${keyId}`, { status, revokedEpoch: epoch.token });
  await addToCollection("auditLog", { kind: `signing-key.${status}`, uid, keyId, epochToken: epoch.token });
  return { keyId, status };
}
/** Revoke a signing key — instantly invalidates every attestation it signed. */
export const revokeSigningKey  = (uid, keyId) => setStatus(uid, keyId, "revoked");
/** Retire a signing key — retires it (also invalidates its attestations). */
export const retireSigningKey  = (uid, keyId) => setStatus(uid, keyId, "retired");

/** Sign arbitrary content → an embeddable attestation block. */
export async function signWithKey(uid, keyId, contentText) {
  const k = await getDocument(`users/${uid}/signingKeys/${keyId}`);
  if (!k) throw new Error("Signing key not found.");
  if (k.status !== "active") throw new Error(`This signing key is ${k.status}; only active keys can sign.`);
  const contentHash = await CC.sha256Hex(contentText);
  const sig = await CC.signPayload(k.privateJwk, CC.attestationPayload({ keyId, keyVector: k.keyVector, contentHash, epochToken: k.epochToken }));
  return {
    format: "attestation/1", keyId, identityId: k.identityId, ownerUid: uid,
    keyVector: k.keyVector, epochToken: k.epochToken, contentHash, sig,
    signedAt: new Date().toISOString(),
  };
}

/** Verify an attestation block: signature + registry status. Traces to the owner. */
export async function verifyAttestation(block) {
  if (!block || !block.keyId || !block.sig) return { valid: false, reason: "malformed attestation block" };
  const reg = await getDocument(`keyRegistry/${block.keyId}`);
  if (!reg) return { valid: false, reason: "unknown key — no registry entry" };
  if (reg.status !== "active")
    return { valid: false, status: reg.status, identityId: reg.identityId, ownerUid: reg.ownerUid,
             reason: `key ${reg.status} — validity has been revoked` };
  if (block.keyVector !== reg.keyVector) return { valid: false, reason: "key-vector mismatch" };
  const ok = await CC.verifyPayload(
    reg.publicJwk,
    CC.attestationPayload({ keyId: block.keyId, keyVector: reg.keyVector, contentHash: block.contentHash, epochToken: block.epochToken }),
    block.sig
  );
  return {
    valid: ok, status: reg.status, identityId: reg.identityId, ownerUid: reg.ownerUid,
    role: reg.role, label: reg.label, keyVector: reg.keyVector,
    reason: ok ? "verified" : "signature invalid",
  };
}

/** Stronger check: confirm the attestation AND that it signs this exact content. */
export async function verifyAttestationAgainstContent(block, contentText) {
  const base = await verifyAttestation(block);
  if (!base.valid) return base;
  const h = await CC.sha256Hex(contentText);
  const contentMatch = h === block.contentHash;
  return { ...base, valid: base.valid && contentMatch, contentMatch, reason: contentMatch ? base.reason : "content does not match attestation" };
}
