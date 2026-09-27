/**
 * Access Control — the role system for the platform.
 * ------------------------------------------------------
 *   MEMBER   — default; can grow, transfer, and rate. No authoring/granting.
 *   OPERATOR — validated authority; can author operator content.
 *   ADMIN    — root authority; can grant OPERATOR and ADMIN roles.
 *
 * Role authority comes ONLY from records a user cannot write for themselves —
 * the same two sources firestore.rules trusts (see roleOf() there):
 *   config/rootAdmins  { uids: [...] } — set by hand in the Firebase console;
 *                                        clients can never write it → ADMIN
 *   roleGrants/{uid}   { role, scope, grantedByUid, grantedAt }
 *                                      — written only by an ADMIN (rules-enforced)
 * Nothing on the user's own identity doc confers a role. (The earlier HMAC
 * "certificates" were keyed by the issuer's public Identity ID, so anyone could
 * forge one; they are gone.)
 *
 * Roles are designed to collapse cleanly: drop OPERATOR and you have a plain
 * admin/member model without touching call sites.
 */

import { getDocument, setDocument, addToCollection } from "../firebase/firestore.js";

// ─── Root Admin List ──────────────────────────────────────────────────
// Bootstrap: in the Firebase console → Firestore, create the document
//   config/rootAdmins   with field   uids: ["<your biochain-ai Auth UID>"]
// (Authentication → Users → copy your UID). Clients cannot write it, so it can
// only be set from the console / Admin SDK. Until it exists, no one is ADMIN.
export const ROOT_ADMINS_DOC = "config/rootAdmins";

// ─── Role Definitions ─────────────────────────────────────────────────
export const ROLES = {
  MEMBER:   { name: "Member",   level: 0, canAuthor: false, canGrantOperator: false, canGrantAdmin: false },
  OPERATOR: { name: "Operator", level: 1, canAuthor: true,  canGrantOperator: false, canGrantAdmin: false },
  ADMIN:    { name: "Admin",    level: 2, canAuthor: true,  canGrantOperator: true,  canGrantAdmin: true  },
};

/** Whether `uid` is listed in config/rootAdmins. */
export async function isRootAdmin(uid) {
  const doc = await getDocument(ROOT_ADMINS_DOC);
  return !!(doc && Array.isArray(doc.uids) && doc.uids.includes(uid));
}

/** The caller-independent role grant for `uid` (null if none). */
export const readRoleGrant = (uid) => getDocument(`roleGrants/${uid}`);

/** Resolve the effective role of a user — mirrors roleOf() in firestore.rules. */
export async function resolveRole(uid) {
  if (await isRootAdmin(uid)) return "ADMIN";
  const grant = await readRoleGrant(uid);
  return grant && ROLES[grant.role] ? grant.role : "MEMBER";
}

/**
 * Grant (or demote to MEMBER) a role. Caller must be ADMIN — checked here for a
 * clear error, and enforced by the rules on roleGrants/{uid}.
 *   issuerUid  — the granting ADMIN's uid
 *   subjectUid — the uid receiving the role
 *   targetRole — "MEMBER" | "OPERATOR" | "ADMIN"
 *   scope      — namespace string (e.g. "*", "tenant-x")
 */
export async function grantRole(issuerUid, subjectUid, targetRole, scope = "*") {
  if (!ROLES[targetRole]) throw new Error(`Unknown role: ${targetRole}`);
  const issuerRole = await resolveRole(issuerUid);
  if (targetRole === "OPERATOR" && !ROLES[issuerRole].canGrantOperator) throw new Error("Issuer cannot grant Operator.");
  if (targetRole === "ADMIN"    && !ROLES[issuerRole].canGrantAdmin)    throw new Error("Issuer cannot grant Admin.");
  if (targetRole === "MEMBER"   && issuerRole !== "ADMIN")               throw new Error("Only an Admin can change roles.");
  const grant = {
    subjectUid, role: targetRole, scope: scope || "*",
    certifiedScopes: scope === "*" || !scope ? ["*"] : [scope],
    grantedByUid: issuerUid, grantedAt: new Date().toISOString(),
  };
  await setDocument(`roleGrants/${subjectUid}`, grant);
  await addToCollection("auditLog", { kind: "role.granted", uid: issuerUid, subjectUid, role: targetRole, scope: grant.scope });
  return grant;
}

/** Whether a user (by their role grant) can author content on a given scope. */
export function canAuthorOnScope(grant, scope) {
  if (!grant) return false;
  const roleDef = ROLES[grant.role || "MEMBER"];
  if (!roleDef || !roleDef.canAuthor) return false;
  const scopes = grant.certifiedScopes || [];
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
