/**
 * Identity Registry — derives a user's immutable Identity ID from an identity seed.
 * ----------------------------------------------------------------------------
 * Pipeline:
 *   identitySeed → SHD-CCP 4×4×4 compression → geoVector[64]
 *   uid          → SHA-256 hash              → uidVector[64]
 *   IdentityID   = geoVector ⊕ uidVector     (bitwise XOR blend)
 *
 * The Identity ID is the geometric fingerprint that anchors a user's signing
 * keys and attestations. Once committed, it is immutable (enforced by rules:
 * identityId / identitySeed / geoVector are frozen on update).
 */

import { getDocument, setDocument } from "../firebase/firestore.js";

const LATTICE_SPACES = {
  E8:  { name: "E8 Lie Algebra",   modulus: 240,    phi: 1.618033988749 },
  R8:  { name: "ℝ⁸ Octonionic",    modulus: 128,    phi: 2.618033988749 },
  R24: { name: "ℝ²⁴ Leech Grid",   modulus: 196560, phi: 4.236067977499 },
};

const LOCAL_KEY = "biochain_identity";

// ─── Hashing ──────────────────────────────────────────────────────────
async function sha256Bytes(input) {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(buf); // 32 bytes
}

// Expand 32 → 64 bytes: every byte paired with its bitwise complement.
function expandToHolographicInverse(bytes32) {
  const out = new Uint8Array(64);
  for (let i = 0; i < 32; i++) { out[i] = bytes32[i]; out[i + 32] = 0xff ^ bytes32[i]; }
  return out;
}

// ─── SHD-CCP 4×4×4 Compression ────────────────────────────────────────
function shdccpCompress(bytes64, latticeKey) {
  const lattice = LATTICE_SPACES[latticeKey] || LATTICE_SPACES.E8;
  const phi = lattice.phi;
  let acc = 0n, cx = 0, cy = 0, cz = 0;
  for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) for (let z = 0; z < 4; z++) {
    const v = bytes64[x * 16 + y * 4 + z];
    const weight = (x + 1) * (y + 1) * (z + 1);
    acc = (acc * 31n + BigInt(v * weight)) & 0xffffffffffffffffn;
    cx += v * Math.cos((x * phi) % (2 * Math.PI));
    cy += v * Math.sin((y * phi) % (2 * Math.PI));
    cz += v * Math.cos((z * phi * phi) % (2 * Math.PI));
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
    lattice: latticeKey,
  };
}

function xorBlendHex(hexA, hexB) {
  const a = BigInt("0x" + hexA);
  const b = BigInt("0x" + hexB);
  return (a ^ b).toString(16).toUpperCase().padStart(16, "0");
}

// ─── Public API ───────────────────────────────────────────────────────

/** Compute a geometric vector from an identity seed alone (live preview). */
export async function computeGeoVector(identitySeed, latticeKey = "E8") {
  const trimmed = (identitySeed || "").trim();
  if (!trimmed) throw new Error("Identity seed is empty");
  const hash32 = await sha256Bytes(trimmed);
  const bytes64 = expandToHolographicInverse(hash32);
  return shdccpCompress(bytes64, latticeKey);
}

/** Compute the final Identity ID: seed's geo vector XOR-blended with the uid hash. */
export async function computeIdentityId(identitySeed, uid, latticeKey = "E8") {
  const geo = await computeGeoVector(identitySeed, latticeKey);
  const uidHash = await sha256Bytes(uid);
  let uidHex = "";
  for (let i = 0; i < 8; i++) uidHex += uidHash[i].toString(16).padStart(2, "0");
  const identityId = "0x" + xorBlendHex(geo.vector64, uidHex.toUpperCase());
  return { identityId, geoVector: geo };
}

/**
 * Commit the identity to Firestore. Refuses to overwrite once committed — the
 * identity seed and derived ID are immutable. `role` seeds the initial role
 * (default MEMBER; the login flow passes ADMIN for root-admin uids).
 */
export async function registerIdentity(uid, identitySeed, { latticeKey = "E8", role = "MEMBER" } = {}) {
  const existing = await getDocument(`users/${uid}/identity/main`);
  if (existing && existing.identityId) {
    throw new Error("Identity already committed. Identity ID cannot be regenerated.");
  }
  const result = await computeIdentityId(identitySeed, uid, latticeKey);
  const payload = {
    identitySeed,
    identityId: result.identityId,
    geoVector: result.geoVector.vector64,
    coords: result.geoVector.coords,
    entropy: result.geoVector.entropy,
    latticeSpace: latticeKey,
    role,
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

// ─── Local Backup ─────────────────────────────────────────────────────
export function saveLocalBackup(uid, identity) {
  if (!identity) return;
  const payload = {
    version: 1, uid,
    identityId: identity.identityId,
    identitySeed: identity.identitySeed,
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

export { LATTICE_SPACES };
