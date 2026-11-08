// The offline static guards, in one run (CI job "static").
import { report } from "./files.mjs";
import * as storage from "./storage-policy.mjs";
import * as audit from "./audit-kinds.mjs";
import * as cdn from "./cdn-pins.mjs";

const results = [
  report("storage policy", storage.check()),
  report("audit-log kinds", audit.check()),
  report("CDN pins", cdn.check()),
];
process.exit(results.every(Boolean) ? 0 : 1);
