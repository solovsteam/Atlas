# Handoff

## Trackers: scrolling log and history chart (29 Oct 2026)

From Renaissance (Tonio's request: a quick "Scrolled" button with an iPhone-style time wheel, and a chart of how often he scrolled).
- **Built:** migration `015_documentation_entries.sql` (one row per entry, row level security, realtime; a tracker with entries cannot be deleted), `shared/documentationEntries.ts` (wheel, history buckets, trailing average), `src/services/documentationEntries.ts`, `src/hooks/useDocumentationEntries.ts`, `src/components/tracking/`, `src/pages/TrackPage.tsx` (`/track`, `/track/:id`), the Track tab, tracker buttons on Now, and undo for entry create and delete.
- **Tests:** `scripts/documentation-entries.test.ts` (logic, also run in four time zones) and `scripts/documentation-entries-db.test.ts` (015 on PGlite with row level security). `npm run check` passed. The screens were checked at iPhone size with sample data in a temporary page outside the repository; the signed-in app itself was not driven.
- **Applied once live** with guard and history row 015; read back (table, 4 policies, grants, realtime, history). Evidence: `.handoff/renaissance-migration-015-*`. Never replay.
- **Not yet ported:** a documentation task completed by typing a value (the original weighing example). The entries table already allows values in `data`.
- **Push:** approved by Tonio on 29 Oct ("push it to github"). Task note: `.handoff/scrolling-log-20261029.md`.

## Archive and task-status edits added (22 Oct 2026)

- **Migration `014_brain_edits_status_archive.sql`** adds two bounded operations:
  - `archive_interval`: archives the block and unschedules tasks placed in it; nothing is deleted.
  - `set_task_status`: active/done/cancelled.

  Parser and contract are in `shared/brainEdits.ts` and `src/services/brainEdits.ts`; tests in `brain-edits-text-times.test.ts` and `brain-edits.test.ts`. `npm run check` passed.
- **Applied once live** with guard and history row 014; read back. Evidence: `.handoff/renaissance-migration-014-*`. Never replay.
- **Used by** Renaissance's live scheduler (`Renaissance/experiments/atlas-schedule/slice/live.mjs`), which writes under Tonio's standing permission. First live refresh: request `renaissance-live-2026-10-22T21-08-37-380Z-1`.
- **Not committed:** all of 013 and 014.

## Live text time columns fixed for the edit adapter (22 Oct 2026)

From Renaissance (Tonio's request: write his designed week to Atlas, then "fix Atlas's edit tool").
- **Cause:** live `public.items.task_due_at` and `task_fixed_starts_at`/`task_fixed_ends_at` are `TEXT NOT NULL DEFAULT ''` (007's `add column if not exists … timestamptz` was skipped on the live database). 012 assumed NULL timestamptz, so every edit touching an existing task failed ("Fixed appointment cannot be placed in an interval" or a timestamptz cast of `''`).
- **Fix:** `supabase/migrations/013_brain_edits_text_times.sql` normalizes `''` to NULL when reading and writes `''` back on text columns; timestamptz schemas are unchanged.
- **Test:** `scripts/brain-edits-text-times.test.ts` (live-like schema: preview, apply, undo, fixed-appointment refusal); 013 is also in `brain-edits.test.ts`. `npm run check` passed.
- **Applied once live** through `supabase db query --linked` with guard and history row 013; read back. Evidence: `.handoff/renaissance-migration-013-*`. Never replay.
- **First live use:** Renaissance request `renaissance-week-2026-10-26-v1` (Brain's 26 Oct – 1 Nov blocks moved to the new design, 3 intervals and 1 task created). Undo via the adapter while the context is unchanged.
- **Not committed:** 013, the new test and the `package.json` test entry.

## Brain scheduling effect adapter deployed (15 Oct 2026)

Code93a9bd4 (bfd93ac plus safety hardening) is integrated/pushed to main.
Migration012 was applied once through the Management API, with its history in
the same transaction and independent catalog/privilege readback. Brain ea3ba5d
and documentation cfac622 are deployed; acting schema installed and workers
restarted. Both full project checks pass. Atlas apply revalidates elapsed time
and remaining capacity; potential virtual recurring conflicts stop conservatively
for review rather than trusting raw rows or model assertions.

Authenticated read-only context returned75items/35links, real edit contract and
scheduler preview. Receipt lookup returned null; remote preview/receipt counts
both0. No calendar edits or invented thread messages were issued to test this.
Live effect/delivery behavior is covered by inert transaction/controller tests.
The old pinned routine job and experimental batch remain unchanged.

Next: real scheduling instructions can use Brain's dedicated path. No migration
or implementation action remains; never replay migration012. Phone delivery and
independent new-task/manual-feedback activation remain separate future work.
Final note: `.handoff/brain-edit-loop-deployment-20261015.md`; Brain's coordinating
note: `/Users/tonio/apps/Brain/.handoff/atlas-edit-loop-deploy-20261015.md`.

## Automatic Brain scheduling effect adapter (15 Oct 2026)

Initial implementation phase (superseded by the deployment record above), on
`brain-edit-loop-20261015` from e836bc7. The user explicitly authorized the Brain principle-triggered loop and
superseded create-only as its target. `shared/brainEdits.ts`,
`src/services/brainEdits.ts` and `scripts/brain-edit-adapter.mjs` define its bounded
context/preview/apply/receipt/feedback/undo surface. Migration
`012_brain_edits.sql` adds server-authored ten-minute previews, atomic fresh-state
edits and immutable receipts, plus append-only link history. It supports active
existing task placement/moves, interval create/update and task appointment/time
edits; recurring references fail closed. Existing routine overbooking is not
worsened. Old MCP/pinned-routine adapters retain their current contracts.

Real PostgreSQL fixture tests verify no calendar writes during preview, exact
idempotent receipts/retries, foreign/stale/expired refusal, atomic rollback after
a late constraint failure, placement/interval/appointment edits and safe undo
with recoverable original values. Transport errors remain explicitly uncertain.
Full check status and commit are recorded in
`.handoff/brain-edit-loop-20261015.md` in this worktree. Root Brain thread
coordinates both repositories, deployment and applying migration 012. No live
personal data changes or integration/push performed by this Atlas agent.

## Calendar and shell redesign (15 Oct 2026)

Tonio found the UI, above all Calendar on his phone, hard to use. Calendar now
opens with the calendar under a sticky toolbar (title, Day/Week/Month, Today,
‹ ›, +), so switching back from a tapped month day needs no scrolling. Day and
desktop-week views use an hour grid where intervals are rounded boxes as tall as
their duration; overlapping entries sit in lanes and widen into free ones
(`layoutBoxesOnDay`, tested in `scripts/calendar-layout.test.ts`); the grid
widens for early/late entries and shows a now line. Phone week is an agenda.
Colour by kind lives in `src/components/calendar/eventStyle.ts`; the tinted
palette overrides Tailwind's neutral scale in `src/index.css`. Phone navigation
is a bottom tab bar; capture is hidden on Calendar; tool panels fold away below
the calendar. "Interval" replaces "block" in all user-visible text (his name for
them). Evidence: `npm run check` and headless phone/desktop screenshots against an
in-memory Supabase stub (not committed). brain-experimental also edits
`CalendarViews.tsx`; expect a conflict there on its next refresh (keep this
version, re-apply its `itemTitles` map change if still wanted).

Follow-ups the same day: requests refused with "JWT issued at future" (fresh
token a few seconds ahead of PostgREST's clock) are resent after a short wait
(`src/lib/clockSkewFetch.ts`); recurring-generator templates no longer draw as
an extra appointment. His weekday work 09:00–18:00 is not in Atlas at all: Brain's
routine spec keeps it as occupied context because the action contract allows
3–240 minutes. Showing it needs either a recurring appointment he creates on the
Mac or his command to change that contract; asked 15 Oct.

## Recurring generators (12 Oct 2026)

Implemented in reviewed thread `recurring-generators-20261012`, from main
17b8aca; the unapproved `brain-experimental` batch stays separate. Lazy live
references, universal field ownership, completed snapshots, visible clash
resolution, pause/delete/undo, fixed/flexible scheduling and the subscription
compiler are implemented. New recurrence state is distinct from legacy metadata.
`npm run check` passes, including real PostgreSQL migration/RLS/history and
runtime/transport tests. A live Luna/Medium worker compilation succeeded
(IR-7dcb2c14, two calls, zero schema changes); browser fixture review preserved
the old version on a real click. No calendar items were created.

Deployed: commit b206f05 was checked, fast-forwarded into main and pushed to
origin; Vercel completed the initial b206f05 deployment and its hosted bundle contains
the generator editor. The archive-restoration retry aadf781 and final timezone-reuse fix 8335d03
also deployed successfully; the hosted bundle confirms both. The earlier
37fd45b deployment failure was recovered without needing user sign-in. Migration 011 was applied transactionally through the Supabase
Management API and recorded in migration history. Live metadata confirms the
reference column, history RLS, invoker RPC and restrict FK; no recurring/history
rows were created. `local.atlas.recurrence-compiler` is installed from main with
the exact hosted Atlas origin allowed. Browser fetch from the hosted page to the
local bridge health endpoint returned 200/ready. A separate phone cannot reach it.
Temporary compiler/Vite fixture processes stopped. Keep-old and actual Undo
clicks passed on inert browser data. The full recurring scheduling/feedback loop
is still a separate unfinished Brain feature. Portable note:
`.handoff/recurring-generators-20261012.md` in that thread's Atlas worktree.
Guide and limits: `docs/RECURRING_GENERATORS.md`. Task complete; no user answer
or approval is pending. Timezone-only changes reuse the saved predicate, verified
with a browser fixture showing zero compiler requests. All temporary services stopped.

Last updated 2026-10-06.

## State

- Main now includes the already-promoted scientific Atlas and Brain surface contract (d17545b). The checkout started clean on `experiment/scientific-atlas`; `origin/main` already held the promotion (46628ec), and local main was fast-forwarded to the existing experiment tip before this work.
- Tonio's 5 Oct effect-layer decision implemented: his request for a schedule change in the current conversation authorizes fresh preview then apply, without a second confirmation. `humanApproved` records the request. Create-only task/link writes, own-account binding, ten-minute expiry and changed-snapshot refusal remain enforced.
- `npm run check` passes: lint (existing warnings), build, Brain MCP typecheck and all tests. New tests exercise actual MCP handlers and services with inert data: unchanged existing items/links, only task/scheduled_in creation, foreign/expired/lost/stale-preview refusal before writes, exact saved plan and duplicate-free retry. No live calendar writes made in this task.
- `scripts/brain-contract.test.ts` and Brain's companion adapter comments distinguish human-admin action-pulse issuance/undo from the conversational MCP path. Brain companion work: `/Users/tonio/.t3/worktrees/Brain/effect-layer`, branch `feature/effect-layer`.
- The 29 Sep real action-pulse demonstration remains historical; no replay or deletion performed.

## Next step

Commit and push the effect-layer contract/tests on main per Atlas rules. Brain integrates/deploys its companion tests and docs separately. Reload an existing Atlas MCP process to receive the new conversational contract.

## Decisions for the user

Atlas credential isolation from shell-capable hosts is undecided and was not built. `origin` is public; no personal data or credentials added.
