# RePlan

Local-first retirement planning web app.
Data stays in your browser (IndexedDB). Computation runs in your browser (Web Worker).
No server/backend required.

## Goals

- Model and organize retirement scenarios.
- Run deterministic (v0) and later Monte Carlo simulations.
- Display results with tables and charts.
- Stay easy to build, run, and deploy (static site; GitHub Pages friendly).
- Keep architecture modular so a future remote/sync backend can be added without rewriting the app.

## Tech Stack

- React + TypeScript + Vite - UI and build tooling
- React Hook Form (RHF) - form state management
- Zod - runtime validation + type inference (single source of truth)
- Zustand - lightweight app state / dependency container
- Dexie + IndexedDB - in-browser persistent storage
- Web Workers - run simulations off the UI thread
- TanStack Table - scenario/run tables
- Recharts - charts (balance over time)
- Vitest - unit tests
- Playwright - end-to-end smoke tests
- ESLint + Prettier - linting/formatting

## Architecture Overview

RePlan is split into a few layers:

1. Core domain models
   - `src/core/models/`
   - Zod schemas define shapes and constraints.
   - TypeScript types are inferred from Zod to avoid drift.

2. Core simulation engine
   - `src/core/sim/`
   - Pure functions (no React, no browser APIs).
   - Deterministic v0 engine used for early wiring and testing.
   - Designed so we can later swap/extend engines (Monte Carlo, tax models, etc.).

3. Storage layer (local-first)
   - `src/core/storage/` + `src/db/`
   - `StorageClient` exposes repositories for scenarios, people, accounts, strategies, and runs.
   - Local implementation uses Dexie/IndexedDB with schema versioning.
   - Interfaces are designed so a remote implementation can be added later.

4. Simulation client layer
   - `src/core/simClient/`
   - `ISimClient` is an abstraction for running scenarios.
   - Current implementation uses a Web Worker (`WorkerSimClient`) so compute does not block the UI.
   - A future remote implementation could call an API instead, without changing UI code.

5. UI feature modules
   - `src/features/` holds screens and feature-specific logic.
   - Shared UI parts in `src/components/`
   - Routing/layout in `src/app/`
   - Minimal global state in `src/state/` (Zustand), mainly for dependency injection.

### Dependency direction

UI -> (StorageClient, SimClient) -> (Repos / Worker) -> Core (models + sim)

Core should not depend on UI.

## Data Model (current)

Most entities have `id`, `createdAt`, and `updatedAt` fields. Relationships are stored by id.
Simulation runs are stored separately with `startedAt`/`finishedAt` timestamps.

Key entities include:

- Person
- SocialSecurityEarnings
- NonInvestmentAccount
- InvestmentAccount
- InvestmentAccountHolding
- FutureWorkStrategy
- FutureWorkPeriod
- SpendingStrategy
- SpendingLineItem
- SocialSecurityStrategy
- PersonStrategy
- Scenario (references people, accounts, strategies, and funding choices)
- SimulationRun
- InflationDefault
- SsaWageIndex
- SsaBendPoint
- SsaRetirementAdjustment

## Simulation (v0 deterministic)

Each year:
- `balance = (balance * (1 + annualReturn)) - annualSpending + annualContribution`
- `annualSpending` increases by inflation each year (`spending *= 1 + annualInflation`)
- contributions remain flat in v0

Outputs:
- Timeline records: `{ yearIndex, age, balance, contribution, spending }`
- Summary: `{ endingBalance, minBalance, maxBalance }`

## Local Database (IndexedDB via Dexie)

Database name: `replan`

Tables (v6 schema):
- `scenarios` (primary key `id`, index `updatedAt`)
- `runs` (primary key `id`, indexes `scenarioId`, `finishedAt`)
- `people` (primary key `id`, index `updatedAt`)
- `socialSecurityEarnings` (primary key `id`, indexes `personId`, `year`)
- `socialSecurityStrategies` (primary key `id`, index `personId`)
- `nonInvestmentAccounts` (primary key `id`, index `updatedAt`)
- `investmentAccounts` (primary key `id`, index `updatedAt`)
- `investmentAccountHoldings` (primary key `id`, indexes `investmentAccountId`, `updatedAt`)
- `futureWorkStrategies` (primary key `id`, index `personId`)
- `futureWorkPeriods` (primary key `id`, indexes `futureWorkStrategyId`, `startDate`)
- `spendingStrategies` (primary key `id`, index `updatedAt`)
- `spendingLineItems` (primary key `id`, indexes `spendingStrategyId`, `startDate`)
- `personStrategies` (primary key `id`, indexes `personId`, `scenarioId`)
- `inflationDefaults` (primary key `id`, index `type`)
- `ssaWageIndex` (primary key `id`, index `year`)
- `ssaBendPoints` (primary key `id`, index `year`)
- `ssaRetirementAdjustments` (primary key `id`, indexes `birthYearStart`, `birthYearEnd`)

The Dexie schema lives in `src/db/db.ts` and supports versioning/migrations.

## Routes

- `/scenarios`
  Scenario list + create action.

- `/scenarios/:id`
  Scenario edit form + run simulation + associated grids.

- `/runs/:id`
  Run results: timeline table + Recharts line chart (balance over time).

- `/people`
  People list + detail pages.

- `/accounts`
  Cash and investment account lists + detail pages.

- `/about`
  High-level project overview.

- `/license`
  License information and third-party notices.

## Development

### Prereqs
- Node.js (LTS recommended)
- pnpm

### Install
```bash
pnpm install
```

### Run
```bash
pnpm dev
```

## GitHub Pages

Deploys under `https://kirkhaines.github.io/replan/` using hash-based routing so refreshes work without server rewrites.

### Quality checks
```bash
pnpm lint
pnpm format
pnpm test
pnpm test:e2e
pnpm build
```

## License

RePlan is licensed under the PolyForm Noncommercial License 1.0.0. See `LICENSE`.

## Third-party notices

Third-party licenses and notices are documented in the in-app Licensing page.

## CHANGELOG

- Initialized core domain models, simulation engine, and worker-backed sim client.
- Added local Dexie storage with repository interfaces for scenarios, people, accounts, strategies, and runs.
- Built minimal UI flows for scenario CRUD, run execution, and results visualization.
- Added People and Accounts pages with detail views.
- Added Vitest and Playwright scaffolding plus ESLint/Prettier scripts.
- Configured GitHub Pages deployment and hash routing.
