import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { addDays, atLocalClock } from '../shared/recurringReferences';
import { DEFAULT_SLEEP_SETTINGS, type SleepNight } from '../shared/sleepLog';
import { createReactionTestResult } from '../shared/reactionTest';
import type { SleepReactionTest } from '../shared/sleepReactionTest';
import {
  clockString, historyDates, nightHistoryRows, sleepClockMinutes, sleepMeasureDays,
  sleepNormalLevels, sleepRegularity, sleepSpread, sleepWindowTest,
} from '../shared/sleepHistory';

const zone = 'Europe/Berlin';
const local = (date: string, clock: string) => atLocalClock(date, `${clock}:00`, zone);
function night(date: string, wake = '07:30', lights = '22:15', taken?: boolean): SleepNight {
  return {
    evening: { lightsOut: local(lights < '12:00' ? date : addDays(date, -1), lights), timeZone: zone, dayRating: 4 },
    morning: { wakeAt: local(date, wake), timeZone: zone, wokeBy: 'alarm', fallAsleepMinutes: 15,
      sleepQuality: 4, methylphenidate: taken === undefined ? undefined : { taken } },
  };
}
function reaction(date: string, lapses = 1, sleepiness: SleepReactionTest['sleepiness'] = 3, practice = false, clock = '15:00'): SleepReactionTest {
  return { ...createReactionTestResult({ startedAt: local(date, clock), deviceBrowser: 'Invented fixture',
    previousTestCount: practice ? 0 : 3, sleepiness,
    events: Array.from({ length: lapses }, (_, index) => ({ type: 'response', stimulusAtMs: index * 2000, reactionTimeMs: 400 })),
  }), timeZone: zone };
}

if (!process.env.SLEEP_HISTORY_TZ_CHILD) {
  for (const timeZone of ['Europe/Berlin', 'America/Los_Angeles', 'Asia/Tokyo']) {
    test(`sleep history calculations in ${timeZone}`, () => {
      const env = { ...process.env, TZ: timeZone, SLEEP_HISTORY_TZ_CHILD: '1' };
      // Node suppresses nested test runners unless this inherited marker is removed.
      delete env.NODE_TEST_CONTEXT;
      const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', fileURLToPath(import.meta.url)], {
        env, encoding: 'utf8', timeout: 30000,
      });
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
      assert.match(result.stdout, /tests 13/, 'Every calculation test must actually run in the child process.');
    });
  }
} else {
  test('night rows preserve all requested derived values without mutating records', () => {
    const value = night('2026-11-16', '06:45');
    value.morning!.wokeBy = 'self';
    value.evening!.tags = [' Nap '];
    value.morning!.tags = ['nap', 'sick'];
    const copy = structuredClone(value);
    const row = nightHistoryRows([value])[0];
    assert.equal(row.date, '2026-11-16');
    assert.equal(row.lightsOut, 1335);
    assert.equal(row.wake, 405);
    assert.equal(row.timeInBed, 510);
    assert.equal(row.estimatedSleep, 495);
    assert.equal(row.earlyWake, true);
    assert.equal(row.minutesEarly, 45);
    assert.equal(row.shift, 0);
    assert.equal(row.choiceNight, false);
    assert.equal(row.targetLightsOut, 1335);
    assert.deepEqual(row.tags, ['nap', 'sick']);
    assert.deepEqual(value, copy);
  });

  test('clock spread unwraps midnight before computing population deviation and interpolated IQR', () => {
    assert.deepEqual(sleepSpread([1430, 10], true), { count: 2, standardDeviationMinutes: 10, interquartileRangeMinutes: 10 });
    assert.deepEqual(sleepSpread([0, 1430, 10], true), { count: 3, standardDeviationMinutes: Math.sqrt(200 / 3), interquartileRangeMinutes: 10 });
    assert.equal(sleepSpread([1439, 1, 2], true).interquartileRangeMinutes, 1.5);
    assert.deepEqual(sleepSpread([10, 20, 30, 40]), { count: 4, standardDeviationMinutes: Math.sqrt(125), interquartileRangeMinutes: 15 });
    assert.equal(clockString(1445), '00:05');
    assert.equal(clockString(-10), '23:50');
  });

  test('regularity uses calendar days including both boundaries, excluding future and old nights', () => {
    const rows = nightHistoryRows([night('2026-11-09', '11:00'), night('2026-11-10'), night('2026-11-16', '08:30'), night('2026-11-17', '12:00')]);
    const seven = sleepRegularity(rows, '2026-11-16', 7);
    assert.equal(seven.wake.count, 2);
    assert.equal(seven.wake.standardDeviationMinutes, 30);
    assert.equal(seven.wake.interquartileRangeMinutes, 30);
    assert.equal(seven.lightsOut.standardDeviationMinutes, 0);
    assert.equal(sleepRegularity(rows, '2026-11-16', 28).wake.count, 3);
    assert.deepEqual(historyDates('2026-11-02', 3), ['2026-10-31', '2026-11-01', '2026-11-02']);
    assert.throws(() => historyDates('2026-11-02', 0));
  });

  test('regularity across 23:50 and 00:10 lights out has a twenty minute range', () => {
    const rows = nightHistoryRows([night('2026-11-15', '07:30', '23:50'), night('2026-11-16', '07:30', '00:10')]);
    const result = sleepRegularity(rows, '2026-11-16', 7);
    assert.equal(result.lightsOut.standardDeviationMinutes, 10);
    assert.equal(result.lightsOut.interquartileRangeMinutes, 10);
    assert.equal(result.estimatedSleep.standardDeviationMinutes, 10);
  });

  test('missing logs and fewer than seven nights stay unknown rather than becoming zero', () => {
    const value = night('2026-11-16');
    const rows = nightHistoryRows([{ evening: value.evening }, { morning: value.morning }, {}]);
    assert.equal(rows[0].date, '2026-11-16');
    assert.equal(rows[0].estimatedSleep, null);
    assert.equal(rows[1].date, null);
    assert.equal(rows[1].wake, null);
    const result = sleepRegularity(rows, '2026-11-16', 7);
    assert.equal(result.wake.count, 1);
    assert.equal(result.wake.standardDeviationMinutes, null);
    assert.equal(result.estimatedSleep.count, 0);
    assert.equal(result.estimatedSleep.interquartileRangeMinutes, null);
    assert.equal(sleepClockMinutes('bad', zone), null);
    assert.equal(sleepClockMinutes('2026-11-16T07:30:00', zone), null);
    assert.equal(sleepClockMinutes(local('2026-11-16', '07:30'), 'bad'), null);
    assert.equal(sleepSpread([NaN, Infinity]).count, 0);
  });

  test('window test counts only mornings with a known cause and uses early wakes for the median', () => {
    const first = night('2026-11-13', '07:00'); first.morning!.wokeBy = 'self';
    const second = night('2026-11-14', '06:30'); second.morning!.wokeBy = 'self';
    const alarm = night('2026-11-15', '06:30');
    const unknown = night('2026-11-16', '06:30'); unknown.morning!.wokeBy = undefined;
    const result = sleepWindowTest(nightHistoryRows([first, second, alarm, unknown, {}]), '2026-11-16');
    assert.deepEqual(result, { days: 28, recordedMornings: 3, earlyWakes: 2, share: 2 / 3, medianMinutesEarly: 45 });
    assert.equal(sleepWindowTest([], '2026-11-16').share, null);
    assert.equal(sleepWindowTest(nightHistoryRows([alarm]), '2026-11-16').medianMinutesEarly, null);
  });

  test('night choices accept wake obligations and recorded choice context', () => {
    const value = night('2026-11-16', '09:00', '23:45');
    assert.equal(nightHistoryRows([value])[0].choiceNight, true);
    assert.equal(nightHistoryRows([value], DEFAULT_SLEEP_SETTINGS, { requiredWakeByDate: { '2026-11-16': local('2026-11-16', '07:45') } })[0].choiceNight, false);
    assert.equal(nightHistoryRows([value], DEFAULT_SLEEP_SETTINGS, { choiceWakeDates: [] })[0].choiceNight, false);
    assert.equal(nightHistoryRows([value])[0].shift, 90);
  });

  test('durations use elapsed time across DST while regularity uses recorded local clocks', () => {
    const rows = nightHistoryRows([night('2026-03-28'), night('2026-03-29')]);
    assert.equal(rows[1].timeInBed, 495);
    assert.equal(rows[1].estimatedSleep, 480);
    assert.equal(sleepRegularity(rows, '2026-03-29', 7).wake.standardDeviationMinutes, 0);
    assert.equal(sleepRegularity(rows, '2026-03-29', 7).estimatedSleep.standardDeviationMinutes, 30);
  });

  test('four measures retain missing data and attach evening ratings to the evening date', () => {
    const value = night('2026-11-16', '07:30', '22:15', true);
    const days = sleepMeasureDays([value], [reaction('2026-11-16', 0, 2)], '2026-11-16', 3);
    assert.equal(days[0].lapses, null);
    assert.equal(days[0].sleepQuality, null);
    assert.equal(days[1].dayRating, 4);
    assert.equal(days[2].dayRating, null);
    assert.equal(days[2].lapses, 0);
    assert.equal(days[2].sleepiness, 2);
    assert.equal(days[2].sleepQuality, 4);
    assert.equal(days[2].fallAsleepMinutes, 15);
    assert.equal(days[2].medicine, 'with');
  });

  test('normal levels are separate medians for each medicine group, not weekday guesses', () => {
    const nights = [night('2026-11-13', '07:30', '22:15', true), night('2026-11-14', '07:30', '22:15', false), night('2026-11-15', '07:30', '22:15', true), night('2026-11-16')];
    nights[0].morning!.fallAsleepMinutes = 10;
    nights[1].morning!.fallAsleepMinutes = 40;
    nights[2].morning!.fallAsleepMinutes = 20;
    const days = sleepMeasureDays(nights, [reaction('2026-11-13', 1, 2), reaction('2026-11-14', 7, 8), reaction('2026-11-15', 3, 4), reaction('2026-11-16', 100, 9)], '2026-11-16');
    const levels = sleepNormalLevels(days, '2026-11-16');
    assert.equal(levels.with.lapses, 2);
    assert.equal(levels.with.sleepiness, 3);
    assert.equal(levels.with.fallAsleepMinutes, 15);
    assert.equal(levels.without.lapses, 7);
    assert.equal(levels.without.sleepiness, 8);
    assert.equal(levels.without.fallAsleepMinutes, 40);
    assert.equal(levels.with.counts.lapses, 2);
    assert.equal(levels.without.counts.lapses, 1);
    assert.equal(days.at(-1)!.medicine, 'unknown');
  });

  test('ordinaryDay excludes sickness, travel and supplied follow-up windows from normal levels', () => {
    const nights = ['13', '14', '15', '16'].map(day => night(`2026-11-${day}`, '07:30', '22:15', true));
    nights[0].morning!.tags = ['Sick'];
    nights[1].morning!.tags = ['travel'];
    const context = { followUpWindows: [{ startDate: '2026-11-15', endDate: '2026-11-15', dates: ['2026-11-15'] }] };
    const days = sleepMeasureDays(nights, ['13', '14', '15', '16'].map((day, i) => reaction(`2026-11-${day}`, i + 1)), '2026-11-16', 28, context);
    assert.equal(days.filter(day => !day.ordinary).length, 3);
    assert.equal(sleepNormalLevels(days, '2026-11-16').with.lapses, 4);
    assert.equal(sleepNormalLevels(days, '2026-11-16').without.lapses, null);
  });

  test('normal levels use exactly 28 calendar days and exclude future tests and practice results', () => {
    const nights = ['2026-10-19', '2026-10-20', '2026-11-15', '2026-11-16', '2026-11-17'].map(date => night(date, '07:30', '22:15', true));
    const days = sleepMeasureDays(nights, [reaction('2026-10-19', 100), reaction('2026-10-20', 1), reaction('2026-11-15', 100, 9, true), reaction('2026-11-16', 3), reaction('2026-11-17', 100)], '2026-11-17', 40);
    const levels = sleepNormalLevels(days, '2026-11-16');
    assert.equal(levels.with.lapses, 2);
    assert.equal(levels.with.counts.lapses, 2);
    assert.equal(levels.with.counts.sleepQuality, 3, 'practice still permits the independent sleep measure');
  });

  test('a test can exist without a night, and non-practice takes priority over a later practice result', () => {
    const days = sleepMeasureDays([], [reaction('2026-11-16', 1, 2, false, '14:00'), reaction('2026-11-16', 99, 9, true, '16:00')], '2026-11-16', 1);
    assert.equal(days[0].medicine, 'unknown');
    assert.equal(days[0].lapses, 1);
    assert.equal(days[0].practice, false);
    assert.equal(sleepNormalLevels(days, '2026-11-16').with.lapses, null);
    assert.equal(sleepMeasureDays([], [reaction('2026-11-16', 2, 3, false, '14:00'), reaction('2026-11-16', 4, 4, false, '16:00')], '2026-11-16', 1)[0].lapses, 4);
  });
}
