# RePlan

Local-first retirement planning app built with React + TypeScript. All data lives in the browser (IndexedDB), and simulations run in a Web Worker so UI stays responsive.

## Architecture

- `src/core/models/` Zod schemas + types for Scenario and SimulationRun.
- `src/core/sim/` Pure simulation engine (deterministic v0).
- `src/core/storage/` Repository interfaces + Dexie-backed implementation.
- `src/core/simClient/` Simulation client interface + worker implementation.
- `src/db/` IndexedDB schema via Dexie.
- `src/workers/` Web Worker for simulation execution + validation.
- `src/features/` Scenario CRUD and run/results views.
- `src/components/` Shared UI helpers.
- `src/app/` Routes and layout.
- `src/state/` Zustand store for app dependencies.
- `src/test/` Unit test helpers.

The UI depends on clean client interfaces (`StorageClient`, `ISimClient`) so a remote implementation can be added without rewriting features.

## Data model

- Scenario: person, finances, assumptions, timestamps, UUID.
- SimulationRun: scenarioId, status, result timeline + summary, timestamps.

Validation happens with Zod in both UI forms and the Web Worker.

## Local-first storage

Dexie manages IndexedDB database `replan` with tables:

- `scenarios` (key: `id`, index: `updatedAt`)
- `runs` (key: `id`, indexes: `scenarioId`, `finishedAt`)

## Simulation

`runSimulation` performs deterministic yearly steps in the worker:

- `balance = (balance * (1 + annualReturn)) - annualSpending + annualContribution`
- Spending inflates each year by `annualInflation`.

Results include a timeline and summary stats.

## Development

```bash
pnpm install
pnpm dev
```

Quality checks:

```bash
pnpm lint
pnpm format
pnpm test
pnpm test:e2e
pnpm build
```

## CHANGELOG

- Initialized core domain models, simulation engine, and worker-backed sim client.
- Added local Dexie storage with repository interfaces for scenarios and runs.
- Built minimal UI flows for scenario CRUD, run execution, and results visualization.
- Added Vitest and Playwright scaffolding plus ESLint/Prettier scripts.
