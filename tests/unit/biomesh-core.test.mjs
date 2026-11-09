// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Schism-Labs-AI
//
// The generated core (src/biomesh/biomesh-core.js, from Owl-Academy) behind src/biomesh/biomesh.js, against the code
// it replaced (biomesh.js at BEFORE, tests/unit/support/pre-b2.mjs):
//   - every name biomesh.js exported before is still exported, and the codec names are the core's own functions;
//   - growBiochain gives the same records (tests/unit/fixtures/biomesh-pre-b2.json; rebuilt from git history when the
//     commit is present), so no existing chainId, Merkle root, weave or GROWN/1 commitment changes (I3);
//   - with history: verifyIntegrity, extendBiochain, recreation, seeds, codices and commitments agree with the old
//     code, and engramGrid (now built once per letter) gives the old grid on 10,000 seeded tokens.
// Set BC_REQUIRE_HISTORY=1 (CI) to fail instead of skipping when the commit is not in the checkout.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import "./support/env.mjs";
import { BEFORE, beforeSource, importBefore, inputs, tokens, digest } from "./support/pre-b2.mjs";

const BM = await import("../../src/biomesh/biomesh.js");
const C = await import("../../src/biomesh/biomesh-core.js");
const OLD = await importBefore();
const FIXTURE = JSON.parse(readFileSync(new URL("./fixtures/biomesh-pre-b2.json", import.meta.url), "utf8"));
const needHistory = { skip: OLD === null && process.env.BC_REQUIRE_HISTORY !== "1" ? `commit ${BEFORE.slice(0, 7)} is not in this checkout` : false };

test("history: the pre-B2 biomesh.js is available when BC_REQUIRE_HISTORY=1", () => {
  if (process.env.BC_REQUIRE_HISTORY === "1") assert.notEqual(beforeSource(), null, `git show ${BEFORE}:src/biomesh/biomesh.js`);
});

test("biomesh.js re-exports the generated core: the codec names are the core's functions, STRICT_ENFORCE is local", () => {
  for (const name of Object.keys(C)) {
    if (name === "extendBiochain") continue;
    assert.equal(BM[name], C[name], `${name} is the core's`);
  }
  assert.notEqual(BM.extendBiochain, C.extendBiochain, "extendBiochain is wrapped with STRICT_ENFORCE");
  assert.equal(BM.STRICT_ENFORCE, false, "shadow mode");
  assert.equal("STRICT_ENFORCE" in C, false, "the flag is not in the generated core");
  const src = readFileSync(new URL("../../src/biomesh/biomesh.js", import.meta.url), "utf8");
  for (const fn of ["function fold64", "function crystallize", "function encodeChunk", "function verifyIntegrity(", "function growBiochain", "function deriveCodex"])
    assert.equal(src.includes(fn), false, `biomesh.js no longer defines ${fn}`);
});

test("every name biomesh.js exported before the generated core is still exported", needHistory, () => {
  const missing = Object.keys(OLD).filter((k) => !(k in BM));
  assert.deepEqual(missing, []);
});

test("growBiochain gives the pre-B2 records (fixture): no chainId, root, weave or commitment changes", async () => {
  assert.equal(FIXTURE.commit, BEFORE);
  const byKey = new Map(FIXTURE.records.map((r) => [`${r.id}/${r.engrams}`, r]));
  let n = 0;
  for (const { id, text } of inputs()) {
    for (const engrams of [true, false]) {
      const want = byKey.get(`${id}/${engrams}`);
      if (!want) continue;
      const rec = await BM.growBiochain(text, { engrams });
      assert.equal(rec.chainId, want.chainId, `${id} engrams ${engrams}: chainId`);
      assert.equal(digest(rec), want.digest, `${id} engrams ${engrams}: record`);
      assert.equal(BM.grownCommitment(rec).split("|")[1], want.chainId);
      assert.equal(BM.verifyIntegrityStrict(rec).ok, true, `${id}: strict`);
      n++;
    }
  }
  assert.equal(n, FIXTURE.records.length, "every fixture record checked");
  assert.ok(n >= 45);
});

test("the fixture is what the pre-B2 code gives (rebuilt from git history)", needHistory, async () => {
  for (const r of FIXTURE.records) {
    const { text } = inputs().find((x) => x.id === r.id);
    const rec = await OLD.growBiochain(text, { engrams: r.engrams });
    assert.equal(digest(rec), r.digest, `${r.id} engrams ${r.engrams}`);
  }
});

test("verifyIntegrity, recreation, seeds, codices and commitments agree with the pre-B2 code", needHistory, async () => {
  const tamper = JSON.parse(readFileSync(new URL("../vendor/shdccp2-contract/suites/shdccp2_tamper.json", import.meta.url), "utf8"));
  // length_negative: the old lenient parser does not stop on a negative residual length; the core refuses it (O3).
  for (const c of tamper.cases.filter((c) => c.id !== "length_negative")) {
    assert.deepEqual(await BM.verifyIntegrity(c.input.record), await OLD.verifyIntegrity(c.input.record), `${c.id}: verifyIntegrity`);
  }
  for (const { id, text } of inputs().filter((x) => x.text.length <= 6000)) {
    const rec = await BM.growBiochain(text);
    assert.deepEqual(await BM.verifyIntegrity(rec), await OLD.verifyIntegrity(rec), `${id}: verifyIntegrity`);
    assert.equal(BM.recreateText(rec), OLD.recreateText(rec), `${id}: recreateText`);
    assert.deepEqual(BM.recreateChunks(rec), OLD.recreateChunks(rec), `${id}: recreateChunks`);
    assert.deepEqual(BM.parseBiochainStream(rec.stream), OLD.parseBiochainStream(rec.stream), `${id}: parseBiochainStream`);
    assert.deepEqual(BM.biochainToSeeds(rec), OLD.biochainToSeeds(rec), `${id}: seeds`);
    assert.deepEqual(BM.matchSeeds("torsion pump", BM.biochainToSeeds(rec)), OLD.matchSeeds("torsion pump", OLD.biochainToSeeds(rec)), `${id}: matchSeeds`);
    assert.deepEqual(BM.engramStreamFromText(text), OLD.engramStreamFromText(text), `${id}: engram stream`);
    assert.deepEqual(BM.passagesOf(text), OLD.passagesOf(text), `${id}: passages`);
    const cx = await BM.deriveCodex(text);
    assert.deepEqual(cx, await OLD.deriveCodex(text), `${id}: codex`);
    assert.deepEqual(BM.parseCodexStream(cx.stream), OLD.parseCodexStream(cx.stream), `${id}: codex parse`);
    assert.equal(BM.codexCommitment(cx), OLD.codexCommitment(cx));
    assert.equal(BM.grownCommitment(rec), OLD.grownCommitment(rec));
    assert.equal(BM.pairCommitment(rec.chainId, cx.codexHash), OLD.pairCommitment(rec.chainId, cx.codexHash));
    const child = await BM.extendBiochain(rec, " and more text.");
    const oldChild = await OLD.extendBiochain(rec, " and more text.");
    assert.deepEqual({ ...child }, oldChild, `${id}: extendBiochain (enumerable fields)`);
    assert.equal(BM.growthCommitment(child), OLD.growthCommitment(oldChild));
    assert.equal(child.parentStrict.ok, true, `${id}: the parent's strict verdict`);
  }
  assert.equal(BM.crystallizeGolden(), OLD.crystallizeGolden());
  assert.equal(BM.crystallizeGolden(), "9841D88D8B003CEA");
});

test("engramGrid, now built once per letter, gives the pre-B2 grid on 10,000 seeded tokens (F15)", needHistory, () => {
  for (const t of tokens(10000)) assert.deepEqual(BM.engramGrid(t), OLD.engramGrid(t), t);
  for (const t of tokens(200)) assert.equal(BM.engramHex(t), OLD.engramHex(t), t);
});
