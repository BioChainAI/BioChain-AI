// CDN pins on the pages that sign in or handle keys (login.html, index.html,
// console/**): every third-party script or module they can load names an exact
// version and carries an integrity value — `integrity=` on a <script src>, or
// an entry in the page's import map "integrity" for a module (including modules
// imported by src/ files the page loads). The same URL has the same value on
// every page. cdn-live.mjs checks the values against the CDNs (network).
import { posix } from "node:path";
import { pathToFileURL } from "node:url";
import { webFiles, read, lineOf, report } from "./files.mjs";

export const PAGES = (files = webFiles([".html"])) =>
  files.filter((f) => f === "login.html" || f === "index.html" || f.startsWith("console/"));

// Exempt from the integrity requirement, with the reason.
export const EXEMPT = new Map([
  ["https://cdn.tailwindcss.com", "the Tailwind Play CDN script generates styles in the page; exempt until the pages use a compiled stylesheet"],
]);

const VERSIONED = /(@\d+\.\d+\.\d+(?:-[\w.]+)?(?=\/|$))|(\/\d+\.\d+\.\d+\/)/;
const SRI = /^sha(256|384|512)-[A-Za-z0-9+/]+={0,2}$/;
const IMPORTS = [
  /\b(?:import|export)\s[^'"`;]*?\bfrom\s*(["'])([^"']+)\1/g,
  /\bimport\s*(["'])([^"']+)\1/g,
  /\bimport\(\s*(["'])([^"']+)\1\s*\)/g,
];

function attrs(tag) {
  const out = {};
  for (const m of tag.matchAll(/([\w-]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) out[m[1].toLowerCase()] = m[3] ?? m[4] ?? m[5] ?? "";
  return out;
}

function scripts(html) {
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].map((m) => ({ index: m.index, attrs: attrs(m[1]), body: m[2] }));
}

function specifiers(js) {
  const out = [];
  for (const re of IMPORTS) for (const m of js.matchAll(re)) out.push(m[2]);
  return out;
}

function resolveBare(spec, importMap) {
  const imports = importMap.imports || {};
  if (imports[spec]) return imports[spec];
  let best = null;
  for (const k of Object.keys(imports)) if (k.endsWith("/") && spec.startsWith(k) && (!best || k.length > best.length)) best = k;
  return best ? imports[best] + spec.slice(best.length) : null;
}

/** Everything one page can load from a CDN: { url, integrity, kind, where } plus problems. */
export function pageLoads(page) {
  const html = read(page);
  const problems = [];
  const loads = [];
  const ss = scripts(html);
  const maps = ss.filter((s) => s.attrs.type === "importmap");
  if (maps.length > 1) problems.push(`${page}: more than one import map`);
  let importMap = {};
  if (maps.length) {
    try { importMap = JSON.parse(maps[0].body); } catch (e) { problems.push(`${page}: import map is not JSON (${e.message})`); }
    const firstModule = ss.find((s) => s.attrs.type === "module");
    if (firstModule && firstModule.index < maps[0].index) problems.push(`${page}: the import map must come before the first module script`);
  }
  const mapIntegrity = importMap.integrity || {};

  const seen = new Set();
  const visit = (js, fromDir, where) => {
    for (const spec of specifiers(js)) {
      let url = null;
      if (/^https?:\/\//.test(spec)) url = spec;
      else if (spec.startsWith(".") || spec.startsWith("/")) {
        const file = posix.normalize(spec.startsWith("/") ? spec.slice(1) : posix.join(fromDir, spec));
        if (!seen.has(file)) {
          seen.add(file);
          let text = null;
          try { text = read(file); } catch { problems.push(`${where}: imports ${spec}, which is not in the repository`); }
          if (text !== null) visit(text, posix.dirname(file), file);
        }
        continue;
      } else {
        url = resolveBare(spec, importMap);
        if (!url) { problems.push(`${where}: bare import "${spec}" has no import-map entry`); continue; }
      }
      if (/^https?:\/\//.test(url)) loads.push({ url, integrity: mapIntegrity[url], kind: "module", where });
    }
  };

  for (const s of ss) {
    const where = `${page}:${lineOf(html, s.index)}`;
    if (s.attrs.type === "importmap") {
      for (const url of Object.values(importMap.imports || {}))
        if (/^https?:\/\//.test(url) && !url.endsWith("/")) loads.push({ url, integrity: mapIntegrity[url], kind: "module", where });
      continue;
    }
    if (s.attrs.src !== undefined) {
      const src = s.attrs.src;
      if (/^https?:\/\//.test(src)) {
        if (s.attrs.type === "module") loads.push({ url: src, integrity: s.attrs.integrity ?? mapIntegrity[src], kind: "module", where });
        else loads.push({ url: src, integrity: s.attrs.integrity, crossorigin: s.attrs.crossorigin, kind: "script", where });
      } else if (s.attrs.type === "module") {
        const file = posix.normalize(posix.join(posix.dirname(page), src));
        if (!seen.has(file)) { seen.add(file); visit(read(file), posix.dirname(file), file); }
      }
    } else if (s.attrs.type === "module") {
      visit(s.body, posix.dirname(page), where);
    }
  }
  return { loads, problems };
}

export function check() {
  const problems = [];
  const values = new Map();   // url -> integrity
  for (const page of PAGES()) {
    const r = pageLoads(page);
    problems.push(...r.problems);
    for (const l of r.loads) {
      const exempt = [...EXEMPT.keys()].some((u) => l.url === u || l.url.startsWith(u + "/") || l.url.startsWith(u + "?"));
      if (exempt) continue;
      if (!VERSIONED.test(l.url)) problems.push(`${l.where}: ${l.url} names no exact version`);
      if (!l.integrity) { problems.push(`${l.where} (${page}): ${l.url} has no integrity value`); continue; }
      if (!SRI.test(l.integrity)) problems.push(`${l.where}: integrity for ${l.url} is malformed`);
      if (l.kind === "script" && l.crossorigin === undefined) problems.push(`${l.where}: ${l.url} has integrity but no crossorigin attribute`);
      if (values.has(l.url) && values.get(l.url) !== l.integrity) problems.push(`${l.where}: ${l.url} has a different integrity value than on another page`);
      values.set(l.url, l.integrity);
    }
  }
  return problems;
}

/** Every pinned (url, integrity) pair across the pages, for cdn-live.mjs. */
export function pins() {
  const out = new Map();
  for (const page of PAGES()) for (const l of pageLoads(page).loads) if (l.integrity) out.set(l.url, l.integrity);
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(report("CDN pins", check()) ? 0 : 1);
