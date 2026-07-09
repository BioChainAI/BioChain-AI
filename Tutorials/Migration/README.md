# BioChain AI — Deployment Scaffold

**What this is:** a complete, reproducible runbook for spinning the BioMesh
architecture (SHD-CCP traceability + engram system) out of a reference codebase
into a **standalone, decoupled platform on its own Firebase project**. It
documents exactly how the `BioChain-AI` platform was migrated out of Owl Academy,
written so a future engineer can repeat the process for the *next* product built
on the same core — swap the names, swap the Firebase project, and go.

It is the companion to [`/MIGRATION_PLAN.md`](../../MIGRATION_PLAN.md): the plan
is *what and why* (the verifiable ledger); this scaffold is *how* (the ordered,
copy-pasteable steps).

## How to use it

1. Read the plan (`MIGRATION_PLAN.md`) end to end — it is the map.
2. Work these chapters in order. Each ends with an **exit gate** you must pass
   before moving on.
3. Tick the boxes in the plan's [Acceptance Checklist](../../MIGRATION_PLAN.md#9-acceptance-checklist)
   as you go. When they're all ticked, the platform is live and decoupled.

## Chapters

| # | Chapter | You will end with |
|---|---|---|
| 01 | [Architecture & scope](01-architecture-and-scope.md) | A clear picture of the four layers and exactly what does / does not move |
| 02 | [The naming standard](02-naming-standard.md) | A mechanical find/replace map from esoteric → enterprise names |
| 03 | [Firebase project & identity substrate](03-firebase-and-identity.md) | A live `biochain-ai` project with rules deployed and identity/keys ported |
| 04 | [Protocol core & BioMesh services](04-protocol-and-biomesh.md) | The SHD-CCP core copied + verified, and `biomesh.js` rewired |
| 05 | [Security rules & verification](05-rules-and-verification.md) | Rules proven in the emulator; protocol integrity proven bit-for-bit |
| 06 | [Console, login & reuse](06-console-and-reuse.md) | Re-hosted console pages + a login/Key Manager, and how to reuse all of this |

## The one principle

> **Names and hosting change; the protocol never does.** The SHD-CCP wire
> format, engram crystallization, Merkle/chiral commitments, and certification
> chain are mathematically pinned. Every step below is safe *because* it only
> touches identity naming and project binding — the traceability guarantee is
> carried over by construction and re-proven in Chapter 05.
