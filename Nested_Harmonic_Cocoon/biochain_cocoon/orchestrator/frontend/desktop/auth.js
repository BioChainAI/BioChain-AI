// Sign-in for the Cocoon Desktop: the same Firebase Auth project as the BioChain console.
//
// ISOLATION: this file loads ONLY firebase-app and firebase-auth. No Firestore,
// no Storage, and nothing from the BioChain repo's src/. The hub supplies the
// public Firebase web config (GET /api/auth/config), so the cocoon has no
// build-time link to BioChain. tests/test_isolation.py enforces this.
const SDK = "https://www.gstatic.com/firebasejs/12.15.0";

export async function createAuth(config) {
  if (config.mode === "none") {
    // Dev/demo hub (loopback only): no login; the hub treats every call as the local operator.
    const local = { uid: "local", displayName: "Local operator", email: null, photoURL: null };
    return {
      mode: "none",
      onChange(cb) { cb(local); return () => {}; },
      async signIn() {}, async signOut() {},
      async token() { return null; },
    };
  }
  const [{ initializeApp }, fa] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
  ]);
  // The default app name, with the same apiKey as the BioChain console. When
  // the desktop is served from the same origin as the console, the existing
  // sign-in is reused (single sign-on); otherwise the user signs in once with
  // the same account.
  const app = initializeApp(config.firebase);
  const auth = fa.getAuth(app);
  const provider = new fa.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return {
    mode: "firebase",
    onChange: (cb) => fa.onAuthStateChanged(auth, cb),
    signIn: () => fa.signInWithPopup(auth, provider),
    signOut: () => fa.signOut(auth),
    // The SDK caches the ID token and refreshes it before its 1 h expiry.
    token: () => (auth.currentUser ? auth.currentUser.getIdToken() : Promise.resolve(null)),
  };
}
