// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Schism-Labs-AI. Adapted from Owl-Academy mage_tower/Biomesh_Audit.html
// (MIT, Copyright (c) 2026 Ebayednoob); see NOTICE.
/**
 * The strict audit: RFC 07's strict check (verifyIntegrityStrict) over every
 * biochain record, read-only. The Operations Console's Audit tab (ADMIN) runs it
 * and offers the JSON report as a file to save; nothing is written anywhere.
 *
 * Firebase-free: runAudit reads pages through the listPage function it is given
 * (BM.listBiochainsPage in the console), so tests/unit/biomesh-app.test.mjs runs
 * it in Node. Labels follow decision D15: "strict ok", "legacy", "failed at
 * <check>", "self-consistent only, failed at <check>".
 *
 * Weaves are recomputed in the auditing browser. RFC 07 section 8.3 defines them
 * with V8's Math.hypot, so the audit first compares this engine with V8
 * (engineCheck, ./biomesh-engine-check.js) and records the result: when they
 * differ, a weave mismatch may come from the auditor's browser, not the grower's.
 */
import { verifyIntegrity, verifyIntegrityStrict, failedCheck, strictLabel, sha256HexSync, STRICT_CHECKS } from "./biomesh-core.js";
import { engineCheck } from "./biomesh-engine-check.js";

export const AUDIT_FORMAT = "biochain-biomesh-audit/1";

const str = (v, n) => (typeof v === "string" ? v.slice(0, n) : null);
// A value of unknown type, for the report: a string (cut to n characters), or its type in parentheses.
const shown = (v, n) => (typeof v === "string" ? v.slice(0, n)
  : "(" + (v === null ? "null" : Array.isArray(v) ? "array" : typeof v) + ")");

/** This engine against V8 (userAgent and engineCheck's result); never throws. */
export function auditEngine(nav = globalThis.navigator) {
  const userAgent = nav && typeof nav.userAgent === "string" ? nav.userAgent : null;
  try { return { userAgent, ...engineCheck() }; }
  catch (e) { return { userAgent, matchesV8: false, error: String((e && e.message) || e) }; }
}

/** One record → its audit entry. Reads nothing beyond the record. doc.id is the
 *  document id (from the query snapshot); dataId is the record's own `id` field
 *  when it has one that differs from the document id. */
export async function auditRecord(doc, dataId) {
  const v = verifyIntegrityStrict(doc);
  const f = failedCheck(v);
  const selfConsistent = v.ok || v.legacy ? null : (await verifyIntegrity(doc)).ok;
  const fields = f && Array.isArray(f.fields) ? f.fields : [];
  const weaveMismatch = v.failed === "weaves" && (fields.includes("weaveChiral") || fields.includes("weaveMirror"));
  let chainIdFromOwnWeave = null;
  if (weaveMismatch && typeof doc.merkleRoot === "string" && typeof doc.weaveChiral === "string")
    chainIdFromOwnWeave = doc.chainId === "BC-" + sha256HexSync(doc.merkleRoot + "|" + doc.weaveChiral).slice(0, 24);
  return {
    docId: doc.id,
    ...(dataId !== undefined ? { dataId: shown(dataId, 64) } : {}),
    chainId: str(doc.chainId, 64),
    idMatches: doc.id === doc.chainId,
    kind: str(doc.kind, 64),
    title: str(doc.title, 120),
    createdAt: str(doc.createdAt, 40),
    growerIdentityId: str(doc.growerIdentityId, 80),
    origBytes: typeof doc.origBytes === "number" ? doc.origBytes : null,
    label: strictLabel(v, selfConsistent),
    strict: { ok: v.ok, failed: v.failed, legacy: v.legacy, detail: f ? f.detail : null, fields },
    selfConsistent,
    rootless: !Array.isArray(doc.leafHashes) || typeof doc.merkleRoot !== "string",
    weaveMismatch,
    chainIdFromOwnWeave,
  };
}

/** The report of a run: counts, notes, the weave-mismatch subset and every entry. */
export function buildReport(entries, run) {
  const failedAt = Object.fromEntries(STRICT_CHECKS.map((c) => [c, 0]));
  const byKind = {};
  const counts = { records: entries.length, strictOk: 0, legacy: 0, failed: 0, selfConsistentOnly: 0, rootless: 0,
                   weaveMismatch: 0, idMismatch: 0, dataIdMismatch: 0, failedAt, byKind };
  for (const e of entries) {
    const k = e.kind || "(none)";
    byKind[k] = byKind[k] || { records: 0, strictOk: 0 };
    byKind[k].records++;
    if (e.strict.ok) { counts.strictOk++; byKind[k].strictOk++; }
    else if (e.strict.legacy) counts.legacy++;
    else { counts.failed++; failedAt[e.strict.failed]++; }
    if (e.selfConsistent === true) counts.selfConsistentOnly++;
    if (e.rootless) counts.rootless++;
    if (e.weaveMismatch) counts.weaveMismatch++;
    if (!e.idMatches) counts.idMismatch++;
    if ("dataId" in e) counts.dataIdMismatch++;
  }
  return {
    format: AUDIT_FORMAT,
    startedAt: run.startedAt,
    generatedAt: new Date().toISOString(),
    verifier: "verifyIntegrityStrict, src/biomesh/biomesh-core.js (generated from Owl-Academy; RFC 07 section 12, BioChainAI/SHD-CCP-core)",
    strictEnforce: run.strictEnforce,
    auditEngineMatchesV8: run.engine.matchesV8,
    auditEngine: run.engine,
    checks: [...STRICT_CHECKS],
    pageSize: run.pageSize,
    pages: run.pages,
    notes: [
      "failedAt counts the first failing check of records that are not legacy.",
      "selfConsistentOnly: the strict check fails and verifyIntegrity (self-consistency) passes.",
      "rootless: the record has no leafHashes array or no merkleRoot string.",
      "weaveMismatch: the record fails at weaves with weaveChiral or weaveMirror not reproduced; it may have been grown in a browser whose Math.hypot differs from V8's (RFC 07 section 8.7, D7). chainIdFromOwnWeave tells whether its chainId matches its own merkleRoot and weaveChiral.",
      "auditEngine: the auditing browser (userAgent) and its comparison with V8 on the 24 hypot vectors of shdccp2_arith and a seeded weave (src/biomesh/biomesh-engine-check.js). When auditEngineMatchesV8 is false, the weaves were recomputed with arithmetic that differs from V8's, so weaveMismatch may count records that reproduce in V8.",
      "idMismatch: the document id is not the record's chainId field.",
      "dataIdMismatch: the record's data has its own id field, different from its document id (dataId shows it); docId is always the document id.",
    ],
    counts,
    weaveMismatch: entries.filter((e) => e.weaveMismatch).map((e) => ({ docId: e.docId, chainId: e.chainId, kind: e.kind,
      createdAt: e.createdAt, fields: e.strict.fields, chainIdFromOwnWeave: e.chainIdFromOwnWeave })),
    records: entries,
  };
}

/** Run the audit over every page. listPage(pageSize, afterId) → { records, lastId, dataIds }
 *  (BM.listBiochainsPage). onProgress({ pages, records }) is called after each record; pause()
 *  yields to the page between records. → the report. On an error the thrown Error carries
 *  `checked`, the number of records checked before it. */
export async function runAudit({ listPage, pageSize = 50, strictEnforce = false, engine = auditEngine(),
                                 onProgress = () => {}, pause = () => new Promise((r) => setTimeout(r, 0)) }) {
  const run = { startedAt: new Date().toISOString(), pageSize, pages: 0, engine, strictEnforce };
  const entries = [];
  let after = null;
  try {
    for (;;) {
      // The cursor is the last document id of the page, from the query snapshot (never a field of the data).
      const page = await listPage(pageSize, after);
      run.pages++;
      for (const doc of page.records) {
        entries.push(await auditRecord(doc, page.dataIds.get(doc.id)));
        onProgress({ pages: run.pages, records: entries.length });
        await pause();
      }
      if (page.records.length < pageSize || page.lastId === null) break;
      if (page.lastId === after) throw new Error("the page cursor did not advance");
      after = page.lastId;
    }
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    err.checked = entries.length;
    throw err;
  }
  return buildReport(entries, run);
}
