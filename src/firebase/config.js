/**
 * Firebase bootstrap for the standalone BioChain AI platform.
 * ----------------------------------------------------------------------------
 * This is the ONLY file that binds the app to a Firebase project. Point it at a
 * different project (staging, a customer tenant, a fork) and the entire platform
 * follows — nothing else in src/ references a project id. That single-point
 * binding is what makes the stack redeployable as a scaffold.
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyCIOlhkngpzqU15GiTPXiWUpWX5U0tYyIg",
  authDomain: "biochain-ai.firebaseapp.com",
  projectId: "biochain-ai",
  storageBucket: "biochain-ai.firebasestorage.app",
  messagingSenderId: "154632169740",
  appId: "1:154632169740:web:689b3e1196c76a40350129",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
