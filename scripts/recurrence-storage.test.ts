import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { itemToDbInsert, itemFromDbRow } from "../shared/item";
import {
  emptyItem,
  defaultGeneratorRule,
  newOccurrence,
  changeOccurrence,
  resolveOccurrence,
} from "../shared/recurringReferences";

test("real PostgreSQL migration preserves references, revisions, history and account isolation", async () => {
  const db = new PGlite();
  const owner = "11111111-1111-4111-8111-111111111111",
    other = "33333333-3333-4333-8333-333333333333";
  try {
    await db.exec(`create role authenticated;create role anon;create schema auth;create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
      grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
      insert into auth.users values('${owner}'),('${other}');`);
    for (const name of [
      "001_items",
      "003_interval_extended",
      "005_task_expected_duration",
      "006_subtasks",
      "007_task_scheduling",
      "011_recurring_references",
    ]) {
      let sql = await readFile(
        new URL(`../supabase/migrations/${name}.sql`, import.meta.url),
        "utf8",
      );
      // Replication isn't part of this migration or this embedded Postgres fixture.
      sql = sql.replace(
        "alter publication supabase_realtime add table public.items;",
        "",
      );
      await db.exec(sql);
    }
    await db.exec(`grant select,insert,update,delete on public.items,public.item_history to authenticated;
      grant usage on sequence public.item_history_id_seq to authenticated;set role authenticated;
      set request.jwt.claim.sub='${owner}';`);
    const write = async (
      item: ReturnType<typeof emptyItem>,
      revision: number,
      sourceRevision: number | null = null,
    ) => {
      const result = await db.query<{ value: any }>(
        "select public.atlas_write_reference($1::jsonb,$2::integer,$3::integer) as value",
        [JSON.stringify(itemToDbInsert(item, owner)), revision, sourceRevision],
      );
      return result.rows[0].value;
    };
    let g = {
      ...emptyItem("22222222-2222-4222-8222-222222222222", owner),
      title: "Original",
      isTask: true,
      taskStatus: "active" as const,
      recurrenceState: {
        ...defaultGeneratorRule("Europe/Berlin", "2026-10-12"),
        status: "active" as const,
        text: "Daily",
        compiledText: "Daily",
        source: "d=>true",
      },
    };
    const created = await write(g, 0);
    g = itemFromDbRow(created.row) as typeof g;
    const raw = newOccurrence(g, "2026-10-12");
    const first = await write(raw, 0, g.revision);
    assert.equal(first.row.title, "");
    assert.equal(first.row.is_task, false);
    assert.equal(first.row.revision, 1);
    assert.equal(
      (await write(raw, 0, g.revision)).conflict.revision,
      1,
      "duplicate first touch returns existing identity",
    );
    const second = newOccurrence(g, "2026-10-13");
    assert.deepEqual(await write(second, 0, g.revision - 1), {
      generatorConflict: true,
    });
    assert.equal(
      (await db.query("select id from public.items where id=$1", [second.id]))
        .rows.length,
      0,
      "stale generator writes nothing",
    );
    const updated = await write({ ...g, title: "New default" }, g.revision);
    g = itemFromDbRow(updated.row) as typeof g;
    assert.equal(
      resolveOccurrence(itemFromDbRow(first.row), g).item.title,
      "New default",
    );
    assert.equal(
      (await write({ ...g, title: "Stale" }, g.revision - 1)).conflict.title,
      "New default",
    );
    const done = changeOccurrence(itemFromDbRow(first.row), g, {
      taskStatus: "done",
    });
    const completed = await write(done, 1, g.revision);
    await write(
      {
        ...g,
        title: "Later",
        recurrenceState: { ...g.recurrenceState, status: "deleted" },
      },
      g.revision,
    );
    assert.equal(
      resolveOccurrence(itemFromDbRow(completed.row), { ...g, title: "Later" })
        .item.title,
      "New default",
    );
    await assert.rejects(
      db.query("delete from public.items where id=$1", [g.id]),
      /archived|foreign key/,
    );
    await assert.rejects(
      db.query("delete from public.items where id=$1", [raw.id]),
      /archived/,
    );
    const history = await db.query<{
      operation: string;
      before_row: any;
      after_row: any;
    }>("select * from public.item_history order by id");
    assert.equal(history.rows.length, 5);
    assert.equal(
      history.rows[3].after_row.recurrence_state.frozen.title,
      "New default",
    );
    assert.equal(history.rows[4].before_row.title, "New default");
    assert.equal(
      (await db.query("delete from public.item_history returning id")).rows
        .length,
      0,
    );
    assert.equal(
      (
        await db.query(
          "update public.item_history set operation='changed' returning id",
        )
      ).rows.length,
      0,
    );
    await db.exec(`set request.jwt.claim.sub='${other}';`);
    assert.equal((await db.query("select * from public.items")).rows.length, 0);
    assert.equal(
      (await db.query("select * from public.item_history")).rows.length,
      0,
    );
    await assert.rejects(write(raw, 0, g.revision), /account/);
    await db.exec("set role anon");
    await assert.rejects(
      db.query("select public.atlas_write_reference($1::jsonb,0,null)", [
        JSON.stringify(itemToDbInsert(raw, other)),
      ]),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
