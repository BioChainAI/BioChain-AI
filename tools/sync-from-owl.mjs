#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Schism-Labs-AI
/**
 * Generate BioChain-AI's copy of the Biomesh core from BioChainAI/Owl-Academy.
 * ----------------------------------------------------------------------------
 * Owl-Academy owns the reference implementation of the shdccp/2 biochain codec
 * (scripts/biomesh-core.js, RFC 07 in BioChainAI/SHD-CCP-core). BioChain-AI does
 * not edit a copy by hand: this script writes
 *
 *   src/biomesh/biomesh-core.js          from scripts/biomesh-core.js
 *   src/biomesh/biomesh-engine-check.js  from scripts/biomesh-engine-check.js
 *   src/biomesh/VENDOR.json              the commit, and each file's SHA-256 upstream and here
 *
 * from Owl's git objects at OWL_COMMIT (below), the one place the pin is set.
 * Each generated file is a header (SPDX, copyright and NOTICE lines, the source
 * commit and SHA-256) followed by Owl's file, with the rewrites listed in FILES
 * applied: biomesh-core.js imports sha256Hex from ../identity/crypto-core.js
 * instead of ./seal-crypto.js (the same function: SHA-256 of the UTF-8 encoding
 * of String(str), as lower-case hex, by Web Crypto).
 *
 * Usage (from the repository root):
 *   node tools/sync-from-owl.mjs --owl <Owl-Academy checkout> --write   regenerate the files
 *   node tools/sync-from-owl.mjs --owl <Owl-Academy checkout> --check   regenerate in memory and compare (CI)
 *   node tools/sync-from-owl.mjs --verify                               offline: hashes, headers and rewrites (CI)
 *   node tools/sync-from-owl.mjs --print-commit                         print OWL_COMMIT (CI reads it)
 *
 * The checkout only needs the pinned commit's objects (a shallow clone at that
 * commit is enough); its working tree is not read.
 *
 * To repin: set OWL_COMMIT to the new commit, run --write, review the diff of
 * src/biomesh/, run the unit tests (node --test "tests/unit/*.test.mjs").
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const OWL_REPOSITORY = "BioChainAI/Owl-Academy";
/** The Owl-Academy commit the generated files come from. */
export const OWL_COMMIT = "26a05eae0320e1287b40accff60d06086171cc24";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const VENDOR_PATH = "src/biomesh/VENDOR.json";

/** The generated files: upstream path, path here, and the exact text replacements (each must occur exactly once). */
export const FILES = Object.freeze([
  Object.freeze({
    from: "scripts/biomesh-core.js",
    to: "src/biomesh/biomesh-core.js",
    rewrites: Object.freeze([
      Object.freeze({ from: 'import { sha256Hex } from "./seal-crypto.js";', to: 'import { sha256Hex } from "../identity/crypto-core.js";' }),
    ]),
  }),
  Object.freeze({
    from: "scripts/biomesh-engine-check.js",
    to: "src/biomesh/biomesh-engine-check.js",
    rewrites: Object.freeze([]),
  }),
]);

const LICENCE = "MIT. Copyright (c) 2026 Ebayednoob (BioChainAI/Owl-Academy, LICENSE). The generated files carry " +
  "SPDX-License-Identifier: MIT and the copyright line; NOTICE at the root of this repository records the copy.";

export const sha256 = (text) => createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");

const count = (text, part) => text.split(part).length - 1;

/** The header written above Owl's file. Every line starts with "// "; the last line ends it. */
export function header(file, commit, upstreamSha256) {
  // Each rewrite as two JSON strings, so that the line cannot read as an import statement.
  const changes = file.rewrites.length
    ? file.rewrites.map((r) => `//   ${JSON.stringify(r.from)} -> ${JSON.stringify(r.to)}`)
    : ["//   none: the file is copied unchanged"];
  return [
    "// SPDX-License-Identifier: MIT",
    "// Copyright (c) 2026 Ebayednoob (BioChainAI/Owl-Academy); copied under the MIT licence, see NOTICE.",
    "// GENERATED FILE, do not edit. tools/sync-from-owl.mjs wrote it from",
    `// ${OWL_REPOSITORY} ${file.from} at commit ${commit}`,
    `// (SHA-256 of that file: ${upstreamSha256}). Changes to Owl's text:`,
    ...changes,
    "// To change it, change Owl's file, repin OWL_COMMIT in tools/sync-from-owl.mjs and run",
    "//   node tools/sync-from-owl.mjs --owl <Owl-Academy checkout> --write",
    "// Paths named in Owl's comments below are Owl-Academy paths.",
    "// ---- end of the generated header; Owl's file follows ----",
    "",
  ].join("\n");
}

/** Owl's text → the generated text. Throws if a rewrite does not occur exactly once. */
export function generate(file, upstream, commit) {
  let body = upstream;
  for (const r of file.rewrites) {
    const n = count(body, r.from);
    if (n !== 1) throw new Error(`${file.from}: "${r.from}" occurs ${n} times (expected once)`);
    if (count(body, r.to) !== 0) throw new Error(`${file.from}: "${r.to}" already occurs in Owl's file`);
    body = body.replace(r.from, () => r.to);
  }
  return header(file, commit, sha256(upstream)) + body;
}

/** The generated text → Owl's text, or an error message: the inverse of generate for this commit and header. */
export function ungenerate(file, text, commit, upstreamSha256) {
  const head = header(file, commit, upstreamSha256);
  if (!text.startsWith(head)) return { error: `${file.to}: the generated header is not the one for ${commit}` };
  let body = text.slice(head.length);
  for (const r of [...file.rewrites].reverse()) {
    const n = count(body, r.to);
    if (n !== 1) return { error: `${file.to}: "${r.to}" occurs ${n} times (expected once)` };
    if (count(body, r.from) !== 0) return { error: `${file.to}: "${r.from}" occurs in the generated file` };
    body = body.replace(r.to, () => r.from);
  }
  return { upstream: body };
}

export function vendorJson(entries, commit) {
  return JSON.stringify({
    format: "biochain-vendor/1",
    description: "Files generated from another repository by tools/sync-from-owl.mjs, each pinned by SHA-256. " +
      "The commit is set by OWL_COMMIT in tools/sync-from-owl.mjs and recorded here; this file is generator " +
      "output, so edit OWL_COMMIT and run --write rather than editing it. " +
      "Offline checks (tests/unit/vendor.test.mjs and `node tools/sync-from-owl.mjs --verify`): each file's " +
      "SHA-256, its header, and that removing the header and undoing the rewrites gives the upstream SHA-256. " +
      "CI also regenerates the files from a checkout of the source at the commit and compares them " +
      "(`node tools/sync-from-owl.mjs --owl <checkout> --check`).",
    generator: "tools/sync-from-owl.mjs",
    source: { repository: OWL_REPOSITORY, commit, licence: LICENCE },
    files: entries.map(({ file, upstreamSha256, sha256: own }) => ({
      path: file.to,
      upstream: file.from,
      upstreamSha256,
      sha256: own,
      rewrites: file.rewrites.map((r) => ({ from: r.from, to: r.to })),
    })),
  }, null, 1) + "\n";
}

/** Owl's file at the commit, read from the checkout's git objects. */
export function readUpstream(owlDir, commit, path) {
  const git = (...args) => execFileSync("git", ["-C", owlDir, ...args], { encoding: "utf8", maxBuffer: 64 << 20 });
  const resolved = git("rev-parse", "--verify", "--quiet", `${commit}^{commit}`).trim();
  if (resolved !== commit) throw new Error(`${owlDir}: commit ${commit} resolves to ${resolved}`);
  return git("show", `${commit}:${path}`);
}

const GENERATED = new Set(FILES.map((f) => f.to));

/** Relative imports of a generated file that do not exist here (another generated file counts as existing). */
export function missingImports(file, text) {
  const out = [];
  for (const m of text.matchAll(/^\s*import\s[^;]*?from\s*["'](\.{1,2}\/[^"']+)["']/gm)) {
    const target = join(dirname(file.to), m[1]);
    if (!GENERATED.has(target) && !existsSync(join(ROOT, target))) out.push(m[1]);
  }
  return out;
}

/** All generated texts for the commit, from an Owl checkout. → { texts: Map(path → text), vendor } */
export function regenerate(owlDir, commit = OWL_COMMIT) {
  const texts = new Map(), entries = [];
  for (const file of FILES) {
    const upstream = readUpstream(owlDir, commit, file.from);
    const text = generate(file, upstream, commit);
    const missing = missingImports(file, text);
    if (missing.length) throw new Error(`${file.to}: imports that do not exist here: ${missing.join(", ")}`);
    texts.set(file.to, text);
    entries.push({ file, upstreamSha256: sha256(upstream), sha256: sha256(text) });
  }
  return { texts, vendor: vendorJson(entries, commit) };
}

/** Offline checks of the committed files against VENDOR.json and OWL_COMMIT. → list of problems (empty when ok) */
export function verifyOffline(root = ROOT) {
  const problems = [];
  const read = (p) => readFileSync(join(root, p), "utf8");
  let vendor;
  try { vendor = JSON.parse(read(VENDOR_PATH)); } catch (e) { return [`${VENDOR_PATH}: ${e.message}`]; }
  if (vendor.format !== "biochain-vendor/1") problems.push(`${VENDOR_PATH}: format ${vendor.format}`);
  if (vendor.source?.repository !== OWL_REPOSITORY) problems.push(`${VENDOR_PATH}: repository ${vendor.source?.repository}`);
  if (vendor.source?.commit !== OWL_COMMIT) problems.push(`${VENDOR_PATH}: commit ${vendor.source?.commit} is not OWL_COMMIT ${OWL_COMMIT}`);
  const listed = (vendor.files || []).map((f) => f.path);
  if (JSON.stringify(listed) !== JSON.stringify(FILES.map((f) => f.to))) problems.push(`${VENDOR_PATH}: files ${listed.join(", ")}`);
  const entries = [];
  for (const file of FILES) {
    const entry = (vendor.files || []).find((f) => f.path === file.to);
    if (!entry) continue;
    let text;
    try { text = read(file.to); } catch (e) { problems.push(`${file.to}: ${e.message}`); continue; }
    if (sha256(text) !== entry.sha256) problems.push(`${file.to}: SHA-256 ${sha256(text)} is not ${entry.sha256} (VENDOR.json)`);
    if (entry.upstream !== file.from) problems.push(`${file.to}: upstream ${entry.upstream} is not ${file.from}`);
    if (JSON.stringify(entry.rewrites) !== JSON.stringify(file.rewrites.map((r) => ({ from: r.from, to: r.to }))))
      problems.push(`${file.to}: the rewrites in VENDOR.json are not the ones in FILES`);
    const back = ungenerate(file, text, OWL_COMMIT, entry.upstreamSha256);
    if (back.error) { problems.push(back.error); continue; }
    if (sha256(back.upstream) !== entry.upstreamSha256)
      problems.push(`${file.to}: without the header and rewrites its SHA-256 is ${sha256(back.upstream)}, not Owl's ${entry.upstreamSha256}`);
    if (generate(file, back.upstream, OWL_COMMIT) !== text) problems.push(`${file.to}: regenerating from its own body does not give the file`);
    const missing = missingImports(file, text);
    if (missing.length) problems.push(`${file.to}: imports that do not exist here: ${missing.join(", ")}`);
    entries.push({ file, upstreamSha256: entry.upstreamSha256, sha256: entry.sha256 });
  }
  if (entries.length === FILES.length && vendorJson(entries, OWL_COMMIT) !== read(VENDOR_PATH))
    problems.push(`${VENDOR_PATH}: not the text the generator writes (regenerate it)`);
  return problems;
}

function main(argv) {
  const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  if (argv.includes("--print-commit")) { process.stdout.write(OWL_COMMIT + "\n"); return 0; }
  if (argv.includes("--verify")) {
    const problems = verifyOffline();
    for (const p of problems) console.log("  ✗ " + p);
    console.log(problems.length ? `generated files: ${problems.length} problem(s)` : `generated files: ok (${FILES.length} files from ${OWL_REPOSITORY}@${OWL_COMMIT.slice(0, 7)})`);
    return problems.length ? 1 : 0;
  }
  const owl = arg("--owl");
  const mode = argv.includes("--write") ? "write" : argv.includes("--check") ? "check" : null;
  if (!owl || !mode) {
    console.log("usage: node tools/sync-from-owl.mjs --owl <Owl-Academy checkout> --write|--check | --verify | --print-commit");
    return 2;
  }
  const { texts, vendor } = regenerate(resolve(owl));
  const all = new Map([...texts, [VENDOR_PATH, vendor]]);
  if (mode === "write") {
    for (const [p, t] of all) writeFileSync(join(ROOT, p), t);
    console.log(`wrote ${[...all.keys()].join(", ")} from ${OWL_REPOSITORY}@${OWL_COMMIT}`);
    return 0;
  }
  let bad = 0;
  for (const [p, t] of all) {
    const here = existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), "utf8") : null;
    if (here === t) { console.log(`  ✓ ${p}`); continue; }
    bad++;
    const a = (here ?? "").split("\n"), b = t.split("\n");
    let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
    console.log(`  ✗ ${p}: ${here === null ? "missing" : `differs from line ${i + 1}`}` +
      (here === null ? "" : `\n      here:       ${JSON.stringify(a[i] ?? "<end>").slice(0, 160)}\n      regenerated: ${JSON.stringify(b[i] ?? "<end>").slice(0, 160)}`));
  }
  console.log(bad ? `${bad} file(s) differ from ${OWL_REPOSITORY}@${OWL_COMMIT}: run --write and commit` : `generated files match ${OWL_REPOSITORY}@${OWL_COMMIT}`);
  return bad ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
