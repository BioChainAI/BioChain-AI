// Network check (CI job "cdn"): fetch every pinned CDN file named by
// cdn-pins.mjs and compare its SHA-384/256/512 with the integrity value.
import { createHash } from "node:crypto";
import { pins } from "./cdn-pins.mjs";

async function digest(url, algo) {
  let last;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { redirect: "follow" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = Buffer.from(await res.arrayBuffer());
      return { b64: createHash(algo).update(body).digest("base64"), acao: res.headers.get("access-control-allow-origin") };
    } catch (e) { last = e; await new Promise((r) => setTimeout(r, 1000 * attempt)); }
  }
  throw last;
}

let bad = 0;
for (const [url, integrity] of pins()) {
  const [algo, expected] = integrity.split(/-(.*)/s);
  try {
    const { b64, acao } = await digest(url, algo);
    if (b64 === expected) console.log(`  ✓ ${url}${acao ? "" : "  (note: no Access-Control-Allow-Origin header)"}`);
    else { bad++; console.log(`  ✗ ${url}\n      pinned ${integrity}\n      served ${algo}-${b64}`); }
  } catch (e) { bad++; console.log(`  ✗ ${url} — ${e.message}`); }
}
console.log(bad ? `\n${bad} pinned file(s) did not match` : "\nall pinned files match");
process.exit(bad ? 1 : 0);
