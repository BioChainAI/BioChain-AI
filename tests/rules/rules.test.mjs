// Firestore security-rules tests — run against the local emulator.
//
//   cd tests/rules && npm ci
//   npm test        # firebase emulators:exec --only firestore … "node rules.test.mjs"
//
// The checks are data: scenarios/trust-v1.json holds abstract steps (actor,
// operation, expected allow/deny) and scenarios/names.biochain-ai.json maps
// each operation to BioChain-AI's collections and fields (scenarios/README.md).
// Steps run in file order against one database, after the setup writes.
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, deleteField, doc, getDoc, getDocs, setDoc, updateDoc } from "firebase/firestore";
import { readFileSync } from "node:fs";
import { DELETE_FIELD, steps, translate, validate } from "./scenarios/translate.mjs";

const here = (p) => new URL(p, import.meta.url);
const scenarios = JSON.parse(readFileSync(here("./scenarios/trust-v1.json"), "utf8"));
const names = JSON.parse(readFileSync(here("./scenarios/names.biochain-ai.json"), "utf8"));

const problems = validate(scenarios, names);
if (problems.length) {
  console.log("Scenario files are invalid:\n  " + problems.join("\n  "));
  process.exit(1);
}

const env = await initializeTestEnvironment({
  projectId: "demo-biochain-rules",
  firestore: { rules: readFileSync(here("../../firestore.rules"), "utf8"), host: "127.0.0.1", port: 8080 },
});

// Replace the names file's delete marker with the SDK's deleteField().
function sdkData(v) {
  if (v === DELETE_FIELD) return deleteField();
  if (Array.isArray(v)) return v.map(sdkData);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, sdkData(x)]));
  return v;
}

function request(db, req) {
  const ref = () => doc(db, req.path);
  switch (req.method) {
    case "set":    return setDoc(ref(), sdkData(req.data));
    case "update": return updateDoc(ref(), sdkData(req.data));
    case "get":    return getDoc(ref());
    case "list":   return getDocs(collection(db, req.path));
    case "delete": return deleteDoc(ref());
    default: throw new Error(`unknown method ${req.method}`);
  }
}

const dbFor = (uid) => (uid === null ? env.unauthenticatedContext() : env.authenticatedContext(uid)).firestore();

await env.withSecurityRulesDisabled(async (c) => {
  const f = c.firestore();
  for (const s of scenarios.setup || []) await request(f, translate(s, names));
});

const todo = new Set(names.todo || []);
let pass = 0, fail = 0, todoCount = 0, skipped = 0;
let currentGroup = null;
for (const { group, step } of steps(scenarios)) {
  if (group !== currentGroup) { console.log(group.title); currentGroup = group; }
  if (!names.ops[step.op]) { skipped++; console.log("  -", step.name, "— not applicable to", names.app); continue; }
  const req = translate(step, names);
  const assert = step.expect === "allow" ? assertSucceeds : assertFails;
  try {
    await assert(request(dbFor(step.as), req));
    if (todo.has(step.id)) { fail++; console.log("  ✗", step.name, "— passes but is listed as todo; remove it from the names file"); }
    else { pass++; console.log("  ✓", step.name); }
  } catch (e) {
    if (todo.has(step.id)) { todoCount++; console.log("  ~", step.name, "— todo"); }
    else { fail++; console.log("  ✗", step.name, "—", String(e.message).split("\n")[0]); }
  }
}

await env.cleanup();
const extra = [todoCount ? `${todoCount} todo` : "", skipped ? `${skipped} not applicable` : ""].filter(Boolean).join(", ");
console.log(`\n${pass} passed, ${fail} failed${extra ? ", " + extra : ""}`);
process.exit(fail ? 1 : 0);
