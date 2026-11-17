import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DocumentationEntry } from '../shared/documentationEntries';
import { addDays, atLocalClock } from '../shared/recurringReferences';
import { DEFAULT_INTAKE_BUTTONS, assignedIntakes, intakeData, intakeNow, intakeTrialAdherence, intakesOnDate, lastTakenToday, methylphenidateOnDate, nightIntakeAdherence, nightTrialIntakes, parseIntakeButtons, readIntakes, sleepIntake } from '../shared/intake';
import { sleepMeasureDays, sleepNormalLevels } from '../shared/sleepHistory';
import { sleepHistoryContext } from '../shared/sleepIntegration';
import { sleepScreenSettings, sleepSettingsSchema, sleepScreenState } from '../shared/sleepScreens';
import type { SleepTrialAssignment } from '../shared/sleepTrial';
import { sleepNight, type SleepNight } from '../shared/sleepLog';

let next = 0;
function entry(occurredAt: string, data: Record<string, unknown>): DocumentationEntry {
  return { id: `entry-${++next}`, ownerId: 'owner', itemId: 'sleep', occurredAt, createdAt: occurredAt, data };
}
const button = (id: string) => DEFAULT_INTAKE_BUTTONS.find(b => b.id === id)!;
for (const zone of ['UTC', 'Europe/Berlin', 'America/New_York', 'Pacific/Auckland']) {
  const at = (date: string, time: string) => atLocalClock(date, `${time}:00`, zone);
  test(`${zone}: a tap creates an independent intake at now, including dose and zone`, () => {
    const now = new Date(at('2026-11-17', '08:12'));
    const intake = intakeNow(button('methylphenidate'), now, zone);
    const row = entry(now.toISOString(), intakeData(intake));
    assert.equal(row.occurredAt, intake.takenAt);
    assert.deepEqual(sleepIntake(row), { substance: 'methylphenidate', label: 'Methylphenidate', dose: 36, unit: 'mg', takenAt: now.toISOString(), timeZone: zone });
    assert.equal(sleepNight(row), null);
    assert.equal(readIntakes([row, entry(row.occurredAt, intakeData(intake))]).length, 2, 'a second tap is a second intake');
  });
  test(`${zone}: last taken today uses the viewed civil day, newest first and shared substance identity`, () => {
    const rows = ['2026-11-16', '2026-11-17'].flatMap(date => ['08:12', '12:30'].map(time => {
      const intake = intakeNow(button('glycine-5'), new Date(at(date, time)), zone);
      return entry(intake.takenAt, intakeData(intake));
    }));
    const intakes = readIntakes(rows.reverse());
    assert.equal(lastTakenToday(intakes, 'glycine', new Date(at('2026-11-17', '14:00')), zone)?.intake.takenAt, new Date(at('2026-11-17', '12:30')).toISOString());
    assert.equal(lastTakenToday(intakes, 'coffee', new Date(at('2026-11-17', '14:00')), zone), null);
    assert.equal(intakesOnDate(intakes, '2026-11-17', zone).length, 2);
    assert.equal(intakesOnDate(intakes, '2026-11-18', zone).length, 0);
  });
  test(`${zone}: trial window includes both endpoints and excludes daytime glycine and next-day intake`, () => {
    const target = at('2026-11-17', '23:00');
    const lights = at('2026-11-18', '00:15');
    const instants = ['12:00', '18:59', '19:00', '22:00'].map(time => at('2026-11-17', time));
    instants.push(lights, at('2026-11-18', '00:16'));
    const intakes = readIntakes(instants.map(taken => {
      const intake = intakeNow(button('glycine-5'), new Date(taken), zone);
      return entry(intake.takenAt, intakeData(intake));
    }));
    assert.deepEqual(nightTrialIntakes(intakes, target, lights).map(i => i.takenAt).sort(), [instants[2], instants[3], lights].map(t => new Date(t).toISOString()).sort());
    const off: SleepTrialAssignment = { version: 1, nightDate: '2026-11-18', factors: [{ factorId: 'glycine', on: false, level: null, schedule: 'nightly', periodIndex: null }] };
    assert.equal(intakeTrialAdherence(off, intakes, target, lights).status, 'deviated');
    assert.equal(intakeTrialAdherence(off, intakes.filter(r => r.intake.takenAt === new Date(instants[0]).toISOString()), target, lights).status, 'as assigned');
  });
  test(`${zone}: old embedded fields remain intakes without rewriting the original`, () => {
    const night: SleepNight = { morning: { wakeAt: at('2026-11-17', '07:30'), timeZone: zone, methylphenidate: { taken: true }, coffee: [{ teaspoons: 2, takenAt: at('2026-11-17', '08:00') }] },
      evening: { lightsOut: at('2026-11-16', '23:00'), timeZone: zone, supplements: [{ supplement: 'glycine', dose: 3, takenAt: at('2026-11-16', '22:00'), timeZone: zone }] } };
    const row = entry(at('2026-11-16', '23:00'), { sleepLog: night });
    const before = JSON.stringify(row);
    const intakes = readIntakes([row]);
    assert.equal(intakes.length, 3);
    assert.equal(intakes.find(r => r.intake.substance === 'methylphenidate')?.timeKnown, false);
    assert.equal(intakes.find(r => r.intake.substance === 'methylphenidate')?.doseKnown, false);
    assert.equal(methylphenidateOnDate(intakes, '2026-11-17', zone), true);
    assert.equal(nightTrialIntakes(intakes, at('2026-11-16', '23:00'), at('2026-11-16', '23:00'))[0].dose, 3);
    assert.equal(JSON.stringify(row), before);
  });
  test(`${zone}: corrections and deletes of old intakes have undo without rewriting nights`, () => {
    const old = entry(at('2026-11-17', '07:00'), { sleepLog: { morning: { timeZone: zone, coffee: [{ teaspoons: 1, takenAt: at('2026-11-17', '08:00') }] } } });
    const legacy = readIntakes([old])[0];
    const corrected = { ...legacy.intake, dose: 2, takenAt: at('2026-11-17', '09:00') };
    const correction = entry(at('2026-11-17', '09:00'), intakeData(corrected, legacy.legacyKey));
    assert.equal(readIntakes([old, correction]).length, 1);
    assert.equal(readIntakes([old, correction])[0].intake.dose, 2);
    const deleted = entry(at('2026-11-17', '10:00'), { kind: 'intakeCorrection', replacesLegacy: legacy.legacyKey });
    assert.equal(readIntakes([old, correction, deleted]).length, 0);
    assert.equal(readIntakes([old, correction])[0].intake.dose, 2, 'undo delete removes the correction marker');
    assert.equal(readIntakes([old])[0].intake.dose, 1, 'undo edit removes the replacement');
  });
  test(`${zone}: medicine classification and history normal levels use new and old intakes, absence means without`, () => {
    const dates = ['2026-11-15', '2026-11-16', '2026-11-17'];
    const nights: SleepNight[] = dates.map(date => ({ morning: { wakeAt: at(date, '07:30'), timeZone: zone, sleepQuality: date.endsWith('16') ? 2 : 4 } }));
    nights[0].morning!.methylphenidate = { taken: true };
    const rows = nights.map(n => entry(n.morning!.wakeAt!, { kind: 'night', sleepLog: n }));
    const taken = intakeNow(button('methylphenidate'), new Date(at('2026-11-17', '08:00')), zone);
    rows.push(entry(taken.takenAt, intakeData(taken)));
    const days = sleepMeasureDays(nights, [], dates[2], 3, sleepHistoryContext(rows, sleepScreenSettings(null)));
    assert.deepEqual(days.map(d => d.medicine), ['with', 'without', 'with']);
    assert.equal(sleepNormalLevels(days, dates[2]).with.sleepQuality, 4);
    assert.equal(sleepNormalLevels(days, dates[2]).without.sleepQuality, 2);
    const reactionOnly = sleepMeasureDays([], [], dates[2], 1, { intakes: readIntakes(rows) });
    assert.equal(reactionOnly[0].medicine, 'with', 'a morning log is not required');
    assert.equal(sleepMeasureDays([], [], addDays(dates[2], 1), 1)[0].medicine, 'without');
  });
}
test('settings preserve button identity, order, hidden state, custom units and sibling settings', () => {
  const settings = sleepScreenSettings({ sleepLog: { settings: { usualDoses: { glycine: 4 }, coffeeTeaspoons: 2 } } });
  assert.equal(settings.intakeButtons.find(b => b.id === 'glycine-3')?.dose, 4);
  assert.equal(settings.intakeButtons.find(b => b.id === 'glycine-5')?.dose, 5);
  const buttons = [...settings.intakeButtons].reverse().map(b => ({ ...b, hidden: true, label: `My ${b.label}`, unit: 'custom' }));
  const schema = sleepSettingsSchema({ custom: true, sleepLog: { settings: { unknown: 42 } } }, { ...settings, intakeButtons: buttons });
  assert.deepEqual(sleepScreenSettings(schema).intakeButtons, buttons);
  assert.equal((schema.sleepLog as { settings: { unknown: number } }).settings.unknown, 42);
  assert.equal(schema.custom, true);
  assert.deepEqual(parseIntakeButtons([]), []);
  assert.equal(parseIntakeButtons([{ ...buttons[0], dose: -1 }]).length, 7);
  assert.throws(() => intakeData({ ...intakeNow(button('coffee'), new Date(), 'UTC'), dose: NaN }));
  assert.throws(() => intakeNow(button('coffee'), new Date(), 'Invalid/zone'));
  assert.equal(sleepIntake(entry(new Date().toISOString(), { kind: 'reactionTest' })), null);
});
test('legacy self-reports still count, but new off-night intake contradicts them', () => {
  const assignment: SleepTrialAssignment = { version: 1, nightDate: '2026-11-17', factors: [{ factorId: 'glycine', on: false, level: null, schedule: 'nightly', periodIndex: null }] };
  const night: SleepNight = { evening: { lightsOut: '2026-11-16T23:00:00Z', trial: { assignment, adherence: 'as assigned', confirmation: 'self-report', targetLightsOutAt: '2026-11-16T23:00:00Z' } } };
  assert.equal(nightIntakeAdherence(night, []), 'as assigned');
  const intake = intakeNow(button('glycine-3'), new Date('2026-11-16T22:00:00Z'), 'UTC');
  assert.equal(nightIntakeAdherence(night, readIntakes([entry(intake.takenAt, intakeData(intake))])), 'deviated');
  night.evening!.trial!.assignment = { ...assignment, factors: [{ ...assignment.factors[0], on: true, level: { id: '3g', dose: 3, unit: 'g' } }] };
  assert.equal(nightIntakeAdherence(night, []), 'as assigned', 'old on confirmations remain valid');
  night.evening!.trial!.intakeLog = true;
  assert.equal(nightIntakeAdherence(night, []), 'deviated', 'new entries are required for new confirmations');
});

test('an assignment recorded before noon keeps its selected night', () => {
  const assignment: SleepTrialAssignment = { version: 1, nightDate: '2026-11-18', factors: [] };
  const row = entry('2026-11-17T09:00:00Z', { kind: 'night', sleepLog: { evening: { timeZone: 'UTC', trial: { assignment, adherence: 'unknown', targetLightsOutAt: '2026-11-17T22:00:00Z', intakeLog: true } } } });
  assert.equal(sleepScreenState([row], new Date('2026-11-17T20:00:00Z'), 'UTC', '2026-11-18').evening?.entry.id, row.id);
});

test('Taken as assigned creates one current-time intake per active factor', () => {
  const assignment: SleepTrialAssignment = { version: 1, nightDate: '2026-11-18', factors: [
    { factorId: 'melatonin', on: true, level: { id: '0.5mg', dose: 0.5, unit: 'mg' }, schedule: 'nightly', periodIndex: null },
    { factorId: 'glycine', on: false, level: null, schedule: 'nightly', periodIndex: null },
    { factorId: 'magnesium', on: true, level: { id: '200mg', dose: 200, unit: 'mg' }, schedule: 'period', periodIndex: 0 },
  ] };
  const now = new Date('2026-11-17T21:00:00Z');
  const intakes = assignedIntakes(assignment, now, 'Europe/Berlin');
  assert.deepEqual(intakes.map(i => [i.substance, i.dose, i.takenAt, i.timeZone]), [
    ['melatonin', 0.5, now.toISOString(), 'Europe/Berlin'], ['magnesium', 200, now.toISOString(), 'Europe/Berlin'],
  ]);
  assert.equal(assignedIntakes({ ...assignment, factors: assignment.factors.map(f => ({ ...f, on: false, level: null })) }, now, 'UTC').length, 0);
});
