# Atlas — agent instructions

Atlas is a **Vite + React + Supabase** app in this directory. The old Lakebed capsule is deprecated; archived reference code lives in `.lakebed/reference/`.

**Read [`docs/ROADMAP.md`](docs/ROADMAP.md) before feature work** — it covers architecture, phased features, and notifications.

## Hard rules

- All app code lives in this directory (`src/`, `shared/`, `supabase/`).
- Use **npm** for dependencies (`package.json`). Run `npm install` when adding packages.
- Client: React in `src/`. Serverless backend: **Supabase** (Postgres, RLS, Auth, Realtime, Edge Functions if needed).
- **Do not** use Lakebed or `npx lakebed`. Do not edit `.lakebed/reference/` unless refreshing the archive.
- Keep `shared/` free of DOM, Node, env, and Supabase imports (pure TypeScript only).
- Data reads/writes go through **`src/services/`** and hooks — not Supabase calls in pages/components.
- Styling: Tailwind classes in JSX (Tailwind v4 via `@tailwindcss/vite`).
- Routing: `react-router-dom` in `src/App.tsx`.
- Auth: Supabase Auth via `src/hooks/useAuthSession.ts` and `src/lib/supabase.ts`.
- Secrets: `.env.local` locally (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). Never commit secrets. Do not use `service_role` key in the frontend.

## Project structure

```txt
Atlas/                     # repo root
  shared/                  # Domain types and pure logic
  src/
    components/ pages/ hooks/ context/ services/ lib/
  supabase/migrations/     # SQL schema + RLS
  docs/
    ROADMAP.md             # Product + architecture source of truth
  .lakebed/reference/      # Read-only porting reference (gitignored)
  scripts/                 # macOS dev launcher
```

## Commands

```sh
npm install
npm run dev          # http://localhost:5173
npm run build
npm run lint
```

Supabase CLI (optional): `supabase link`, `supabase db push` from this directory.

## Supabase conventions

- One row per item in `public.items`; extend via migrations for new fields/tables.
- RLS: users only access `owner_id = auth.uid()`.
- Realtime: subscribe in hooks (see `useItems.ts`), not in every component.
- Revision field on items for optimistic concurrency (see `updateItem` in services).

## Porting from Lakebed reference

When implementing Phase 2+ features:

1. Read the feature row in `docs/ROADMAP.md`.
2. Study the matching files under `.lakebed/reference/`.
3. Add migration(s), extend `shared/`, implement `src/services/`, then UI.
4. Adapt Preact/Lakebed patterns to React + Supabase (queries/mutations → service functions + hooks).

## Current limits

- MVP item schema is a subset of full Lakebed item model (no intervals, links, docs, generators in DB yet).
- No notification system shipped; follow roadmap in `docs/ROADMAP.md` when adding.
- Local dev uses HTTP; production should use HTTPS (e.g. Vercel).
