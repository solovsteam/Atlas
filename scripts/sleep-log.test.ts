import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isTracker, type DocumentationEntry } from '../shared/documentationEntries';
import type { Item } from '../shared/item';
import { addDays, atLocalClock, dateInput } from '../shared/recurringReferences';
import {
  DEFAULT_SLEEP_SETTINGS,
  choiceNight,
  earlyWake,
  estimatedSleep,
  followUpWindow,
  isComparableNight,
  isSleepLog,
  median,
  ordinaryDay,
  parseSleepSettings,
  requiredWakeTime,
  shift,
  shortfall,
  sleepNight,
  sleepNightDate,
  sleepSettings,
  sleepTags,
  targetLightsOut,
  timeInBed,
  usualSleep,
  type SleepNight,
} from '../shared/sleepLog';

const berlin = 'Europe/Berlin';
const local = (date: string, clock: string, timeZone = berlin) => atLocalClock(date, `${clock}:00`, timeZone);
const night = (wakeDate = '2026-11-16', overrides: Partial<NonNullable<SleepNight['morning']>> = {}): SleepNight => ({
  evening: {
    lightsOut: local(addDays(wakeDate, -1), '22:15'), timeZone: berlin,
    alarm: '07:30', dayRating: 4, tags: [], sleepiness: 7, hardNight: false,
  },
  morning: {
    wakeAt: local(wakeDate, '07:30'), timeZone: berlin,
    wokeBy: 'alarm', fallAsleepMinutes: 15, awakeDuringNight: 'none', sleepQuality: 4,
    ...overrides,
  },
});
const marked = (documentationSchema: unknown) => ({
  isDocumentation: true, isTask: false, isInterval: false, recurrenceRule: null,
  generatedFromId: '', documentationSchema,
}) as Item;

test('a normal night has nine hours of sleep, after fifteen minutes to fall asleep', () => {
  const normal = night();
  assert.equal(timeInBed(normal), 555);
  assert.equal(estimatedSleep(normal), 540);
  assert.equal(sleepNightDate(normal), '2026-11-16');
  assert.equal(usualSleep([normal], '2026-11-16'), 540);
  assert.equal(shortfall(estimatedSleep(normal), 540), 0);
  assert.equal(shift(normal), 0);
  assert.equal(earlyWake(normal), false);
  assert.equal(ordinaryDay('2026-11-16', sleepTags(normal), []), true);
});

test('spring and autumn nights use elapsed duration across daylight saving changes', () => {
  // The clocks go forward in spring and back in autumn, while the clock span stays 9h15.
  assert.equal(timeInBed(night('2026-03-29')), 495);
  assert.equal(estimatedSleep(night('2026-03-29')), 480);
  assert.equal(timeInBed(night('2026-10-25')), 615);
  assert.equal(estimatedSleep(night('2026-10-25')), 600);
  assert.equal(sleepNightDate(night('2026-03-29')), '2026-03-29');
  assert.equal(shift(night('2026-03-29')), 0);
  const first: SleepNight = {
    evening: { lightsOut: '2026-10-25T00:30:00Z', timeZone: berlin },
    morning: { wakeAt: '2026-10-25T01:30:00Z', timeZone: berlin },
  };
  assert.equal(timeInBed(first), 60, 'both clocks read 02:30, but an hour has passed');
});

test('night dates use the wake zone, even across UTC midnight and the international date line', () => {
  const tokyo: SleepNight = { morning: { wakeAt: '2026-11-15T22:30:00Z', timeZone: 'Asia/Tokyo' } };
  assert.equal(sleepNightDate(tokyo), '2026-11-16');
  assert.equal(sleepNightDate({ morning: { wakeAt: '2026-11-16T06:00:00Z', timeZone: 'America/Los_Angeles' } }), '2026-11-15');
  assert.equal(sleepNightDate({ morning: { wakeAt: '2026-11-16T07:30:00', timeZone: berlin } }), null, 'unqualified clocks cannot use the host zone');
  assert.equal(sleepNightDate({ morning: { wakeAt: local('2026-11-16', '07:30') } }), null);
  assert.equal(sleepNightDate({ morning: { wakeAt: 'bad', timeZone: berlin } }), null);
  assert.equal(sleepNightDate({ morning: { wakeAt: local('2026-11-16', '07:30'), timeZone: 'bad' } }), null);
});

test('a missing evening leaves sleep duration unknown but preserves the morning measures', () => {
  const morning: SleepNight = { morning: night().morning };
  assert.equal(timeInBed(morning), null);
  assert.equal(estimatedSleep(morning), null);
  assert.equal(sleepNightDate(morning), '2026-11-16');
  assert.equal(shift(morning), 0);
  assert.equal(earlyWake(morning), false);
  assert.equal(shortfall(estimatedSleep(morning), 540), null);
  assert.equal(usualSleep([morning], '2026-11-16'), null);
});

test('a missing morning leaves sleep, shift, early wake and the night date unknown', () => {
  const evening: SleepNight = { evening: night().evening };
  assert.equal(timeInBed(evening), null);
  assert.equal(estimatedSleep(evening), null);
  assert.equal(sleepNightDate(evening), null);
  assert.equal(shift(evening), null);
  assert.equal(earlyWake(evening), null);
  assert.equal(estimatedSleep({}), null);
  assert.equal(choiceNight(undefined, '2026-11-16', berlin, null), null);
  assert.equal(shortfall(400, null), null);
});

test('spontaneous early wake is separate from shift and an early alarm', () => {
  const early = night('2026-11-16', { wakeAt: local('2026-11-16', '06:45'), wokeBy: 'self' });
  assert.equal(earlyWake(early), true);
  assert.equal(shift(early), 0);
  assert.equal(shortfall(estimatedSleep(early), 540), 45);
  assert.equal(earlyWake({ ...early, morning: { ...early.morning, wokeBy: 'alarm' } }), false);
  assert.equal(earlyWake({ ...early, morning: { ...early.morning, wokeBy: undefined } }), null);
  const late = night('2026-11-16', { wakeAt: local('2026-11-16', '08:10'), wokeBy: 'self' });
  assert.equal(earlyWake(late), false);
  assert.equal(shift(late), 40);
  assert.equal(shortfall(estimatedSleep(late), 540), 0);
});

test('sleep onset uses minutes, night waking uses settings, and estimates never go negative', () => {
  assert.equal(estimatedSleep(night('2026-11-16', { fallAsleepMinutes: 23, awakeDuringNight: 'short' })), 522);
  assert.equal(estimatedSleep(night('2026-11-16', { awakeDuringNight: 'over30' })), 495);
  const defaults = night('2026-11-16', { fallAsleepMinutes: undefined, awakeDuringNight: undefined });
  assert.equal(estimatedSleep(defaults), 540);
  assert.equal(defaults.morning?.fallAsleepMinutes, undefined, 'derivation does not fill the stored record');
  assert.equal(estimatedSleep(night('2026-11-16', { fallAsleepMinutes: 800 })), 0);
  assert.equal(timeInBed(night('2026-11-16', { wakeAt: local('2026-11-15', '10:00') })), null);
  const custom = parseSleepSettings({ defaultFallAsleepMinutes: 20, awakeMinutes: { short: 25 } });
  assert.equal(estimatedSleep({ evening: night().evening, morning: { ...defaults.morning, awakeDuringNight: 'short' } }, custom), 510);
});

test('settings parse bad data field by field and return independent defaults', () => {
  for (const bad of [undefined, null, [], 'settings', 4]) assert.deepEqual(parseSleepSettings(bad), DEFAULT_SLEEP_SETTINGS);
  assert.deepEqual(parseSleepSettings({
    anchorWake: '24:00', sleepMinutes: 0, defaultFallAsleepMinutes: -1,
    awakeMinutes: { none: NaN, short: '10', over30: Infinity }, testTime: '3pm',
    preparationMinutes: Infinity, eveningReminderLeadMinutes: -30,
  }), DEFAULT_SLEEP_SETTINGS);
  const changed = parseSleepSettings({
    anchorWake: '08:05', sleepMinutes: 500, defaultFallAsleepMinutes: 12,
    awakeMinutes: { short: 7 }, testTime: '14:45', preparationMinutes: 60, eveningReminderLeadMinutes: 0,
  });
  assert.deepEqual(changed, {
    anchorWake: '08:05', sleepMinutes: 500, defaultFallAsleepMinutes: 12,
    awakeMinutes: { none: 0, short: 7, over30: 45 }, testTime: '14:45', preparationMinutes: 60, eveningReminderLeadMinutes: 0,
  });
  changed.awakeMinutes.short = 99;
  assert.equal(parseSleepSettings(null).awakeMinutes.short, 10);
});

test('the sleep marker excludes the item from trackers, even when settings are malformed', () => {
  for (const config of [{ sleepLog: {} }, { sleepLog: { settings: {} } }, { sleepLog: null }]) {
    assert.equal(isSleepLog(marked(config)), true);
    assert.equal(isTracker(marked(config)), false);
    assert.deepEqual(sleepSettings(marked(config)), DEFAULT_SLEEP_SETTINGS);
  }
  assert.equal(isSleepLog(marked(null)), false);
  assert.equal(isSleepLog(marked([])), false);
  assert.equal(isTracker(marked({ tracker: {} })), true);
  assert.equal(isTracker(marked({ routine: { steps: [] } })), false);
  assert.equal(sleepSettings(marked({ sleepLog: { settings: { anchorWake: '08:00' } } })).anchorWake, '08:00');
});

test('night records round trip optional evening, morning and medicine fields through entry data', () => {
  const value: SleepNight = {
    evening: { alarm: 'none', fromMemory: true, timeZone: berlin, sleepiness: 9, hardNight: true, lateReasons: ['work'] },
    morning: {
      methylphenidate: { taken: true, takenAt: local('2026-11-16', '08:00'), timeZone: berlin },
      coffee: [{ takenAt: local('2026-11-16', '08:30'), teaspoons: 1, timeZone: berlin }],
      fromMemory: false,
    },
  };
  const entry = { data: JSON.parse(JSON.stringify({ sleepLog: value })) } as DocumentationEntry;
  assert.deepEqual(sleepNight(entry), value);
  assert.deepEqual(sleepNight({ data: { sleepLog: {} } }), {});
  assert.equal(sleepNight({ data: { reactionTest: {} } }), null);
  assert.equal(sleepNight({ data: { sleepLog: [] } }), null);
  assert.deepEqual(sleepNight({ data: { sleepLog: { morning: [] } } }), {});
  const skipped: SleepNight = { morning: { methylphenidate: { taken: false }, coffee: [] } };
  assert.deepEqual(sleepNight({ data: { sleepLog: skipped } }), skipped);
});

test('usual sleep is the median of the latest 28 usable logged nights, with gaps and no future data', () => {
  const history = Array.from({ length: 30 }, (_, index) =>
    night(addDays('2026-08-01', index * 2), { fallAsleepMinutes: index + 1 }));
  const future = night('2026-12-01', { fallAsleepMinutes: 300 });
  assert.equal(usualSleep([...history.toReversed(), future], '2026-11-16'), 538.5);
  assert.equal(median([9, 2, 4, 1]), 3);
  assert.equal(median([]), null);
  assert.equal(median([NaN, 1, Infinity]), 1);
  assert.equal(usualSleep([], '2026-11-16'), null);
});

test('sick and travel nights stay visible but do not affect comparison medians', () => {
  const healthy = night('2026-11-13');
  const sick = night('2026-11-14', { fallAsleepMinutes: 200, tags: [' Sick '] });
  const travel: SleepNight = {
    evening: { ...night('2026-11-15').evening, timeZone: 'America/New_York' },
    morning: { ...night('2026-11-15').morning, fallAsleepMinutes: 100 },
  };
  assert.equal(isComparableNight(sick), false);
  assert.deepEqual(sleepTags(travel), ['travel']);
  assert.equal(isComparableNight(travel), false);
  assert.equal(usualSleep([healthy, sick, travel], '2026-11-16'), 540);
  assert.equal(isComparableNight({ evening: { timeZone: 'US/Eastern' }, morning: { timeZone: 'America/New_York' } }), true);
});

test('a weekday choice night extends only until the required wake time', () => {
  const required = requiredWakeTime(local('2026-11-16', '09:30'));
  assert.equal(required, local('2026-11-16', '08:00'));
  const choice = choiceNight(local('2026-11-15', '23:45'), '2026-11-16', berlin, required)!;
  assert.equal(choice.isChoiceNight, true);
  assert.equal(choice.fullSleepWakeAt, local('2026-11-16', '09:00'));
  assert.equal(choice.extendWakeAt, required);
  assert.equal(choice.extensionMinutes, 30);
  assert.equal(choiceNight(local('2026-11-15', '23:45'), '2026-11-16', berlin, local('2026-11-16', '07:59'))?.isChoiceNight, false);
  assert.equal(choiceNight(local('2026-11-15', '23:45'), '2026-11-16', berlin, local('2026-11-16', '07:00'))?.isChoiceNight, false);
  assert.equal(choiceNight(local('2026-11-15', '23:45'), '2026-11-16', berlin, 'invalid'), null);
});

test('a weekend choice night can extend to the full sleep window', () => {
  const choice = choiceNight(local('2026-11-13', '23:45'), '2026-11-14', berlin, null)!;
  assert.equal(choice.isChoiceNight, true);
  assert.equal(choice.extendWakeAt, local('2026-11-14', '09:00'));
  assert.equal(choice.extensionMinutes, 90);
  assert.equal(choiceNight(local('2026-11-13', '22:15'), '2026-11-14', berlin, null)?.isChoiceNight, false);
  assert.equal(choiceNight(local('2026-11-13', '22:30'), '2026-11-14', berlin, null)?.isChoiceNight, false, 'Extend must offer at least 30 actual minutes');
  assert.equal(choiceNight(local('2026-11-13', '22:45'), '2026-11-14', berlin, null)?.isChoiceNight, true);
});

test('required wake subtracts preparation as elapsed time, including across DST', () => {
  assert.equal(requiredWakeTime(null), null);
  assert.equal(requiredWakeTime('bad'), null);
  assert.equal(requiredWakeTime(local('2026-11-16', '00:45')), local('2026-11-15', '23:15'));
  assert.equal(requiredWakeTime('2026-03-29T03:30:00+02:00'), '2026-03-29T00:00:00.000Z');
  assert.equal(requiredWakeTime(local('2026-11-16', '09:30'), parseSleepSettings({ preparationMinutes: 60 })), local('2026-11-16', '08:30'));
});

test('follow-up crosses a weekend and includes the second required wake day', () => {
  const weekday = (date: string) => ![0, 6].includes(dateInput(date).weekday);
  const friday = followUpWindow('2026-11-13', weekday);
  assert.deepEqual(friday, {
    startDate: '2026-11-14', endDate: '2026-11-17',
    dates: ['2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17'],
  });
  assert.deepEqual(followUpWindow('2026-11-13', ['2026-11-16', '2026-11-17']), friday);
  assert.deepEqual(followUpWindow('2026-11-12', weekday).dates, ['2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16']);
  assert.deepEqual(followUpWindow('2026-10-23', weekday).dates, ['2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27']);
});

test('ordinary days exclude every follow-up window, sick days and travel days', () => {
  const windows = [followUpWindow('2026-11-13', ['2026-11-16', '2026-11-17']), followUpWindow('2026-11-17', ['2026-11-18', '2026-11-19'])];
  assert.equal(ordinaryDay('2026-11-13', [], windows), true);
  for (let day = 14; day <= 19; day += 1) assert.equal(ordinaryDay(`2026-11-${day}`, [], windows), false);
  assert.equal(ordinaryDay('2026-11-20', [], windows), true);
  assert.equal(ordinaryDay('2026-11-20', ['Sick'], windows), false);
  assert.equal(ordinaryDay('2026-11-20', ['travel'], windows), false);
  assert.equal(ordinaryDay('2026-11-20', ['late caffeine'], windows), true);
  const unknownEnd = followUpWindow('2026-11-13', [], 7);
  assert.equal(unknownEnd.endDate, null);
  assert.equal(unknownEnd.dates.length, 7);
  assert.equal(ordinaryDay('2026-12-01', [], [unknownEnd]), false, 'do not invent an end when the schedule horizon is insufficient');
  assert.throws(() => followUpWindow('2026-11-13', [], 0));
});

test('target lights out uses fewer than 28 nights and rounds the median onset to five minutes', () => {
  const history = [night('2026-11-13', { fallAsleepMinutes: 13 }), night('2026-11-15', { fallAsleepMinutes: 24 })];
  assert.deepEqual(targetLightsOut(history, '2026-11-16', berlin), {
    recalculatedOn: '2026-11-16', usualFallAsleepMinutes: 20, windowMinutes: 560,
    lightsOut: '22:10', lightsOutAt: local('2026-11-15', '22:10'), dayOffset: -1,
  });
  assert.equal(targetLightsOut([], '2026-11-16', berlin).lightsOut, '22:15');
  assert.equal(targetLightsOut([], '2026-11-16', berlin).windowMinutes, 555);
});

test('the onset estimate stays fixed through Sunday and recalculates on Monday', () => {
  const history = [night('2026-11-15', { fallAsleepMinutes: 10 }), night('2026-11-17', { fallAsleepMinutes: 50 }), night('2026-11-18', { fallAsleepMinutes: 60 })];
  assert.equal(targetLightsOut(history, '2026-11-16', berlin).usualFallAsleepMinutes, 10);
  assert.equal(targetLightsOut(history, '2026-11-22', berlin).usualFallAsleepMinutes, 10);
  assert.equal(targetLightsOut(history, '2026-11-23', berlin).usualFallAsleepMinutes, 50);
  const onsetOnly: SleepNight = { morning: { wakeAt: local('2026-11-15', '07:30'), timeZone: berlin, fallAsleepMinutes: 35 } };
  assert.equal(targetLightsOut([onsetOnly], '2026-11-16', berlin).usualFallAsleepMinutes, 35);
  assert.equal(usualSleep([onsetOnly], '2026-11-16'), null);
});

test('targets preserve nine hours of sleep across DST and choices use the same elapsed window', () => {
  for (const [date, clock] of [['2026-03-29', '21:15'], ['2026-10-25', '23:15']] as const) {
    const target = targetLightsOut([], date, berlin);
    assert.equal(target.lightsOut, clock);
    assert.equal((Date.parse(local(date, '07:30')) - Date.parse(target.lightsOutAt)) / 60000, 555);
    assert.equal(choiceNight(target.lightsOutAt, date, berlin, null)?.isChoiceNight, false);
    const late = new Date(Date.parse(target.lightsOutAt) + 60 * 60000).toISOString();
    assert.equal(choiceNight(late, date, berlin, null)?.extensionMinutes, 60);
  }
});

test('the target uses only the latest 28 comparable onset observations', () => {
  const history = Array.from({ length: 30 }, (_, i) => night(addDays('2026-09-01', i), { fallAsleepMinutes: i < 2 ? 800 : i * 5 }));
  history.push(night('2026-11-15', { fallAsleepMinutes: 900, tags: ['sick'] }));
  assert.equal(targetLightsOut(history, '2026-11-16', berlin).usualFallAsleepMinutes, 80);
});
