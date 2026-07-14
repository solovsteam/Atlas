# Atlas roadmap

This document is the source of truth for product direction, architecture decisions, and phased delivery. **Agents should read this before adding features or changing storage/auth/sync.**

Atlas is a unified notes, tasks, and calendar app. The active codebase is **Vite + React + Supabase** in this directory. The former Lakebed implementation is archived under `.lakebed/reference/` for porting only — do not extend it.

---

## Product vision

- **One model:** everything is an **Item** (notes, tasks, intervals, generators, documentation).
- **Graph, not folders:** relationships via **item links** (`context`, `documentation`, `generates`, `scheduled_in`).
- **Now inbox:** relevance-ranked list with tags, status boosts, stable ordering.
- **Calendar:** intervals as items; tasks linked via `scheduled_in`.
- **Long-term values:** user-owned data, optional local-first, sync when online (especially for notifications and multi-device).

---

## Architecture direction

### Current (MVP)

| Layer | Choice |
|-------|--------|
| Frontend | Vite, React, React Router, Tailwind |
| Backend | Supabase (Postgres, RLS, Realtime, Auth) |
| Auth | Google OAuth via Supabase |
| Data access | `src/services/*` → Supabase client (keep Supabase out of components) |
| Domain logic | `shared/*` (pure TypeScript, no DOM/Node/Supabase) |

### Recommended evolution

1. **Now:** Supabase cloud + local dev. Optional Vercel deploy when sharing with others.
2. **Before large features:** keep all persistence behind `src/services/` so storage can be swapped later.
3. **If the product grows:** **local-first + optional sync** (Obsidian-style), not pure cloud SaaS.
4. **Notifications** require online sync or a small always-on worker (see below) — plan for that; don’t go pure “clone and run locally with no backend” if notifications matter.

### Switching cost (local ↔ cloud)

| Change | Effort |
|--------|--------|
| Supabase cloud ↔ self-hosted Supabase | Low (config + migrations) |
| Add Vercel / static host | Low |
| Supabase → SQLite / files | Medium–large (new services layer, auth, sync) |
| Local-first + optional sync | Large (offline, conflicts, migrations) |

Supabase is currently used in ~5 files; `shared/` domain logic is portable. **Do not** add Supabase calls directly in pages/components.

---

## Feature status

### Shipped (Supabase MVP)

- [x] Google sign-in (Supabase Auth)
- [x] Items: create, edit title/body, delete
- [x] Task toggle + status (active / done / cancelled)
- [x] Now inbox: relevance, tag filters, search
- [x] Item detail: autosave, revision conflicts
- [x] Undo (Cmd/Ctrl+Z and button)
- [x] Realtime item list (Supabase Realtime)

### To port from Lakebed reference

Source: `.lakebed/reference/` (read-only archive, gitignored).

| Phase | Features | Reference paths |
|-------|----------|-----------------|
| **2** | Item links, associations panel, breadcrumbs | `shared/links.ts`, `client/components/AssociationsPanel.tsx`, `server/links.ts` |
| **3** | Documentation items, completion rules, recurrence, generators | `shared/documentation.ts`, `completion.ts`, `recurrence.ts`, `generation.ts`, related client components |
| **4** | Intervals as items, calendar (day/week/month), task placement, schedule tab | `shared/interval.ts`, `schedule.ts`, `client/pages/CalendarPage.tsx`, `server/intervals.ts` |
| **5** | Relevance metadata UI (location, startable window), fuzzy dates | `shared/startable.ts`, `locale.ts`, `client/components/*` |
| **—** | Lakebed → Supabase data import | Design when schema catches up |

When porting: extend Supabase migrations first, then `shared/`, then `src/services/`, then UI. Merge full item fields from reference `shared/item.ts` incrementally.

---

## Notifications roadmap

Notifications need **shared state** and usually **something online** for cross-device / app-closed alerts.

### v0 — In-app (no push)

- Show due/overdue tasks in Now inbox with visual emphasis.
- Optional: browser notifications via `Notification API` while tab is open.
- **No new infra.**

### v1 — Scheduled reminders (single device)

- User sets reminder on an item/task.
- **Local:** `setTimeout` / service worker / OS scheduler where available.
- Works offline on one device; no sync required.

### v2 — Cross-device / app closed (needs sync)

- Supabase (or worker) evaluates due items on a schedule (pg_cron, Edge Function, or external cron).
- Store push subscription tokens per user/device.
- Send via **Web Push** (web) and later FCM/APNs (mobile).
- Requires: migrations for `reminders` / `device_tokens`, edge function or small worker, VAPID keys.

### v3 — Calendar-aware & interval notifications

- Notify when interval starts/ends, task startable window opens, generator creates occurrences.
- Depends on Phase 4 interval model being ported.

### Design rules for new code

- Model reminders as data (time, item id, channel), not hard-coded timers scattered in UI.
- Prefer computing “what is due now” from synced item state.
- Keep notification delivery in a thin layer (`src/services/notifications.ts` or edge functions), not in React components.

---

## Deployment options

| Mode | Who | Notes |
|------|-----|-------|
| **Local dev only** | You, technical users | `scripts/setup.sh`, then `npm run dev` or `scripts/Atlas Dev.app` (macOS). |
| **Hosted frontend** | General users | Vercel + same Supabase; add production URL to Supabase Auth redirect URLs. |
| **Local-first (future)** | Privacy-focused users | SQLite/files + optional sync; larger refactor. |

Google OAuth: publish consent screen when opening to non-test users. Google does **not** host the app — only sign-in.

---

## Agent checklist (new work)

1. Read this file and [`AGENTS.md`](../AGENTS.md).
2. Keep domain logic in `shared/`; persistence in `src/services/`.
3. Do not modify `.lakebed/reference/` except to refresh archive if explicitly asked.
4. Add Supabase changes as SQL migrations in `supabase/migrations/`.
5. For features listed as “to port”, start from reference implementation, adapt to Supabase patterns in this codebase.
6. Consider notifications and sync implications when adding time-based or calendar features.
