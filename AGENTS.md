# AGENTS.md — RePlan (agent instructions)

## Project summary
RePlan is a local-first retirement planning web app.
- Data stays in the browser (IndexedDB via Dexie).
- Compute stays in the browser (Web Worker simulation).
- No backend/server is in scope unless explicitly requested.
 - Dependency injection is via Zustand in `src/state/appStore.ts` (StorageClient + ISimClient).

## Key invariants (do not violate)
1. Local-first storage:
   - UI MUST use StorageClient/Repo interfaces (no direct Dexie calls from pages/components).
2. Simulation boundary:
   - UI triggers simulations via ISimClient.
   - Worker validates inputs with Zod and returns structured results/errors.
3. Domain model is Zod-first:
   - Zod schemas are the source of truth; infer TS types from schemas.
4. Keep dependencies lean:
   - Do not add UI frameworks (MUI/Chakra/etc.) unless explicitly requested.
   - Prefer small utilities over big libraries.
5. Frontend hosting:
   - GitHub Pages deploy under `/replan/` (Vite `base` must match).
   - HashRouter is required for refresh-safe routing on static hosting.

## Dev commands (pnpm)
- Install: `pnpm install`
- Dev: `pnpm dev`
- Build: `pnpm build`
- Unit tests: `pnpm test`
- E2E tests: `pnpm test:e2e`
- Lint: `pnpm lint`
- Format: `pnpm format`

## Environment
- Node.js is installed; use it for small scripting tasks.
- Python is not installed.

## How to make changes (workflow)
- Prefer small, reviewable diffs.
- Before refactoring folders/architecture, propose the change and wait for approval.
- Update or add tests for behavior changes.
- Keep TypeScript strict; do not use `any` except at external boundaries.
 - When adding or changing models, update Zod schemas first and infer types from them.
 - When adding persistent entities, update both the StorageClient interfaces and Dexie schema.

## Defaults and seed data
- Default reference data lives in `src/core/defaults/defaultData.ts`.
- `seedDefaults` is called on app startup in `src/app/App.tsx` and after clearing data.

## Documentation upkeep
- Keep `README.md` aligned with current architecture, data model, and schema versions.
- Keep all `AGENTS.md` files aligned with current conventions and architectural decisions.

## What to do when uncertain
- Ask a clarifying question OR make the smallest reasonable assumption and document it in code comments.
- If you encounter build/test failures, stop and report the exact error with the command used.
