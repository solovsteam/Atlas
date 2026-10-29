import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Migration 015 on a local PostgreSQL, with Supabase's auth.uid() and roles
// reproduced, so the row level security rules are exercised for real.
const alice = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";
const tracker = "33333333-3333-4333-8333-333333333333";
const bobsItem = "44444444-4444-4444-8444-444444444444";

async function database() {
  const db = new PGlite();
  await db.exec(`create role authenticated;create role anon;create schema auth;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
    grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
    insert into auth.users values('${alice}'),('${bob}');create publication supabase_realtime;`);
  for (const name of ["001_items", "003_interval_extended", "015_documentation_entries"]) {
    await db.exec(await readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), "utf8"));
  }
  // Applying 015 twice must be harmless (if not exists / guarded policies).
  await db.exec(await readFile(new URL("../supabase/migrations/015_documentation_entries.sql", import.meta.url), "utf8"));
  await db.exec(`grant select,insert,update,delete on public.items to authenticated;
    insert into public.items(id,owner_id,title,is_documentation) values('${tracker}','${alice}','Scrolled',true),('${bobsItem}','${bob}','Bob''s',true);`);
  const as = async (user: string) => db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${user}';`);
  const asAdmin = async () => db.exec("reset role;");
  return { db, as, asAdmin };
}

async function rejects(promise: Promise<unknown>, pattern: RegExp) {
  await assert.rejects(promise, (error: Error) => pattern.test(error.message));
}

test("015: owners write and read their own entries only", async () => {
  const { db, as } = await database();
  try {
    await as(alice);
    await db.query(`insert into public.documentation_entries(owner_id,item_id,occurred_at) values($1,$2,$3)`, [alice, tracker, "2026-10-29T21:30:00Z"]);
    const own = await db.query<{ data: unknown }>(`select data from public.documentation_entries`);
    assert.equal(own.rows.length, 1);
    assert.deepEqual(own.rows[0].data, {}, "event-only entries default to an empty object");
    await rejects(db.query(`insert into public.documentation_entries(owner_id,item_id,occurred_at) values($1,$2,now())`, [bob, tracker]), /row-level security/);
    await rejects(db.query(`insert into public.documentation_entries(owner_id,item_id,occurred_at) values($1,$2,now())`, [alice, bobsItem]), /row-level security/);
    await rejects(db.query(`insert into public.documentation_entries(owner_id,item_id,occurred_at,data) values($1,$2,now(),'[1]')`, [alice, tracker]), /check constraint/);

    await as(bob);
    assert.equal((await db.query(`select * from public.documentation_entries`)).rows.length, 0, "Bob sees none of Alice's entries");
    await db.query(`delete from public.documentation_entries`);
    await as(alice);
    assert.equal((await db.query(`select * from public.documentation_entries`)).rows.length, 1, "Bob cannot delete them either");
  } finally {
    await db.close();
  }
});

test("015: a tracker with entries cannot be deleted, but an account deletion still cascades", async () => {
  const { db, as, asAdmin } = await database();
  try {
    await as(alice);
    const inserted = await db.query<{ id: string }>(
      `insert into public.documentation_entries(owner_id,item_id,occurred_at) values($1,$2,now()) returning id`,
      [alice, tracker]
    );
    await rejects(db.query(`delete from public.items where id=$1`, [tracker]), /documentation_entries/);
    // Undo of an entry deletion reinserts it with its original id.
    const [row] = (await db.query<Record<string, unknown>>(`select * from public.documentation_entries`)).rows;
    await db.query(`delete from public.documentation_entries where id=$1`, [inserted.rows[0].id]);
    await db.query(
      `insert into public.documentation_entries(id,owner_id,item_id,occurred_at,data,created_at) values($1,$2,$3,$4,$5,$6)`,
      [row.id, row.owner_id, row.item_id, row.occurred_at, JSON.stringify(row.data), row.created_at]
    );
    assert.equal((await db.query(`select * from public.documentation_entries where id=$1`, [row.id])).rows.length, 1);

    await asAdmin();
    await db.query(`delete from auth.users where id=$1`, [alice]);
    assert.equal((await db.query(`select * from public.documentation_entries`)).rows.length, 0);
    assert.equal((await db.query(`select * from public.items where owner_id=$1`, [alice])).rows.length, 0);
  } finally {
    await db.close();
  }
});

test("015: the table is published for realtime with full delete payloads", async () => {
  const { db } = await database();
  try {
    const published = await db.query(`select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='documentation_entries'`);
    assert.equal(published.rows.length, 1);
    const identity = await db.query<{ relreplident: string }>(`select relreplident from pg_class where relname='documentation_entries'`);
    assert.equal(identity.rows[0].relreplident, "f");
  } finally {
    await db.close();
  }
});
