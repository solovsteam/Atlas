import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../src/types/database';
import { findOrCreateSleepLog, findSleepLog, sleepLogItemId, sleepLogStore } from '../src/services/sleepLog';
import { restoreEntry, updateEntryData, deleteEntry } from '../src/services/documentationEntries';
import { fullnessLabel, sleepNight, sleepSettings, DEFAULT_SLEEP_SETTINGS, type SleepRating } from '../shared/sleepLog';
import { eveningMeal, readMeals } from '../shared/meals';
import { sleepReactionTest } from '../shared/sleepReactionTest';
import { sleepIntake, intakeNow, DEFAULT_INTAKE_BUTTONS, readIntakes } from '../shared/intake';
import { createReactionTestResult } from '../shared/reactionTest';

const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';

// A small PostgREST transport for the real services. SQL runs under authenticated
// RLS on PGlite. This fixture never connects to Supabase or a real account.
function localClient(db: PGlite): SupabaseClient<Database> {
  return { from(table: string) {
    assert.ok(['items', 'documentation_entries'].includes(table));
    let operation = 'select';
    let payload: Record<string, unknown> = {};
    const filters: [string, unknown][] = [];
    const orders: string[] = [];
    let range: [number, number] | null = null;
    let single = false;
    const builder = {
      select() { return builder; },
      insert(value: Record<string, unknown>) { operation = 'insert'; payload = value; return builder; },
      update(value: Record<string, unknown>) { operation = 'update'; payload = value; return builder; },
      delete() { operation = 'delete'; return builder; },
      eq(name: string, value: unknown) { filters.push([name, value]); return builder; },
      order(name: string, options?: { ascending?: boolean }) { orders.push(`"${name}" ${options?.ascending === false ? 'desc' : 'asc'}`); return builder; },
      range(from: number, to: number) { range = [from, to]; return builder; },
      single() { single = true; return builder; },
      async then(resolve: (value: unknown) => unknown, reject: (cause: unknown) => unknown) {
        try {
          const values: unknown[] = [];
          const parameter = (value: unknown) => { values.push(value !== null && typeof value === 'object' ? JSON.stringify(value) : value); return `$${values.length}`; };
          const columns = Object.keys(payload);
          let sql = operation === 'insert' ? `insert into ${table} (${columns.map(c => `"${c}"`).join(',')}) values (${columns.map(c => parameter(payload[c])).join(',')})`
            : operation === 'update' ? `update ${table} set ${columns.map(c => `"${c}"=${parameter(payload[c])}`).join(',')}`
            : operation === 'delete' ? `delete from ${table}` : `select * from ${table}`;
          if (filters.length) sql += ` where ${filters.map(([name, value]) => `"${name}"=${parameter(value)}`).join(' and ')}`;
          if (operation === 'select') {
            if (orders.length) sql += ` order by ${orders.join(',')}`;
            if (range) sql += ` limit ${range[1] - range[0] + 1} offset ${range[0]}`;
          } else sql += ' returning *';
          const { rows } = await db.query(sql, values);
          const data = JSON.parse(JSON.stringify(rows));
          return resolve({ data: single ? data[0] ?? null : data, error: null });
        } catch (cause) {
          if (cause instanceof Error) return resolve({ data: null, error: { message: cause.message, code: (cause as Error & { code?: string }).code } });
          return reject(cause);
        }
      },
    };
    return builder;
  } } as unknown as SupabaseClient<Database>;
}
async function database() {
  const db = new PGlite();
  await db.exec(`create role authenticated; create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
    insert into auth.users values('${alice}'),('${bob}'); create publication supabase_realtime;`);
  for (const name of ['001_items', '003_interval_extended', '015_documentation_entries']) {
    await db.exec(await readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), 'utf8'));
  }
  await db.exec('grant select,insert,update,delete on public.items to authenticated;');
  const as = (user: string) => db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${user}';`);
  return { db, client: localClient(db), as };
}

test('sleep storage: first use, nights, corrections, test entries and all three undo operations under RLS', async () => {
  const { db, client, as } = await database();
  try {
    await as(alice);
    assert.equal(await findSleepLog(client, alice), null, 'reading does not create a container');
    const item = await findOrCreateSleepLog(client, alice);
    assert.equal(item.title, 'Sleep');
    assert.equal(item.id, sleepLogItemId(alice));
    assert.deepEqual(sleepSettings(item), DEFAULT_SLEEP_SETTINGS);
    assert.equal((await findOrCreateSleepLog(client, alice)).id, item.id);
    assert.equal((await db.query('select * from items')).rows.length, 1);
    const store = sleepLogStore(client, alice);
    const evening = await store.saveEvening(item.id, { lightsOut: '2026-11-15T22:00:00Z', timeZone: 'Europe/Berlin' }, new Date('2026-11-15T22:00:00Z'));
    assert.equal(evening.before, undefined);
    const morning = await store.saveMorning(item.id, { wakeAt: '2026-11-16T07:00:00Z', timeZone: 'Europe/Berlin' }, new Date('2026-11-16T07:00:00Z'));
    assert.equal(morning.entry.id, evening.entry.id);
    assert.deepEqual(morning.before, evening.entry);
    assert.equal(sleepNight(morning.entry)?.morning?.wakeAt, '2026-11-16T07:00:00Z');
    const correction = await store.saveEvening(item.id, { lightsOut: '2026-11-15T23:00:00Z', timeZone: 'Europe/Berlin', fromMemory: true }, new Date(), evening.entry.id);
    assert.deepEqual(sleepNight(correction.entry)?.morning, sleepNight(morning.entry)?.morning);
    await updateEntryData(client, alice, correction.before!.id, correction.before!.data);
    assert.equal(sleepNight((await store.readEntries(item.id))[0])?.evening?.lightsOut, '2026-11-15T22:00:00Z', 'undo correction restores the full snapshot');
    const orphan = await store.saveMorning(item.id, { wakeAt: '2026-11-17T07:00:00Z', timeZone: 'Europe/Berlin' }, new Date('2026-11-17T07:00:00Z'));
    assert.notEqual(orphan.entry.id, morning.entry.id);
    assert.equal(sleepNight(orphan.entry)?.evening, undefined);
    const result = createReactionTestResult({ startedAt: '2026-11-16T14:00:00Z', previousTestCount: 0, deviceBrowser: 'fixture phone', sleepiness: 5,
      events: [{ type: 'response', stimulusAtMs: 1000, reactionTimeMs: 300 }] });
    const savedTest = await store.saveReactionTest(item.id, result, 'Europe/Berlin');
    assert.equal(sleepReactionTest(savedTest.entry)?.deviceBrowser, 'fixture phone');
    assert.equal(sleepNight(savedTest.entry), null);
    const deleted = await store.deleteEntry(item.id, savedTest.entry.id);
    await restoreEntry(client, alice, deleted);
    assert.deepEqual((await store.readEntries(item.id)).find(entry => entry.id === deleted.id), deleted, 'undo delete preserves id and timestamps');
    await deleteEntry(client, alice, savedTest.entry.id);
    assert.equal((await store.readEntries(item.id)).some(entry => entry.id === savedTest.entry.id), false, 'undo create removes the test');
    await assert.rejects(store.saveMorning(item.id, { timeZone: 'Europe/Berlin' }, new Date(), 'missing'), /no longer exists/);
    await assert.rejects(store.saveMorning(item.id, { timeZone: 'invalid' }, new Date()), /Invalid time zone/);

    const intake = intakeNow(DEFAULT_INTAKE_BUTTONS[1], new Date('2026-11-16T08:12:00Z'), 'Europe/Berlin');
    const savedIntake = await store.saveIntake(item.id, intake);
    assert.equal(savedIntake.entry.occurredAt, intake.takenAt);
    assert.equal(readIntakes(await store.readEntries(item.id))[0].intake.dose, 1);
    const correctedIntake = await store.saveIntake(item.id, { ...intake, dose: 2, takenAt: '2026-11-16T09:30:00Z' }, savedIntake.entry.id);
    assert.equal(correctedIntake.entry.id, savedIntake.entry.id);
    assert.equal(correctedIntake.entry.occurredAt, '2026-11-16T09:30:00.000Z');
    assert.equal(readIntakes([correctedIntake.entry])[0].intake.dose, 2);
    await updateEntryData(client, alice, correctedIntake.before!.id, correctedIntake.before!.data, new Date(correctedIntake.before!.occurredAt));
    const restoredIntake = (await store.readEntries(item.id)).find(e => e.id === savedIntake.entry.id)!;
    assert.equal(restoredIntake.occurredAt, savedIntake.entry.occurredAt, 'undo edit restores occurred_at as well as data');
    const deletedIntake = await store.deleteEntry(item.id, savedIntake.entry.id);
    await restoreEntry(client, alice, deletedIntake);
    assert.deepEqual((await store.readEntries(item.id)).find(e => e.id === deletedIntake.id), deletedIntake);
    const marker = await store.hideLegacyIntake(item.id, `${evening.entry.id}:coffee:0`, new Date(intake.takenAt));
    assert.equal(marker.entry.data.kind, 'intakeCorrection');
    await deleteEntry(client, alice, marker.entry.id);
    await assert.rejects(store.saveIntake(item.id, intake, evening.entry.id), /not an intake/);

    await as(bob);
    assert.equal(await findSleepLog(client, bob), null);
    assert.deepEqual(await sleepLogStore(client, bob).readEntries(item.id), []);
    await assert.rejects(sleepLogStore(client, bob).saveEvening(item.id, { timeZone: 'UTC' }, new Date()), /row-level security/);
    await assert.rejects(restoreEntry(client, bob, deleted), /another account/);
    const bobs = await findOrCreateSleepLog(client, bob);
    assert.notEqual(bobs.id, item.id);
  } finally { await db.close(); }
});

test('sleep storage keeps an existing legacy container and refuses duplicates', async () => {
  const { db, client, as } = await database();
  try {
    await as(alice);
    const id = '33333333-3333-4333-8333-333333333333';
    await db.query(`insert into items(id,owner_id,title,is_documentation,documentation_schema) values($1,$2,'Sleep',true,'{"sleepLog":null}')`, [id, alice]);
    assert.equal((await findOrCreateSleepLog(client, alice)).id, id);
    await db.query(`insert into items(owner_id,title,is_documentation,documentation_schema) values($1,'Sleep',true,'{"sleepLog":{}}')`, [alice]);
    await assert.rejects(findOrCreateSleepLog(client, alice), /More than one sleep log/);
  } finally { await db.close(); }
});


test('concurrent first use creates one container without replaying a write', async () => {
  const { db, client, as } = await database();
  try {
    await as(alice);
    const [first, second] = await Promise.all([findOrCreateSleepLog(client, alice), findOrCreateSleepLog(client, alice)]);
    assert.equal(first.id, second.id);
    assert.equal((await db.query('select * from items')).rows.length, 1);
  } finally { await db.close(); }
});

test('one morning change stores recalled lights out and one undo restores both parts', async () => {
  const { db, client, as } = await database();
  try {
    await as(alice);
    const item = await findOrCreateSleepLog(client, alice);
    const store = sleepLogStore(client, alice);
    const before = await store.saveEvening(item.id, { timeZone: 'UTC', dayRating: 3 }, new Date('2026-11-16T21:00:00Z'));
    const saved = await store.saveMorning(item.id, { timeZone: 'UTC', wakeAt: '2026-11-17T07:30:00Z' }, new Date('2026-11-17T07:30:00Z'), before.entry.id, '2026-11-16T22:15:00Z');
    assert.equal(saved.entry.id, before.entry.id);
    assert.equal(sleepNight(saved.entry)?.evening?.lightsOut, '2026-11-16T22:15:00Z');
    assert.equal(sleepNight(saved.entry)?.evening?.fromMemory, true);
    assert.equal(sleepNight(saved.entry)?.evening?.dayRating, 3);
    assert.ok(sleepNight(saved.entry)?.morning);
    await updateEntryData(client, alice, saved.before!.id, saved.before!.data);
    assert.deepEqual((await store.readEntries(item.id))[0].data, before.entry.data);
    const created = await store.saveMorning(item.id, { timeZone: 'UTC', wakeAt: '2026-11-19T07:30:00Z' }, new Date('2026-11-19T07:30:00Z'), undefined, '2026-11-18T22:15:00Z');
    assert.equal(created.before, undefined);
    assert.ok(sleepNight(created.entry)?.evening?.fromMemory);
    await deleteEntry(client, alice, created.entry.id);
    assert.equal((await store.readEntries(item.id)).length, 1);
  } finally { await db.close(); }
});

test('day evidence uses separate entries with correction, deletion and undo under RLS', async () => {
  const { db, client, as } = await database();
  try {
    await as(alice);
    const item = await findOrCreateSleepLog(client, alice);
    const store = sleepLogStore(client, alice);
    const created = await store.saveDayEvidence(item.id, 'dayConfirmation', { date: '2026-11-17', timeZone: 'Europe/Berlin' });
    const answer = await store.saveDayEvidence(item.id, 'medicineAnswer', { date: '2026-11-17', timeZone: 'Europe/Berlin', answer: 'not-taken' });
    assert.equal((await store.readEntries(item.id)).length, 2);
    assert.equal(sleepNight(created.entry), null);
    assert.equal(sleepIntake(answer.entry), null);
    const edited = await store.saveDayEvidence(item.id, 'dayConfirmation', { date: '2026-11-16', timeZone: 'America/New_York' }, created.entry.id);
    assert.equal(edited.entry.occurredAt, '2026-11-16T17:00:00.000Z');
    assert.ok(edited.before);
    await updateEntryData(client, alice, edited.before.id, edited.before.data, new Date(edited.before.occurredAt));
    assert.deepEqual((await store.readEntries(item.id)).find(row => row.id === created.entry.id)?.data, created.entry.data);
    const removed = await store.deleteEntry(item.id, answer.entry.id);
    assert.equal((await store.readEntries(item.id)).length, 1);
    await restoreEntry(client, alice, removed);
    assert.equal((await store.readEntries(item.id)).length, 2);
    await assert.rejects(store.saveDayEvidence(item.id, 'medicineAnswer', { date: '2026-11-17', timeZone: 'UTC', answer: 'not-taken' }, created.entry.id), /different kind/);
    await as(bob);
    await assert.rejects(sleepLogStore(client, bob).saveDayEvidence(item.id, 'dayConfirmation', { date: '2026-11-17', timeZone: 'UTC' }), /row-level security/);
  } finally { await db.close(); }
});

test('meal finish times and optional bedtime fullness survive corrections and undo under RLS', async () => {
  const { db, client, as } = await database();
  try {
    await as(alice);
    const item = await findOrCreateSleepLog(client, alice);
    const store = sleepLogStore(client, alice);
    const meal = { finishedAt: '2026-11-17T20:15:00+01:00', timeZone: 'Europe/Berlin' };
    const created = await store.saveMeal(item.id, meal);
    assert.equal(created.before, undefined);
    assert.equal(created.entry.occurredAt, '2026-11-17T19:15:00.000Z');
    assert.deepEqual(eveningMeal(created.entry), { ...meal, finishedAt: created.entry.occurredAt });
    assert.deepEqual(readIntakes([created.entry]), []);
    const corrected = await store.saveMeal(item.id, { ...meal, finishedAt: '2026-11-16T19:30:00Z' }, created.entry.id);
    assert.equal(corrected.entry.id, created.entry.id);
    assert.equal(corrected.entry.occurredAt, '2026-11-16T19:30:00.000Z');
    await updateEntryData(client, alice, corrected.before!.id, corrected.before!.data, new Date(corrected.before!.occurredAt));
    assert.deepEqual(readMeals(await store.readEntries(item.id))[0].meal, eveningMeal(created.entry));
    const removed = await store.deleteEntry(item.id, created.entry.id);
    assert.deepEqual(readMeals(await store.readEntries(item.id)), []);
    await restoreEntry(client, alice, removed);
    assert.equal(readMeals(await store.readEntries(item.id)).length, 1);
    await assert.rejects(store.saveMeal(item.id, { ...meal, finishedAt: 'invalid' }), /valid date and time/);
    await assert.rejects(store.saveMeal(item.id, { ...meal, timeZone: 'Invalid/zone' }), /Invalid time zone/);

    const night = await store.saveEvening(item.id, { timeZone: 'Europe/Berlin', lightsOut: '2026-11-17T22:00:00Z', dayRating: 4, sleepiness: 6 }, new Date('2026-11-17T22:00:00Z'));
    assert.equal(sleepNight(night.entry)?.evening?.fullness, undefined, 'an old or skipped answer stays unrecorded');
    assert.equal(fullnessLabel(undefined), null);
    await store.saveMorning(item.id, { timeZone: 'Europe/Berlin', wakeAt: '2026-11-18T07:30:00Z' }, new Date('2026-11-18T07:30:00Z'), night.entry.id);
    const full = await store.saveEvening(item.id, { ...sleepNight(night.entry)!.evening!, fullness: 4 }, new Date(night.entry.occurredAt), night.entry.id);
    assert.equal(fullnessLabel(sleepNight(full.entry)?.evening?.fullness), 'Very full');
    assert.equal(sleepNight(full.entry)?.evening?.dayRating, 4);
    assert.equal(sleepNight(full.entry)?.morning?.wakeAt, '2026-11-18T07:30:00Z');
    const cleared = await store.saveEvening(item.id, { ...sleepNight(full.entry)!.evening!, fullness: undefined }, new Date(night.entry.occurredAt), night.entry.id);
    assert.equal(sleepNight(cleared.entry)?.evening?.fullness, undefined);
    await updateEntryData(client, alice, cleared.before!.id, cleared.before!.data);
    assert.equal(sleepNight((await store.readEntries(item.id)).find(row => row.id === night.entry.id)!)?.evening?.fullness, 4);
    await updateEntryData(client, alice, full.before!.id, full.before!.data);
    assert.equal(sleepNight((await store.readEntries(item.id)).find(row => row.id === night.entry.id)!)?.evening?.fullness, undefined);
    await assert.rejects(store.saveEvening(item.id, { timeZone: 'UTC', fullness: 6 as SleepRating }, new Date()), /fullness level/);
    await assert.rejects(store.saveMeal(item.id, meal, night.entry.id), /not an evening meal/);
    await assert.rejects(store.saveEvening(item.id, { timeZone: 'UTC' }, new Date(), created.entry.id), /not a night/);
    await deleteEntry(client, alice, created.entry.id);
    assert.deepEqual(readMeals(await store.readEntries(item.id)), [], 'undo create removes the meal');

    await as(bob);
    assert.deepEqual(await sleepLogStore(client, bob).readEntries(item.id), []);
    await assert.rejects(sleepLogStore(client, bob).saveMeal(item.id, meal), /row-level security/);
  } finally { await db.close(); }
});
