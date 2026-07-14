# Atlas

Unified notes, tasks, and calendar app — **Vite + React + Supabase**.

**Agents:** read [`AGENTS.md`](AGENTS.md) and [`docs/ROADMAP.md`](docs/ROADMAP.md) before making changes.

## MVP (shipped)

- Google sign-in (Supabase Auth)
- Items: create, edit title/body, delete
- Task toggle + status (active / done / cancelled)
- Now inbox with relevance ranking, tag filters, and search
- Item detail with autosave and revision conflict handling
- Undo (Cmd/Ctrl+Z and button)
- Realtime item updates

## Planned (see roadmap)

Calendar, intervals, generators, documentation items, item links, notifications, optional local-first sync — porting from archived Lakebed reference in `.lakebed/reference/` (local, gitignored).

## Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project

## One-time Supabase setup

1. Create a project at [supabase.com/dashboard](https://supabase.com/dashboard).
2. Run [`supabase/migrations/001_items.sql`](supabase/migrations/001_items.sql) in the SQL Editor (or `supabase db push` if linked).
3. Enable Google auth:
   - **Authentication → Providers → Google** — OAuth client from [Google Cloud Console](https://console.cloud.google.com/).
   - Google redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
   - **Authentication → URL Configuration:** Site URL and Redirect URLs include `http://localhost:5173` for local dev.
4. Copy **Project Settings → API** URL and anon key into `.env.local`.

## Local development

```sh
cp .env.example .env.local
# Edit .env.local
npm install
npm run dev
```

Open **http://localhost:5173**

### macOS launcher

Double-click **`scripts/Atlas2 Dev.app`** (drag to Dock). Starts the dev server and opens the browser.

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
