/**
 * Access Control — the role system for the platform.
 * ------------------------------------------------------
 *   MEMBER   — default; can grow, transfer, and rate. No authoring/granting.
 *   OPERATOR — validated authority; can author operator content.
 *   ADMIN    — root authority; can grant OPERATOR and ADMIN roles.
 *
 * A Role Certificate = Identity + Validation Certificate
 * Validation Certificate = HMAC-SHA-256 over (issuer, role, scope, subject, issuedAt)
 *                          keyed by the issuer's Identity ID.
 *
 * Roles are designed to collapse cleanly: drop OPERATOR and you have a plain
 * admin/member model without touching call sites.
 */

import { readIdentity } from "./identity-registry.js";
import { setDocument } from "../firebase/firestore.js";

// ─── Root Admin List ──────────────────────────────────────────────────
// Firebase UIDs that self-validate as ADMIN at the root layer.
// IMPORTANT: these are per-project UIDs for the `biochain-ai` project — NOT the
// same as any Owl Academy UID. Add your biochain-ai Authentication UID here
// before using the operations console, or no one can hold ADMIN.
//   Firebase console → Authentication → Users → copy your UID.
export const ROOT_ADMIN_UIDS = [
  // "PASTE_YOUR_biochain-ai_FIREBASE_UID_HERE",
];

// ─── Role Definitions ─────────────────────────────────────────────────
export const ROLES = {
  MEMBER:   { name: "Member",   level: 0, canAuthor: false, canGrantOperator: false, canGrantAdmin: false },
  OPERATOR: { name: "Operator", level: 1, canAuthor: true,  canGrantOperator: false, canGrantAdmin: false },
  ADMIN:    { name: "Admin",    level: 2, canAuthor: true,  canGrantOperator: true,  canGrantAdmin: true  },
};

// ─── HMAC Signing ─────────────────────────────────────────────────────
async function hmacSign(key, payload) {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(payload));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}
async function hmacVerify(key, payload, signatureHex) {
  const expected = await hmacSign(key, payload);
  if (expected.length !== signatureHex.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signatureHex.charCodeAt(i);
  return diff === 0;
}
function certificatePayload(cert) {
  return [cert.issuer, cert.role, cert.scope, cert.subject, cert.issuedAt].join("|");
}

// ─── Certificate Issue / Verify ───────────────────────────────────────

/**
 * Issue a role certificate. Caller must hold sufficient role.
 *   issuerIdentity — the issuing user's identity doc (read from Firestore)
 *   subjectId      — Identity ID of the user being certified
 *   targetRole     — "OPERATOR" | "ADMIN"
 *   scope          — namespace string (e.g. "*", "tenant-x")
 */
export async function issueCertificate(issuerIdentity, subjectId, targetRole, scope) {
  if (!issuerIdentity || !issuerIdentity.identityId) throw new Error("Issuer has no identity.");
  const issuerRole = issuerIdentity.role || "MEMBER";
  if (!ROLES[issuerRole]) throw new Error(`Unknown issuer role: ${issuerRole}`);
  if (targetRole === "OPERATOR" && !ROLES[issuerRole].canGrantOperator) throw new Error("Issuer cannot grant Operator.");
  if (targetRole === "ADMIN"    && !ROLES[issuerRole].canGrantAdmin)    throw new Error("Issuer cannot grant Admin.");

  const cert = {
    issuer: issuerIdentity.identityId,
    subject: subjectId,
    role: targetRole,
    scope: scope || "*",
    issuedAt: new Date().toISOString(),
  };
  cert.signature = await hmacSign(issuerIdentity.identityId, certificatePayload(cert));
  return cert;
}

/** Verify a certificate against the issuer's known Identity ID. */
export async function verifyCertificate(cert, issuerIdentityId) {
  if (!cert || !cert.signature) return { valid: false, reason: "no_signature" };
  if (cert.issuer !== issuerIdentityId) return { valid: false, reason: "issuer_mismatch" };
  const ok = await hmacVerify(issuerIdentityId, certificatePayload(cert), cert.signature);
  return { valid: ok, reason: ok ? "ok" : "bad_signature" };
}

/** Self-issue an ADMIN certificate for a root-admin UID (bootstrap path). */
export async function bootstrapAdminCertificate(uid, identity) {
  if (!ROOT_ADMIN_UIDS.includes(uid)) throw new Error("UID is not in the root admin list.");
  const cert = {
    issuer: identity.identityId, subject: identity.identityId,
    role: "ADMIN", scope: "*", issuedAt: new Date().toISOString(), selfSigned: true,
  };
  cert.signature = await hmacSign(identity.identityId, certificatePayload(cert));
  return cert;
}

// ─── Role application ─────────────────────────────────────────────────

/** Apply a role upgrade to the caller's own identity. Verifies the certificate. */
export async function applyCertificate(uid, cert) {
  const myId = await readIdentity(uid);
  if (!myId) throw new Error("Commit an Identity first.");
  if (cert.subject !== myId.identityId) throw new Error("Certificate subject does not match your Identity ID.");

  if (cert.selfSigned) {
    if (!ROOT_ADMIN_UIDS.includes(uid)) throw new Error("Self-signed certificates only permitted for root admin UIDs.");
    const { valid } = await verifyCertificate(cert, myId.identityId);
    if (!valid) throw new Error("Self-signed certificate failed verification.");
  } else {
    const { valid, reason } = await verifyCertificate(cert, cert.issuer);
    if (!valid) throw new Error(`Certificate invalid: ${reason}`);
  }

  const scopes = cert.scope === "*" ? ["*"] : [cert.scope];
  await setDocument(`users/${uid}/identity/main`, {
    ...myId, role: cert.role, certificate: cert, certifiedScopes: scopes,
    certifiedAt: new Date().toISOString(),
  });
  return cert;
}

/** Resolve the effective role of a user. Falls back to MEMBER. */
export async function resolveRole(uid) {
  const id = await readIdentity(uid);
  if (!id || !id.certificate) return ROOT_ADMIN_UIDS.includes(uid) ? "ADMIN" : "MEMBER";
  if (id.certificate.selfSigned) {
    if (!ROOT_ADMIN_UIDS.includes(uid)) return "MEMBER";
    const { valid } = await verifyCertificate(id.certificate, id.identityId);
    return valid ? "ADMIN" : "MEMBER";
  }
  const { valid } = await verifyCertificate(id.certificate, id.certificate.issuer);
  if (valid) return id.certificate.role;
  return ROOT_ADMIN_UIDS.includes(uid) ? "ADMIN" : "MEMBER";
}

/** Whether a user can author content on a given scope. */
export function canAuthorOnScope(identity, scope) {
  if (!identity || !identity.certificate) return false;
  const roleDef = ROLES[identity.role || "MEMBER"];
  if (!roleDef || !roleDef.canAuthor) return false;
  const scopes = identity.certifiedScopes || [];
  return scopes.includes("*") || scopes.includes(scope);
}

/**
 * Content priority from the author's role.
 *   ADMIN → "certified" · OPERATOR → "reviewed" · MEMBER → "draft"
 */
export function contentPriority(role) {
  if (role === "ADMIN") return "certified";
  if (role === "OPERATOR") return "reviewed";
  return "draft";
}

/** Role-specific ring decoration (SVG markup) overlaid on the identity icon. */
export function roleRingOverlay(role, size = 200) {
  const cx = size / 2, cy = size / 2;
  if (role === "ADMIN") {
    return `
      <circle cx="${cx}" cy="${cy}" r="${size * 0.48}" fill="none" stroke="#D4AF37" stroke-width="1.2" opacity="0.7"/>
      <circle cx="${cx}" cy="${cy}" r="${size * 0.46}" fill="none" stroke="#00d4ff" stroke-width="0.6" opacity="0.6"/>
      <circle cx="${cx}" cy="${cy}" r="${size * 0.44}" fill="none" stroke="#e81cff" stroke-width="0.5" opacity="0.6" stroke-dasharray="2 2"/>
      <text x="${cx}" y="${size * 0.08}" text-anchor="middle" font-family="Cinzel" font-size="${size * 0.06}" fill="#D4AF37" font-weight="bold">ADMIN</text>`;
  }
  if (role === "OPERATOR") {
    return `
      <circle cx="${cx}" cy="${cy}" r="${size * 0.48}" fill="none" stroke="#D4AF37" stroke-width="1" opacity="0.7"/>
      <circle cx="${cx}" cy="${cy}" r="${size * 0.45}" fill="none" stroke="#00d4ff" stroke-width="0.6" opacity="0.6" stroke-dasharray="3 2"/>
      <text x="${cx}" y="${size * 0.96}" text-anchor="middle" font-family="Cinzel" font-size="${size * 0.05}" fill="#00d4ff">OPERATOR</text>`;
  }
  return `<circle cx="${cx}" cy="${cy}" r="${size * 0.46}" fill="none" stroke="#D4AF37" stroke-width="0.5" opacity="0.4"/>`;
}
