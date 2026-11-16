import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { addDays } from '../shared/recurringReferences';
import {
  DEFAULT_TRIAL_FACTORS, TRIAL_DOSE_LIMITS, checkSuggestedTrialDose, createSleepTrialConfig,
  randomSleepChoice, sleepTrialAssignment, sleepTrialPhase, sleepTrialTonight, trialAdherence,
  trialFactorEffects, trialStopDecision,
  type FactorEffect, type SleepTrialAssignment, type SleepTrialConfig,
  type TrialIntakeLog, type TrialOutcomeNight,
} from '../shared/sleepTrial';

const config = createSleepTrialConfig('2026-03-15');
const seed = 'stored-crypto-quality-seed-🔒';
function assignment(index = 0, trial = config, randomSeed = seed): SleepTrialAssignment {
  const result = sleepTrialAssignment(trial, randomSeed, addDays(trial.trialStartDate, index));
  assert.ok(result);
  return result;
}
function combination(row: SleepTrialAssignment): string {
  return ['melatonin', 'glycine'].map(id => Number(row.factors.find(factor => factor.factorId === id)!.on)).join('');
}
function state(row: SleepTrialAssignment, id = 'magnesium'): boolean {
  return row.factors.find(factor => factor.factorId === id)!.on;
}
const target = '2026-03-28T22:15:00+01:00';
const targetMs = Date.parse(target);
function intakeFor(row: SleepTrialAssignment): TrialIntakeLog {
  return {
    complete: true,
    entries: row.factors.filter(factor => factor.on).map(factor => ({
      factorId: factor.factorId, dose: factor.level!.dose, unit: factor.level!.unit,
      takenAt: new Date(targetMs - (factor.level!.timeWindow?.earliestMinutesBefore ?? 60) * 60000).toISOString(),
    })),
  };
}
const onMelatonin = {
  version: 1, nightDate: '2026-03-29',
  factors: [{ factorId: 'melatonin', on: true, level: DEFAULT_TRIAL_FACTORS[0].levels[0], schedule: 'nightly', periodIndex: null }],
} satisfies SleepTrialAssignment;
const onGlycine = {
  ...onMelatonin, factors: [{ factorId: 'glycine', on: true, level: DEFAULT_TRIAL_FACTORS[1].levels[0], schedule: 'nightly', periodIndex: null }],
} satisfies SleepTrialAssignment;

test('default trial doses, relative time windows and schedules match the agreed plan', () => {
  assert.equal(config.trialStartDate, '2026-03-29');
  assert.deepEqual(DEFAULT_TRIAL_FACTORS.map(factor => [factor.id, factor.levels[0].dose, factor.levels[0].unit, factor.schedule]), [
    ['melatonin', 0.5, 'mg', 'nightly'], ['glycine', 3, 'g', 'nightly'], ['magnesium', 200, 'mg', 'period'],
  ]);
  assert.equal(DEFAULT_TRIAL_FACTORS[2].periodNights, 14);
  assert.deepEqual(DEFAULT_TRIAL_FACTORS[0].levels[0].timeWindow, { earliestMinutesBefore: 60, latestMinutesBefore: 30 });
  assert.deepEqual(DEFAULT_TRIAL_FACTORS[1].levels[0].timeWindow, { earliestMinutesBefore: 60, latestMinutesBefore: 60, approximate: true });
  assert.equal(DEFAULT_TRIAL_FACTORS[2].levels[0].timeWindow, null, 'do not invent a magnesium time requirement');
});

test('assignments are stable across call order, reloads and serialization; seeds change schedules', () => {
  const reference = Array.from({ length: 112 }, (_, index) => assignment(index));
  const reloaded = JSON.parse(JSON.stringify(config)) as SleepTrialConfig;
  for (let index = 111; index >= 0; index -= 1) assert.deepEqual(assignment(index, reloaded), reference[index]);
  assert.notDeepEqual(Array.from({ length: 112 }, (_, index) => assignment(index, config, 'another-seed')), reference);
  assert.throws(() => assignment(0, config, ''), /seed/);
  const reordered = { ...config, factors: [...config.factors].reverse() };
  for (let index = 0; index < 28; index += 1) {
    assert.deepEqual([...assignment(index, reordered).factors].reverse(), reference[index].factors);
  }
  // Freeze the public v1 schedule to catch accidental changes to hash/shuffle semantics.
  assert.equal(reference.slice(0, 8).map(combination).join(','), '01,00,10,11,11,10,00,01');
});

test('every aligned four-night block is complete, including DST and month boundaries', () => {
  for (const randomSeed of [seed, 'other', 'unicode-汉字']) {
    for (let block = 0; block < 100; block += 1) {
      const combinations = Array.from({ length: 4 }, (_, offset) => combination(assignment(block * 4 + offset, config, randomSeed)));
      assert.deepEqual(combinations.sort(), ['00', '01', '10', '11']);
    }
  }
});

test('randomization is balanced at each block position and independent of Keep/Extend', () => {
  const positionCounts = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
  const joint = Array.from({ length: 4 }, () => [0, 0]);
  const periodFirst = [0, 0];
  for (let index = 0; index < 8000; index += 1) {
    const row = assignment(index);
    const code = parseInt(combination(row), 2);
    const keep = randomSleepChoice(seed, row.nightDate, [null, null]) === 'keep' ? 1 : 0;
    positionCounts[index % 4][code] += 1;
    joint[code][keep] += 1;
    if (index % 28 === 0) periodFirst[Number(state(row))] += 1;
  }
  for (const counts of positionCounts) for (const count of counts) assert.ok(Math.abs(count / 2000 - 0.25) < 0.04);
  for (const counts of joint) for (const count of counts) assert.ok(Math.abs(count / 8000 - 0.125) < 0.025);
  assert.ok(Math.abs(periodFirst[1] / (periodFirst[0] + periodFirst[1]) - 0.5) < 0.1);
});

test('magnesium stays constant for 14 nights and each pair has one on and one off period', () => {
  const firsts = new Set<boolean>();
  for (let pair = 0; pair < 40; pair += 1) {
    const first = state(assignment(pair * 28));
    firsts.add(first);
    for (let offset = 0; offset < 28; offset += 1) {
      const row = assignment(pair * 28 + offset);
      assert.equal(state(row), offset < 14 ? first : !first);
      assert.equal(row.factors.find(factor => factor.factorId === 'magnesium')!.periodIndex, pair * 2 + Math.floor(offset / 14));
    }
  }
  assert.equal(firsts.size, 2, 'the first period order is randomized for every pair');
});

test('phase boundaries use 14 civil nights across both DST changes, with optional gaps', () => {
  for (const start of ['2026-03-15', '2026-10-11', '2026-12-20']) {
    const trial = createSleepTrialConfig(start);
    assert.equal(sleepTrialPhase(trial, addDays(start, -1)), 'none');
    for (let day = 0; day < 14; day += 1) {
      assert.equal(sleepTrialPhase(trial, addDays(start, day)), 'normal-level');
      assert.equal(sleepTrialAssignment(trial, seed, addDays(start, day)), null);
    }
    const tonight = sleepTrialTonight(trial, seed, addDays(start, 14));
    assert.equal(tonight.phase, 'trial');
    assert.ok(tonight.assignment);
    assert.equal(sleepTrialPhase(trial, addDays(start, 400)), 'trial');
    const gap = createSleepTrialConfig(start, addDays(start, 17));
    assert.equal(sleepTrialPhase(gap, addDays(start, 14)), 'none');
    assert.equal(sleepTrialPhase(gap, addDays(start, 16)), 'none');
    assert.throws(() => createSleepTrialConfig(start, addDays(start, 13)), /14 nights/);
  }
  assert.throws(() => sleepTrialPhase(config, '2026-02-30'));
  assert.throws(() => createSleepTrialConfig('not-a-date'));
});

test('factor levels remain data and input configuration is validated', () => {
  const newLevel = { id: 'future-dose', dose: 0.25, unit: 'mg', timeWindow: null } as const;
  const trial = { ...config, factors: config.factors.map(factor => factor.id === 'melatonin'
    ? { ...factor, activeLevelId: newLevel.id, levels: [...factor.levels, newLevel] } : factor) };
  for (let day = 0; day < 4; day += 1) {
    const melatonin = assignment(day, trial).factors.find(factor => factor.factorId === 'melatonin')!;
    if (melatonin.on) assert.deepEqual(melatonin.level, newLevel);
    assert.equal(combination(assignment(day, trial)), combination(assignment(day)));
  }
  assert.throws(() => assignment(0, { ...config, factors: [config.factors[0], config.factors[0]] }), /once/);
  assert.throws(() => assignment(0, { ...config, factors: [{ ...config.factors[0], activeLevelId: 'missing' }] }), /active level/);
  assert.throws(() => assignment(0, { ...config, factors: [{ ...config.factors[2], periodNights: 0 }] }), /positive/);
  assert.throws(() => assignment(0, { ...config, factors: [{ ...config.factors[0], id: 'methylphenidate' } as never] }), /supported/);
  const nightlyOnly = { ...config, factors: [config.factors[0]] };
  let on = 0;
  for (let day = 0; day < 1000; day += 1) on += Number(state(assignment(day, nightlyOnly), 'melatonin'));
  assert.ok(on > 440 && on < 560, 'a factor outside the pair uses its own fair coin');
});

test('two preceding Keep outcomes prohibit random choice; other histories use the stable fair coin', () => {
  let keeps = 0;
  for (let day = 0; day < 2000; day += 1) {
    const date = addDays('2026-01-01', day);
    assert.equal(randomSleepChoice(seed, date, ['keep', 'keep']), 'own-choice-only');
    const result = randomSleepChoice(seed, date, [null, null]);
    for (const previous of [['keep', 'extend'], ['extend', 'keep'], ['keep', null], [null, 'keep']] as const) {
      assert.equal(randomSleepChoice(seed, date, previous), result);
    }
    keeps += Number(result === 'keep');
  }
  assert.ok(keeps > 900 && keeps < 1100);
  assert.notDeepEqual(Array.from({ length: 30 }, (_, day) => randomSleepChoice(seed, addDays('2026-01-01', day), [null, null])),
    Array.from({ length: 30 }, (_, day) => randomSleepChoice('other', addDays('2026-01-01', day), [null, null])));
});

test('complete evening intake compares on/off, dose, converted units, time, and split doses', () => {
  for (let day = 0; day < 28; day += 1) {
    const row = assignment(day);
    assert.equal(trialAdherence(row, intakeFor(row), target, 15).status, 'as assigned');
  }
  const log = intakeFor(onMelatonin);
  assert.equal(trialAdherence(onMelatonin, { ...log, entries: [{ ...log.entries[0], dose: 0.0005, unit: 'g' }] }, target).status, 'as assigned');
  assert.equal(trialAdherence(onMelatonin, { ...log, entries: [{ ...log.entries[0], dose: 0.25 }, { ...log.entries[0], dose: 0.25 }] }, target).status, 'as assigned');
  for (const dose of [0, 0.25, 1]) assert.equal(trialAdherence(onMelatonin, { ...log, entries: [{ ...log.entries[0], dose }] }, target).status, 'deviated');
  assert.equal(trialAdherence(onMelatonin, { entries: [], complete: true }, target).status, 'deviated');
  const off = { ...onMelatonin, factors: [{ ...onMelatonin.factors[0], on: false, level: null }] };
  assert.equal(trialAdherence(off, { entries: [], complete: true }).status, 'as assigned');
  assert.equal(trialAdherence(off, log, target).status, 'deviated');
  for (const before of [30, 60]) {
    assert.equal(trialAdherence(onMelatonin, { ...log, entries: [{ ...log.entries[0], takenAt: new Date(targetMs - before * 60000).toISOString() }] }, target).status, 'as assigned');
  }
  for (const before of [29, 61, -30]) {
    const result = trialAdherence(onMelatonin, { ...log, entries: [{ ...log.entries[0], takenAt: new Date(targetMs - before * 60000).toISOString() }] }, target);
    assert.equal(result.status, 'deviated');
    assert.match(result.details[0].reason, /time window/);
  }
});

test('missing logs, doses and times stay unknown; explicit deviations dominate missing evidence', () => {
  const log = intakeFor(onMelatonin);
  assert.equal(trialAdherence(onMelatonin, null, target).status, 'unknown');
  assert.equal(trialAdherence(onMelatonin, { ...log, complete: false }, target).status, 'unknown');
  for (const patch of [{ dose: undefined }, { unit: undefined }, { dose: NaN }, { dose: -1 }, { takenAt: undefined }, { takenAt: '2026-03-28T21:15:00' }]) {
    assert.equal(trialAdherence(onMelatonin, { ...log, entries: [{ ...log.entries[0], ...patch }] }, target).status, 'unknown');
  }
  assert.equal(trialAdherence(onMelatonin, log).status, 'unknown');
  assert.equal(trialAdherence(onGlycine, intakeFor(onGlycine), target).status, 'unknown', 'the caller must define tolerance for an approximate time');
  assert.equal(trialAdherence(onGlycine, intakeFor(onGlycine), target, 15).status, 'as assigned');
  assert.equal(trialAdherence(onMelatonin, { complete: false, entries: [{ factorId: 'melatonin', dose: 1, unit: 'mg' }] }).status, 'deviated');
  const multi = { ...onMelatonin, factors: [...onMelatonin.factors, ...onGlycine.factors] };
  const result = trialAdherence(multi, { complete: true, entries: [{ factorId: 'melatonin', dose: 1, unit: 'mg' }] });
  assert.equal(result.status, 'deviated');
  assert.equal(result.details.length, 2);
  assert.throws(() => trialAdherence(onMelatonin, log, target, -1), /tolerance/);
});

function outcome(on: boolean, value: number | null, hardNight = false): TrialOutcomeNight {
  return {
    assignment: { ...onMelatonin, factors: [{ ...onMelatonin.factors[0], on }] },
    adherence: 'as assigned', outcome: value, hardNight,
  };
}
function close(actual: number | null, expected: number): void {
  assert.ok(actual !== null && Math.abs(actual - expected) < 1e-10, `${actual} should equal ${expected}`);
}

test('synthetic effects use unbiased variance and the requested 90 percent normal interval', () => {
  const rows = [outcome(true, 8), outcome(true, 10), outcome(false, 2), outcome(false, 4),
    outcome(true, 10, true), outcome(true, 14, true), outcome(false, 6, true), outcome(false, 10, true)];
  const result = trialFactorEffects(rows)[0];
  assert.equal(result.factorId, 'melatonin');
  close(result.overall.effect, 5);
  close(result.overall.onMean, 10.5);
  close(result.overall.offMean, 5.5);
  close(result.hardNights.effect, 4);
  close(result.hardNights.standardError, Math.sqrt(8));
  close(result.hardNights.interval90![0], 4 - 1.6448536269514722 * Math.sqrt(8));
  close(result.hardNights.interval90![1], 4 + 1.6448536269514722 * Math.sqrt(8));
  const excluded: TrialOutcomeNight[] = [
    { ...outcome(true, 1e8, true), adherence: 'deviated' },
    { ...outcome(false, -1e8), adherence: 'unknown' },
    { ...outcome(true, 1e8), comparable: false }, outcome(true, null), outcome(false, NaN), outcome(false, Infinity),
  ];
  assert.deepEqual(trialFactorEffects([...rows, ...excluded]), [result]);
});

test('factorial synthetic data recovers each known main effect', () => {
  const rows: TrialOutcomeNight[] = Array.from({ length: 280 }, (_, day) => {
    const row = assignment(day);
    return { assignment: row, adherence: 'as assigned', outcome: 100 + Number(state(row, 'melatonin')) * 8 + Number(state(row, 'glycine')) * 4 };
  });
  const results = trialFactorEffects(rows);
  close(results.find(result => result.factorId === 'melatonin')!.overall.effect, 8);
  close(results.find(result => result.factorId === 'glycine')!.overall.effect, 4);
  // Four does not divide 14. Nightly balance does not force magnesium's marginal
  // contrast to zero in a finite trial. Verify a known period effect separately.
  const magnesiumRows = rows.map(row => ({ ...row,
    assignment: { ...row.assignment, factors: row.assignment.factors.filter(factor => factor.factorId === 'magnesium') },
    outcome: 100 + Number(state(row.assignment)) * 9,
  }));
  close(trialFactorEffects(magnesiumRows)[0].overall.effect, 9);
});

test('empty or sparse data cannot produce a stopping interval', () => {
  assert.deepEqual(trialFactorEffects([]), []);
  const result = trialFactorEffects([outcome(true, 3), outcome(false, 1)])[0];
  assert.equal(result.overall.effect, 2);
  assert.equal(result.overall.standardError, null);
  assert.equal(result.overall.interval90, null);
  assert.equal(result.hardNights.effect, null);
  assert.equal(trialStopDecision(result.overall, 1), 'continue');
});

test('the stop rule checks direction, magnitude, equivalence and inconclusive cases', () => {
  const result = (effect: number, interval90: readonly [number, number]): FactorEffect => ({
    effect, interval90, standardError: 1, onCount: 20, offCount: 20, onMean: 0, offMean: 0,
  });
  assert.equal(trialStopDecision(result(3, [1, 5]), 2), 'effect present');
  assert.equal(trialStopDecision(result(-3, [-5, -1]), 2), 'effect present');
  assert.equal(trialStopDecision(result(2, [1, 3]), 2), 'effect present');
  assert.equal(trialStopDecision(result(0, [-1, 1]), 2), 'too small to matter');
  assert.equal(trialStopDecision(result(0, [-2, 2]), 2), 'too small to matter');
  assert.equal(trialStopDecision(result(0.5, [0.1, 0.9]), 2), 'too small to matter');
  assert.equal(trialStopDecision(result(3, [0, 6]), 2), 'continue');
  assert.equal(trialStopDecision(result(-3, [-6, 0]), 2), 'continue');
  assert.equal(trialStopDecision(result(1, [-3, 4]), 2), 'continue');
  assert.equal(trialStopDecision(result(0.5, [0.1, 3]), 2), 'continue');
  assert.equal(trialStopDecision(result(3, [NaN, 5]), 2), 'continue');
  for (const minimum of [0, -1, NaN, Infinity]) assert.throws(() => trialStopDecision(result(3, [1, 5]), minimum), /positive/);
});

test('dose suggestions refuse excess daily magnesium, unverified limits and invalid inputs', () => {
  assert.equal(TRIAL_DOSE_LIMITS.magnesium.upperDailyMg, 250);
  assert.match(TRIAL_DOSE_LIMITS.magnesium.source, /350 mg/);
  for (const dose of [200, 250]) assert.equal(checkSuggestedTrialDose('magnesium', dose, 'mg').allowed, true);
  assert.equal(checkSuggestedTrialDose('magnesium', 0.25, 'g').allowed, true);
  assert.equal(checkSuggestedTrialDose('magnesium', 250.01, 'mg').reason, 'above limit');
  assert.equal(checkSuggestedTrialDose('magnesium', 200, 'mg', 51).reason, 'above limit');
  assert.equal(checkSuggestedTrialDose('magnesium', 200, 'mg', 50).allowed, true);
  for (const id of ['melatonin', 'glycine'] as const) {
    assert.equal(TRIAL_DOSE_LIMITS[id].upperDailyMg, null);
    assert.equal(TRIAL_DOSE_LIMITS[id].status, 'to verify');
    assert.match(TRIAL_DOSE_LIMITS[id].source, /to verify/);
    assert.equal(checkSuggestedTrialDose(id, id === 'glycine' ? 3 : 0.5, id === 'glycine' ? 'g' : 'mg').allowed, false);
    assert.equal(checkSuggestedTrialDose(id, 1e6, 'g').reason, 'to verify');
  }
  for (const dose of [-1, NaN, Infinity]) assert.equal(checkSuggestedTrialDose('magnesium', dose, 'mg').reason, 'invalid dose');
  assert.equal(checkSuggestedTrialDose('magnesium', 200, 'mg', -1).allowed, false);
  assert.equal(checkSuggestedTrialDose('magnesium', 1, 'invalid' as never).allowed, false);
  for (const id of ['methylphenidate', 'ashwagandha', 'toString', '__proto__']) {
    assert.equal(checkSuggestedTrialDose(id as never, 1, 'mg').reason, 'unsupported substance');
  }
});

// Run the actual logic in fresh Node processes. A host-zone change must not alter
// assignment, period boundaries, phases, choice or adherence across either DST day.
test('the same results survive reloads in UTC, Berlin, Los Angeles and Tokyo', () => {
  const source = `
    import { createSleepTrialConfig, sleepTrialTonight, randomSleepChoice, trialAdherence } from './shared/sleepTrial.ts';
    const rows = [];
    for (const start of ['2026-03-15', '2026-10-11']) {
      const config = createSleepTrialConfig(start);
      for (const date of [start, config.trialStartDate]) {
        const result = sleepTrialTonight(config, 'zone-seed', date);
        rows.push(result, randomSleepChoice('zone-seed', date, [null, null]));
        if (result.assignment) rows.push(trialAdherence(result.assignment, { complete: true, entries: [] }));
      }
    }
    console.log(JSON.stringify(rows));
  `;
  let expected: string | undefined;
  for (const TZ of ['UTC', 'Europe/Berlin', 'America/Los_Angeles', 'Asia/Tokyo']) {
    const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', source], {
      cwd: new URL('..', import.meta.url), env: { ...process.env, TZ }, encoding: 'utf8', timeout: 15000,
    });
    assert.equal(result.status, 0, result.stderr);
    if (expected === undefined) expected = result.stdout;
    else assert.equal(result.stdout, expected, TZ);
  }
});
