// An in-memory stand-in for the parts of the Firebase web SDK (app, auth,
// firestore, storage) that src/ imports. It records every write in order, so
// tests can check exactly what the app sends. Not a rules emulator: nothing is
// denied here (tests/rules covers the rules).
export const store = new Map();          // "col/doc" -> data
export const writes = [];                // { op, path, data } | { op: "batch", ops: [...] }

export function reset() { store.clear(); writes.length = 0; autoId = 0; }
let autoId = 0;

const DELETE = Symbol("deleteField");
const SERVER_TS = "<serverTimestamp>";
export const deleteField = () => DELETE;
export const serverTimestamp = () => SERVER_TS;
export const increment = (n) => ({ increment: n });

// app / auth / storage
export const initializeApp = (config) => ({ config });
export const getAuth = () => ({ currentUser: null });
export const getFirestore = () => ({ firestore: true });
export const getStorage = () => ({ storage: true });
export class GoogleAuthProvider {}
export const signInWithPopup = async () => ({});
export const signOut = async () => {};
export const onAuthStateChanged = () => () => {};

// firestore references
const join = (segments) => segments.flatMap((s) => String(s).split("/")).join("/");
export const doc = (_db, ...segments) => ({ type: "doc", path: join(segments), id: join(segments).split("/").pop() });
export const collection = (_db, ...segments) => ({ type: "collection", path: join(segments) });
export const query = (ref) => ref;
export const where = (...a) => ({ where: a });
export const orderBy = (...a) => ({ orderBy: a });
export const limit = (n) => ({ limit: n });
export const onSnapshot = () => () => {};

function snapshot(path) {
  const has = store.has(path);
  return { id: path.split("/").pop(), exists: () => has, data: () => (has ? structuredClone(store.get(path)) : undefined) };
}
export const getDoc = async (ref) => snapshot(ref.path);
export const getDocs = async (ref) => {
  const prefix = ref.path + "/";
  const docs = [...store.keys()].filter((p) => p.startsWith(prefix) && !p.slice(prefix.length).includes("/")).map(snapshot);
  return { docs };
};

// replace: start from an empty document (setDoc without merge, addDoc);
// otherwise merge into the stored one (setDoc with merge, updateDoc).
function apply(path, data, { replace = false } = {}) {
  const next = replace ? {} : { ...(store.get(path) || {}) };
  for (const [k, v] of Object.entries(data)) {
    if (v === DELETE) delete next[k];
    else next[k] = v;
  }
  store.set(path, next);
}
function record(op, path, data) {
  const shown = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v === DELETE ? "<deleteField>" : v]));
  return { op, path, data: shown };
}

export const setDoc = async (ref, data, opts = {}) => {
  writes.push(record("set", ref.path, data));
  apply(ref.path, data, { replace: !opts.merge });
};
export const updateDoc = async (ref, data) => {
  if (!store.has(ref.path)) throw new Error(`No document to update: ${ref.path}`);
  writes.push(record("update", ref.path, data));
  apply(ref.path, data);
};
export const addDoc = async (colRef, data) => {
  const ref = doc(null, colRef.path, `auto${++autoId}`);
  writes.push(record("add", ref.path, data));
  apply(ref.path, data, { replace: true });
  return ref;
};
export const writeBatch = () => {
  const ops = [];
  return {
    update(ref, data) { ops.push({ op: "update", ref, data }); return this; },
    set(ref, data) { ops.push({ op: "set", ref, data }); return this; },
    async commit() {
      for (const o of ops) if (o.op === "update" && !store.has(o.ref.path)) throw new Error(`No document to update: ${o.ref.path}`);
      writes.push({ op: "batch", ops: ops.map((o) => record(o.op, o.ref.path, o.data)) });
      for (const o of ops) apply(o.ref.path, o.data, { replace: o.op === "set" });
    },
  };
};
