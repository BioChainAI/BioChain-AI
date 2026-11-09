// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Schism-Labs-AI
//
// The vendored files, offline: every file under tests/vendor/ is listed in tests/vendor/VENDOR.json (or is one of the
// folder's own files) and has the SHA-256 recorded there; and the files generated from Owl-Academy
// (src/biomesh/VENDOR.json) pass tools/sync-from-owl.mjs's offline check.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyOffline, OWL_COMMIT } from "../../tools/sync-from-owl.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const DIR = join(ROOT, "tests/vendor");
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(relative(DIR, p).split(sep).join("/"));
  }
  return out.sort();
}

test("tests/vendor: every file is listed in VENDOR.json and has its SHA-256", () => {
  const v = JSON.parse(readFileSync(join(DIR, "VENDOR.json"), "utf8"));
  assert.equal(v.format, "biochain-test-vendor/1");
  const listed = new Map();
  for (const s of v.sources) {
    assert.match(s.commit, /^[0-9a-f]{40}$/, `${s.id}: commit`);
    assert.match(s.licence, /CC0-1\.0/, `${s.id}: licence`);
    for (const f of s.files) {
      assert.ok(!listed.has(f.path), `${f.path} listed twice`);
      listed.set(f.path, f.sha256);
    }
  }
  const files = walk(DIR).filter((p) => !v.own.includes(p));
  assert.deepEqual(files, [...listed.keys()].sort(), "the files under tests/vendor/ are the listed ones");
  for (const [p, h] of listed) assert.equal(sha256(readFileSync(join(DIR, p))), h, `${p}: SHA-256`);
});

test("src/biomesh: the files generated from Owl-Academy match VENDOR.json, their headers and Owl's SHA-256", () => {
  assert.deepEqual(verifyOffline(), []);
  const v = JSON.parse(readFileSync(join(ROOT, "src/biomesh/VENDOR.json"), "utf8"));
  assert.equal(v.source.commit, OWL_COMMIT);
  for (const f of v.files) {
    const text = readFileSync(join(ROOT, f.path), "utf8");
    assert.ok(text.startsWith("// SPDX-License-Identifier: MIT\n// Copyright (c) 2026 Ebayednoob"), `${f.path}: SPDX and copyright lines`);
    assert.ok(text.includes(`at commit ${OWL_COMMIT}`), `${f.path}: names the commit`);
  }
});

test("src/biomesh: an edit to a generated file, or a header for another commit, is caught offline", async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, cpSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const tmp = mkdtempSync(join(tmpdir(), "bc-sync-"));
  try {
    mkdirSync(join(tmp, "src/biomesh"), { recursive: true });
    for (const f of ["biomesh-core.js", "biomesh-engine-check.js", "VENDOR.json"]) cpSync(join(ROOT, "src/biomesh", f), join(tmp, "src/biomesh", f));
    assert.deepEqual(verifyOffline(tmp), [], "a faithful copy passes");
    const core = join(tmp, "src/biomesh/biomesh-core.js");
    const text = readFileSync(core, "utf8");
    writeFileSync(core, text.replace("const CHUNK = 720, SEGMENTS = 7;", "const CHUNK = 721, SEGMENTS = 7;"));
    assert.ok(verifyOffline(tmp).some((p) => p.includes("biomesh-core.js: SHA-256")), "an edited body is caught");
    const vendor = JSON.parse(readFileSync(join(tmp, "src/biomesh/VENDOR.json"), "utf8"));
    vendor.files[0].sha256 = sha256(readFileSync(core));
    writeFileSync(join(tmp, "src/biomesh/VENDOR.json"), JSON.stringify(vendor, null, 1) + "\n");
    assert.ok(verifyOffline(tmp).some((p) => p.includes("not Owl's")), "an edited body with a matching VENDOR.json hash is still caught");
    writeFileSync(core, text.replace(`at commit ${OWL_COMMIT}`, "at commit " + "0".repeat(40)));
    assert.ok(verifyOffline(tmp).some((p) => p.includes("generated header")), "a header for another commit is caught");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
