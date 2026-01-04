# AGENTS.md — src/workers

## Scope
- Web Worker entry points for simulation and other compute tasks.

## Rules of thumb
- Validate inputs with Zod before running simulations.
- Return structured results/errors via the SimClient message types.
- Keep worker code independent of React/DOM APIs.
