# AGENTS.md — src/core

## Scope
- Domain models live in `src/core/models/` and are Zod-first.
- Simulation engine is in `src/core/sim/` and must stay pure (no React/browser APIs).
- Simulation client abstractions are in `src/core/simClient/`.
- Storage interfaces are in `src/core/storage/`.

## Rules of thumb
- Update Zod schemas first and infer types from them.
- Keep simulation deterministic and side-effect free.
- UI should not import Dexie directly; StorageClient is the boundary.
