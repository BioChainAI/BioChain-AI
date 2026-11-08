// Trust scenarios: turn abstract steps (trust-v1.json) into concrete Firestore
// requests through an app's names file (names.<app>.json). Pure and
// dependency-free, so it is unit-tested without the emulator
// (tests/unit/scenarios.test.mjs). The format is described in README.md.

export const SCENARIO_FORMAT = "trust-scenarios/1";
export const NAMES_FORMAT = "trust-names/1";
export const METHODS = ["set", "update", "get", "list", "delete"];
const DATA_METHODS = new Set(["set", "update"]);
const PLACEHOLDER = /\{([A-Za-z_][A-Za-z0-9_]*)(?:=([^{}]*))?\}/g;
const WHOLE = /^\{([A-Za-z_][A-Za-z0-9_]*)(?:=([^{}]*))?\}$/;

/** Marker that a names file uses for "remove this field" ({"$delete": true}). */
export const DELETE_FIELD = Symbol.for("trust-scenarios.delete-field");

function lookup(name, def, vars, where) {
  if (Object.prototype.hasOwnProperty.call(vars, name) && vars[name] !== undefined) return { found: true, value: vars[name] };
  if (def !== undefined) {
    try { return { found: true, value: JSON.parse(def) }; }
    catch { throw new Error(`${where}: default for {${name}} is not JSON: ${def}`); }
  }
  return { found: false };
}

function interpolate(str, vars, where) {
  return str.replace(PLACEHOLDER, (_, name, def) => {
    const r = lookup(name, def, vars, where);
    if (!r.found) throw new Error(`${where}: no value for {${name}}`);
    return String(r.value);
  });
}

// A data template: a string that is exactly one placeholder takes the value's
// type and is omitted when the value is absent; other strings are interpolated;
// {"$delete": true} becomes DELETE_FIELD; objects and arrays recurse.
const OMIT = Symbol("omit");
function fill(tpl, vars, where) {
  if (typeof tpl === "string") {
    const m = WHOLE.exec(tpl);
    if (m) {
      const r = lookup(m[1], m[2], vars, where);
      return r.found ? r.value : OMIT;
    }
    return interpolate(tpl, vars, where);
  }
  if (Array.isArray(tpl)) return tpl.map((v, i) => fill(v, vars, `${where}[${i}]`)).filter((v) => v !== OMIT);
  if (tpl && typeof tpl === "object") {
    const keys = Object.keys(tpl);
    if (keys.length === 1 && keys[0] === "$delete" && tpl.$delete === true) return DELETE_FIELD;
    const out = {};
    for (const k of keys) {
      const v = fill(tpl[k], vars, `${where}.${k}`);
      if (v !== OMIT) out[k] = v;
    }
    return out;
  }
  return tpl;
}

/**
 * Translate one step (or setup entry) into { method, path, data? }.
 * `as` is the acting uid (null when signed out); params fill the op's template.
 */
export function translate(step, names) {
  const where = `step ${step.id || step.op}`;
  const tpl = names.ops[step.op];
  if (!tpl) throw new Error(`${where}: op "${step.op}" has no mapping in names file for ${names.app}`);
  const vars = { ...(step.params || {}), as: step.as ?? null };
  const path = interpolate(tpl.path, vars, `${where} path`);
  const segments = path.split("/");
  if (segments.some((s) => s === "")) throw new Error(`${where}: empty path segment in "${path}"`);
  const isCollection = tpl.method === "list";
  if ((segments.length % 2 === 1) !== isCollection)
    throw new Error(`${where}: "${path}" is not a ${isCollection ? "collection" : "document"} path`);
  const req = { method: tpl.method, path };
  if (DATA_METHODS.has(tpl.method)) req.data = fill(tpl.data || {}, vars, `${where} data`);
  return req;
}

/** Check a scenario file and a names file against each other; returns a list of problems (empty when valid). */
export function validate(scenarios, names) {
  const problems = [];
  const p = (msg) => problems.push(msg);
  if (scenarios.format !== SCENARIO_FORMAT) p(`scenario format is "${scenarios.format}", expected "${SCENARIO_FORMAT}"`);
  if (names.format !== NAMES_FORMAT) p(`names format is "${names.format}", expected "${NAMES_FORMAT}"`);
  for (const [op, tpl] of Object.entries(names.ops || {})) {
    if (!METHODS.includes(tpl.method)) p(`op ${op}: method "${tpl.method}" is not one of ${METHODS.join(", ")}`);
    if (typeof tpl.path !== "string") p(`op ${op}: path missing`);
    if (DATA_METHODS.has(tpl.method) && (!tpl.data || typeof tpl.data !== "object")) p(`op ${op}: data template missing`);
  }
  const ids = new Set();
  for (const s of scenarios.setup || []) {
    try { translate(s, names); } catch (e) { p(`setup: ${e.message}`); }
  }
  for (const g of scenarios.groups || []) {
    if (!g.id || !g.title || !Array.isArray(g.steps)) { p(`group ${g.id || "?"}: needs id, title and steps`); continue; }
    for (const s of g.steps) {
      if (!s.id) { p(`group ${g.id}: a step has no id`); continue; }
      if (ids.has(s.id)) p(`step ${s.id}: duplicate id`);
      ids.add(s.id);
      if (!s.name) p(`step ${s.id}: no name`);
      if (s.expect !== "allow" && s.expect !== "deny") p(`step ${s.id}: expect must be "allow" or "deny"`);
      if (!("as" in s)) p(`step ${s.id}: no actor ("as"; null means signed out)`);
      if (!names.ops || !names.ops[s.op]) {
        if (!(names.unsupported || []).includes(s.op)) p(`step ${s.id}: op "${s.op}" is neither mapped nor listed as unsupported`);
        continue;
      }
      try { translate(s, names); } catch (e) { p(e.message); }
    }
  }
  for (const id of names.todo || []) if (!ids.has(id)) p(`todo lists unknown step "${id}"`);
  return problems;
}

/** Every step in file order, with its group. */
export function steps(scenarios) {
  const out = [];
  for (const g of scenarios.groups || []) for (const s of g.steps) out.push({ group: g, step: s });
  return out;
}
