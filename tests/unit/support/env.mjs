// Test environment for modules that import Firebase: registers the module
// hooks (firebase-hooks.mjs) and a Map-backed localStorage. Import this before
// importing anything under src/ that touches Firebase.
import { register } from "node:module";

register(new URL("./firebase-hooks.mjs", import.meta.url));

class MemoryStorage {
  #m = new Map();
  getItem(k) { return this.#m.has(k) ? this.#m.get(k) : null; }
  setItem(k, v) { this.#m.set(k, String(v)); }
  removeItem(k) { this.#m.delete(k); }
  clear() { this.#m.clear(); }
  get length() { return this.#m.size; }
  key(i) { return [...this.#m.keys()][i] ?? null; }
}
Object.defineProperty(globalThis, "localStorage", { value: new MemoryStorage(), configurable: true, writable: true });

export const sdk = await import("https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js");
