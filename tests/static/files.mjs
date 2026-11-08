// Shared helpers for the static guards: the repository's own web files
// (Nested_Harmonic_Cocoon/, node_modules/ and tests/ excluded).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SKIP = new Set(["Nested_Harmonic_Cocoon", "node_modules", "tests", ".git", ".github"]);

export function webFiles(exts = [".html", ".js", ".mjs"]) {
  const out = [];
  (function walk(dir) {
    for (const name of readdirSync(dir)) {
      if (SKIP.has(name)) continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (exts.some((e) => name.endsWith(e))) out.push(relative(ROOT, p).split(sep).join("/"));
    }
  })(ROOT);
  return out.sort();
}

export const read = (rel) => readFileSync(join(ROOT, rel), "utf8");
export const lineOf = (text, index) => text.slice(0, index).split("\n").length;

export function report(name, problems) {
  if (problems.length) {
    console.log(`${name}: ${problems.length} problem(s)`);
    for (const p of problems) console.log("  ✗ " + p);
    return false;
  }
  console.log(`${name}: ok`);
  return true;
}
