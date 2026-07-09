# Chapter 06 — Console, Login & Reuse

**Goal:** re-host the three BioMesh console pages, author the one new identity UI
the standalone build needs (login + Key Manager), and learn to reuse this whole
scaffold for the next product.

## 6.1 Author `login.html`

Owl Academy's login is entangled with curriculum onboarding, so the standalone
build gets a fresh, minimal one. It must do three things:

1. Google sign-in (`src/firebase/auth.js`).
2. On first sign-in, bootstrap the identity doc: derive the **Identity ID** from
   an identity seed and write `users/{uid}/identity/main` (via
   `src/identity/identity-registry.js`), defaulting `role: "MEMBER"` (or `ADMIN`
   if the uid is in `ROOT_ADMIN_UIDS`).
3. Redirect back to the page the user requested (the `?redirect=` param that
   `src/ui/auth-guard.js` appends).

## 6.2 Re-host the console pages

Copy and re-theme, rewiring imports to `../src/**`. Apply the Chapter 02 renames
to all copy and identifiers.

| Source | Target | Key edits |
|---|---|---|
| `mage_tower/Biomesh_Console.html` | `console/Operations_Console.html` | role gate `ARCHON`→`ADMIN`; imports `../src/biomesh/biomesh.js`, `../src/identity/access-control.js` (`resolveRole`), `../src/identity/signing-key.js` (`listSigningKeys`); drop Academy nav/theme |
| `mage_tower/Biomesh_Language_Growing.html` | `console/Language_Studio.html` | same imports + `../src/biomesh/identicon.js` (`renderKeyIdenticon`); "Familiar"→"Retrieval Agent" |
| `mage_tower/Biomesh_Mind_Eye_3D.html` | `console/Lattice_Forge.html` | keep the Three.js importmap and inline SHD-CCP codec unchanged; re-theme only |
| `…_Guide.html` (both) | `console/guides/…_Guide.html` | copy edits per Chapter 02 |

Each protected page starts with:

```html
<script type="module" src="../src/ui/auth-guard.js"></script>
```

which hides the body until auth resolves and redirects to `/login.html` if signed
out.

## 6.3 Author the Key Manager

The one identity surface that doesn't come from a BioMesh page (Academy's Seal
Forge is entangled with tomes). A small page that:

- Lists the caller's signing keys (`listSigningKeys`) with their identicons.
- Creates a new signing key (`createSigningKey`).
- Revokes / retires a key (`revokeSigningKey` / `retireSigningKey`) — and shows
  that its attestations stop verifying.

This closes the loop: a MEMBER can mint a key, grow + certify a biochain, transfer
it free, and rate — with no Academy dependency anywhere.

## 6.4 Relink the landing page

`Index.html` already exists. Add entry points to `login.html` and the console so
the standalone site is navigable. Deployment stays on GitHub Pages
(`.github/workflows/static.yml`) — no server needed; Firestore + rules are the
backend.

## 6.5 Reuse this as a scaffold for the next product

This is why the migration was documented, not just done. To spin out another
platform on the same core:

1. **New Firebase project** → drop its config into `src/firebase/config.js`.
   That's the only project binding; everything follows.
2. **New naming standard** → write a fresh version of the Chapter 02 table
   (e.g. a customer's vocabulary) and apply it. The *seam* (identity substrate vs
   protocol core vs UI) does not change — only the words do.
3. **Copy `protocol/` verbatim** → the SHD-CCP core is product-agnostic; it never
   needs re-derivation.
4. **Port `src/identity/` + `src/biomesh/`** → apply the new names; rerun the
   Chapter 05 proofs.
5. **Re-theme `console/`** → the feature logic is done; only chrome changes.
6. **Deploy rules** → start from this repo's `firestore.rules`, rename
   collections to match, deploy.

The invariant that makes reuse cheap: **the protocol core is pinned and shared;
identity is a rename; UI is a re-theme.** A second deployment is days, not weeks,
because the hard, correctness-critical part is copied, not rebuilt.

## Exit gate (and platform go-live)

- [ ] `login.html` bootstraps an identity on first sign-in.
- [ ] Three console pages + two guides re-hosted and re-themed; auth-guard on each.
- [ ] Key Manager creates/revokes signing keys.
- [ ] Full loop works on the live `biochain-ai` project: sign in → identity → key
      → grow → certify → transfer → accept → rate → trace.
- [ ] The plan's [Acceptance Checklist](../../MIGRATION_PLAN.md#9-acceptance-checklist) is fully ticked.

**When every box is ticked, the standalone decoupled platform is live — and this
scaffold is ready to run again for the next one.**
