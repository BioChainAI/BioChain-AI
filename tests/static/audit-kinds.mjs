// The audit-log kinds the client writes and the kinds firestore.rules accepts
// (auditKinds()) must be the same set: a kind missing from the rules would make
// that client write fail, and a kind no client writes should not be accepted.
import { pathToFileURL } from "node:url";
import { webFiles, read, lineOf, report } from "./files.mjs";

export function rulesKinds() {
  const rules = read("firestore.rules");
  const start = rules.indexOf("function auditKinds()");
  if (start < 0) return null;
  const body = rules.slice(start, rules.indexOf("}", start));
  return new Set([...body.matchAll(/'([^']+)'/g)].map((m) => m[1]));
}

// The text of the object literal that starts at `open` (an index of "{").
function objectAt(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return text.slice(open, i + 1);
  }
  return null;
}

// The expression after `kind:` up to the next comma or brace at depth 0.
function kindExpr(obj) {
  const m = /\bkind\s*:/.exec(obj);
  if (!m) return null;
  let depth = 0, i = m.index + m[0].length;
  const start = i;
  for (; i < obj.length; i++) {
    const c = obj[i];
    if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) { if (depth === 0) break; depth--; }
    else if (c === "," && depth === 0) break;
  }
  return obj.slice(start, i).trim();
}

export function clientKinds() {
  const kinds = new Map();   // kind -> first location
  const problems = [];
  for (const f of webFiles()) {
    const text = read(f);
    for (const m of text.matchAll(/addToCollection\(\s*["']auditLog["']\s*,\s*\{/g)) {
      const where = `${f}:${lineOf(text, m.index)}`;
      const obj = objectAt(text, m.index + m[0].length - 1);
      const expr = obj && kindExpr(obj);
      if (!expr) { problems.push(`${where}: audit entry without a kind`); continue; }
      if (expr.includes("`")) { problems.push(`${where}: kind is a template literal; use string literals or a const map`); continue; }
      const found = [...expr.matchAll(/(["'])([^"']+)\1/g)].map((x) => x[2]);
      const lookup = /^([A-Za-z_$][\w$]*)\s*\[/.exec(expr);
      if (lookup) {
        const decl = new RegExp(`\\bconst\\s+${lookup[1]}\\s*=\\s*\\{`).exec(text);
        const map = decl && objectAt(text, decl.index + decl[0].length - 1);
        if (!map) { problems.push(`${where}: kind map ${lookup[1]} not found as a const object in ${f}`); continue; }
        for (const x of map.matchAll(/:\s*(["'])([^"']+)\1/g)) found.push(x[2]);
      }
      if (!found.length) { problems.push(`${where}: kind ${expr} is not a string literal or a const map lookup`); continue; }
      for (const k of found) if (!kinds.has(k)) kinds.set(k, where);
    }
  }
  return { kinds, problems };
}

export function check() {
  const accepted = rulesKinds();
  if (!accepted) return ["firestore.rules: function auditKinds() not found"];
  const { kinds, problems } = clientKinds();
  for (const [k, where] of kinds) if (!accepted.has(k)) problems.push(`${where}: kind "${k}" is not in firestore.rules auditKinds()`);
  for (const k of accepted) if (!kinds.has(k)) problems.push(`firestore.rules: auditKinds() lists "${k}", which no client writes`);
  return problems;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(report("audit-log kinds", check()) ? 0 : 1);
