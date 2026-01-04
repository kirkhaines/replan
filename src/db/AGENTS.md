# AGENTS.md — src/db

## Scope
- Dexie database schema and versioning live here.

## Rules of thumb
- When adding persistent entities, bump the Dexie version and add indexes as needed.
- Keep schema versions additive and compatible with existing data when possible.
