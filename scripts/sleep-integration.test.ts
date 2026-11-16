import assert from 'node:assert/strict';
import test from 'node:test';
import { addDays, atLocalClock } from '../shared/recurringReferences';
import { sleepTrialDisplay, supplementMode, sleepChoiceCard, previousSleepChoices, sleepHistoryContext, reactionTestCardDue } from '../shared/sleepIntegration';
import { sleepScreenSettings, sleepSettingsSchema } from '../shared/sleepScreens';
import { parseStoredSleepTrial, randomSleepChoice } from '../shared/sleepTrial';
import { sleepMeasureDays } from '../shared/sleepHistory';
import { createReactionTestResult } from '../shared/reactionTest';
import type { DocumentationEntry } from '../shared/documentationEntries';
import type { SleepNight } from '../shared/sleepLog';

const settings = sleepScreenSettings(null);
const trial = { seed: 'fixed-seed', normalLevelStartDate: '2026-11-16' };
test('the normal level lasts exactly fourteen wake dates and assignment survives a settings round trip', () => {
  assert.equal(parseStoredSleepTrial({ seed: '', normalLevelStartDate: '2026-11-16' }), null);
  assert.equal(parseStoredSleepTrial({ seed: 'x', normalLevelStartDate: 'bad' }), null);
  assert.equal(parseStoredSleepTrial({ seed: 'x' }), null);
  const saved = sleepScreenSettings(sleepSettingsSchema(null, { ...settings, trial }));
  assert.deepEqual(saved.trial, trial);
  assert.equal(sleepTrialDisplay(saved.trial, '2026-11-15').phase, 'none');
  for (let day = 0; day < 14; day++) assert.equal(sleepTrialDisplay(saved.trial, addDays('2026-11-16', day)).phase, 'normal-level');
  const last = sleepTrialDisplay(saved.trial, '2026-11-29');
  assert.equal(last.normalEnd, '2026-11-29');
  assert.equal(last.trialStart, '2026-11-30');
  const first = sleepTrialDisplay(saved.trial, '2026-11-30');
  assert.equal(first.phase, 'trial');
  assert.ok(first.assignment);
  assert.deepEqual(first.assignment, sleepTrialDisplay(trial, '2026-11-30').assignment);
  assert.equal(supplementMode({}, sleepTrialDisplay(null, '2026-11-16')), 'manual');
  assert.equal(supplementMode({}, last), 'normal-level');
  assert.equal(supplementMode({}, first), 'assignment');
  assert.equal(supplementMode({ trial: { assignment: first.assignment, adherence: 'as assigned', targetLightsOutAt: '2026-11-29T21:15:00Z' } }, last), 'assignment');
});
for (const zone of ['Europe/Berlin', 'America/New_York', 'Asia/Kolkata', 'UTC']) {
  const at = (date: string, clock: string) => atLocalClock(date, `${clock}:00`, zone);
  test(`choice card boundaries, shortfall and follow-up dates in ${zone}`, () => {
    const card = (clock: string, obligation?: string) => sleepChoiceCard(at('2026-11-16', clock), '2026-11-17', zone, [], settings, obligation);
    assert.equal(card('22:15'), null);
    assert.equal(card('22:44'), null);
    const late = card('23:15')!;
    assert.equal(late.keepShortfall, 60);
    assert.equal(late.extendShortfall, 30);
    assert.equal(late.extensionMinutes, 30);
    assert.deepEqual(late.followUpWindow.dates, ['2026-11-17', '2026-11-18']);
    assert.equal(card('23:15', at('2026-11-17', '09:00')), null);
    assert.equal(sleepChoiceCard(at('2026-11-16', '23:15'), '2026-11-18', zone, [], settings), null);
    const weekend = sleepChoiceCard(at('2026-11-20', '23:15'), '2026-11-21', zone, [], settings)!;
    assert.equal(weekend.extendShortfall, 0);
    assert.equal(weekend.extensionMinutes, 60);
    assert.equal(weekend.followUpWindow.endDate, '2026-11-24');
    assert.equal(sleepChoiceCard(at('2026-11-17', '00:15'), '2026-11-17', zone, [], settings)!.keepShortfall, 120);
    const ordinaryNight: SleepNight = { evening: { lightsOut: at('2026-11-15', '23:15'), timeZone: zone }, morning: { wakeAt: at('2026-11-16', '07:30'), timeZone: zone, fallAsleepMinutes: 15 } };
    assert.equal(sleepChoiceCard(at('2026-11-16', '23:15'), '2026-11-17', zone, [ordinaryNight], settings)!.keepShortfall, 0);
  });
  test(`reaction card opens at test time and resets at local midnight in ${zone}`, () => {
    const result = { ...createReactionTestResult({ startedAt: at('2026-11-16', '15:00'), deviceBrowser: 'fixture', previousTestCount: 0, sleepiness: 4, events: [] }), timeZone: zone };
    assert.equal(reactionTestCardDue(new Date(at('2026-11-16', '14:59')), zone, '15:00', []), false);
    assert.equal(reactionTestCardDue(new Date(at('2026-11-16', '15:00')), zone, '15:00', []), true);
    assert.equal(reactionTestCardDue(new Date(at('2026-11-16', '23:59')), zone, '15:00', []), true);
    assert.equal(reactionTestCardDue(new Date(at('2026-11-17', '00:00')), zone, '15:00', []), false);
    assert.equal(reactionTestCardDue(new Date(at('2026-11-16', '15:01')), zone, '15:00', [result]), false);
    assert.equal(reactionTestCardDue(new Date(at('2026-11-17', '15:00')), zone, '15:00', [result]), true);
    assert.equal(reactionTestCardDue(new Date(at('2026-11-16', '15:00')), zone, '16:00', []), false);
  });
}
test('the previous two calendar nights include own choices, but a missing night breaks the sequence', () => {
  const row = (date: string, outcome: 'keep' | 'extend', random: boolean) => ({
    entry: { id: date, occurredAt: `${addDays(date, -1)}T23:00:00Z` } as DocumentationEntry,
    night: { evening: { timeZone: 'UTC', choice: { wakeDate: date, outcome, random, alarmAt: `${date}T07:30:00Z`, followUpWindow: { startDate: date, endDate: date, dates: [date] } } } } as SleepNight,
  });
  const rows = [row('2026-11-16', 'keep', false), row('2026-11-15', 'keep', true)];
  assert.deepEqual(previousSleepChoices(rows, '2026-11-17'), ['keep', 'keep']);
  assert.equal(randomSleepChoice('seed', '2026-11-17', previousSleepChoices(rows, '2026-11-17')), 'own-choice-only');
  assert.deepEqual(previousSleepChoices(rows.slice(1), '2026-11-17'), [null, 'keep']);
  assert.notEqual(randomSleepChoice('seed', '2026-11-17', previousSleepChoices(rows.slice(1), '2026-11-17')), 'own-choice-only');
});
test('history uses recorded choices and exclusions, including nights with no morning', () => {
  const choice = { wakeDate: '2026-11-21', outcome: 'extend' as const, random: true, alarmAt: '2026-11-21T09:00:00Z', followUpWindow: { startDate: '2026-11-21', endDate: '2026-11-24', dates: ['2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24'] } };
  const entries = [{ occurredAt: '2026-11-20T23:00:00Z', data: { kind: 'night', sleepLog: { evening: { timeZone: 'UTC', choice, earlyObligationAt: '2026-11-21T10:00:00Z' } } } }] as DocumentationEntry[];
  const context = sleepHistoryContext(entries, settings);
  assert.deepEqual(context.choiceWakeDates, ['2026-11-21']);
  assert.equal(context.requiredWakeByDate!['2026-11-21'], '2026-11-21T08:30:00.000Z');
  const days = sleepMeasureDays([], [], '2026-11-25', 6, context);
  assert.deepEqual(days.map(day => day.ordinary), [true, false, false, false, false, true]);
});
