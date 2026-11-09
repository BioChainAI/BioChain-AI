// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Schism-Labs-AI. Ported from Owl-Academy scripts/biomesh.js (MIT, Copyright (c) 2026
// Ebayednoob); see NOTICE.
/**
 * BioMesh — biochain growing, certification, free transfer & marketplace.
 * ----------------------------------------------------------------------------
 * The standalone deployment of the BioChain protocol engram machinery:
 *
 *  • GROW    — grow a biochain in the growth substrate (in-browser, the measured
 *              predict-then-correct cell: order-2 rank coder, 720-byte chunks,
 *              crystal packets, 7 weave segments with chiral + mirror
 *              holonomies).
 *  • CERTIFY — the grower signs a GROWN/1 commitment with their signing key.
 *              Certification is therefore revocable, verifiable by any
 *              signed-in user, and traces to an Identity via keyRegistry/{keyId}.
 *  • SEND    — transfers are ALWAYS FREE. A transfer is a signed TRANSFER/1
 *              record; ownership only moves when the recipient accepts. The
 *              transfer docs are the lineage — never deleted.
 *  • RATE    — marketplace ratings: measured value + verified integrity are
 *              automatic; utility stars come from raters (role-weighted).
 *
 * Trust posture: client-side crypto with firestore.rules as the backstop (see
 * rules: biochains / transfers / ratings). Every event is also written to the
 * append-only audit log.
 *
 * The pure, Firebase-free functions (grow, recreate, verify, engrams, seeds,
 * codex derivation, commitments, the strict verifier, the kind registry) are in
 * ./biomesh-core.js, generated from Owl-Academy's scripts/biomesh-core.js by
 * tools/sync-from-owl.mjs (never edited here; OWL_COMMIT in that script pins
 * the commit, src/biomesh/VENDOR.json records it). This module re-exports all
 * of them and keeps the Firestore services.
 *
 * Strict verification (verifyIntegrityStrict, RFC 07 section 12, in
 * BioChainAI/SHD-CCP-core) runs in shadow mode while STRICT_ENFORCE is false:
 * publishBiochain always refuses a record that fails it; acceptBiochain,
 * extendBiochain and traceBiochain compute the verdict and return it, and refuse
 * on it only when STRICT_ENFORCE is true. STRICT_ENFORCE is set here, not in the
 * generated core, so BioChain-AI turns it on independently of Owl-Academy.
 */

import {
  getDocument, setDocument, updateDocument, addToCollection, queryCollection, queryDocuments,
  where, orderBy, limit, startAfter, documentId,
} from "../firebase/firestore.js";
import { readIdentity } from "../identity/identity-registry.js";
import { getEpoch } from "../identity/epoch-service.js";
import { signWithKey, verifyAttestation } from "../identity/signing-key.js";
import { resolveRole } from "../identity/access-control.js";
import * as CC from "../identity/crypto-core.js";
import {
  verifyIntegrity, verifyIntegrityStrict, strictLabel, validateKind, extendBiochain as extendBiochainCore,
  growthCommitment, grownCommitment, parseCodexStream, codexCommitment, pairCommitment,
} from "./biomesh-core.js";

export * from "./biomesh-core.js";

/** Shadow mode: false computes strict verdicts on accept, extend, trace and the
 *  console pages without refusing on them; true makes them refuse.
 *  publishBiochain refuses a record that fails the strict check either way. */
export const STRICT_ENFORCE = false;

/** extendBiochain from biomesh-core.js with this module's STRICT_ENFORCE: the
 *  parent's strict verdict is on the result as `parentStrict` (not enumerable,
 *  so it is not stored when the child is published). */
export const extendBiochain = (parentChain, newText, opts = {}) =>
  extendBiochainCore(parentChain, newText, { ...opts, enforceStrict: STRICT_ENFORCE });

/** Verify a child epoch's GROWTH/1 attestation against the record's commitment. */
export async function verifyGrowth(chain) {
  if (!chain.parentChainId) return { valid: false, reason: "not a growth epoch" };
  if (!chain.growthAttestation) return { valid: false, reason: "no growth certification block" };
  const base = await verifyAttestation(chain.growthAttestation);
  if (!base.valid) return base;
  const h = await CC.sha256Hex(growthCommitment(chain));
  const match = h === chain.growthAttestation.contentHash;
  return { ...base, valid: base.valid && match,
    reason: match ? `epoch ${chain.epoch} grown from ${chain.parentChainId} by ` + base.identityId
                  : "growth commitment does not match certification" };
}

// ─── certification (GROWN/1) + publication ───────────────────────────────────

/** Publish a grown biochain: sign the commitment with a key, write the record.
 *  The record must pass verifyIntegrityStrict whatever STRICT_ENFORCE says, and
 *  meta.kind (default "text") must be in KINDS; meta.crystCost, when given, must
 *  be a finite number ≥ 0. All three are checked before anything is signed or
 *  written; `kind` and `crystCost` are stored on the record. */
export async function publishBiochain(uid, keyId, chain, meta = {}) {
  const strict = verifyIntegrityStrict(chain);
  if (!strict.ok) throw new Error("Not published: the record fails the strict check (" + strictLabel(strict) + ").");
  const kind = validateKind(meta.kind === undefined ? "text" : meta.kind);
  if (meta.crystCost !== undefined && !(typeof meta.crystCost === "number" && Number.isFinite(meta.crystCost) && meta.crystCost >= 0))
    throw new Error("Not published: crystCost must be a number ≥ 0.");
  const id = await readIdentity(uid);
  if (!id || !id.identityId) throw new Error("Commit your Identity first.");
  const grownAttestation = await signWithKey(uid, keyId, grownCommitment(chain));
  const growthAttestation = chain.parentChainId
    ? await signWithKey(uid, keyId, growthCommitment(chain)) : null;
  const epoch = await getEpoch();
  const rec = {
    ...chain,
    kind,
    ...(meta.crystCost !== undefined ? { crystCost: meta.crystCost } : {}),
    title: meta.title || "Untitled Biochain",
    description: meta.description || "",
    growerUid: uid, growerIdentityId: id.identityId, growerKeyId: keyId,
    grownAttestation,                                 // the certification block
    ...(growthAttestation ? { growthAttestation } : {}),
    ownerUid: uid, ownerIdentityId: id.identityId,
    lineage: [{
      event: chain.parentChainId ? "extended" : "grown",
      uid, identityId: id.identityId, epoch: epoch.token, at: new Date().toISOString(),
      ...(chain.parentChainId ? { parentChainId: chain.parentChainId, chainEpoch: chain.epoch } : {}),
    }],
    lastTransferId: null, transferSeq: 0,
    status: meta.listed ? "listed" : "grown",
    epochToken: epoch.token,
    createdAt: new Date().toISOString(),
  };
  await setDocument(`biochains/${chain.chainId}`, rec);
  await addToCollection("auditLog", {
    kind: chain.parentChainId ? "biomesh.extended" : "biomesh.grown",
    uid, chainId: chain.chainId, identityId: id.identityId, keyId,
    merkleRoot: chain.merkleRoot, epochToken: epoch.token,
    ...(chain.parentChainId ? { parentChainId: chain.parentChainId, chainEpoch: chain.epoch } : {}),
  });
  return rec;
}

/** Verify certification: the GROWN/1 attestation against the record's commitment. */
export async function verifyGrown(chain) {
  if (!chain.grownAttestation) return { valid: false, reason: "no certification block" };
  const base = await verifyAttestation(chain.grownAttestation);
  if (!base.valid) return base;
  const h = await CC.sha256Hex(grownCommitment(chain));
  const match = h === chain.grownAttestation.contentHash;
  return { ...base, valid: base.valid && match,
    reason: match ? "certified grown by " + base.identityId : "commitment does not match certification" };
}

export const listBiochains = (max = 100) =>
  queryCollection("biochains", [orderBy("createdAt", "desc"), limit(max)]);
export const getBiochain = (chainId) => getDocument(`biochains/${chainId}`);
/** One page of every biochain, in document-id order (records without createdAt
 *  included). → { records, lastId, dataIds }. Each record is the document's
 *  fields with `id` set to its document id. lastId is the last document id of
 *  the page, taken from the query snapshot (null for an empty page): pass it as
 *  `afterId` for the next page. dataIds maps the document id of each record
 *  whose data has its own `id` field, different from the document id, to that
 *  field's value. */
export async function listBiochainsPage(pageSize = 50, afterId = null) {
  const docs = await queryDocuments("biochains",
    [orderBy(documentId()), ...(afterId !== null ? [startAfter(afterId)] : []), limit(pageSize)]);
  const dataIds = new Map();
  for (const d of docs)
    if (Object.prototype.hasOwnProperty.call(d.data, "id") && d.data.id !== d.id) dataIds.set(d.id, d.data.id);
  return {
    records: docs.map(({ id, data }) => ({ ...data, id })),
    lastId: docs.length ? docs[docs.length - 1].id : null,
    dataIds,
  };
}

/** Owner toggles marketplace listing (transfers stay free either way). */
export async function setListing(uid, chainId, listed) {
  await updateDocument(`biochains/${chainId}`, { status: listed ? "listed" : "grown" });
  await addToCollection("auditLog", { kind: "biomesh.listing", uid, chainId, listed });
}

// ─── codex files (CODEX/1) + chain pairing (PAIR/1): publication ────────────
// deriveCodex, parseCodexStream, codexCommitment and pairCommitment are in
// biomesh-core.js (the same closed instruction set as protocol/codex_engine.py).

/** Publish a codex: sign the commitment, write the immutable record. */
export async function publishCodex(uid, keyId, codex, meta = {}) {
  const id = await readIdentity(uid);
  if (!id || !id.identityId) throw new Error("Commit your Identity first.");
  parseCodexStream(codex.stream);                                    // ABI gate before write
  const codexAttestation = await signWithKey(uid, keyId, codexCommitment(codex));
  await setDocument(`codices/${codex.codexHash}`, {
    ...codex,
    title: meta.title || "Untitled Codex",
    derivedFromChainId: meta.derivedFromChainId || null,
    creatorUid: uid, creatorIdentityId: id.identityId, creatorKeyId: keyId,
    codexAttestation, createdAt: new Date().toISOString(),
  });
  await addToCollection("auditLog", { kind: "biomesh.codex", uid, codexHash: codex.codexHash,
    identityId: id.identityId, entryCount: codex.entryCount });
  return codex.codexHash;
}

export const getCodex = (codexHash) => getDocument(`codices/${codexHash}`);

/** Pair a codex to a chain you own — both then travel together on the mesh. */
export async function pairCodex(uid, keyId, chainId, codexHash) {
  const chain = await getBiochain(chainId);
  if (!chain) throw new Error("Unknown biochain.");
  if (chain.ownerUid !== uid) throw new Error("Only the current owner may pair a codex.");
  if (!(await getCodex(codexHash))) throw new Error("Unknown codex — publish it first.");
  const pairAttestation = await signWithKey(uid, keyId, pairCommitment(chainId, codexHash));
  await updateDocument(`biochains/${chainId}`, { pairedCodexHash: codexHash, pairAttestation });
  await addToCollection("auditLog", { kind: "biomesh.paired", uid, chainId, codexHash });
  return true;
}

/** Verify a chain's codex pairing attestation. */
export async function verifyPair(chain) {
  if (!chain.pairedCodexHash) return { valid: false, reason: "no codex paired" };
  if (!chain.pairAttestation) return { valid: false, reason: "pairing has no attestation" };
  const base = await verifyAttestation(chain.pairAttestation);
  if (!base.valid) return base;
  const h = await CC.sha256Hex(pairCommitment(chain.chainId, chain.pairedCodexHash));
  const match = h === chain.pairAttestation.contentHash;
  return { ...base, valid: base.valid && match,
    reason: match ? `codex ${chain.pairedCodexHash} paired by ` + base.identityId
                  : "pairing does not match attestation" };
}

// ─── free transfers (TRANSFER/1) — the lineage spine ─────────────────────────
// Transfers are sequenced per chain: each is stamped with the chain's current
// `transferSeq` (its `chainSeq`), and accepting one advances the chain to
// chainSeq + 1. The rules only move ownership for a transfer sent by the
// CURRENT owner at the CURRENT sequence, so every transfer is single-use and an
// old accepted one can never be replayed to reclaim the chain.

const chainSeqOf = (chain) => chain.transferSeq || 0;

export async function sendBiochain(uid, keyId, chainId, toUid) {
  const chain = await getBiochain(chainId);
  if (!chain) throw new Error("Unknown biochain.");
  if (chain.ownerUid !== uid) throw new Error("Only the current owner may send a biochain.");
  const id = await readIdentity(uid);
  const epoch = await getEpoch();
  const payload = ["TRANSFER/1", chainId, id.identityId, toUid, epoch.token].join("|");
  const xferAttestation = await signWithKey(uid, keyId, payload);
  const doc = await addToCollection("transfers", {
    chainId, fromUid: uid, fromIdentityId: id.identityId, toUid,
    payload, xferAttestation, price: 0,           // transfers are ALWAYS free
    chainSeq: chainSeqOf(chain),
    status: "pending", epochToken: epoch.token, sentAt: new Date().toISOString(),
  });
  await addToCollection("auditLog", { kind: "biomesh.sent", uid, chainId, toUid, transferId: doc.id });
  return doc.id;
}

/** Recipient accepts: transfer flips to accepted, then ownership moves (rules
 *  verify the accepted transfer addressed to the caller, sent by the current
 *  owner at the chain's current sequence, before allowing it).
 *  The chain's strict verdict is computed before any write and returned
 *  ({ accepted: true, strict }); it refuses only when STRICT_ENFORCE is true. */
export async function acceptBiochain(uid, transferId) {
  const t = await getDocument(`transfers/${transferId}`);
  if (!t) throw new Error("Unknown transfer.");
  if (t.toUid !== uid) throw new Error("This transfer is not addressed to you.");
  if (t.status !== "pending") throw new Error(`Transfer already ${t.status}.`);
  const check = await verifyAttestation(t.xferAttestation);
  if (!check.valid) throw new Error("Sender's transfer attestation fails verification: " + check.reason);
  // Refuse stale transfers BEFORE flipping status, so a transfer the rules would
  // not honor is never left marked "accepted" with ownership unmoved.
  const chain = await getBiochain(t.chainId);
  if (!chain) throw new Error("Unknown biochain.");
  if (chain.ownerUid !== t.fromUid || typeof t.chainSeq !== "number" || t.chainSeq !== chainSeqOf(chain))
    throw new Error("This transfer is stale — the chain has changed hands since it was sent. Ask the current owner to send it again.");
  const strict = verifyIntegrityStrict(chain);
  if (STRICT_ENFORCE && !strict.ok) throw new Error("Not accepted: the chain fails the strict check (" + strictLabel(strict) + ").");
  const id = await readIdentity(uid);
  await updateDocument(`transfers/${transferId}`, { status: "accepted", acceptedAt: new Date().toISOString() });
  await updateDocument(`biochains/${t.chainId}`, {
    ownerUid: uid, ownerIdentityId: id?.identityId || null, lastTransferId: transferId,
    transferSeq: t.chainSeq + 1,
    lineage: [...(chain.lineage || []), {
      event: "transfer", transferId, fromUid: t.fromUid, fromIdentityId: t.fromIdentityId,
      toUid: uid, toIdentityId: id?.identityId || null, epoch: t.epochToken, at: new Date().toISOString(),
    }],
  });
  await addToCollection("auditLog", { kind: "biomesh.accepted", uid, chainId: t.chainId, transferId });
  return { accepted: true, strict };
}

export const declineBiochain = async (uid, transferId) => {
  await updateDocument(`transfers/${transferId}`, { status: "declined" });
  await addToCollection("auditLog", { kind: "biomesh.declined", uid, transferId });
};

export const listIncoming = (uid) =>
  queryCollection("transfers", [where("toUid", "==", uid), where("status", "==", "pending")]);
export const listTransfersForChain = (chainId) =>
  queryCollection("transfers", [where("chainId", "==", chainId)]);
export const listAllTransfers = (max = 200) =>
  queryCollection("transfers", [orderBy("createdAt", "desc"), limit(max)]);

/** Record that a Language Studio session was burned (destroyed, unexported).
 *  Logs ONLY the fact + turn count + last parity — never the content — so a burn
 *  is itself an auditable system event even though the session it destroys is
 *  deliberately unrecoverable. */
export async function logSessionBurn(uid, turnCount, parityHex) {
  await addToCollection("auditLog", {
    kind: "biomesh.session_burned", uid, turnCount, parityHex, at: new Date().toISOString(),
  });
}

/** Full trace: certification + every hop's attestation, verified, and the
 *  record's self-consistency (`integrity`) and strict verdict (`strict`). When
 *  STRICT_ENFORCE is true a strict failure also fails `integrity`; `selfCheck`
 *  is verifyIntegrity's own result either way (the label uses it). */
export async function traceBiochain(chainId) {
  const chain = await getBiochain(chainId);
  if (!chain) throw new Error("Unknown biochain.");
  const grown = await verifyGrown(chain);
  const transfers = (await listTransfersForChain(chainId))
    .sort((a, b) => (a.sentAt || "").localeCompare(b.sentAt || ""));
  const hops = [];
  for (const t of transfers) {
    const v = await verifyAttestation(t.xferAttestation);
    hops.push({ ...t, attestationValid: v.valid, attestationReason: v.reason, senderIdentity: v.identityId || t.fromIdentityId });
  }
  const selfCheck = await verifyIntegrity(chain);
  const strict = verifyIntegrityStrict(chain);
  const integrity = STRICT_ENFORCE && !strict.ok
    ? { ok: false, reasons: ["strict check: " + strictLabel(strict, selfCheck.ok), ...selfCheck.reasons] }
    : selfCheck;
  return { chain, grown, hops, integrity, selfCheck, strict };
}

// ─── marketplace ratings → success score ─────────────────────────────────────

const ROLE_WEIGHT = { ADMIN: 3, OPERATOR: 2, MEMBER: 1 };

export async function rateBiochain(uid, chainId, stars, comment = "", recreatedOk = null) {
  const id = await readIdentity(uid);
  let role = "MEMBER";
  try { role = await resolveRole(uid); } catch (_) {}
  await setDocument(`ratings/${chainId}_${uid}`, {
    chainId, raterUid: uid, raterIdentityId: id?.identityId || null, raterRole: role,
    stars: Math.max(1, Math.min(5, Math.round(stars))), comment: String(comment).slice(0, 500),
    recreatedOk, ratedAt: new Date().toISOString(),
  });
  await addToCollection("auditLog", { kind: "biomesh.rated", uid, chainId, stars });
}

export const listRatings = (chainId) =>
  queryCollection("ratings", [where("chainId", "==", chainId)]);

/** Success score: measured value 40 · verified integrity 25 · utility stars 25 · adoption 10. */
export function successScore(chain, ratings = [], transferCount = 0) {
  const valuePart = 40 * Math.min(1, (chain.value || 0) / 2);            // value 2.0 ≈ ceiling
  const verified = ratings.filter(r => r.recreatedOk === true).length;
  const integrityPart = 25 * (ratings.length ? Math.min(1, verified / Math.max(1, ratings.length)) : 0);
  let wsum = 0, wtot = 0;
  for (const r of ratings) { const w = ROLE_WEIGHT[r.raterRole] || 1; wsum += w * (r.stars || 0); wtot += w; }
  const starsPart = 25 * (wtot ? (wsum / wtot) / 5 : 0);
  const adoptionPart = 10 * Math.min(1, transferCount / 5);
  return {
    total: +(valuePart + integrityPart + starsPart + adoptionPart).toFixed(1),
    parts: { value: +valuePart.toFixed(1), integrity: +integrityPart.toFixed(1),
             stars: +starsPart.toFixed(1), adoption: +adoptionPart.toFixed(1) },
    verifiedCount: verified, ratingCount: ratings.length, transferCount,
  };
}
