# Chapter 01 — Architecture & Scope

**Goal:** understand the four layers, and internalize the seam that makes this
migration tractable — the only Owl Academy coupling is *identity naming*, never
*domain logic*.

## The four layers

```
Layer 4  CONSOLE / UI ......... operator + member web pages
Layer 3  BIOMESH SERVICES ..... grow · certify · transfer · rate · trace  (+ identity/keys)
Layer 2  PROTOCOL CORE ........ SHD-CCP kernel · codex engine · engram shard · mesh · pump clock
Layer 1  DATA / RULES ......... Firestore collections + security rules + project binding
```

The migration difficulty is *inverted* from what you'd expect:

- **Layer 2 (the scary-sounding part)** — the SHD-CCP protocol, engram
  crystallization, the mesh economy — has **zero** coupling. It's pure Python
  standard library, deterministic, already dependency-free. It moves by `cp`.
- **Layer 3 (the boring part)** — identity, signing keys, timing — is where
  *all* the coupling lives, and it's coupling of *names*, not behavior.

## What moves, what doesn't

**Moves into `BioChain-AI/`:**

- The 5 protocol modules (`shdccp_kernel.py`, `codex_engine.py`,
  `biochain_mesh.py`, `pump_clock.py`, `engram_shard.py`).
- The grow/certify/transfer/rate service (`biomesh.js`) + its identity substrate
  (identity registry, access control, signing key, crypto core, epoch service,
  identicon).
- The three BioMesh console pages + their guides.
- The generic Firebase wrapper (config/auth/firestore).

**Stays in Owl Academy (never touched):**

- Curriculum & canon: `tomes`, `majorTomes`, `artifacts`, `Library/`, `Proofs/`,
  `canon/`, `unlockRequests`, `tomeUnlocks`, `guilds`, `constellations`.
- Academy pages: Seal Forge, Genesis Forge, Registrar, Instructor/Unlock
  consoles, Store, Familiars, etc.

## Why the coupling is only identity

`biomesh.js` imports exactly six things beyond the Firebase wrapper:

```
readRegistrar        → identity (Cosmological ID)
signWithMinorTome    → signing (ECDSA attestation)
verifySealBlock      → verification
resolveTier          → role (only for rating weight + console gate)
getTick              → timing (epoch stamp)
SC.*                 → crypto primitives
```

None of those are Academy *concepts* — they're an identity/PKI substrate that
any multi-tenant system needs. Owl Academy dressed them in fantasy names (tome,
seal, archon, sigil, schumann, cosmological). We keep the machinery and change
the dress. That is the entire migration.

## The reassurance you carry into every later chapter

The browser grow cell is already **byte-identical** to the Python kernel:
`crystallize(0..59) = 9841D88D8B003CEA` on both, and engram token `"GEODESIC"`
→ `5c896a4801c9c24c` on both. So "port the traceability + engram system" does not
mean "reimplement" — it means "relocate and rename, then re-run the existing
proofs." Chapter 05 re-runs them.

## Exit gate

- [ ] You can name the four layers and which one carries the coupling.
- [ ] You can list three collections that move and three that stay.
- [ ] You accept the principle: **names/hosting change; protocol does not.**

→ Continue to [Chapter 02 — The naming standard](02-naming-standard.md).
