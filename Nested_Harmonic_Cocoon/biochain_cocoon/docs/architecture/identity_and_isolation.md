# Identity and isolation: the Cocoon Desktop

The Cocoon Desktop is the user's personal control panel for the Nested
Harmonic Cocoon. Users sign in with **the same credentials as the BioChain
console**. Nothing else crosses between the two systems.

```
          BioChain console                         Cocoon hub (Pi / PC / Docker)
┌──────────────────────────────┐         ┌──────────────────────────────────────────────┐
│ Firebase Auth (Google)  ◄────┼── same ─┼──►  Firebase Auth (Google), web SDK: app+auth │
│ Firestore: identities, keys, │ account │     ID token ──► hub verifies RS256 locally  │
│ roles, biochains, market     │         │                                              │
│             ✗ never read     │         │  SQLite: accounts · desktops · profiles ·    │
└──────────────────────────────┘         │  sessions · biofeedback · events · receipts  │
                                         └──────────────────────────────────────────────┘
```

## What carries over

| from BioChain | used by the cocoon as |
|---|---|
| the Firebase Auth account (Google sign-in on project `biochain-ai`) | the login |
| ID-token claims `sub`, `email`, `email_verified`, `name`, `picture` | account key, display, allowlist |

## What does not carry over (enforced)

| BioChain data | status in the cocoon | enforced by |
|---|---|---|
| Firestore (identities, signing keys, biochains, marketplace, transfers) | never loaded | `tests/test_isolation.py`: the frontend may load only `firebase-app` and `firebase-auth`; backend code references no Firestore/Admin SDK |
| BioChain roles (`config/rootAdmins`, `roleGrants`, ADMIN/OPERATOR/MEMBER) | ignored | cocoon roles come only from `COCOON_OWNER_UIDS` |
| the BioChain Identity commitment (login.html one-time setup) | not required | the cocoon reads no identity records |
| BioChain source (`src/firebase`, `src/identity`, …) | not imported | isolation test: no path into the repo's `src/` |
| cocoon data → BioChain | never pushed | the optional bridge only produces a receipt; the user publishes it in the BioChain console themselves |

## How sign-in works

1. The desktop fetches the public Firebase web config from the hub
   (`GET /api/auth/config`: apiKey, authDomain, projectId, appId. None of these are secrets).
2. It loads only `firebase-app.js` and `firebase-auth.js` from gstatic and
   signs in with Google, exactly as the BioChain console does. Served from the
   same origin as the console, the existing sign-in is reused.
3. Every API call carries `Authorization: Bearer <Firebase ID token>`. The SDK
   refreshes the token before its one-hour expiry.
4. The hub verifies the token itself (`cocoon_backend/auth.py`, standard library):
   RS256 signature against Google's published keys, `aud` = project,
   `iss` = `securetoken.google.com/<project>`, and `exp`/`iat`/`auth_time`/`sub`.
   Keys are cached in memory and on disk, so a brief internet outage does not lock users out.
5. First sign-in creates a cocoon **account** row and gives the user the
   *Personal cocoon* desktop template.

## Cocoon roles and data scope

| role | who | can |
|---|---|---|
| **member** | any BioChain account that passes the hub allowlist | own desktop, own profiles and consent records, own sessions/receipts/events; start a session when the cocoon is free; **always stop** |
| **owner** | uids in `COCOON_OWNER_UIDS` | everything: all users' data, puck placement, Hub accounts module |
| **service** | the `COCOON_API_TOKEN` bearer | machines: wearable bridges, scripts, offline hubs |

One cocoon is one physical room, so there is one session at a time. While
someone else's session runs, other members see only that the room is busy and
the target band. Their biostate, Guide state and events are private (HTTP 409 on start or
command, 403 on biofeedback, 404 on their events).

## Operating notes

* **Authorized domain.** Google sign-in only works on domains listed in the
  Firebase project (console → Authentication → Settings → Authorized domains).
  `localhost` is there by default. Add the hub's hostname or IP (e.g.
  `cocoon-hub.local`, `192.168.1.40`) before the first remote sign-in.
* **Restrict who can use a hub.** Any Google account can create a Firebase Auth
  user in the project. For a clinic, set `COCOON_ALLOWED_EMAILS=@clinic.example`
  (verified emails only) or `COCOON_ALLOWED_UIDS`.
* **Offline hub.** Sign-in needs Google. Without internet, previously cached
  keys keep validating current tokens. Machines use the service token.
* **Dev / demo.** `python3 -m cocoon_backend --sim --no-auth` skips sign-in and
  refuses to listen beyond 127.0.0.1.
