# Lessons learned

Notes for agents and future work. Update this file when a mistake or architectural decision is worth remembering.

## Lakebed → Supabase + Vercel migration

- **Active app** is Vite + React at the repo root. Lakebed is archived in `.lakebed/reference/` (gitignored, read-only for porting).
- **Persistence:** all Supabase access goes through `src/services/`, not components or pages.
- **Domain logic:** pure TypeScript in `shared/` — no DOM, Node, or Supabase imports.
- **Deploy:** static frontend on Vercel (`vercel.json` SPA routing); Postgres, Auth, and Realtime stay on Supabase. Add production URL to Supabase Auth redirect URLs.
- **Migrations:** SQL files in `supabase/migrations/`; run in order in the Supabase SQL editor or via `supabase db push`. Do **not** rename a migration file after it has been applied to a live project — add a new migration instead.
- **Realtime DELETE:** filtered subscriptions drop delete events on other tabs because delete payloads only carry `id` (see `useItems.ts`).

## UX: undo, not confirmation

- Destructive actions run immediately; register undo via `UndoContext`. Do not add `window.confirm` for normal edits/deletes.

## Dynamic item materialization (removed — rewrite planned)

The previous implementation was removed because it mixed half-ported Lakebed code with an incomplete refactor:

| Mistake | Better approach for a rewrite |
|---------|-------------------------------|
| Stored materialization spec in `recurrence_rule` | Use a dedicated JSON column or table; `recurrence_rule` is for calendar recurrence only |
| Legacy `is_generator` column on items | Model templates vs materialized children explicitly (`generated_from_id` / `occurrence_key` are fine) |
| Sync logic split across a dedicated service file, `useItems` timers, and `updateItem` | One service owns materialize / update / prune; hooks only call it after mutations |
| Background sync on every items-source change | Deterministic sync triggered by template save, with clear error surfacing |
| UI coupled to spec parsing in the editor | `shared/` parses/validates spec; editor only edits spec; service materializes |

When re-implementing dynamic item materialization, study `.lakebed/reference/shared/` for the Lakebed spec and the roadmap Phase 3 row, but design for Supabase from scratch (migrations → `shared/` → `src/services/` → UI).

## Documentation map

| File | Purpose |
|------|---------|
| [`README.md`](../README.md) | Quick start, setup, deploy |
| [`docs/ROADMAP.md`](ROADMAP.md) | Product vision, feature phases, architecture |
| [`AGENTS.md`](../AGENTS.md) / [`CLAUDE.md`](../CLAUDE.md) | Agent coding rules |
| This file | Mistakes and migration context |

Keep these in sync when removing or adding major features.
