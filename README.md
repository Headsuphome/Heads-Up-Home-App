# Heads Up Home engine

The recall collector and alert engine (Supabase Edge Functions), kept on its own branch so it never
touches the app build.

- `supabase/functions/` – the Edge Functions and the shared collectors in `_shared/`
- `supabase/migrations/` – database changes, run in order in the Supabase SQL Editor
- `dashboard/` – each function bundled into one file, for pasting into the Supabase dashboard
  (`node scripts/bundle-for-dashboard.mjs` rebuilds them)
- `tests/` – `npm test`

Pushing to this branch runs **Engine check**: the tests, plus a live run of every collector against the real
sources, with a report saved to the `build-logs` branch under `engine-check/`.
