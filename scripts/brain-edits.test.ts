import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { parseBrainEditPlan } from "../shared/brainEdits";
import { applyBrainEditPreview, BrainEditError, getBrainEditContext } from "../src/services/brainEdits";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/types/database";
import { emptyItem } from "../shared/recurringReferences";
import { itemToDbInsert } from "../shared/item";
import { defaultGeneratorRule } from "../shared/recurringReferences";
import { projectItems } from "../src/services/recurrence";
import { itemFromDbRow } from "../shared/item";
import type { DbItemRow } from "../src/types/database";

const owner = "11111111-1111-4111-8111-111111111111";
const foreign = "99999999-9999-4999-8999-999999999999";
const task = "22222222-2222-4222-8222-222222222222";
const first = "33333333-3333-4333-8333-333333333333";
const second = "44444444-4444-4444-8444-444444444444";
const fresh = "55555555-5555-4555-8555-555555555555";
const date = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
const at = (hour: number) => `${date}T${String(hour).padStart(2,"0")}:00:00Z`;
function plan(requestId: string, operations: unknown[]) { return { format: "brain-atlas.edits", version: 1, requestId, reason: "Human changed the scheduling principle", operations }; }

test("typed edits reject unknown authority fields and missing/ambiguous values", () => {
  assert.throws(() => parseBrainEditPlan({ ...plan("x", []), ownerId: owner }), /Unknown/);
  assert.throws(() => parseBrainEditPlan(plan("x", [{ kind: "update_task", id: task, expectedRevision: 1, title: "Forbidden" }])), /Unknown/);
  assert.throws(() => parseBrainEditPlan(plan("x", [{ kind: "create_interval", id: first, title: "Work", startsAt: `${date}T09:00:00`, endsAt: at(10) }])), /timezone/);
  assert.throws(() => parseBrainEditPlan(plan("x", [{ kind: "create_task", id: task, title: "Task" }])), /number/);
  assert.equal(parseBrainEditPlan(plan("x", [{ kind: "place_task", taskId: task, expectedRevision: 1, intervalId: null }])).operations.length, 1);
});

test("transport loss remains uncertain, while a transactional SQL refusal is definite", async () => {
  const client = (rpc: () => Promise<unknown>) => ({ auth: { getUser: async () => ({ data: { user: { id: owner } }, error: null }) }, rpc }) as unknown as SupabaseClient<Database>;
  await assert.rejects(applyBrainEditPreview(client(async () => { throw new Error("connection reset after write"); }), first), error => error instanceof BrainEditError && error.uncertain);
  await assert.rejects(applyBrainEditPreview(client(async () => ({ data: null, error: { code: "P0001", message: "Atlas context changed" } })), first), error => error instanceof BrainEditError && !error.uncertain);
  await assert.rejects(applyBrainEditPreview(client(async () => ({ data: null, error: { code: "500", message: "response lost" } })), first), error => error instanceof BrainEditError && error.uncertain);
});

test("planner context pages scheduling data and carries the actual engine result and effect contract", async () => {
  const rows = Array.from({ length: 501 }, (_, i) => ({ ...itemToDbInsert({ ...emptyItem(`00000000-0000-4000-8000-${String(i).padStart(12,"0")}`, owner), title: `Task ${i}`, isTask: true, taskStatus: "active" }, owner), revision: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }));
  rows.push({ ...itemToDbInsert({ ...emptyItem(fresh, owner), title: "Private unrelated note" }, owner), revision: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  const offsets: number[] = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: owner } }, error: null }) },
    from: (table: string) => {
      const query = { select: () => query, eq: () => query, order: () => query, range: async (start: number, end: number) => { if (table === "items") offsets.push(start); return { data: table === "items" ? rows.slice(start, end+1) : [], error: null }; } };
      return query;
    }
  } as unknown as SupabaseClient<Database>;
  const context = await getBrainEditContext(client);
  assert.deepEqual(offsets, [0, 500]);
  assert.equal(context.items.length, 501);
  assert.equal(context.ownerId, owner);
  assert.equal(context.editContract.format, "brain-atlas.edits");
  assert.equal(context.editContract.scheduler.durationBuffer, 1.25);
  assert.equal(context.schedulerPreview.unassigned.length, 501);
  assert.ok(!context.items.some(item => item.title === "Private unrelated note"));
});

test("real PostgreSQL atomic edits enforce freshness, receipts, account, capacity and recoverable undo", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role authenticated;create role anon;create schema auth;create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
      grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
      insert into auth.users values('${owner}'),('${foreign}');create publication supabase_realtime;`);
    for (const name of ["001_items", "003_interval_extended", "005_task_expected_duration", "006_subtasks", "007_task_scheduling", "008_item_links", "011_recurring_references", "012_brain_edits"]) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), "utf8"));
    }
    await db.exec(`grant select,insert,update,delete on public.items,public.item_links to authenticated;
      set role authenticated;set request.jwt.claim.sub='${owner}';
      insert into public.items(id,owner_id,title,is_task,task_status,task_expected_minutes,revision) values('${task}','${owner}','Call dentist',true,'active',15,1);
      insert into public.items(id,owner_id,title,is_interval,interval_kind,interval_status,interval_starts_at,interval_ends_at,revision) values
      ('${first}','${owner}','Available hour',true,'fixed','scheduled','${at(9)}','${at(10)}',1),
      ('${second}','${owner}','Second hour',true,'fixed','scheduled','${at(11)}','${at(12)}',1);`);
    const call = async (fn: string, ...args: unknown[]) => (await db.query<{ value: any }>(`select public.${fn}(${args.map((_, i) => `$${i+1}`).join(",")}) as value`, args.map(v => typeof v === "object" ? JSON.stringify(v) : v))).rows[0].value;
    const preview = (p: unknown) => call("atlas_preview_brain_edits", p);
    const apply = (id: string) => call("atlas_apply_brain_edit_preview", id);
    const receipt = (id: string) => call("atlas_get_brain_edit_receipt", id);
    const count = async (table: string) => Number((await db.query<{n: number}>(`select count(*) n from public.${table}`)).rows[0].n);

    const assignPlan = plan("assign-dentist", [{ kind: "place_task", taskId: task, expectedRevision: 1, intervalId: first }]);
    const p = await preview(assignPlan);
    assert.equal(p.requestId, "assign-dentist");
    assert.equal((Date.parse(p.expiresAt) - Date.parse(p.createdAt))/60000, 10);
    assert.equal(await count("item_links"), 0, "preview writes no calendar data");
    const applied = await apply(p.previewId);
    assert.equal(applied.afterLinks[0].to_id, first);
    assert.equal(await count("item_links"), 1);
    assert.deepEqual(await apply(p.previewId), applied, "retry reads the exact durable receipt");
    assert.deepEqual(await receipt("assign-dentist"), applied);
    assert.equal((await preview(assignPlan)).alreadyApplied, true);
    await assert.rejects(preview(plan("assign-dentist", [{ kind: "place_task", taskId: task, expectedRevision: 1, intervalId: second }])), /different plan/);
    const moved = await apply((await preview(plan("move-dentist", [{ kind: "place_task", taskId: task, expectedRevision: 1, intervalId: second }]))).previewId);
    assert.equal(moved.beforeLinks[0].to_id, first);
    assert.equal(moved.afterLinks[0].to_id, second);
    const undone = await call("atlas_undo_brain_edits", "move-dentist", "undo-move-dentist");
    assert.equal(undone.afterLinks[0].to_id, first);
    assert.deepEqual(await call("atlas_undo_brain_edits", "move-dentist", "undo-move-dentist"), undone);

    const stale = await preview(plan("stale-context", [{ kind: "place_task", taskId: task, expectedRevision: 1, intervalId: second }]));
    await db.exec(`update public.items set title='Call regular dentist',revision=2 where id='${task}'`);
    await assert.rejects(apply(stale.previewId), /context changed/);
    assert.equal(await receipt("stale-context"), null);
    await assert.rejects(preview(plan("stale-revision", [{ kind: "place_task", taskId: task, expectedRevision: 1, intervalId: second }])), /revision changed/);
    await assert.rejects(call("atlas_undo_brain_edits", "assign-dentist", "unsafe-undo"), /context changed/);

    const exp = await preview(plan("expired", [{ kind: "place_task", taskId: task, expectedRevision: 2, intervalId: second }]));
    await db.exec(`reset role;update public.brain_edit_previews set expires_at=now()-interval '1 second' where id='${exp.previewId}';set role authenticated;`);
    await assert.rejects(apply(exp.previewId), /expired/);
    await db.exec(`set request.jwt.claim.sub='${foreign}'`);
    assert.equal(await receipt("assign-dentist"), null);
    await assert.rejects(apply(p.previewId), /this account/);
    await assert.rejects(preview(plan("foreign-task", [{ kind: "place_task", taskId: task, expectedRevision: 2, intervalId: second }])), /not found/);
    await db.exec(`set request.jwt.claim.sub='${owner}'`);

    await assert.rejects(preview(plan("overlap", [{ kind: "create_interval", id: fresh, title: "Overlaps", startsAt: at(9), endsAt: at(11) }])), /overlaps/);
    await assert.rejects(preview(plan("too-long", [{ kind: "update_task", id: task, expectedRevision: 2, durationMinutes: 60 }])), /insufficient capacity/);
    await assert.rejects(preview(plan("unknown", [{ kind: "delete_task", id: task }])), /Unknown/);
    await assert.rejects(preview(plan("owner-change", [{ kind: "update_task", id: task, expectedRevision: 2, owner_id: foreign, durationMinutes: 15 }])), /Unknown/);
    await assert.rejects(preview(plan("missing-duration", [{ kind: "create_task", id: fresh, title: "Bad task" }])), /requires duration/);
    assert.equal(await count("items"), 3, "all refused plans leave no partial item writes");

    const occupiedId = "77777777-7777-4777-8777-777777777777";
    await db.exec(`reset role;insert into public.items(id,owner_id,title) values('${occupiedId}','${foreign}','Other account');set role authenticated;`);
    const lateFailure = await preview(plan("atomic-late-failure", [
      { kind: "update_task", id: task, expectedRevision: 2, durationMinutes: 14 },
      { kind: "create_task", id: occupiedId, title: "Collision", durationMinutes: 20 }
    ]));
    await assert.rejects(apply(lateFailure.previewId), /duplicate key/);
    assert.equal((await db.query<{revision:number}>(`select revision from items where id='${task}'`)).rows[0].revision, 2, "late failure rolls back the preceding item edit");
    assert.equal(await receipt("atomic-late-failure"), null);

    const changed = await apply((await preview(plan("move-interval", [{ kind: "update_interval", id: first, expectedRevision: 1, startsAt: at(13), endsAt: at(14), title: "Afternoon" }]))).previewId);
    assert.equal(changed.beforeItems[0].title, "Available hour");
    assert.equal(changed.afterItems[0].title, "Afternoon");
    assert.equal(changed.afterItems[0].revision, 2);
    const feedback = await call("atlas_get_brain_edit_feedback", "move-interval");
    assert.equal(feedback.currentItems[0].interval_starts_at, at(13));
    await call("atlas_undo_brain_edits", "move-interval", "undo-interval");
    assert.equal((await db.query<{title:string}>(`select title from items where id='${first}'`)).rows[0].title, "Available hour");

    const newTask = "66666666-6666-4666-8666-666666666666";
    const created = await apply((await preview(plan("new-task-and-interval", [
      { kind: "create_interval", id: fresh, title: "Free afternoon", startsAt: at(15), endsAt: at(16) },
      { kind: "create_task", id: newTask, title: "Write letter", durationMinutes: 20 },
      { kind: "place_task", taskId: newTask, expectedRevision: 0, intervalId: fresh }
    ]))).previewId);
    assert.equal(created.afterItems.length, 2);
    assert.equal(created.afterLinks[0].from_id, newTask);
    await call("atlas_undo_brain_edits", "new-task-and-interval", "undo-created");
    assert.equal((await db.query<{task_status:string}>(`select task_status from items where id='${newTask}'`)).rows[0].task_status, "cancelled");
    assert.equal((await db.query<{interval_status:string}>(`select interval_status from items where id='${fresh}'`)).rows[0].interval_status, "archived");

    const appointment = await apply((await preview(plan("make-appointment", [
      { kind: "place_task", taskId: task, expectedRevision: 2, intervalId: null },
      { kind: "update_task", id: task, expectedRevision: 2, durationMinutes: 30, fixedStartsAt: at(17), fixedEndsAt: at(18) }
    ]))).previewId);
    assert.equal(appointment.afterItems[0].revision, 3);
    assert.equal(Date.parse(appointment.afterItems[0].task_fixed_starts_at), Date.parse(at(17)));
    assert.equal(appointment.afterLinks.length, 0);
    await assert.rejects(preview(plan("half-appointment", [{ kind: "update_task", id: task, expectedRevision: 3, fixedEndsAt: null }])), /both start and end/);
    await assert.rejects(preview(plan("place-appointment", [{ kind: "place_task", taskId: task, expectedRevision: 3, intervalId: first }])), /Fixed appointment/);
    const routineTask = "88888888-8888-4888-8888-888888888888";
    await db.exec(`insert into public.items(id,owner_id,title,is_task,task_status,task_expected_minutes,revision) values('${routineTask}','${owner}','Nominal routine',true,'active',60,1);
      insert into public.item_links(owner_id,from_id,to_id,kind) values('${owner}','${routineTask}','${second}','scheduled_in');`);
    const routineMove = await apply((await preview(plan("move-nominal-routine", [{ kind: "update_interval", id: second, expectedRevision: 1, startsAt: at(19), endsAt: at(20) }]))).previewId);
    assert.equal(routineMove.afterItems[0].interval_starts_at, at(19), "legacy nominal-duration interval can move without worsening overbooking");
    await assert.rejects(preview(plan("worsen-routine", [{ kind: "update_interval", id: second, expectedRevision: 2, startsAt: `${date}T19:15:00Z` }])), /insufficient capacity/);
    await assert.rejects(preview(plan("appointment-over-routine", [{ kind: "update_task", id: task, expectedRevision: 3, fixedStartsAt: at(19), fixedEndsAt: at(20) }])), /insufficient capacity/);

    // The predicate produces an occurrence next week, while the stored template
    // is far in the past. A raw items-only overlap check cannot see that event.
    const generator = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const recurrence = { ...defaultGeneratorRule("UTC", date), status: "active", text: "Every day", compiledText: "Every day", source: "function includes(date) { return true; }", until: date };
    await db.query(`insert into public.items(id,owner_id,title,is_interval,interval_kind,interval_status,interval_starts_at,interval_ends_at,revision,recurrence_state) values($1,$2,'Recurring work',true,'fixed','scheduled','2020-01-01T21:00:00Z','2020-01-01T22:00:00Z',1,$3)`, [generator, owner, JSON.stringify(recurrence)]);
    const generatorRows = await db.query<DbItemRow>(`select * from public.items where id=$1`, [generator]);
    const projected = await projectItems(generatorRows.rows.map(itemFromDbRow));
    assert.ok(projected.some(item => item.generatedFromId === generator && Date.parse(item.intervalStartsAt) === Date.parse(at(21))), "fixture contains a virtual recurring interval");
    await assert.rejects(preview(plan("overlap-virtual-interval", [{ kind: "create_interval", id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", title: "Clashing work", startsAt: at(21), endsAt: at(22) }])), /virtual recurring/);
    await assert.rejects(preview(plan("overlap-virtual-appointment", [{ kind: "update_task", id: task, expectedRevision: 3, fixedStartsAt: at(21), fixedEndsAt: at(22) }])), /virtual recurring/);
    const afterHorizon = new Date(Date.parse(`${date}T00:00:00Z`) + 2 * 86400000).toISOString().slice(0, 10);
    assert.ok((await preview(plan("outside-recurrence-horizon", [{ kind: "update_task", id: task, expectedRevision: 3, fixedStartsAt: `${afterHorizon}T21:00:00Z`, fixedEndsAt: `${afterHorizon}T22:00:00Z` }]))).previewId);
    await db.exec(`update public.items set recurrence_state=recurrence_state||'{"status":"paused"}' where id='${generator}'`);
    // Sparse touched rows preserve their scheduling values in the baseline, not
    // necessarily their raw columns, and survive paused/deleted generators.
    const touchedOccurrence = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    await db.query(`insert into public.items(id,owner_id,title,generated_from_id,occurrence_key,revision,recurrence_state) values($1,$2,'Touched recurrence',$3,$4,1,$5)`, [touchedOccurrence, owner, generator, date, JSON.stringify({ kind: "occurrence", version: 1, baseline: { values: { isInterval: true, intervalStartsAt: at(21), intervalEndsAt: at(22) } }, overrides: {}, deleted: false })]);
    await assert.rejects(preview(plan("overlap-sparse-occurrence", [{ kind: "update_task", id: task, expectedRevision: 3, fixedStartsAt: at(21), fixedEndsAt: at(22) }])), /recurring/);
    await db.exec(`update public.items set interval_starts_at='2020-01-01T06:00:00Z',interval_ends_at='2020-01-01T07:00:00Z' where id='${generator}'`);
    await assert.rejects(preview(plan("paused-generator-live-reference", [{ kind: "update_task", id: task, expectedRevision: 3, fixedStartsAt: at(6), fixedEndsAt: at(7) }])), /recurring/);
    // Pure removals reduce load and need no recurrence assumption.
    assert.ok((await preview(plan("safe-unschedule-with-recurrence", [{ kind: "place_task", taskId: routineTask, expectedRevision: 1, intervalId: null }]))).previewId);

    // A still-unexpired preview must refuse time-sensitive effects whose start
    // passed after preview, even though no item/link row changed in between.
    const imminentStarts = new Date(Date.now() + 700).toISOString();
    const imminentEnds = new Date(Date.now() + 3600000).toISOString();
    const imminent = await preview(plan("time-passed", [{ kind: "update_task", id: task, expectedRevision: 3, fixedStartsAt: imminentStarts, fixedEndsAt: imminentEnds }]));
    await new Promise(resolve => setTimeout(resolve, 800));
    await assert.rejects(apply(imminent.previewId), /Invalid appointment range/);
    assert.equal(await receipt("time-passed"), null);
    const runningInterval = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const minuteTask = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    const runningStart = new Date(Date.now() - 10000).toISOString();
    const runningEnd = new Date(Date.now() + 120500).toISOString();
    await db.query(`insert into public.items(id,owner_id,title,is_interval,interval_kind,interval_status,interval_starts_at,interval_ends_at,revision) values($1,$2,'Running work block',true,'fixed','scheduled',$3,$4,1)`, [runningInterval, owner, runningStart, runningEnd]);
    const shrinkingCapacity = await preview(plan("capacity-time-passed", [
      { kind: "create_task", id: minuteTask, title: "One minute task", durationMinutes: 1 },
      { kind: "place_task", taskId: minuteTask, expectedRevision: 0, intervalId: runningInterval }
    ]));
    await new Promise(resolve => setTimeout(resolve, 650));
    await assert.rejects(apply(shrinkingCapacity.previewId), /insufficient capacity/);
    assert.equal(await receipt("capacity-time-passed"), null);
    await db.exec(`update public.items set recurrence_state='{"kind":"generator"}',revision=2 where id='${routineTask}'`);
    await assert.rejects(preview(plan("generator-edit", [{ kind: "update_task", id: routineTask, expectedRevision: 2, durationMinutes: 15 }])), /recurrence review/);
    assert.ok(await count("item_link_history") >= 5);
    await assert.rejects(db.exec("delete from public.brain_edit_receipts"), /permission denied/);
    await assert.rejects(db.exec("delete from public.item_link_history"), /permission denied/);
    await assert.rejects(call("atlas_commit_brain_edit_changes", "evil", "digest", {}, {}), /permission denied/);
  } finally { await db.close(); }
});
