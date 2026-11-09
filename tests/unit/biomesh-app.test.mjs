// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Schism-Labs-AI
//
// src/biomesh/biomesh.js (the app layer over the generated core) against the in-memory Firebase stand-in:
//   - publishBiochain refuses a record that fails the strict check, an unknown kind or a bad crystCost before it
//     signs or writes anything, whatever STRICT_ENFORCE says, and stores kind and crystCost;
//   - accept, trace and extend compute the strict verdict in shadow mode and refuse on it only with
//     STRICT_ENFORCE = true (a copy of biomesh.js loaded from a data: URL with the flag on);
//   - the Firestore rows carry the document id, listBiochainsPage pages by document id, and the strict audit
//     (src/biomesh/audit.js) counts what it should and writes nothing.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sdk } from "./support/env.mjs";

const BM = await import("../../src/biomesh/biomesh.js");
const SK = await import("../../src/identity/signing-key.js");
const FS = await import("../../src/firebase/firestore.js");
const AUDIT = await import("../../src/biomesh/audit.js");

/** biomesh.js with STRICT_ENFORCE = true, imported from a data: URL (its relative imports made absolute). */
async function enforcing() {
  const url = new URL("../../src/biomesh/biomesh.js", import.meta.url);
  const src = readFileSync(url, "utf8");
  assert.equal(src.split("export const STRICT_ENFORCE = false;").length, 2, "one flag line");
  const text = src.replace("export const STRICT_ENFORCE = false;", "export const STRICT_ENFORCE = true;")
    .replace(/(from\s*")(\.\.?\/[^"]+)(")/g, (_, a, rel, b) => a + new URL(rel, url).href + b);
  return import("data:text/javascript;base64," + Buffer.from(text, "utf8").toString("base64"));
}
const BME = await enforcing();

const tamper = JSON.parse(readFileSync(new URL("../vendor/shdccp2-contract/suites/shdccp2_tamper.json", import.meta.url), "utf8"));
const tcase = (id) => structuredClone(tamper.cases.find((c) => c.id === id).input.record);
const T2 = () => tcase("T2_crystal_packet0_bit0");          // self-consistent only, failed at crystal

const U1 = "U1", U2 = "U2";
let KEY = null;
beforeEach(async () => {
  sdk.reset();
  sdk.store.set(`users/${U1}/identity/main`, { identityId: "0x0D450E41BC04837A", geoVector: "3C29AEAE666615A2" });
  sdk.store.set(`users/${U2}/identity/main`, { identityId: "0x1111111111111111", geoVector: "2222222222222222" });
  KEY = (await SK.createSigningKey(U1, {}, "test key")).keyId;
  sdk.writes.length = 0;
});

// ---------------------------------------------------------------- publish

test("publishBiochain stores kind (default text) and crystCost, and the record passes the strict check", async () => {
  const chain = await BM.growBiochain("A record grown for the publish test.");
  const rec = await BM.publishBiochain(U1, KEY, chain, { title: "t" });
  assert.equal(rec.kind, "text");
  assert.equal("crystCost" in rec, false);
  assert.equal(sdk.store.get(`biochains/${chain.chainId}`).kind, "text");
  const env = await BM.growBiochain(JSON.stringify({ kind: "ENVIRONMENT/1", v: 1 }));
  await BM.publishBiochain(U1, KEY, env, { kind: "latticeforge.environment", crystCost: 12 });
  const stored = sdk.store.get(`biochains/${env.chainId}`);
  assert.equal(stored.kind, "latticeforge.environment");
  assert.equal(stored.crystCost, 12);
  for (const kind of ["language-session", "latticeforge.lattice_seed"]) {
    const c = await BM.growBiochain("kind " + kind);
    assert.equal((await BM.publishBiochain(U1, KEY, c, { kind })).kind, kind);
  }
  assert.equal(BM.verifyIntegrityStrict(stored).ok, true, "the stored record (with its extra fields) still passes");
});

test("publishBiochain refuses a strict failure, an unknown kind or a bad crystCost before signing or writing", async () => {
  const good = await BM.growBiochain("A record grown for the refusal test.");
  const cases = [
    [T2(), {}, /fails the strict check \(failed at crystal\)/],
    [tcase("T1_no_leaves_no_root"), {}, /failed at leaves/],
    [tcase("legacy_streams"), {}, /\(legacy\)/],
    [good, { kind: "mindseye.unknown" }, /Unknown biochain kind/],
    [good, { kind: 7 }, /Unknown biochain kind/],
    [good, { crystCost: -1 }, /crystCost/],
    [good, { crystCost: Number.NaN }, /crystCost/],
    [good, { crystCost: "5" }, /crystCost/],
  ];
  for (const [chain, meta, re] of cases) {
    sdk.writes.length = 0;
    await assert.rejects(BM.publishBiochain(U1, KEY, chain, meta), re);
    assert.deepEqual(sdk.writes, [], `nothing written (${re})`);
  }
  await assert.rejects(BME.publishBiochain(U1, KEY, T2(), {}), /strict check/, "the same with the flag on");
});

// ---------------------------------------------------------------- accept, trace, extend

async function seedTransfer(chain) {
  const chainId = chain.chainId;
  sdk.store.set(`biochains/${chainId}`, { ...chain, ownerUid: U1, growerUid: U1, transferSeq: 0, lineage: [] });
  const xferAttestation = await SK.signWithKey(U1, KEY, ["TRANSFER/1", chainId, "0x0D450E41BC04837A", U2, "EPOCH.1"].join("|"));
  sdk.store.set("transfers/X1", { chainId, fromUid: U1, toUid: U2, status: "pending", chainSeq: 0, xferAttestation, epochToken: "EPOCH.1" });
  sdk.writes.length = 0;
  return chainId;
}

test("acceptBiochain: shadow mode accepts and returns the strict verdict; with STRICT_ENFORCE it refuses before writing", async () => {
  const chainId = await seedTransfer(T2());
  await assert.rejects(BME.acceptBiochain(U2, "X1"), /Not accepted: the chain fails the strict check \(failed at crystal\)/);
  assert.deepEqual(sdk.writes, [], "nothing written under the flag");
  const r = await BM.acceptBiochain(U2, "X1");
  assert.equal(r.accepted, true);
  assert.deepEqual([r.strict.ok, r.strict.failed], [false, "crystal"]);
  assert.equal(sdk.store.get(`biochains/${chainId}`).ownerUid, U2);
  assert.equal(sdk.store.get("transfers/X1").status, "accepted");
});

test("acceptBiochain on an honest chain: accepted, strict ok, with the flag on too", async () => {
  await seedTransfer(await BM.growBiochain("An honest chain to transfer."));
  const r = await BME.acceptBiochain(U2, "X1");
  assert.deepEqual([r.accepted, r.strict.ok], [true, true]);
});

test("traceBiochain returns the strict verdict and the self-consistency check; the flag makes a strict failure fail integrity", async () => {
  const chainId = await seedTransfer(T2());
  const t = await BM.traceBiochain(chainId);
  assert.deepEqual([t.strict.ok, t.strict.failed, t.selfCheck.ok], [false, "crystal", true]);
  assert.equal(t.integrity, t.selfCheck, "shadow mode: integrity is the self-consistency check");
  assert.equal(BM.strictLabel(t.strict, t.selfCheck.ok), "self-consistent only, failed at crystal");
  assert.equal(t.hops.length, 1);
  const te = await BME.traceBiochain(chainId);
  assert.equal(te.integrity.ok, false);
  assert.equal(te.integrity.reasons[0], "strict check: self-consistent only, failed at crystal");
  assert.equal(te.selfCheck.ok, true);
});

test("extendBiochain: the parent's strict verdict is on the child (not enumerable); the flag refuses a failing parent", async () => {
  const child = await BM.extendBiochain(T2(), " more");
  assert.deepEqual([child.parentStrict.ok, child.parentStrict.failed], [false, "crystal"]);
  assert.equal(Object.keys(child).includes("parentStrict"), false);
  await assert.rejects(BME.extendBiochain(T2(), " more"), /Parent chain fails the strict check: failed at crystal/);
  const honest = await BM.growBiochain("parent text");
  const ok = await BME.extendBiochain(honest, " and child text");
  assert.deepEqual([ok.parentStrict.ok, ok.epoch, ok.parentChainId], [true, 2, honest.chainId]);
  assert.equal(BM.recreateText(ok), "parent text and child text");
});

// ---------------------------------------------------------------- Firestore rows, paging, the audit

test("rows carry the document id: a field named id in the data does not replace it", async () => {
  sdk.store.set("transfers/T-real", { id: "T-other", chainId: "BC-1", toUid: U2, status: "pending" });
  assert.equal((await FS.getDocument("transfers/T-real")).id, "T-real");
  assert.deepEqual((await FS.queryCollection("transfers", [FS.where("toUid", "==", U2)])).map((r) => r.id), ["T-real"]);
  assert.deepEqual((await BM.listIncoming(U2)).map((r) => r.id), ["T-real"]);
  assert.deepEqual(await FS.queryDocuments("transfers", []), [{ id: "T-real", data: { id: "T-other", chainId: "BC-1", toUid: U2, status: "pending" } }]);
});

async function seedChains(n) {
  const ids = [];
  for (let i = 0; i < n; i++) {
    const c = await BM.growBiochain(`chain number ${i} for the paging test`);
    sdk.store.set(`biochains/${c.chainId}`, { ...c, kind: "text", title: `c${i}`, growerIdentityId: "0x0D450E41BC04837A" });
    ids.push(c.chainId);
  }
  return ids.sort();
}

test("listBiochainsPage pages by document id with the snapshot's last id, whatever id fields the data holds", async () => {
  const ids = await seedChains(7);
  sdk.store.get(`biochains/${ids[2]}`).id = "0";                 // data ids that must not steer the cursor
  sdk.store.get(`biochains/${ids[6]}`).id = 42;
  const seen = [];
  let after = null, pages = 0, dataIds = new Map();
  for (;;) {
    const p = await BM.listBiochainsPage(3, after);
    pages++;
    seen.push(...p.records.map((r) => r.id));
    for (const [k, v] of p.dataIds) dataIds.set(k, v);
    if (p.records.length < 3 || p.lastId === null) break;
    after = p.lastId;
  }
  assert.deepEqual(seen, ids, "every record once, in document-id order");
  assert.equal(pages, 3);
  assert.deepEqual([...dataIds], [[ids[2], "0"], [ids[6], 42]]);
});

test("the strict audit counts strict ok, legacy, failures, self-consistent only, weave mismatches and id mismatches, and writes nothing", async () => {
  const ids = await seedChains(3);
  const put = (docId, rec) => sdk.store.set(`biochains/${docId}`, rec);
  const t2 = T2(); put(t2.chainId, { ...t2, kind: "text" });
  const leg = tcase("legacy_streams"); put("BC-legacy", leg);
  const wv = tcase("weavechiral_changed"); put("BC-weave", { ...wv, chainId: "BC-weave" });   // its own document
  const moved = await BM.growBiochain("stored under another document id"); put("BC-elsewhere", { ...moved, id: "BC-x" });
  sdk.writes.length = 0;
  const progress = [];
  const report = await AUDIT.runAudit({ listPage: BM.listBiochainsPage, pageSize: 2, pause: async () => {}, onProgress: (p) => progress.push(p) });
  assert.deepEqual(sdk.writes, [], "the audit writes nothing");
  const c = report.counts;
  assert.equal(c.records, 7);
  assert.equal(c.strictOk, 4);
  assert.equal(c.legacy, 1);
  assert.equal(c.failed, 2);
  assert.equal(c.failedAt.crystal, 1);
  assert.equal(c.failedAt.weaves, 1);
  assert.equal(c.selfConsistentOnly, 1, "T2 is self-consistent only");
  assert.equal(c.weaveMismatch, 1);
  assert.equal(c.idMismatch, 2, "BC-legacy and BC-elsewhere are not their chainId");
  assert.deepEqual(report.weaveMismatch.map((w) => [w.docId, w.chainIdFromOwnWeave]), [["BC-weave", false]]);
  assert.equal(c.dataIdMismatch, 1);
  assert.equal(report.pages, 4);
  assert.equal(report.format, "biochain-biomesh-audit/1");
  assert.equal(report.auditEngineMatchesV8, true, "Node computes weaves as V8 does");
  assert.equal(progress.at(-1).records, 7);
  const e = report.records.find((r) => r.docId === t2.chainId);
  assert.equal(e.label, "self-consistent only, failed at crystal");
  assert.equal(report.records.find((r) => r.docId === "BC-elsewhere").dataId, "BC-x");
  assert.ok(ids.every((id) => report.records.find((r) => r.docId === id).label === "strict ok"));
});

test("the audit stops when the page cursor does not advance", async () => {
  const page = { records: [{ id: "a" }, { id: "b" }], lastId: "b", dataIds: new Map() };
  await assert.rejects(AUDIT.runAudit({ listPage: async (_, after) => (after === "b" ? page : page), pageSize: 2, pause: async () => {} }),
    (e) => /did not advance/.test(e.message) && e.checked === 4);
});

test("the Operations Console shows the audit tab to ADMIN accounts only and runs the audit read-only", () => {
  const html = readFileSync(new URL("../../console/Operations_Console.html", import.meta.url), "utf8");
  assert.match(html, /<div class="tab hidden" data-tab="audit" id="auditTab">Audit<\/div>/);
  assert.match(html, /\$\("#auditTab"\)\.classList\.toggle\("hidden", ROLE !== "ADMIN"\);/);
  assert.match(html, /if \(ROLE !== "ADMIN"\) return toast\(/);
  assert.match(html, /listPage: BM\.listBiochainsPage/);
  assert.match(html, /kind: "text"/, "the console publishes kind text");
  const studio = readFileSync(new URL("../../console/Language_Studio.html", import.meta.url), "utf8");
  assert.match(studio, /kind: "language-session"/);
  assert.match(studio, /BM\.STRICT_ENFORCE && !strict\.ok/);
  const forge = readFileSync(new URL("../../console/Lattice_Forge.html", import.meta.url), "utf8");
  for (const kind of ["latticeforge.lattice_seed", "latticeforge.environment"]) {
    assert.ok(forge.includes(`kind: '${kind}'`), kind);
    assert.ok(kind in BM.KINDS, `${kind} is a known kind`);
  }
});
