# Recurring generators

An item can become a generator from its detail page. Configure its normal task,
appointment or interval fields, choose **Make this a recurring generator**, and
write its repetition rule in ordinary text. **Compile and apply rule** sends one
bounded job to Brain on this Mac using the signed-in Luna subscription. Atlas
shows the next ten dates; unchanged text reuses its stored predicate.

Occurrences are live references. Untouched occurrences have no database row;
Atlas computes the start-date-to-next-90-days view, including overdue open tasks.
Ticking, editing, explicitly starting, linking or scheduling an occurrence stores
its stable identity and individual state. `recurrence_state` is a versioned tagged
record distinct from the preserved legacy `recurrence_rule` calendar metadata.
Inherited display values are never saved as independent copies.

Every normal item field can be defined strictly by the generator, supplied as an
overridable default, or owned by the occurrence. Progress defaults to item-owned.
Generator edits leave completed snapshots unchanged. An open occurrence with
started/ticked work, or an individual value the edit takes over/removes, retains
its earlier version and appears in the visible review list. **Take new version**,
**Keep old version**, and **Detach as standalone** are undoable. Taking a rule that
excludes this date archives that occurrence; keeping it pins its earlier version.

Pause/delete removes untouched future occurrences; touched/completed references
remain. Deletion is a tombstone, never a cascading delete. Undo restores the old
rule. PostgreSQL retains item changes in append-only `item_history`; writes lock
the generator and check source/item revisions before touching an occurrence.

Fixed recurring windows block the scheduler as appointments. Flexible recurring
tasks are ordinary scheduling candidates. Generator templates are never tasks to
perform or scheduling capacity. Conversation MCP still creates only new plan
tasks and links: it never first-touches a virtual interval or edits a generator.

## Setup and verification

Apply `supabase/migrations/011_recurring_references.sql` after migration 009.
No existing item contents are rewritten by the migration. Existing recurrence
metadata remains legacy data; it is not silently converted into an active rule.

Brain's instruction worker must be running with a permitted Luna model and fresh
usage admission. Run `npm run atlas:compile`, or install the idle local bridge:

```sh
python3 scripts/recurrence_service.py install
python3 scripts/recurrence_service.py status
```

Only the two local Atlas origins are allowed by default. Add the exact hosted
Atlas origin with `install --origin https://YOUR-ATLAS-HOST` when using that page
on the Mac. The bridge stays on loopback; compiling from a separate phone is not
implemented. Once compiled, predicates need neither Brain nor a model connection.
This does not make Supabase persistence available offline.

The predicate receives a civil date `{iso, year, month, day, weekday}` with month
1–12 and weekday 0=Sunday. QuickJS/Wasm supplies no host bindings, clock, random
source, imports, network, DOM or storage. Each date gets a fresh context, an 8 MiB
memory limit, a stack limit and an interrupt budget. Rules must return a boolean.
Dates use the generator's explicit timezone. Missing DST clocks are surfaced as
errors; repeated clocks use the first instant. Computation and scan horizons are
bounded (3,660 dates per evaluation; the preview scans five years).

`npm run check` includes behavioral reference/scheduler tests, real PostgreSQL
migration/RLS/history checks in PGlite, sandbox tests and inert compiler-transport
tests. A live 12 Oct check queued `IR-7dcb2c14`, ran Luna/Medium with two tool calls
and zero schema changes, and independently evaluated its returned first-Monday
predicate. Browser checks used inert data. No calendar items were created.

Deployment checked 12 Oct: implementation b206f05 is on main and Vercel reported
success. Migration 011 is recorded in the live project; metadata confirms history
RLS, the invoker RPC and deletion restriction, with zero recurring/history rows
created. The persistent local compiler is installed, and the hosted page reached
its health endpoint on the Mac (200/ready). These checks do not claim a live
authenticated occurrence mutation: browser review/undo checks used inert data.

The archived source remains addressable from retained occurrences in main
37fd45b, with a Restore generator control. Its first deployment failed, then aadf781
recovered it. Final 8335d03 is also deployed and verified in the hosted bundle;
timezone-only edits reuse the predicate without another model call. An inert
browser check observed zero compiler requests. No Vercel sign-in is needed.
