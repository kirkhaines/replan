# Enhancements

## Scenario Edit
- N/A

## Run Results
- N/A

## Simulation Engine
- N/A 

## Models / Data
- N/A

## UI Polish
- N/A

## Security
- Implement CSP for production builds with a strict self-only policy:
  - `default-src 'self'`, `connect-src 'self'`, `script-src 'self'`, `style-src 'self'`,
    `img-src 'self' data:`, `font-src 'self'`, `worker-src 'self'`,
    `object-src 'none'`, `frame-src 'none'`, `base-uri 'none'`, `form-action 'none'`.
- Migrate inline `style={{ ... }}` usage to CSS classes so strict `style-src 'self'` is viable.
- Keep development usable by applying a dev-compatible CSP strategy (Vite HMR injects runtime styles).
- Add a verification checklist to confirm same-origin networking and local IndexedDB persistence in production preview.
