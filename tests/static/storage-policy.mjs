// Storage policy: the pages share an origin (biochainai.github.io) with other
// apps, so BioChain-AI never clears Web Storage wholesale and uses only its own
// keys (listed below, or prefixed "biochain_" / "biochain.").
import { pathToFileURL } from "node:url";
import { webFiles, read, lineOf, report } from "./files.mjs";

const PREFIXES = ["biochain_", "biochain."];
const KEYS = new Set(["biochain_identity"]);

export function check() {
  const problems = [];
  for (const f of webFiles()) {
    const text = read(f);
    for (const m of text.matchAll(/\b(localStorage|sessionStorage)\s*\.\s*clear\s*\(/g))
      problems.push(`${f}:${lineOf(text, m.index)}: ${m[1]}.clear() wipes other apps' data on the shared origin`);
    for (const m of text.matchAll(/\b(localStorage|sessionStorage)\s*\.\s*(setItem|getItem|removeItem)\s*\(\s*([^,)]+)/g)) {
      const arg = m[3].trim();
      let key = null;
      const lit = /^(["'`])([^"'`$]*)\1$/.exec(arg);
      if (lit) key = lit[2];
      else if (/^[A-Za-z_$][\w$]*$/.test(arg)) {
        const decl = new RegExp(`\\bconst\\s+${arg.replace(/\$/g, "\\$")}\\s*=\\s*(["'])([^"']*)\\1`).exec(text);
        if (decl) key = decl[2];
      }
      const where = `${f}:${lineOf(text, m.index)}`;
      if (key === null) problems.push(`${where}: ${m[1]}.${m[2]} key ${arg} is not a literal or a const string`);
      else if (!KEYS.has(key) && !PREFIXES.some((p) => key.startsWith(p)))
        problems.push(`${where}: ${m[1]} key "${key}" is not a BioChain-AI key (prefix ${PREFIXES.join(" or ")})`);
    }
    for (const m of text.matchAll(/\b(localStorage|sessionStorage)\s*(\[|\.(?!setItem|getItem|removeItem|clear|length|key)\w+\s*=)/g))
      problems.push(`${f}:${lineOf(text, m.index)}: use ${m[1]}.setItem/getItem with a BioChain-AI key, not property access`);
  }
  return problems;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(report("storage policy", check()) ? 0 : 1);
