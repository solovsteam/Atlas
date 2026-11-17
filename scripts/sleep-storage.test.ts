import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DocumentationEntry } from '../shared/documentationEntries';
import { trackersOf } from '../shared/documentationEntries';
import { morningWithLightsOut, matchingSleepNight, sleepNight } from '../shared/sleepLog';
import { sleepReactionTest } from '../shared/sleepReactionTest';
import { createReactionTestResult } from '../shared/reactionTest';
import { buildInboxEntries, isLibraryItem, searchItems } from '../shared/relevance';
import { routineConfig } from '../shared/timedRoutines';
import { itemFromDbRow, newItemInsert } from '../shared/item';

const entry = (id: string, lightsOut: string, morning?: object): DocumentationEntry => ({
  id, itemId: 'sleep', ownerId: 'alice', occurredAt: lightsOut, createdAt: lightsOut,
  data: { kind: 'night', sleepLog: { evening: { lightsOut }, ...(morning ? { morning } : {}) } },
});
const result = () => ({
  ...createReactionTestResult({ startedAt: '2026-11-16T14:00:00Z', deviceBrowser: 'test phone', previousTestCount: 2, sleepiness: 5,
    events: [{ type: 'response', stimulusAtMs: 1000, reactionTimeMs: 400 }, { type: 'false-start', atMs: 2500 },
      { type: 'miss', stimulusAtMs: 50000, endedAtMs: 60000, reason: 'test-ended' }] }),
  timeZone: 'Europe/Berlin',
});
const testEntry = () => ({ data: { kind: 'reactionTest', reactionTest: result() } });

for (const tz of ['UTC', 'Europe/Berlin', 'America/New_York', 'Asia/Tokyo']) {
  test(`morning picks the latest eligible evening in elapsed time (${tz})`, () => {
    const old = process.env.TZ;
    process.env.TZ = tz;
    try {
      const entries = [entry('older', '2026-11-15T21:00:00Z'), entry('newer', '2026-11-15T23:00:00Z'),
        entry('done', '2026-11-16T01:00:00Z', {}), entry('future', '2026-11-16T12:00:00Z')];
      assert.equal(matchingSleepNight(entries, '2026-11-16T08:00:00Z')?.id, 'newer');
      assert.equal(matchingSleepNight(entries.toReversed(), '2026-11-16T08:00:00Z')?.id, 'newer');
      assert.equal(matchingSleepNight([entry('boundary', '2026-11-15T12:00:00Z')], '2026-11-16T08:00:00Z')?.id, 'boundary');
      assert.equal(matchingSleepNight([entry('old', '2026-11-15T11:59:59.999Z')], '2026-11-16T08:00:00Z'), null);
      assert.equal(matchingSleepNight([], '2026-11-16T08:00:00Z'), null);
      assert.equal(matchingSleepNight([entry('spring', '2026-03-28T22:30:00+01:00')], '2026-03-29T18:00:00+02:00')?.id, 'spring');
      assert.equal(matchingSleepNight([entry('autumn', '2026-10-24T22:30:00+02:00')], '2026-10-25T18:00:00+01:00'), null);
    } finally { if (old === undefined) delete process.env.TZ; else process.env.TZ = old; }
  });
}

test('morning matching ignores tests, malformed evenings, and missing evenings', () => {
  const partial = entry('partial', '2026-11-15T22:00:00Z');
  partial.data = { kind: 'night', sleepLog: { evening: {} } };
  assert.equal(matchingSleepNight([partial], '2026-11-16T07:00:00Z')?.id, 'partial', 'missing lights out uses the evening log time');
  assert.equal(matchingSleepNight([entry('invalid', 'bad'), { ...partial, data: { kind: 'night', sleepLog: { morning: {} } } },
    { ...partial, data: { kind: 'reactionTest', sleepLog: { evening: { lightsOut: partial.occurredAt } } } }], '2026-11-16T07:00:00Z'), null);
  assert.throws(() => matchingSleepNight([], '2026-11-16T07:00'), /valid morning/);
});

test('test entries preserve the measured events, practice flag, device, zone and summaries', () => {
  assert.deepEqual(sleepReactionTest(testEntry()), result());
  const fourth = testEntry();
  fourth.data.reactionTest.practice = false;
  assert.equal(sleepReactionTest(fourth)?.practice, false);
  assert.equal(sleepNight(testEntry()), null);
  assert.deepEqual(sleepNight({ data: { sleepLog: {} } }), {}, 'legacy nights remain readable');
});

test('test parser rejects unrelated and damaged data without inventing a result', () => {
  for (const data of [{}, { kind: 'night', reactionTest: result() }, { kind: 'reactionTest', reactionTest: null }]) {
    assert.equal(sleepReactionTest({ data }), null);
  }
  const patches: Record<string, unknown>[] = [
    { protocolVersion: 'unknown' }, { startedAt: 'yesterday' }, { timeZone: 'invalid' }, { durationMs: 1 },
    { practice: 'yes' }, { sleepiness: 10 }, { deviceBrowser: '' }, { events: [null] },
    { events: [{ type: 'response', stimulusAtMs: 1, reactionTimeMs: -1 }] },
    { events: [{ type: 'response', stimulusAtMs: 1, reactionTimeMs: 30000 }] },
    { events: [{ type: 'false-start', atMs: Number.NaN }] },
    { events: [{ type: 'miss', stimulusAtMs: 5, endedAtMs: 4, reason: 'timeout' }] },
    { reactionTimesMs: [123] }, { summary: { lapses: 0 } },
  ];
  for (const patch of patches) assert.equal(sleepReactionTest({ data: { kind: 'reactionTest', reactionTest: { ...result(), ...patch } } }), null);
});

test('Sleep stays out of trackers, routines, the inbox, library and search', () => {
  const sleep = itemFromDbRow({ ...newItemInsert('alice', 'Sleep'), id: 'sleep', is_documentation: true,
    documentation_schema: { sleepLog: {}, routine: { steps: [] } } });
  const note = { ...sleep, id: 'note', title: 'Sleep notes', documentationSchema: null, isDocumentation: false };
  assert.deepEqual(trackersOf([sleep]), []);
  assert.equal(routineConfig(sleep), null);
  assert.equal(isLibraryItem(sleep), false);
  assert.deepEqual(buildInboxEntries([sleep, note], { now: new Date(), activeTags: [], activeStatusBoosts: [] }), [note]);
  assert.deepEqual(searchItems([sleep, note], 'sleep'), [note]);
});

 test('morning saves recalled lights out while preserving the evening fields', () => {
  const morning = { timeZone: 'Europe/Berlin', wakeAt: '2026-11-17T07:00:00Z' };
  const lightsOut = '2026-11-16T21:15:00Z';
  assert.deepEqual(morningWithLightsOut({}, morning, lightsOut), { morning, evening: { lightsOut, timeZone: morning.timeZone, fromMemory: true } });
  const evening = { alarm: '07:30', dayRating: 4 as const, timeZone: 'UTC' };
  assert.deepEqual(morningWithLightsOut({ evening }, morning, lightsOut).evening, { ...evening, lightsOut, fromMemory: true });
  const recorded = { ...evening, lightsOut: '2026-11-16T22:00:00Z' };
  assert.deepEqual(morningWithLightsOut({ evening: recorded }, morning, lightsOut), { evening: recorded, morning });
  assert.deepEqual(morningWithLightsOut({}, morning), { morning });
});

 test('older three-minute results remain readable', () => {
  const legacy = { ...result(), protocolVersion: 'atlas-pvt-b-v1', durationMs: 180000 };
  assert.deepEqual(sleepReactionTest({ data: { kind: 'reactionTest', reactionTest: legacy } }), legacy);
});
