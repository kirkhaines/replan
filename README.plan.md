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

- **React + TypeScript + Vite** — UI and build tooling
- **React Hook Form (RHF)** — form state management
- **Zod** — runtime validation + type inference (single source of truth)
- **Zustand** — lightweight app state / dependency container
- **Dexie + IndexedDB** — in-browser persistent storage
- **Web Workers** — run simulations off the UI thread
- **TanStack Table** — scenario/run tables
- **Recharts** — charts (balance over time)
- **Vitest** — unit tests
- **Playwright** — end-to-end smoke tests
- **ESLint + Prettier** — linting/formatting

## Architecture Overview

RePlan is split into a few layers:

1. **Core domain models**
   - `src/core/models/`
   - Zod schemas define shapes and constraints.
   - TypeScript types are inferred from Zod to avoid drift.

2. **Core simulation engine**
   - `src/core/sim/`
   - Pure functions (no React, no browser APIs).
   - Deterministic v0 engine used for early wiring and testing.
   - Designed so we can later swap/extend engines (Monte Carlo, tax models, etc.).

3. **Storage layer (local-first)**
   - `src/core/storage/` + `src/db/`
   - `StorageClient` exposes repositories:
     - `ScenarioRepo` (CRUD)
     - `RunRepo` (query by scenario, read runs)
   - Local implementation uses Dexie/IndexedDB with schema versioning.
   - Interfaces are designed so a remote implementation can be added later.

4. **Simulation client layer**
   - `src/core/simClient/`
   - `ISimClient` is an abstraction for running scenarios.
   - Current implementation uses a Web Worker (`WorkerSimClient`) so compute doesn’t block the UI.
   - A future remote implementation could call an API instead, without changing UI code.

5. **UI feature modules**
   - `src/features/` holds screens and feature-specific logic:
     - Scenario list/create/edit
     - Run list
     - Run results (table + chart)
   - Shared UI parts in `src/components/`
   - Routing/layout in `src/app/`
   - Minimal global state in `src/state/` (Zustand), mainly for dependency injection.

### Dependency direction

UI → (StorageClient, SimClient) → (Repos / Worker) → Core (models + sim)

Core should not depend on UI.

## Data Model (v0)

### Scenario (Zod)

A minimal scenario definition:

- `id: string` (uuid)
- `name: string`
- `createdAt: number`
- `updatedAt: number`
- `person.currentAge: number (20–80)`
- `person.retirementAge: number (35–90, > currentAge)`
- `finances.startingBalance: number >= 0`
- `finances.annualContribution: number >= 0`
- `finances.annualSpending: number >= 0`
- `assumptions.annualReturn: number (-0.5..0.5)`
- `assumptions.annualInflation: number (-0.1..0.2)`
- `assumptions.years: number (5..80)`

### SimulationRun

- `id: string`
- `scenarioId: string`
- `startedAt: number`
- `finishedAt: number`
- `status: "success" | "error"`
- `errorMessage?: string`
- `result.timeline[]` and `result.summary`

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

Tables:
- `scenarios` (primary key `id`, index `updatedAt`)
- `runs` (primary key `id`, indexes `scenarioId`, `finishedAt`)

The Dexie schema lives in `src/db/` and supports versioning/migrations.

## Routes

- `/scenarios`  
  Scenario list (TanStack Table) + create action.

- `/scenarios/:id`  
  Scenario edit form (RHF + Zod) + “Run simulation” + list of runs.

- `/runs/:id`  
  Run results: timeline table + Recharts line chart (balance over time).

## Development

### Prereqs
- Node.js (LTS recommended)
- pnpm

### Install
```bash
pnpm install
