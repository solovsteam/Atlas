# Handoff

## Log box: typed sentences become records (17 Nov 2026)

On `main`. The Log box on Intake and Track turns a sentence into drink, intake and tracker
records. A local parser reads simple sentences. The server function `quick-log` asks Claude
for everything else. Atlas code checks every proposal and calculates caffeine from an editable
drink list. Design and setup: [docs/QUICK_LOG.md](docs/QUICK_LOG.md). The function is deployed
and limited to Tonio's account, but it has no `ANTHROPIC_API_KEY` yet, so only the local parser
works. `npm run check` passed. The browser was checked at 390px with an offline store and a
simulated interpreter. No real interpreter call was made. Task note:
`.handoff/quick-log-20261117.md`.

## Drink conversion and language input (17 Nov 2026)

Tonio clarified that custom intake buttons already cover manually entered amounts.
He wants to plan converting a drink and quantity into caffeine, with possible
support for typed or spoken sentences that become Atlas actions. The recommended
first step is editable conversions for specific drinks, followed by language input.
No conversion values were established. The planning note is
`.handoff/drink-intake-planning-20261117.md` in `/Users/tonio/apps/Atlas` on `main`.
The temporary manual caffeine form was removed. Both app files have no diff.
`npm run check` passed on that temporary implementation. No feature was published,
no live data changed, and the offline server was stopped. The unrelated existing
edit in `scripts/brain-atlas-mcp.ts` remains untouched. Next: open a new thread in
the same working folder and plan the experience from the note.

## Missing data and complete days (17 Nov 2026)

Branch `sleep-missing`, based on `2406803`, in `/Users/tonio/apps/Atlas-wt/missing`.
Medicine status is taken, explicitly not taken, or unknown. Old morning negative
answers still count. Unknown medicine days are excluded from normal levels and
measure plots. The evening review lists intakes and every tracker. Separate day
confirmations enable zero counts. Unconfirmed dates remain unknown in Intake,
Track and sleep history. All new writes, corrections and removals have undo.
The seven-day Missing list and Now count share pure due rules. Links open dated
forms. Past reaction tests remain missing, as required by section 5.
`App.tsx` and `scripts/brain-atlas-mcp.ts` are untouched. No migration, live write,
real sign-in or push. Storage and route details are in `docs/SLEEP_SCREENS.md`.
Verification and the local commit are recorded in `.handoff/sleep-missing-20261117.md`.

## Sleep weekday obligation (16 Nov 2026)

Branch `sleep/obligation`, based on `29b2f85`, in `/Users/tonio/apps/Atlas-wt/obligation`.
Weekday obligations default to 09:30 to 19:30 for work, travel and groceries.
The required wake time subtracts preparation. Existing explicit wake constraints remain supported.
The settings editor includes each weekday, both times, the label and the resulting wake time.
It uses the existing settings save and undo. Tests cover defaults, preparation, removal,
explicit wake constraints, weekends and malformed settings. Documentation matches the change.
Morning routines remain unconnected. The sleep hook reads only entries for the sleep log,
and routines do not have a reliable morning marker. No new data access was added.
Verification and the local commit are recorded in `.handoff/sleep-obligation-20261116.md`.
No migration, live write, real sign-in or push is authorized.

## Sleep integration (16 Nov 2026)

Branch `sleep/integrate`, based on `6c3c4c4`, in `/Users/tonio/apps/Atlas-wt/integrate`.
Connected the stored history, trial start and undo, phase-specific evening intake,
choice nights with random selection and saved follow-up windows, and the reaction
card on Now. The contract is in [docs/SLEEP_SCREENS.md](docs/SLEEP_SCREENS.md).
Trial dates are wake dates. The confirmation records self-report. Shortfall uses
measured usual sleep, or an explicitly labelled setting fallback. Work appointments
still need a reliable work marker, as described below.

The first full `npm run check` passed without a recurrence retry. New pure tests
cover four time zones. At 390px, the in-memory fixture checked trial start and undo,
both phases, confirmation, deviation and undo, random choice, the two-Keep refusal,
manual Extend and its alarm, history with gaps and marks, and the reaction card's
time boundaries and completed-test suppression. No real sign-in or live write.
Final verification and commit are recorded in `.handoff/sleep-integrate-20261116.md`.
Do not push this branch.

## Sleep screens (16 Nov 2026)

Branch `sleep/task2-screens`, based on `73520b2`, in `/Users/tonio/apps/Atlas-wt/task2`.
Built the Sleep tab, overview and settings, evening, lights-out and morning logs,
and missing-log cards on Now. Entry saves and settings have undo. Correction links
accept `?entry=<id>`. Manual supplement intake has an assignment prop for the trial.
The settings and integration contract are in [docs/SLEEP_SCREENS.md](docs/SLEEP_SCREENS.md).

The required wake rule uses the weekday setting and the evening's early obligation.
There is no reliable work marker, so other Atlas appointments are excluded.
A reserved work tag or a dedicated field would permit work-only integration.

`npm run check` passed three times, including the final code and documentation. No recurrence retry was needed.
Eleven new tests cover four time zones, daylight saving, settings, and night selection.
At 390px, the actual app with a local simulated Supabase store passed log saves,
corrections, undo, intake defaults, missing-evening recovery, Now cards, settings,
and a refused write. The reaction test link opened the existing screen.
No physical phone, real sign-in or live database write was used. No migration or push.
Task note: `.handoff/sleep-screens-20261116.md`.

## Sleep storage and reaction route (16 Nov 2026)

Branch `sleep/storage`, based on `efbc452`, in `/Users/tonio/apps/Atlas-wt/storage`.
The sleep service and hook store nights and separate reaction tests in the existing
entries table. The hook provides correction, deletion, and undo. Morning matching
uses the latest unfinished evening within 20 elapsed hours. The route `/sleep/test`
uses the existing component and counts completed entries for practice. Sleep stays
out of generic lists. The contract is in `docs/REACTION_TEST.md`.

`npm run check` passed twice without a recurrence retry. New PGlite tests exercise the actual service
with row level security. A 390px background browser checked the real route and
an in-memory Supabase fixture. An accelerated clock checked completion, stored
metadata, fourth-test practice marking, undo and a refused write. No real sign-in or external database write occurred. Final
checks and local commit are recorded in `.handoff/sleep-storage-20261116.md`.
No migration or navigation tab was added. Do not push this branch.

## Timed routines (29 Oct 2026)

Tonio asked for easily editable routine lists and accepted a suggested morning list. Implemented in the working tree: routine lists, timestamp-based recording, skipping and reordering upcoming steps, undo, history and time correction. A sample routine was tested through the real Supabase test account, including reload and undo. `npm run check` passed on the second attempt; a known timing-sensitive recurrence test failed once. The iPhone itself and offline behavior were not tested. Tonio approved publication after reviewing the description. See `.handoff/timed-routines-build-20261029.md`.

## Separate account for verification (29 Oct 2026)

Tonio approved an isolated Atlas test account and said agents should have maximum access to verification in Renaissance. Google refused T3 browser sign-in. A separate Supabase email account was created without changing auth settings. Its credentials and a temporary session bridge are in ignored `.handoff/` files. A T3 browser signed in to the live site, created a sample tracker, and showed its button on Now. A direct test-account read found the sample and could not read Tonio's scrolling tracker. The session bridge is stopped. Account and browser setup: `.handoff/atlas-test-account-investigation-20261029.md`.

## Tracker buttons on Now: refresh repair (29 Oct 2026)

Tonio reported that tracker quick access buttons appear only after refreshing. Atlas now refreshes items after creation, when a page becomes visible again, and after the live connection subscribes or reconnects. Older requests cannot replace newer results. Tonio confirmed that this happens after returning to an already open Atlas page. Browser fixture with invented data verified the visibility and reconnect paths. No signed-in phone test or live data change was made. Task note: `.handoff/now-tracker-refresh-20261029.md`.

## Tracker kinds: habit to break and habit to build (29 Oct 2026)

Tonio's decisions: grow Atlas step by step around plans (what is intended) and records (what happened), no rebuild; stages come from the time; reality checks are a habit to build with a daily aim of 3 that is "not my fault" on days without the triggering event.
- **Built:** `trackerConfig` (kind and daily aim in `documentation_schema.tracker`), `TrackerSettings` on the tracker page, kind choice when creating. Habit to break: single Save, stage from the wheel (`stageFromWheel`), inferred stage for older entries (`entryStage`, 5-minute rule). Habit to build: trigger tags, "x of 3 today", aim level in the chart (`bucketGoal`).
- **Tests:** logic tests now 20 (four time zones). `npm run check` passed. Preview: past time saved "in hindsight", present "while doing it", build tracker saves trigger without stage, aim line, kind switch. (The preview's undo has no item access, so undo of the kind switch was not checked there; it uses the existing item-patch undo.)
- **Follow-up:** timed routines are described in the section above.

## Fixed: blank page on the tracker page (29 Oct 2026)

Tonio reported that after a refresh the app showed briefly and then went blank.
- **Cause (reproduced with the real realtime library):** the tracker page has two views of one tracker (buttons and history), and both opened a realtime channel with the same name. The client returns the existing, already subscribed channel for a repeated name, and adding listeners to it throws. The error came from an effect, so React unmounted the whole app.
- **Fix:** `subscribeToEntryChanges` (`src/services/documentationEntries.ts`) gives every listener its own channel name; the hook catches a failing subscription (live updates are optional); `src/components/ErrorBoundary.tsx` around the routes shows an error message with Reload instead of a blank page.
- **Test:** `scripts/documentation-entries-realtime.test.ts` uses the real client against a closed local port. It passes with the fix and fails with the old fixed name. `npm run check` passed. Preview: tracker page renders with a simulated client that copies the reuse behaviour; the boundary shows an effect error.
- **Lesson:** the earlier preview used a simulated realtime client that did not copy the library's channel reuse, so it could not catch this.

## Trackers record when a habit was noticed (29 Oct 2026)

From Renaissance: Tonio asked to generalize Track using the psychology of noticing, approved the proposal, added a one-tap "Urge now" button, and approved pushing once it works.
- **Built:** stage buttons in the time-wheel sheet (at the urge, while doing it, afterwards), "Urge now", a plan per tracker (item body, shown after each save), optional situation tags (also after a one-tap save, with undo), and history by stage with the share caught at the urge. No migration: stage and tags live in entry `data`. Design and evidence: `docs/TRACKING.md`.
- **Tests:** `scripts/documentation-entries.test.ts` now 16 tests (also in four time zones). `npm run check` passed. Screens checked at iPhone size with the real components and a simulated store (`/tmp/atlas-tracker-preview`, outside Git): one-tap save, tag, two undos, sheet save with stage and tag, charts.
- **Known flaky test:** `scripts/recurrence.test.ts` "large preview evaluates offline…" failed once with "interrupted" (20 ms limit per date in `src/lib/recurrenceRuntime.ts`) while the machine was busy, then passed three times alone and in the full check.
- Task note: `.handoff/tracking-psychology-20261029.md`.

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

## Intake tab (17 Nov 2026)

Branch `sleep-intake`, based on `20ee21a`, in `/Users/tonio/apps/Atlas-wt/intake`.
Added `/intake`, editable dose buttons, late entries, corrections and deletion with
undo. Entries use the Sleep item. Button settings use its documentation schema.
The morning intake controls and manual evening supplement controls are removed.
“Taken as assigned” creates individual intakes. One undo reverses the action.
History and trial adherence read new intakes and old embedded records. The trial
window starts four hours before target lights out and ends at actual lights out.
Old records are not rewritten. Missing medicine intake means without medicine.
Old unknown doses and times stay unknown. Approximate trial timing still needs
an explicit tolerance, as in the existing adherence helper.

Pure tests cover four time zones. PGlite checks intake create, correction of both
time and dose, undo, and deletion. The full `npm run check` passed with exit 0.
The offline browser fixture passed at 375px, including all eight navigation tabs,
repeat taps, last-taken labels, late entries, time wheel corrections, deletion,
settings and assignment undo. No real sign-in or live database write was used.
Final checks and the commit are recorded in `.handoff/sleep-intake-20261117.md`.
No migration, push, or change to `scripts/brain-atlas-mcp.ts`.

## Morning lights out (17 Nov 2026)

Branch `sleep-lightsout`, based on `4f184ed`, in `/Users/tonio/apps/Atlas-wt/lightsout`.
The morning log asks for lights out when that time is missing. The default is the
previous evening's target. One save stores both parts in the same entry. One undo
reverses both parts. Existing evening values stay intact. The link to fill the
other evening fields remains available. All four requested places explain lights
out, and section 3 of `docs/SLEEP.md` defines the term.

`npm run check` passed with exit 0, including pure merge tests and a PGlite test
for saving and undoing both parts. The known preview test passed without a retry.
The offline browser fixture passed at 375px: the default date and time, the time
wheel, no horizontal overflow, one combined entry, the hidden field after saving,
the retained evening link, and one undo restoring the field and removing the entry.
No migration, live write, real sign-in, push, or edit to `scripts/brain-atlas-mcp.ts`.
The task note is `.handoff/sleep-lightsout-20261117.md`. No open questions remain.

## Phone navigation (17 Nov 2026)

Branch `nav-five`, based on `2406803`, in `/Users/tonio/apps/Atlas-wt/nav`.
The phone bar defaults to Now, Calendar, Track, Intake and Sleep. More contains
the other tabs and an editor with checkboxes and Up/Down controls. Any tab can
be removed. Save stores ordered route ids in Supabase auth user metadata under
`atlas_phone_navigation`. Failed saves retain the current local choice and show
an error with a retry. The wide navigation remains unchanged.

`npm run check` passed with exit 0. No flaky-test retry was needed. Five pure
tests cover normalization, defaults, limits, new tabs and nested active routes.
The offline browser fixture at 375px verified the default bar, More list,
navigation and closing, active More, removal of Now, reordering, refused save,
successful retry and restoration after reload. There was no horizontal overflow.
Buttons measured at least 44px high. No live write, real sign-in, migration,
push or edit to `scripts/brain-atlas-mcp.ts`.
Task note: `.handoff/nav-five-20261117.md`. No open questions.
