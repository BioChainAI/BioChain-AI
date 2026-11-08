# Trust scenarios

Abstract, app-independent checks of the BioMesh Firestore trust rules. BioChain-AI
owns them; other apps that share the trust model (Owl Academy) vendor this folder
and supply their own names file.

| File | What it is |
|---|---|
| `trust-v1.json` | The scenarios: setup writes, then groups of steps with an expected verdict |
| `names.biochain-ai.json` | BioChain-AI's mapping from each abstract operation to a Firestore request |
| `translate.mjs` | The dependency-free engine: validation and step → request translation |

`tests/rules/rules.test.mjs` runs every step against the Firestore emulator with
`firestore.rules`; `tests/unit/scenarios.test.mjs` validates the files offline.

## `trust-v1.json` (`"format": "trust-scenarios/1"`)

- `setup` — writes made with rules disabled before any step: `{ "op", "as", "params" }`.
- `groups` — `{ "id", "title", "steps": [...] }`, run in file order against one
  database, so later steps see the state earlier steps left.
- A step is `{ "id", "name", "as", "op", "params", "expect" }`:
  - `id` — unique, stable; a names file refers to steps by it;
  - `as` — the acting uid, or `null` for a signed-out client;
  - `op` — an abstract operation such as `transfer.send` or `identity.forgetSeed`;
  - `params` — the operation's inputs;
  - `expect` — `"allow"` or `"deny"`.

Steps are only added. A step's expected verdict changes only with a deliberate
change to the trust model, recorded in the pull request that makes it.

## `names.<app>.json` (`"format": "trust-names/1"`)

- `ops` — for each operation: `method` (`set`, `update`, `get`, `list`, `delete`),
  a `path` template and, for `set` and `update`, a `data` template.
- `todo` — step ids the app does not meet yet; the runner reports them without
  failing, and fails if one starts passing (so the list only shrinks).
- `unsupported` — operations the app has no equivalent for; their steps are
  reported as not applicable.

Templates use `{name}` placeholders filled from the step's `params`, plus `{as}`
for the acting uid:

- in a path, every placeholder must have a value;
- in data, a string that is exactly one placeholder takes the value's JSON type
  and the field is **omitted** when the step does not supply it (this is how
  "send without chainSeq" is written); `{name=<json>}` gives a default;
- `{"$delete": true}` removes the field (Firestore `deleteField()`).

## Running

```bash
cd tests/rules && npm ci && npm test     # needs Java 21 for the emulator
node --test "tests/unit/*.test.mjs"      # from the repository root: offline validation
```
