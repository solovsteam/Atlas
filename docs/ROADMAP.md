# Atlas roadmap

This document is the source of truth for product direction, architecture decisions, and phased delivery. **Agents should read this before adding features or changing storage/auth/sync.**

Atlas is a unified notes, tasks, and calendar app. The active codebase is **Vite + React + Supabase** in this directory. The former Lakebed implementation is archived under `.lakebed/reference/` for porting only — do not extend it.

**Working copy:** develop against the **local directory** first. GitHub is a backup/deploy mirror — it may lag behind local work until pushed.

---

## Product vision

- **One model:** everything is an **Item** (notes, tasks, intervals, documentation).
- **Graph, not folders:** relationships via **item links** (`context`, `documentation`, `generates`, `scheduled_in`).
- **Now:** focus view — current interval tasks or today's list (stub at `/`).
- **Tasks:** quick throwaway tasks — fast add, check off, inline importance/duration (`/tasks`).
- **Items:** library and planning — notes, generators, full scheduling detail (`/items`).
- **Calendar:** day / week / month views for intervals; tasks via `scheduled_in` links or fixed appointment times.
- **Archive:** done and cancelled tasks (`/archive`); hidden from Items by default.
- **Long-term values:** user-owned data, optional local-first, sync when online (especially for notifications and multi-device).
- **Undo-first interaction:** destructive actions run immediately; **undo** is the safety net — no confirmation dialogs (see below).

---

## Interaction model: undo, not confirmation

Atlas deliberately avoids “Are you sure?” patterns. The user should act freely; mistakes are reversed with **Undo** (header button or Cmd/Ctrl+Z).

| Do | Don't |
|----|-------|
| Execute delete/create/edit immediately | `window.confirm` before destructive actions |
| Push an undo op after each reversible mutation | Modal “This cannot be undone” copy |
| Let undo restore prior state (item, field, status) | Rely on warnings instead of `UndoContext` |

When implementing new features (unlink, archive, bulk delete, etc.):

1. Perform the action on click/submit.
2. Register undo via `src/context/UndoContext.tsx` helpers or a new `UndoOp` variant in `shared/commands.ts`.
3. Never add confirmation UI unless the user explicitly requests it in a future design change.

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
- [x] Items library: browse notes and active tasks with tag/property filters and search
- [x] Archive page for done and cancelled tasks
- [x] Calendar page: day / week / month views with scaled interval blocks
- [x] Item links (`scheduled_in`): assign tasks to intervals; shown on calendar
- [x] Item detail: autosave, revision conflicts
- [x] Undo (Cmd/Ctrl+Z and button)
- [x] Realtime item list (Supabase Realtime)
- [x] Task expected duration (minutes, for future calendar / auto-scheduling)
- [x] Task subtasks (parent task link + subtask list on item detail)
- [x] Task scheduling fields: optional due date, optional fixed appointment times; constraint helpers in `shared/scheduling/`
- [x] Intervals are time containers only (`fixed`, `allDay`) — due dates live on tasks, not intervals
- [x] Auto-schedule v1: relevance scoring (urgency + importance) + greedy interval placement; Calendar preview/apply with undo
- [x] **Tasks page** (`/tasks`): quick task add, inline done toggle, importance slider, duration presets, schedule readiness badges
- [x] Scheduling readiness model: necessary vs optional fields, `missing_info` vs `no_feasible_interval`, subtask inheritance (`shared/scheduling/readiness.ts`)

### Surface split: Tasks vs Items vs Now

| Route | Purpose |
|-------|---------|
| `/tasks` | Speed — throwaway tasks, check off, glance at schedule status |
| `/items` | Specificity — notes, generators, deadlines, appointments, full editor |
| `/` Now | Future focus — current interval + today's committed list (stub) |

**UX principles for frequent actions:** primary controls at the top; prefer sliders/chips over typed fields; one-tap done on Tasks; tap title for optional detail page.

### Scheduling readiness

Tasks are schedulable only when required fields are complete. Optional fields use safe defaults (duration 30 min, importance 0, flexible deferral curve).

| Readiness | Meaning |
|-----------|---------|
| `ready` | Eligible for auto-schedule |
| `missing_info` | Incomplete constraint (e.g. partial fixed appointment) — **not** the same as no calendar room |
| `no_feasible_interval` | Info complete but no interval fits |
| `scheduled` | Has `scheduled_in` link |
| `excluded` | Done, cancelled, or fixed appointment |

**Necessary (v1):** partial fixed appointment must have both start and end, or neither. **Quick tasks** (Tasks page origin) require title only. **Subtasks** inherit parent's scheduling fields when unset.

**Deferred:** `task_scheduling_mode` DB column, auto-schedule on quick create, Items-only generators/notes restriction, ItemEditor split.

### Auto-scheduling (in progress)

Architecture: **algorithm-first, LLM as optional enricher** — hard constraints stay deterministic in `shared/scheduling/`; future LLM plugins implement `TaskEnricher` and never write links directly.

| Layer | Location | v1 | Next |
|-------|----------|-----|------|
| Enrichers | `shared/scheduling/deferralCost.ts` (+ future LLM) | Infer `deadline_step` / `linear_continuous` curves from task fields | Custom curves (e.g. non-linear continuous) via `TaskScheduleInput.deferralCost` |
| Engine | `shared/scheduling/engine.ts` | Greedy assign by decreasing relevance | Locks, quick/planning modes |
| Apply | `src/services/scheduling.ts` | Manual Auto-schedule on Calendar; batch undo | Quick-mode on create; incremental replan |

**v1 shipped:** score active non-fixed tasks; assign to earliest feasible interval within horizon; respect deadline, duration, interval capacity; preview + apply on Calendar.

**Deferred:** 4th task status (planning/unscheduled), quick vs planning scheduling modes, assignment locks, automatic replan on mutation, LLM enricher, location/startable window constraints.

**Compute (personal scale, ~100 tasks + ~50 intervals):** pure algorithm runs in **&lt;50 ms** client-side, **$0**, offline. Full LLM scheduling is **not recommended** (latency, non-determinism); optional LLM enricher calls are **&lt;$0.01/run** if used sparingly.

### To port from Lakebed reference

Source: `.lakebed/reference/` (read-only archive, gitignored).

| Phase | Features | Reference paths |
|-------|----------|-----------------|
| **2** | Item links, associations panel, breadcrumbs | `shared/links.ts`, `client/components/AssociationsPanel.tsx`, `server/links.ts` |
| **3** | Documentation items, completion rules, recurrence | `shared/documentation.ts`, `completion.ts`, `recurrence.ts`, related client components |
| **4** | Intervals as items, calendar (day/week/month), task placement, schedule tab | `shared/interval.ts`, `schedule.ts`, `client/pages/CalendarPage.tsx`, `server/intervals.ts` |
| **5** | Relevance metadata UI (location, startable window), fuzzy dates | `shared/startable.ts`, `locale.ts`, `client/components/*` |
| **—** | Lakebed → Supabase data import | Design when schema catches up |

When porting: extend Supabase migrations first, then `shared/`, then `src/services/`, then UI. Merge full item fields from reference `shared/item.ts` incrementally.

---

## Task scheduling constraints

The auto-scheduler treats tasks differently by **constraint mode**, derived from task fields in `shared/scheduling/constraints.ts`:

| Mode | Task fields | Scheduler behavior |
|------|-------------|-------------------|
| **Fixed (appointment)** | `fixedStartsAt` + `fixedEndsAt` | Excluded from auto-schedule; shown on calendar directly; surfaces on Now when clock is in range |
| **Deadline** | optional `dueAt` | Flexible placement before due; urgency increases as due approaches |
| **Flexible (default)** | neither set; optional `expectedDurationMinutes` | Open-ended work; one duration-sized block per run (default 30 min if unset) |

**Intervals are not constraints.** An interval item is a calendar time block (`fixed` or `allDay`). Tasks are placed into intervals via `scheduled_in` links. Due dates belong on tasks (`task_due_at`), not on intervals.

Key modules in `shared/scheduling/`: `constraints.ts` (hard rules, capacity), `deferralCost.ts` (postponement cost curves — `deadline_step` and `linear_continuous` for now; LLM may override later), `relevance.ts` (combines deferral cost + importance into scores), `engine.ts` (`runScheduler`), `types.ts` (enricher interface).

**Deferral cost curves:** cost of leaving a task undone grows over time. Shape is task-dependent — deadline tasks use a step (with optional pre-deadline shoulder); open-ended tasks use linear growth from creation. Future enrichers can supply custom curves via `TaskScheduleInput.deferralCost`.

**Now page (future):** show fixed/appointment tasks for the current moment first; then today's committed list; use `postponementCost` / `postponementCostDelta` for ranking.

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

- Notify when interval starts/ends or a task startable window opens.
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

1. Read this file, [`AGENTS.md`](../AGENTS.md), and [`LESSONS.md`](LESSONS.md).
2. Keep domain logic in `shared/`; persistence in `src/services/`.
3. Do not modify `.lakebed/reference/` except to refresh archive if explicitly asked.
4. Add Supabase changes as SQL migrations in `supabase/migrations/`.
5. For features listed as “to port”, start from reference implementation, adapt to Supabase patterns in this codebase.
6. Respect **undo, not confirmation** — see § Interaction model above.
7. Consider notifications and sync implications when adding time-based or calendar features.
