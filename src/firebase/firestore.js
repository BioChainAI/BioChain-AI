/**
 * Thin, path-string Firestore facade used by every feature module. Keeping the
 * raw SDK behind this wrapper means feature code never imports the SDK directly,
 * so the SDK version is upgraded in exactly one place.
 */
import { db } from "./config.js";
import {
  doc, getDoc, setDoc, updateDoc,
  collection, addDoc, query, where, orderBy, limit,
  getDocs, onSnapshot, serverTimestamp, increment,
  deleteField, writeBatch,
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

// Splits "users/uid/identity/main" into path segments for doc()
const toRef = (path) => doc(db, ...path.split("/"));

export const getDocument = async (path) => {
  const snap = await getDoc(toRef(path));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};

export const setDocument = (path, data) =>
  setDoc(toRef(path), { ...data, updatedAt: serverTimestamp() }, { merge: true });

export const updateDocument = (path, data) =>
  updateDoc(toRef(path), { ...data, updatedAt: serverTimestamp() });

/** Remove the named fields from a document, changing nothing else (no updatedAt). */
export const removeFields = (path, fields) =>
  updateDoc(toRef(path), Object.fromEntries(fields.map((f) => [f, deleteField()])));

/**
 * Apply several document updates atomically, in the order given: either every
 * write lands or none does. Each op is { path, data }; like updateDocument,
 * each write also sets updatedAt.
 */
export const updateBatch = (ops) => {
  const batch = writeBatch(db);
  for (const { path, data } of ops) batch.update(toRef(path), { ...data, updatedAt: serverTimestamp() });
  return batch.commit();
};

export const addToCollection = (collectionPath, data) =>
  addDoc(collection(db, collectionPath), { ...data, createdAt: serverTimestamp() });

export const queryCollection = async (collectionPath, constraints = []) => {
  const ref = collection(db, collectionPath);
  const q = query(ref, ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export { where, orderBy, limit, onSnapshot, serverTimestamp, increment };
