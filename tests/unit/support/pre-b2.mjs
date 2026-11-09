// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Schism-Labs-AI
//
// src/biomesh/biomesh.js as it was before the generated core (commit BEFORE, BioChain-AI main after #8), loaded from
// git history so the unit tests can compare it with today's code. Its relative imports are pointed at today's
// src/ modules (the identity and Firestore modules it imports were not changed by that step), and it is imported
// from a data: URL. Import ./env.mjs first (the Firebase SDK stand-in).
//
// Also the deterministic inputs on which the old and new grow cells are compared, and the digest of a record.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const BEFORE = "dfbe3f2e94c2ff8101f39054bedf29ec67f75704";
const ROOT = fileURLToPath(new URL("../../..", import.meta.url));

/** The old module's text, or null when the commit is not in this checkout's history. */
export function beforeSource() {
  try {
    return execFileSync("git", ["-C", ROOT, "show", `${BEFORE}:src/biomesh/biomesh.js`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch (_) {
    return null;
  }
}

/** Import the old module (null when the history is missing). */
export async function importBefore() {
  const src = beforeSource();
  if (src === null) return null;
  const base = pathToFileURL(join(ROOT, "src/biomesh/")).href;
  const rewritten = src.replace(/(from\s*")(\.\.?\/[^"]+)(")/g, (_, a, rel, b) => a + new URL(rel, base).href + b);
  return import("data:text/javascript;base64," + Buffer.from(rewritten, "utf8").toString("base64"));
}

export const digest = (rec) => createHash("sha256").update(JSON.stringify(rec)).digest("hex");

/** A small seeded generator (xorshift32), independent of the code under test. */
function rng(seed) {
  let x = seed >>> 0 || 1;
  return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
}
const pick = (r, s) => s[Math.floor(r() * s.length)];

/** The texts on which the grow cells are compared: ASCII and multi-byte text at the cut edges, word text for the
 *  engram layer, 60,000 bytes, and the shdccp2_weave texts (chunks with 0x80 crystal bytes). → [{ id, text }] */
export function inputs() {
  const out = [];
  const r = rng(0xB10C);
  const ascii = " abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,;:'!?\n-";
  for (const n of [1, 2, 59, 60, 719, 720, 721, 1439, 1440, 1441, 5000, 12345])
    out.push({ id: `ascii_${n}`, text: Array.from({ length: n }, () => pick(r, ascii)).join("") });
  const wide = ["é", "ß", "ø", "Ω", "ж", "中", "文", "😀", "🦉", "a", "b", " ", " ", "﻿"];
  for (const n of [1, 240, 241, 1000, 3000])
    out.push({ id: `utf8_${n}`, text: Array.from({ length: n }, () => pick(r, wide)).join("") });
  const words = ["torsion", "pump", "Geodesic", "lattice", "it's", "don't", "Straße", "café", "x2", "the", "a", "QUATERNION"];
  for (const n of [5, 200, 2000])
    out.push({ id: `words_${n}`, text: Array.from({ length: n }, () => pick(r, words)).join(pick(r, [" ", ", ", ". ", "\n"])) });
  out.push({ id: "max_60000", text: Array.from({ length: 60000 }, () => pick(r, ascii)).join("") });
  const weave = JSON.parse(readFileSync(join(ROOT, "tests/vendor/shdccp2-contract/suites/shdccp2_weave.json"), "utf8"));
  const dec = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  for (const c of weave.cases.slice(0, 4))
    out.push({ id: `x80_${c.id}`, text: dec.decode(new Uint8Array(c.input.chunks_hex.join("").match(/../g).map((h) => parseInt(h, 16)))) });
  return out;
}

/** Tokens for the engram-grid comparison: seeded, mixed case, digits, apostrophes and non-ASCII letters. */
export function tokens(n = 10000) {
  const r = rng(0xE6A4);
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'ßéøж";
  return Array.from({ length: n }, () => Array.from({ length: 1 + Math.floor(r() * 12) }, () => pick(r, chars)).join(""));
}
