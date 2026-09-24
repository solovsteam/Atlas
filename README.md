# Atlas

Unified notes, tasks, and calendar app — **Vite + React + Supabase**.

**Agents:** read [`AGENTS.md`](AGENTS.md), [`docs/ROADMAP.md`](docs/ROADMAP.md), and [`docs/LESSONS.md`](docs/LESSONS.md) before making changes.

## MVP (shipped)

- Google sign-in (Supabase Auth)
- Items: create, edit title/body, delete
- Task toggle + status (active / done / cancelled)
- Now inbox with relevance ranking, tag filters, and search
- Item detail with autosave and revision conflict handling
- Undo (Cmd/Ctrl+Z and button)
- Realtime item updates

## Planned (see roadmap)

On `main`, calendar, intervals, documentation items, item links, notifications, and optional local-first sync are planned. The checked-out `experiment/scientific-atlas` branch already includes Tasks, Calendar, intervals, task placement, auto-scheduling, and `.ics` export; see [`docs/EXPERIMENT.md`](docs/EXPERIMENT.md). These experiment features have not been merged to `main`.

## Schema-driven schedule loop (experiment branch)

In Codex, run the `schedule-set` schema for the intentions and constraints you select. Import its finite plan JSON from **Calendar → Schema generated schedule**. Atlas creates only those tasks, places them into existing work blocks, and stores an idempotent schedule run. Inspect and edit the schedule in Atlas, then export its feedback receipt and attach it in Codex with your explanation. The `schedule-feedback-review` schema can also accept words-only feedback. It treats edits as observations and does not infer standing preferences without your explanation.

Atlas needs its Supabase project active for sign-in and saving. If the project is paused, resume it from the [Supabase Dashboard](https://supabase.com/dashboard). Calendar placement requires migrations through `008_item_links.sql`; durable schema schedule runs and feedback require [`009_schema_schedule_runs.sql`](supabase/migrations/009_schema_schedule_runs.sql). Apply pending migrations before using the run-history feature.

## Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project

## First run (after cloning)

Atlas is a **developer-run** app for now: clone → setup → run dev server → browser. There is no standalone installer yet.

```sh
git clone https://github.com/solovsteam/Atlas.git
cd Atlas
./scripts/setup.sh          # Windows: scripts\setup.bat
# Edit .env.local with Supabase URL + anon key (see below)
```

Then start the app:

| Platform | How |
|----------|-----|
| **macOS** | Double-click **`scripts/Atlas Dev.app`** (drag to Dock), or `npm run dev` |
| **Windows / Linux** | `npm run dev` → open http://localhost:5173 |

The macOS `.app` is a tiny launcher (shell script + plist) committed in `scripts/` — not a separate installer. It opens Terminal, runs `npm run dev`, and opens your browser. **Node.js and `npm install` are still required.**

### For end users (not developers)

Non-technical users should use a **hosted URL** (Vercel + Supabase), not a cloned repo. Packaging a desktop app (Tauri/Electron) is a later step — see [`docs/ROADMAP.md`](docs/ROADMAP.md).

## One-time Supabase setup

1. Create a project at [supabase.com/dashboard](https://supabase.com/dashboard).
2. Run all SQL files in [`supabase/migrations/`](supabase/migrations/) in order (or `supabase db push` if linked).
3. Enable Google auth:
   - **Authentication → Providers → Google** — OAuth client from [Google Cloud Console](https://console.cloud.google.com/).
   - Google redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
   - **Authentication → URL Configuration:** Site URL and Redirect URLs include `http://localhost:5173` for local dev.
4. Copy **Project Settings → API** URL and anon key into `.env.local`.

## Local development (manual)

```sh
cp .env.example .env.local
# Edit .env.local
npm install
npm run dev
```

Open **http://localhost:5173**

### macOS Dock shortcut

Double-click **`scripts/Atlas Dev.app`** (drag to Dock). Requires setup above first.

## Deploy (optional)

Host the static frontend on Vercel; database and auth stay on Supabase. See [`docs/ROADMAP.md`](docs/ROADMAP.md) for deployment modes and [`vercel.json`](vercel.json) for SPA routing.

## Project structure

```txt
shared/              Pure domain logic
src/                 React app (components, pages, hooks, services)
supabase/migrations/ Postgres schema + RLS
docs/                Roadmap and guides
.lakebed/reference/  Lakebed porting archive (gitignored, local only)
scripts/             Dev launcher (macOS)
```

## Legacy Lakebed app

Deprecated. Reference snapshot: `.lakebed/reference/`. Do not use `npx lakebed`.
