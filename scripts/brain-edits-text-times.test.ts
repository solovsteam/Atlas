import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// The live database predates 007: task_due_at/task_fixed_starts_at/
// task_fixed_ends_at are TEXT NOT NULL DEFAULT '' there. Migration 013 must
// make edits work on that schema without changing timestamptz behaviour.
const owner = "11111111-1111-4111-8111-111111111111";
const task = "22222222-2222-4222-8222-222222222222";
const block = "33333333-3333-4333-8333-333333333333";
const added = "66666666-6666-4666-8666-666666666666";
const newTask = "77777777-7777-4777-8777-777777777777";
const date = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
const at = (hm: string) => `${date}T${hm}:00+01:00`;
const plan = (requestId: string, operations: unknown[]) => ({ format: "brain-atlas.edits", version: 1, requestId, reason: "Move routine block", operations });

async function liveLikeDb() {
  const db = new PGlite();
  await db.exec(`create role authenticated;create role anon;create schema auth;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
    grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
    insert into auth.users values('${owner}');create publication supabase_realtime;`);
  for (const name of ["001_items", "003_interval_extended", "005_task_expected_duration", "006_subtasks", "007_task_scheduling", "008_item_links", "011_recurring_references", "012_brain_edits", "013_brain_edits_text_times", "014_brain_edits_status_archive"])
    await db.exec(await readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), "utf8"));
  // Reproduce the live drift: the three task time columns as text, '' = none.
  for (const c of ["task_due_at", "task_fixed_starts_at", "task_fixed_ends_at"])
    await db.exec(`alter table public.items alter column ${c} type text using coalesce(${c}::text,''); alter table public.items alter column ${c} set default ''; alter table public.items alter column ${c} set not null;`);
  await db.exec(`grant select,insert,update,delete on public.items,public.item_links to authenticated;
    set role authenticated;set request.jwt.claim.sub='${owner}';
    insert into public.items(id,owner_id,title,is_task,task_status,task_expected_minutes,revision) values('${task}','${owner}','Dinner',true,'active',70,0);
    insert into public.items(id,owner_id,title,is_interval,interval_kind,interval_status,interval_starts_at,interval_ends_at,revision) values('${block}','${owner}','Dinner · Brain',true,'fixed','scheduled','${at("20:20")}','${at("21:30")}',0);
    insert into public.item_links(id,owner_id,from_id,to_id,kind) values(gen_random_uuid(),'${owner}','${task}','${block}','scheduled_in');`);
  const call = async (fn: string, ...args: unknown[]) => (await db.query<{ value: any }>(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(",")}) as value`, args.map(v => typeof v === "object" ? JSON.stringify(v) : v))).rows[0].value;
  return { db, call };
}

test("013: edits work on the live text-column schema and undo restores it", async () => {
  const { db, call } = await liveLikeDb();
  try {
    const row = async (id: string) => (await db.query<any>(`select * from public.items where id='${id}'`)).rows[0];
    assert.equal((await row(task)).task_fixed_starts_at, "");
    const p = await call("atlas_preview_brain_edits", plan("move-dinner", [
      { kind: "update_interval", id: block, expectedRevision: 0, title: "Dinner · Renaissance", startsAt: at("19:50"), endsAt: at("21:00") },
      { kind: "create_interval", id: added, title: "Call dentist", startsAt: at("12:30"), endsAt: at("12:45") },
      { kind: "create_task", id: newTask, title: "Research", durationMinutes: 60 },
    ]));
    const applied = await call("atlas_apply_brain_edit_preview", p.previewId);
    assert.equal((await row(block)).interval_starts_at, at("19:50"));
    assert.equal((await row(added)).title, "Call dentist");
    assert.equal((await row(newTask)).task_fixed_starts_at, "", "new task keeps the text default");
    assert.equal((await row(task)).task_fixed_starts_at, "", "untouched linked task keeps ''");
    await call("atlas_undo_brain_edits", "move-dinner", "undo-move-dinner");
    assert.equal((await row(block)).interval_starts_at, at("20:20"));
    assert.equal((await row(added)).interval_status, "archived");
    // A task edit on the text schema writes '' back, never NULL, and undoes cleanly.
    const t = await call("atlas_apply_brain_edit_preview", (await call("atlas_preview_brain_edits", plan("dinner-length", [{ kind: "update_task", id: task, expectedRevision: 0, durationMinutes: 60 }]))).previewId);
    assert.equal((await row(task)).task_fixed_ends_at, "");
    assert.equal((await row(task)).task_expected_minutes, 60);
    await call("atlas_undo_brain_edits", "dinner-length", "undo-dinner-length");
    assert.equal((await row(task)).task_expected_minutes, 70);
    assert.equal((await row(task)).task_fixed_starts_at, "");
    assert.ok(applied.afterItems.length >= 3 && t.afterItems.length === 1);
  } finally { await db.close(); }
});

test("013: a real fixed appointment stored as text is still refused inside an interval", async () => {
  const { db, call } = await liveLikeDb();
  try {
    await db.exec(`update public.items set task_fixed_starts_at='${at("20:30")}',task_fixed_ends_at='${at("20:45")}' where id='${task}'`);
    await assert.rejects(call("atlas_preview_brain_edits", plan("x", [{ kind: "update_interval", id: block, expectedRevision: 0, startsAt: at("19:50"), endsAt: at("21:00") }])), /Fixed appointment cannot be placed/);
  } finally { await db.close(); }
});

test("014: archive a block (unscheduling its task) and cancel a task, then undo both", async () => {
  const { db, call } = await liveLikeDb();
  try {
    const row = async (id: string) => (await db.query<any>(`select * from public.items where id='${id}'`)).rows[0];
    const linkCount = async () => Number((await db.query<any>(`select count(*) n from public.item_links where to_id='${block}'`)).rows[0].n);
    const p = await call("atlas_preview_brain_edits", plan("drop-dinner", [
      { kind: "archive_interval", id: block, expectedRevision: 0 },
      { kind: "set_task_status", id: task, expectedRevision: 0, status: "cancelled" },
    ]));
    await call("atlas_apply_brain_edit_preview", p.previewId);
    assert.equal((await row(block)).interval_status, "archived");
    assert.equal((await row(task)).task_status, "cancelled");
    assert.equal(await linkCount(), 0, "the task was unscheduled from the archived block");
    await call("atlas_undo_brain_edits", "drop-dinner", "undo-drop-dinner");
    assert.equal((await row(block)).interval_status, "scheduled");
    assert.equal((await row(task)).task_status, "active");
    assert.equal(await linkCount(), 1, "undo restored the placement");
    await assert.rejects(call("atlas_preview_brain_edits", plan("bad", [{ kind: "set_task_status", id: task, expectedRevision: 2, status: "maybe" }])), /status|revision/i);
  } finally { await db.close(); }
});
