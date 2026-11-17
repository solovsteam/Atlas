import assert from 'node:assert/strict';
import test from 'node:test';
import { dayCount, dayEvidenceData, confirmedDay } from '../shared/dayEvidence';
import { methylphenidateStatus, intakeData, intakeNow, DEFAULT_INTAKE_BUTTONS, readIntakes, nightIntakeAdherence } from '../shared/intake';
import { missingData } from '../shared/missingData';
import { addDays, atLocalClock, civilDate } from '../shared/recurringReferences';
import { targetLightsOut } from '../shared/sleepLog';
import { sleepScreenSettings } from '../shared/sleepScreens';
import { sleepMeasureDays, sleepNormalLevels } from '../shared/sleepHistory';
import { buildHistory, type DocumentationEntry } from '../shared/documentationEntries';
import { createSleepTrialConfig, sleepTrialAssignment } from '../shared/sleepTrial';

let sequence = 0;
const entry = (data: Record<string, unknown>, at = '2026-11-17T12:00:00Z'): DocumentationEntry => ({ id: `e${++sequence}`, itemId: 'sleep', ownerId: 'owner', data, occurredAt: at, createdAt: at });
for (const timeZone of ['Europe/Berlin', 'America/New_York', 'Asia/Kolkata', 'Pacific/Auckland']) {
  const date = '2026-11-17';
  const at = (day: string, clock: string) => atLocalClock(day, `${clock}:00`, timeZone);
  const confirmation = entry(dayEvidenceData('dayConfirmation', { date, timeZone }));
  test(`${timeZone}: unknown is separate from zero and later entries preserve confirmation`, () => {
    assert.equal(dayCount(0, [], date, timeZone), null);
    assert.equal(dayCount(3, [], date, timeZone), null);
    assert.equal(dayCount(0, [confirmation], date, timeZone), 0);
    const intake = entry(intakeData(intakeNow(DEFAULT_INTAKE_BUTTONS[1], new Date(at(date, '23:59')), timeZone)), at(date, '23:59'));
    assert.equal(dayCount(1, [confirmation, intake], date, timeZone), 1);
    assert.equal(confirmedDay([confirmation], addDays(date, -1), timeZone), false);
    assert.equal(methylphenidateStatus([confirmation], date, timeZone), 'unknown');
    assert.equal(dayCount(1, [], date, timeZone), null, 'removing confirmation restores unknown');
  });
  test(`${timeZone}: medicine requires an intake or explicit answer, including old records`, () => {
    const old = (taken: boolean) => entry({ kind: 'night', sleepLog: { morning: { wakeAt: at(date, '07:30'), timeZone, methylphenidate: { taken } } } });
    const no = entry(dayEvidenceData('medicineAnswer', { date, timeZone, answer: 'not-taken' }));
    const unknown = entry(dayEvidenceData('medicineAnswer', { date, timeZone, answer: 'unknown' }));
    const yes = entry(intakeData(intakeNow(DEFAULT_INTAKE_BUTTONS[0], new Date(at(date, '08:00')), timeZone)), at(date, '08:00'));
    assert.equal(methylphenidateStatus([], date, timeZone), 'unknown');
    assert.equal(methylphenidateStatus([no], date, timeZone), 'not-taken');
    assert.equal(methylphenidateStatus([old(false)], date, timeZone), 'not-taken');
    assert.equal(methylphenidateStatus([old(true)], date, timeZone), 'taken');
    assert.equal(methylphenidateStatus([old(false), unknown], date, timeZone), 'unknown', 'correction overrides old negative without rewriting it');
    assert.equal(methylphenidateStatus([yes, no], date, timeZone), 'taken');
    assert.equal(methylphenidateStatus([yes], addDays(date, -1), timeZone), 'unknown');
  });
  test(`${timeZone}: today is listed only when due, and weekends still need a medicine answer`, () => {
    const settings = sleepScreenSettings(null);
    const early = missingData([], new Date(at(date, '06:00')), timeZone, settings);
    assert.equal(early.filter(row => row.date === date).length, 0);
    assert.equal(early.length, 36, 'six previous days, six missing things each');
    const target = targetLightsOut([], addDays(date, 1), timeZone, settings);
    const due = Date.parse(target.lightsOutAt) - settings.eveningReminderLeadMinutes * 60000;
    for (const kind of ['evening', 'confirmation', 'medicine']) {
      assert.ok(!missingData([], new Date(due - 1), timeZone, settings).some(row => row.date === date && row.kind === kind));
      assert.ok(missingData([], new Date(due), timeZone, settings).some(row => row.date === date && row.kind === kind));
    }
    const afternoon = missingData([], new Date(at(date, '15:00')), timeZone, settings).filter(row => row.date === date);
    assert.deepEqual(afternoon.map(row => row.kind), ['morning', 'reactionTest']);
    const night = missingData([], new Date(at(date, '23:59')), timeZone, settings);
    assert.equal(night.length, 42);
    assert.equal(night[0].date, date);
    assert.equal(night.at(-1)!.date, addDays(date, -6));
    assert.match(night.find(row => row.kind === 'morning')!.to, /for=2026-11-17/);
    assert.match(night.find(row => row.kind === 'evening')!.to, /for=2026-11-18/);
    const saturday = '2026-11-21';
    assert.ok(missingData([], new Date(at(saturday, '23:59')), timeZone, settings).some(row => row.date === saturday && row.kind === 'medicine'));
    const confirmed = missingData([confirmation], new Date(at(date, '23:59')), timeZone, settings);
    assert.ok(!confirmed.some(row => row.date === date && row.kind === 'confirmation'));
  });
  test(`${timeZone}: a morning and a partial evening fill only their recorded parts`, () => {
    const settings = sleepScreenSettings(null);
    const rows = [entry({ kind: 'night', sleepLog: { evening: { lightsOut: at(addDays(date, -1), '23:00'), timeZone }, morning: { wakeAt: at(date, '07:00'), timeZone } } }, at(addDays(date, -1), '23:00'))];
    const missing = missingData(rows, new Date(at(date, '07:01')), timeZone, settings);
    assert.ok(!missing.some(row => row.date === date && row.kind === 'morning'));
    assert.ok(!missing.some(row => row.date === addDays(date, -1) && row.kind === 'lights-out'));
    assert.ok(missing.some(row => row.date === addDays(date, -1) && row.kind === 'evening'));
  });
}
test('daylight saving uses civil dates and local reminder times', () => {
  const timeZone = 'Europe/Berlin';
  const settings = sleepScreenSettings(null);
  const date = '2026-03-29';
  const local = (clock: string) => new Date(atLocalClock(date, `${clock}:00`, timeZone));
  assert.equal(missingData([], local('14:59'), timeZone, settings).filter(row => row.date === date && row.kind === 'reactionTest').length, 0);
  assert.equal(missingData([], local('15:00'), timeZone, settings).filter(row => row.date === date && row.kind === 'reactionTest').length, 1);
  const rows = missingData([], local('23:59'), timeZone, settings);
  assert.equal(new Set(rows.map(row => row.date)).size, 7);
  assert.equal(rows.at(-1)!.date, '2026-03-23');
});
test('unknown medicine days do not enter either normal level', () => {
  const nights = [true, false, undefined].map((taken, i) => ({ morning: { timeZone: 'UTC', wakeAt: `2026-11-${15 + i}T08:00:00Z`, sleepQuality: (i + 1) as 1 | 2 | 3, methylphenidate: taken === undefined ? undefined : { taken } } }));
  const days = sleepMeasureDays(nights, [], '2026-11-17', 3);
  assert.deepEqual(days.map(day => day.medicine), ['with', 'without', 'unknown']);
  const levels = sleepNormalLevels(days, '2026-11-17');
  assert.equal(levels.with.sleepQuality, 1);
  assert.equal(levels.without.sleepQuality, 2);
});
test('tracker averages exclude unconfirmed days even when entries exist', () => {
  const now = new Date(2026, 10, 17, 23);
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const date = civilDate(now, zone);
  const confirmedDates = [addDays(date, -2), date];
  const entries = [entry({}, new Date(2026, 10, 15, 12).toISOString()), ...Array.from({ length: 9 }, () => entry({}, new Date(2026, 10, 16, 12).toISOString()))];
  const result = buildHistory(entries, { now, range: '30d', trackerCreatedAt: new Date(2026, 10, 15).toISOString(), confirmedDates });
  assert.deepEqual(result.buckets.slice(-3).map(row => row.count), [1, null, 0]);
  assert.equal(result.total, 1);
  assert.equal(result.perDay, 0.5);
  assert.equal(result.buckets.at(-1)!.average, 0.5);
});
test('trial absence stays unknown until the day is confirmed', () => {
  const assignment = sleepTrialAssignment(createSleepTrialConfig('2026-10-01'), 'test', '2026-11-17')!;
  const off = { ...assignment, factors: assignment.factors.map(factor => ({ ...factor, on: false, level: null })) };
  const night = { evening: { lightsOut: '2026-11-16T23:00:00Z', timeZone: 'UTC', trial: { assignment: off, targetLightsOutAt: '2026-11-16T22:00:00Z', adherence: 'as assigned' as const, intakeLog: true } } };
  assert.equal(nightIntakeAdherence(night, []), 'unknown');
  const confirmation = entry(dayEvidenceData('dayConfirmation', { date: '2026-11-16', timeZone: 'UTC' }));
  assert.equal(nightIntakeAdherence(night, readIntakes([]), [confirmation]), 'as assigned');
});

test('a trial window across midnight requires both dates to be confirmed', () => {
  const assignment = sleepTrialAssignment(createSleepTrialConfig('2026-10-01'), 'test', '2026-11-17')!;
  const off = { ...assignment, factors: assignment.factors.map(factor => ({ ...factor, on: false, level: null })) };
  const night = { evening: { lightsOut: '2026-11-17T00:30:00Z', timeZone: 'UTC', trial: { assignment: off, targetLightsOutAt: '2026-11-16T22:00:00Z', adherence: 'as assigned' as const, intakeLog: true } } };
  const confirmations = ['2026-11-16', '2026-11-17'].map(date => entry(dayEvidenceData('dayConfirmation', { date, timeZone: 'UTC' })));
  assert.equal(nightIntakeAdherence(night, [], confirmations.slice(0, 1)), 'unknown');
  assert.equal(nightIntakeAdherence(night, [], confirmations), 'as assigned');
});
