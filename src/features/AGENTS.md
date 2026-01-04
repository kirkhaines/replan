# AGENTS.md — src/features

## Scope
- Feature pages and UI logic live here.
- Data access goes through StorageClient from `src/state/appStore.ts`.
- Simulations run via ISimClient from `src/state/appStore.ts`.

## Rules of thumb
- No direct Dexie access in UI components.
- Prefer React Hook Form + Zod for forms and validation.
- Use HashRouter-friendly paths as defined in `src/app/App.tsx`.
