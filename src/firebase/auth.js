/**
 * Authentication helpers. Google sign-in by default; swap the provider here to
 * change the platform's identity provider without touching any feature module.
 */
import { auth } from "./config.js";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";

const provider = new GoogleAuthProvider();

export const signInWithGoogle = () => signInWithPopup(auth, provider);
export const signOutUser = () => signOut(auth);
export const onAuthChange = (callback) => onAuthStateChanged(auth, callback);
export const getCurrentUser = () => auth.currentUser;
