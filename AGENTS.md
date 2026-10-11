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

## Git workflow

**Brain coder (Tonio, 11 Oct 2026):** unattended Luna/Sol changes use isolated worktrees and merge only into the single `brain-experimental` branch. It stays current with `main`; merging the whole batch into `main` requires Tonio's human-admin approval. A blocking change is reverted with its reason and lesson recorded in Brain. This supersedes unattended main merges for this channel; the interactive Git workflow below remains the historical default outside it.

`.brain.json` links this program to inquiry `IQ-b3a3849d` and the cross-program coding inquiry. Before coding, run `python3 /Users/tonio/apps/Brain/scripts/repo_brain.py context --repo .`; after a verified commit record decisions and lessons through `schema-web` in the program inquiry, citing the hash and anchors such as `atlas:path@commit`. Code and tests define behavior; Brain holds reasons and open problems.

The coder freezes the effect layer and its write/parser/auth/configuration dependencies listed in `.brain.json`: create only, never move/edit/delete human items, same account, exact fresh preview and approval gate. It cannot edit the existing MCP effect tests or Brain adapter contract; `tests/constraints/` is also append-only. Add a new constraint test there; `npm run check` discovers it. Changes requiring protected code or dependencies are blockers for human-reviewed work, not permission to weaken the protections.

**Default:** after meaningful changes, **commit and push** yourself (`git add` → `git commit` → `git push`). User expects GitHub/Vercel to stay current without being asked each time.

**Branches:** only when user explicitly asks for a backup branch — otherwise work on `main`.

**Never commit:** `.env.local`, secrets, or when user says don't commit.

See also `.cursor/rules/git-workflow.mdc`.

## Commands

```sh
npm install
npm run dev          # http://localhost:5173
npm run build
npm run lint
```

Supabase CLI (optional): `supabase link`, `supabase db push` from this directory.

## Checks and handoff

- `npm run check` (lint, build, Brain tool typecheck, all tests) before claiming a change works. Say which evidence you used; documentation is not evidence.
- Start from [`HANDOFF.md`](HANDOFF.md). Before stopping, including mid-task or near a usage limit, update it: goal, verified state, next step, questions for the user.
- Brain (`../Brain`) calls Atlas code directly: its action-pulse adapter imports `src/services/` and `shared/schemaSchedule.ts` by path. `scripts/brain-contract.test.ts` pins that surface. When it fails, change Brain's `scripts/atlas-action-pulse.mjs` in the same step.

## Supabase conventions

- One row per item in `public.items`; extend via migrations for new fields/tables.
- RLS: users only access `owner_id = auth.uid()`.
- Realtime: subscribe in hooks (see `useItems.ts`). DELETE events use a separate listener without `owner_id` filter — delete payloads only carry `id`, so filtered DELETE events are dropped on other tabs.
- Revision field on items for optimistic concurrency (see `updateItem` in services).

## UX: undo replaces confirmation

Atlas uses **undo** (`UndoContext`, Cmd/Ctrl+Z, header Undo button) instead of “Are you sure?” dialogs.

- **Do not** add `window.confirm`, `window.alert` for destructive actions, or other confirmation modals for normal edits/deletes/creates.
- Destructive actions (delete, remove link, clear field, etc.) should execute immediately and push an **undo op** so the user can reverse the action.
- Errors that block the action (network failure, permission denied) may still surface inline or as a brief non-blocking message — not a confirmation gate before trying.
- When adding new mutations, wire undo in the same change (see `trackDeleteUndo`, `trackCreateUndo`, `trackItemPatchUndo`, `trackTaskStatusUndo` in `src/context/UndoContext.tsx`).

## Porting from Lakebed reference

When implementing Phase 2+ features:

1. Read the feature row in `docs/ROADMAP.md`.
2. Study the matching files under `.lakebed/reference/`.
3. Add migration(s), extend `shared/`, implement `src/services/`, then UI.
4. Adapt Preact/Lakebed patterns to React + Supabase (queries/mutations → service functions + hooks).

## Current limits

- Extended item fields (intervals, documentation, recurrence) are partially ported; item links and notifications are not shipped yet.
- No notification system shipped; follow roadmap in `docs/ROADMAP.md` when adding.
- Local dev uses HTTP; production should use HTTPS (e.g. Vercel).
