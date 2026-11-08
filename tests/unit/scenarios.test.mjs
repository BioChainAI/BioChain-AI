// The trust-scenario files, checked offline (the emulator run is tests/rules).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DELETE_FIELD, steps, translate, validate } from "../rules/scenarios/translate.mjs";

const load = (f) => JSON.parse(readFileSync(new URL(`../rules/scenarios/${f}`, import.meta.url), "utf8"));
const scenarios = load("trust-v1.json");
const names = load("names.biochain-ai.json");
const all = steps(scenarios).map((x) => x.step);
const byId = Object.fromEntries(all.map((s) => [s.id, s]));

test("trust-v1.json and names.biochain-ai.json are valid together", () => {
  assert.deepEqual(validate(scenarios, names), []);
});

test("BioChain-AI maps every operation and lists no todo", () => {
  assert.deepEqual(names.todo, []);
  assert.deepEqual(names.unsupported, []);
  for (const s of all) assert.ok(names.ops[s.op], `${s.id}: ${s.op}`);
});

test("the first four groups are the 47 original checks", () => {
  const first = scenarios.groups.slice(0, 4);
  assert.deepEqual(first.map((g) => g.title), [
    "Item 1 — ownership replay", "Item 2 — self-granted roles",
    "Item 3 — revocation is one-way", "Item 4 — rater role must be real",
  ]);
  assert.equal(first.reduce((n, g) => n + g.steps.length, 0), 47);
});

test("translation: typed placeholders, omitted fields, defaults, deletes, signed-out actors", () => {
  assert.deepEqual(translate(byId["xfer-send-seq0"], names), {
    method: "set", path: "transfers/T1",
    data: { chainId: "C1", fromUid: "A", toUid: "B", status: "pending", price: 0, chainSeq: 0 },
  });
  assert.equal("chainSeq" in translate(byId["xfer-send-no-seq"], names).data, false);
  assert.equal(translate(byId["xfer-priced"], names).data.price, 5);
  assert.deepEqual(translate(byId["id-forget"], names), {
    method: "update", path: "users/S/identity/main", data: { identitySeed: DELETE_FIELD },
  });
  assert.deepEqual(translate(byId["identity-with-certificate"], names).data.certificate, { role: "ADMIN" });
  assert.equal(byId["audit-signed-out"].as, null);
  assert.deepEqual(translate(byId["rate-member"], names).path, "ratings/C1_M");
  assert.deepEqual(translate(byId["rate-second-doc-id"], names), {
    method: "set", path: "ratings/C1_M2",
    data: { chainId: "C1", raterUid: "M", raterRole: "MEMBER", stars: 4 },
  });
  assert.deepEqual(translate(byId["sk-list-other"], names), { method: "list", path: "users/A/signingKeys" });
});

test("validate reports unmapped operations, bad verdicts, duplicate ids and bad paths", () => {
  const broken = structuredClone(scenarios);
  broken.groups[0].steps.push({ ...broken.groups[0].steps[0] });                         // duplicate id
  broken.groups[0].steps.push({ id: "x1", name: "x", as: "A", op: "nope.op", params: {}, expect: "allow" });
  broken.groups[0].steps.push({ id: "x2", name: "x", as: "A", op: "transfer.accept", params: {}, expect: "maybe" });
  const problems = validate(broken, names).join("\n");
  assert.match(problems, /duplicate id/);
  assert.match(problems, /"nope\.op" is neither mapped/);
  assert.match(problems, /expect must be/);
  assert.match(problems, /no value for \{id\}/);
});

test("every audit-log kind in the rules has an allow step", () => {
  const rules = readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8");
  const block = rules.slice(rules.indexOf("function auditKinds()"), rules.indexOf("match /auditLog/"));
  const kinds = [...block.matchAll(/'([a-z_.-]+)'/g)].map((m) => m[1]);
  assert.ok(kinds.length >= 10);
  const allowed = new Set(all.filter((s) => s.op === "audit.append" && s.expect === "allow").map((s) => s.params.kind));
  for (const k of kinds) assert.ok(allowed.has(k), k);
});
