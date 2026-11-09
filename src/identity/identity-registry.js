// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Ebayednoob (Owl-Academy); changes Copyright (c) 2026 Schism-Labs-AI. See NOTICE.
/**
 * Identity Registry — commits a user's immutable Identity ID.
 * ----------------------------------------------------------------------------
 * Pipeline (implemented in crypto-core.js, re-exported here):
 *   identitySeed → SHD-CCP 4×4×4 compression → geoVector[64]
 *   uid          → SHA-256 hash              → uidVector[64]
 *   IdentityID   = geoVector ⊕ uidVector     (bitwise XOR blend)
 *
 * The Identity ID is the geometric fingerprint that anchors a user's signing
 * keys and attestations. Once committed, it is immutable (enforced by rules:
 * identityId / geoVector are frozen; the only permitted update removes a stored
 * identitySeed).
 *
 * The seed is an input only. It is used in the browser to derive the ID and is
 * written neither to Firestore nor to localStorage. forgetSeed(uid) removes a
 * seed that earlier versions stored.
 */

import { getDocument, setDocument, removeFields } from "../firebase/firestore.js";
import { computeGeoVector, computeIdentityId, LATTICE_SPACES } from "./crypto-core.js";

export { computeGeoVector, computeIdentityId, LATTICE_SPACES };

const LOCAL_KEY = "biochain_identity";

/**
 * Commit the identity to Firestore. Refuses to overwrite once committed — the
 * derived ID is immutable. The identity carries no role: roles come only from
 * config/rootAdmins + roleGrants (see access-control.js), and firestore.rules
 * reject any role field written here. The seed is not part of the record.
 */
export async function registerIdentity(uid, identitySeed, { latticeKey = "E8" } = {}) {
  const existing = await getDocument(`users/${uid}/identity/main`);
  if (existing && existing.identityId) {
    throw new Error("Identity already committed. Identity ID cannot be regenerated.");
  }
  const result = await computeIdentityId(identitySeed, uid, latticeKey);
  const payload = {
    identityId: result.identityId,
    geoVector: result.geoVector.vector64,
    coords: result.geoVector.coords,
    entropy: result.geoVector.entropy,
    latticeSpace: latticeKey,
    committedAt: new Date().toISOString(),
    committed: true,
  };
  await setDocument(`users/${uid}/identity/main`, payload);
  saveLocalBackup(uid, payload);
  return payload;
}

/** Read the identity from Firestore. */
export async function readIdentity(uid) {
  return getDocument(`users/${uid}/identity/main`);
}

/**
 * Remove a stored identity seed: the `identitySeed` field of
 * users/{uid}/identity/main (the one identity update the rules allow) and the
 * seed in this browser's local backup. Returns true when a Firestore field was
 * removed, false when there was none.
 */
export async function forgetSeed(uid) {
  forgetLocalSeed();
  const doc = await getDocument(`users/${uid}/identity/main`);
  if (!doc || !Object.prototype.hasOwnProperty.call(doc, "identitySeed")) return false;
  await removeFields(`users/${uid}/identity/main`, ["identitySeed"]);
  return true;
}

// ─── Local Backup ─────────────────────────────────────────────────────
// Public identity fields only; the seed is never part of the backup.
export function saveLocalBackup(uid, identity) {
  if (!identity) return;
  const payload = {
    version: 2, uid,
    identityId: identity.identityId,
    coords: identity.coords,
    latticeSpace: identity.latticeSpace,
    committedAt: identity.committedAt,
    syncedAt: new Date().toISOString(),
  };
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(payload)); }
  catch (err) { console.warn("[Identity] localStorage write failed:", err); }
  return payload;
}

export function readLocalBackup() {
  try { const raw = localStorage.getItem(LOCAL_KEY); return raw ? JSON.parse(raw) : null; }
  catch { return null; }
}

/**
 * Remove a seed from this browser's local backup (written by an earlier
 * version). Nothing reads the backup's seed, so it is removed whichever account
 * wrote it. Local only; no Firestore access.
 */
export function forgetLocalSeed() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return;
    const backup = JSON.parse(raw);
    if (!backup || typeof backup !== "object" || !("identitySeed" in backup)) return;
    delete backup.identitySeed;
    localStorage.setItem(LOCAL_KEY, JSON.stringify(backup));
  } catch (err) { console.warn("[Identity] local backup cleanup failed:", err); }
}

// ─── Identity glyph (procedural SVG, deterministic from the Identity ID) ──────
export function renderIdentityIcon(identityId, size = 200) {
  const hex = String(identityId).replace(/^0x/, "").padStart(16, "0");
  const cx = size / 2, cy = size / 2, ringR = size * 0.42;
  const nodes = [];
  for (let i = 0; i < 8; i++) {
    const byte = parseInt(hex.substr(i * 2, 2), 16);
    const angle = (byte / 256) * Math.PI * 2;
    const radius = ringR * (0.4 + (byte % 16) / 32);
    nodes.push({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius, r: 2 + (byte % 5) });
  }
  let paths = "";
  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++)
      paths += `<line x1="${nodes[i].x}" y1="${nodes[i].y}" x2="${nodes[j].x}" y2="${nodes[j].y}" stroke="#D4AF37" stroke-width="0.4" opacity="0.35"/>`;
  const dots = nodes.map(n => `<circle cx="${n.x}" cy="${n.y}" r="${n.r}" fill="#FFF8DC" stroke="#D4AF37" stroke-width="0.8"/>`).join("");
  return `
    <svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" class="identity-icon">
      <circle cx="${cx}" cy="${cy}" r="${ringR}" fill="none" stroke="#D4AF37" stroke-width="0.6" opacity="0.5"/>
      <circle cx="${cx}" cy="${cy}" r="${ringR * 0.7}" fill="none" stroke="#00d4ff" stroke-width="0.4" stroke-dasharray="2 3" opacity="0.4"/>
      ${paths}${dots}
      <circle cx="${cx}" cy="${cy}" r="3" fill="#D4AF37"/>
    </svg>`;
}
