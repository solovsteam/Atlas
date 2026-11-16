import { addDays, dateInput } from './recurringReferences';

export type TrialSubstance = 'melatonin' | 'glycine' | 'magnesium';
export type DoseUnit = 'mg' | 'g';
export type TrialPhase = 'normal-level' | 'trial' | 'none';
export type AdherenceStatus = 'as assigned' | 'deviated' | 'unknown';
export type SleepChoice = 'keep' | 'extend';

/** Positive minutes BEFORE target lights out. Null means the protocol sets no time. */
export type TrialTimeWindow = Readonly<{
  earliestMinutesBefore: number;
  latestMinutesBefore: number;
  approximate?: boolean;
}>;
export type TrialLevel = Readonly<{
  id: string;
  dose: number;
  unit: DoseUnit;
  timeWindow: TrialTimeWindow | null;
}>;
export type TrialFactor = Readonly<{
  id: TrialSubstance;
  schedule: 'nightly' | 'period';
  periodNights?: number;
  /** Extra dose/timing levels are data. This on/off trial uses only activeLevelId. */
  levels: readonly TrialLevel[];
  activeLevelId: string;
}>;
export type SleepTrialConfig = Readonly<{
  /** All dates are civil WAKE dates, matching sleepNightDate in sleepLog.ts. */
  normalLevelStartDate: string;
  trialStartDate: string;
  factors: readonly TrialFactor[];
}>;
export const DEFAULT_TRIAL_FACTORS: readonly TrialFactor[] = Object.freeze([
  Object.freeze({
    id: 'melatonin', schedule: 'nightly', activeLevelId: '0.5mg',
    levels: Object.freeze([Object.freeze({ id: '0.5mg', dose: 0.5, unit: 'mg',
      timeWindow: Object.freeze({ earliestMinutesBefore: 60, latestMinutesBefore: 30 }) })]),
  }),
  Object.freeze({
    id: 'glycine', schedule: 'nightly', activeLevelId: '3g',
    levels: Object.freeze([Object.freeze({ id: '3g', dose: 3, unit: 'g',
      timeWindow: Object.freeze({ earliestMinutesBefore: 60, latestMinutesBefore: 60, approximate: true }) })]),
  }),
  Object.freeze({
    id: 'magnesium', schedule: 'period', periodNights: 14, activeLevelId: '200mg',
    levels: Object.freeze([Object.freeze({ id: '200mg', dose: 200, unit: 'mg', timeWindow: null })]),
  }),
]);

function doseMg(dose: number, unit: DoseUnit): number | null {
  if (!Number.isFinite(dose) || dose < 0 || (unit !== 'mg' && unit !== 'g')) return null;
  const result = dose * (unit === 'g' ? 1000 : 1);
  return Number.isFinite(result) ? result : null;
}
function validateConfig(config: SleepTrialConfig): void {
  dateInput(config.normalLevelStartDate);
  dateInput(config.trialStartDate);
  if (config.trialStartDate < addDays(config.normalLevelStartDate, 14)) {
    throw new Error('The normal-level phase needs 14 nights before the trial.');
  }
  const ids = new Set<string>();
  for (const factor of config.factors) {
    if (!['melatonin', 'glycine', 'magnesium'].includes(factor.id) || ids.has(factor.id)) {
      throw new Error('Use each supported supplement once.');
    }
    ids.add(factor.id);
    if (factor.schedule !== 'nightly' && factor.schedule !== 'period') throw new Error('Invalid factor schedule.');
    if (factor.schedule === 'period' && (!Number.isSafeInteger(factor.periodNights) || factor.periodNights! < 1)) {
      throw new Error('A period needs a positive whole number of nights.');
    }
    const levels = new Set<string>();
    for (const level of factor.levels) {
      if (!level.id || levels.has(level.id) || doseMg(level.dose, level.unit) === null || level.dose <= 0) {
        throw new Error('Use distinct levels with positive finite doses.');
      }
      levels.add(level.id);
      const window = level.timeWindow;
      if (window && (!Number.isFinite(window.earliestMinutesBefore) || !Number.isFinite(window.latestMinutesBefore)
        || window.latestMinutesBefore < 0 || window.earliestMinutesBefore < window.latestMinutesBefore)) {
        throw new Error('Invalid time window before lights out.');
      }
    }
    if (!levels.has(factor.activeLevelId)) throw new Error('Choose an existing active level.');
  }
}
function validateSeed(seed: string): void {
  if (typeof seed !== 'string' || !seed.length) throw new Error('Supply the stored random seed.');
}
export function createSleepTrialConfig(normalLevelStartDate: string, trialStartDate = addDays(normalLevelStartDate, 14)): SleepTrialConfig {
  const config: SleepTrialConfig = { normalLevelStartDate, trialStartDate, factors: DEFAULT_TRIAL_FACTORS };
  validateConfig(config);
  return config;
}
function phase(config: SleepTrialConfig, nightDate: string): TrialPhase {
  dateInput(nightDate);
  if (nightDate >= config.trialStartDate) return 'trial';
  if (nightDate >= config.normalLevelStartDate && nightDate < addDays(config.normalLevelStartDate, 14)) return 'normal-level';
  return 'none';
}
export function sleepTrialPhase(config: SleepTrialConfig, nightDate: string): TrialPhase {
  validateConfig(config);
  return phase(config, nightDate);
}

/**
 * Version 1: FNV-1a over JSON-encoded UTF-16 code units, followed by Murmur3 fmix32.
 * Math.imul and unsigned shifts specify the same 32-bit arithmetic on all devices.
 * This is a reproducible mixer, NOT cryptography. The caller creates and stores a
 * crypto-quality seed once. Never change this algorithm for an existing trial.
 * JSON tuples avoid ambiguous concatenations. Separate namespaces isolate factors.
 */
function hash(parts: readonly (string | number)[]): number {
  const value = JSON.stringify(['sleep-trial-v1', ...parts]);
  let result = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    result = Math.imul(result ^ value.charCodeAt(index), 0x01000193);
  }
  result ^= result >>> 16;
  result = Math.imul(result, 0x85ebca6b);
  result ^= result >>> 13;
  result = Math.imul(result, 0xc2b2ae35);
  return (result ^ (result >>> 16)) >>> 0;
}
/** Rejection sampling avoids modulo bias for the three-way shuffle step. */
function draw(seed: string, key: readonly (string | number)[], bound: number): number {
  const ceiling = Math.floor(0x100000000 / bound) * bound;
  for (let attempt = 0; ; attempt += 1) {
    const value = hash([seed, ...key, attempt]);
    if (value < ceiling) return value % bound;
  }
}
function dayIndex(start: string, nightDate: string): number {
  // UTC noon is just a civil-day index. No local clock or elapsed DST hours enter.
  return (Date.parse(`${nightDate}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86400000;
}
export type TrialFactorAssignment = Readonly<{
  factorId: TrialSubstance;
  on: boolean;
  level: TrialLevel | null;
  schedule: TrialFactor['schedule'];
  periodIndex: number | null;
}>;
export type SleepTrialAssignment = Readonly<{
  version: 1;
  nightDate: string;
  factors: readonly TrialFactorAssignment[];
}>;

/**
 * Each aligned block starts at trialStartDate + 4*k, not at the latest logged night.
 * Shuffle the complete 2x2: each factor is a marginal fair coin, and the factors
 * are independent WITHIN a night. Nights within a block cannot be independent
 * across time while also guaranteeing balance. A sliding four-night guarantee is
 * likewise incompatible with random block orders. Missing logs never reshuffle.
 */
export function sleepTrialAssignment(config: SleepTrialConfig, seed: string, nightDate: string): SleepTrialAssignment | null {
  validateConfig(config);
  validateSeed(seed);
  if (phase(config, nightDate) !== 'trial') return null;
  const index = dayIndex(config.trialStartDate, nightDate);
  const blockStart = addDays(config.trialStartDate, Math.floor(index / 4) * 4);
  const order = [0, 1, 2, 3];
  for (let step = 3; step > 0; step -= 1) {
    const selected = draw(seed, ['factorial', blockStart, step], step + 1);
    [order[step], order[selected]] = [order[selected], order[step]];
  }
  const combination = order[index % 4];
  const balanced = ['melatonin', 'glycine'].every(id => config.factors.some(factor => factor.id === id && factor.schedule === 'nightly'));
  const factors = config.factors.map(factor => {
    let on: boolean;
    let periodIndex: number | null = null;
    if (factor.schedule === 'period') {
      periodIndex = Math.floor(index / factor.periodNights!);
      const pairStart = addDays(config.trialStartDate, Math.floor(periodIndex / 2) * 2 * factor.periodNights!);
      const firstOn = draw(seed, ['period', factor.id, pairStart], 2) === 1;
      on = periodIndex % 2 === 0 ? firstOn : !firstOn;
    } else if (balanced && (factor.id === 'melatonin' || factor.id === 'glycine')) {
      on = Boolean(combination & (factor.id === 'melatonin' ? 1 : 2));
    } else {
      on = draw(seed, ['nightly', factor.id, nightDate], 2) === 1;
    }
    return {
      factorId: factor.id, on, schedule: factor.schedule, periodIndex,
      level: on ? factor.levels.find(level => level.id === factor.activeLevelId)! : null,
    };
  });
  return { version: 1, nightDate, factors };
}
export function sleepTrialTonight(config: SleepTrialConfig, seed: string, nightDate: string): {
  phase: TrialPhase; assignment: SleepTrialAssignment | null;
} {
  return { phase: sleepTrialPhase(config, nightDate), assignment: sleepTrialAssignment(config, seed, nightDate) };
}

/** The tuple contains the two immediately previous nights, including nonrandom choices. */
export function randomSleepChoice(seed: string, nightDate: string, previousTwo: readonly [SleepChoice | null, SleepChoice | null]): SleepChoice | 'own-choice-only' {
  validateSeed(seed);
  dateInput(nightDate);
  if (previousTwo[0] === 'keep' && previousTwo[1] === 'keep') return 'own-choice-only';
  return draw(seed, ['keep-extend', nightDate], 2) === 1 ? 'keep' : 'extend';
}

export type TrialIntake = Readonly<{
  factorId: TrialSubstance;
  dose?: number;
  unit?: DoseUnit;
  takenAt?: string;
}>;
export type TrialIntakeLog = Readonly<{
  /** Evening trial intake only. Exclude the constant daytime glycine and minerals. */
  entries: readonly TrialIntake[];
  /** False means unlogged intake is possible, including when entries is empty. */
  complete: boolean;
}>;
export type AdherenceDetail = Readonly<{
  factorId: TrialSubstance;
  status: AdherenceStatus;
  reason: string;
}>;
export type TrialAdherence = Readonly<{ status: AdherenceStatus; details: readonly AdherenceDetail[] }>;
function instant(value: string | undefined): number | null {
  if (!value || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const result = Date.parse(value);
  return Number.isFinite(result) ? result : null;
}
function combinedStatus(statuses: readonly AdherenceStatus[]): AdherenceStatus {
  return statuses.includes('deviated') ? 'deviated' : statuses.includes('unknown') || !statuses.length ? 'unknown' : 'as assigned';
}
/**
 * Approximate time targets require an explicit tolerance from the caller. The
 * default does not invent a tolerance for "about 60 minutes". A complete log is
 * required to confirm adherence. A known deviation wins over missing evidence.
 */
export function trialAdherence(assignment: SleepTrialAssignment, log: TrialIntakeLog | null, targetLightsOutAt?: string,
  approximateTimingToleranceMinutes?: number): TrialAdherence {
  if (approximateTimingToleranceMinutes !== undefined
    && (!Number.isFinite(approximateTimingToleranceMinutes) || approximateTimingToleranceMinutes < 0)) {
    throw new Error('Timing tolerance must be finite and nonnegative.');
  }
  const target = instant(targetLightsOutAt);
  const details = assignment.factors.map(factor => {
    const detail = (status: AdherenceStatus, reason: string): AdherenceDetail => ({ factorId: factor.factorId, status, reason });
    if (!log) return detail('unknown', 'No evening intake log.');
    const entries = log.entries.filter(entry => entry.factorId === factor.factorId);
    const doses = entries.map(entry => doseMg(entry.dose ?? NaN, entry.unit!));
    const knownDose = doses.reduce<number>((total, dose) => total + (dose ?? 0), 0);
    const missingDose = doses.some(dose => dose === null);
    if (!factor.on) {
      if (knownDose > 0) return detail('deviated', 'Taken on an off night.');
      if (missingDose || !log.complete) return detail('unknown', 'Absence of intake is unconfirmed.');
      return detail('as assigned', 'No trial dose taken.');
    }
    if (!factor.level) return detail('unknown', 'The assigned level is missing.');
    const expected = doseMg(factor.level.dose, factor.level.unit);
    if (expected === null) return detail('unknown', 'The assigned dose is invalid.');
    if (knownDose > expected + 1e-6 || (!missingDose && log.complete && Math.abs(knownDose - expected) > 1e-6)) {
      return detail('deviated', 'The total evening dose differs from the assignment.');
    }
    const window = factor.level.timeWindow;
    let missingTime = false;
    if (window) {
      const tolerance = window.approximate ? approximateTimingToleranceMinutes : 0;
      for (const entry of entries) {
        if (entry.dose === 0) continue;
        const taken = instant(entry.takenAt);
        if (target === null || taken === null || tolerance === undefined) { missingTime = true; continue; }
        const before = (target - taken) / 60000;
        if (before > window.earliestMinutesBefore + tolerance || before < window.latestMinutesBefore - tolerance) {
          return detail('deviated', 'Intake was outside the assigned time window.');
        }
      }
    }
    if (missingDose || missingTime || !log.complete) return detail('unknown', 'Dose, time, tolerance, or completeness is unconfirmed.');
    return detail('as assigned', 'The dose and time match the assignment.');
  });
  return { status: combinedStatus(details.map(detail => detail.status)), details };
}

export type TrialOutcomeNight = Readonly<{
  assignment: SleepTrialAssignment;
  adherence: AdherenceStatus;
  outcome: number | null;
  hardNight?: boolean;
  /** Set false for sick/travel nights. This helper does not inspect SleepNight. */
  comparable?: boolean;
}>;
export type FactorEffect = Readonly<{
  onCount: number; offCount: number;
  onMean: number | null; offMean: number | null;
  effect: number | null;
  standardError: number | null;
  interval90: readonly [number, number] | null;
}>;
const Z90 = 1.6448536269514722;
function mean(values: readonly number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}
function estimate(on: readonly number[], off: readonly number[]): FactorEffect {
  const onMean = mean(on);
  const offMean = mean(off);
  const effect = onMean === null || offMean === null ? null : onMean - offMean;
  const variance = (values: readonly number[], average: number): number =>
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1);
  const standardError = on.length < 2 || off.length < 2 ? null
    : Math.sqrt(variance(on, onMean!) / on.length + variance(off, offMean!) / off.length);
  const interval90: readonly [number, number] | null = effect === null || standardError === null ? null
    : [effect - Z90 * standardError, effect + Z90 * standardError];
  return { onCount: on.length, offCount: off.length, onMean, offMean, effect, standardError, interval90 };
}
/**
 * Descriptive mean(on)-mean(off), using complete as-assigned nights only.
 * SE = sqrt(s_on^2/n_on + s_off^2/n_off), sample variances with n-1 denominators.
 * Pointwise 90% interval = effect +/- 1.64485*SE (normal approximation).
 * At least two observations per arm are needed for an interval, not for a mean.
 * Limits: no blinding, no interaction/covariate adjustment, and missing/nonadherent
 * nights can bias results. Serial correlation and period carryover are ignored;
 * in particular magnesium nights are NOT independent replications of periods.
 * Intervals can be too narrow with small/correlated samples. Repeated weekly
 * looks do NOT preserve a 90% coverage guarantee. These are exploratory helpers,
 * not a validated sequential test or an automatic recommendation to take a dose.
 */
export function trialFactorEffects(nights: readonly TrialOutcomeNight[]): {
  factorId: TrialSubstance; overall: FactorEffect; hardNights: FactorEffect;
}[] {
  const ids = [...new Set(nights.flatMap(night => night.assignment.factors.map(factor => factor.factorId)))].sort();
  return ids.map(factorId => {
    const summarize = (hardOnly: boolean): FactorEffect => {
      const on: number[] = [];
      const off: number[] = [];
      for (const night of nights) {
        if (night.adherence !== 'as assigned' || night.comparable === false || night.outcome === null
          || !Number.isFinite(night.outcome) || (hardOnly && night.hardNight !== true)) continue;
        const factor = night.assignment.factors.find(row => row.factorId === factorId);
        if (factor) (factor.on ? on : off).push(night.outcome);
      }
      return estimate(on, off);
    };
    return { factorId, overall: summarize(false), hardNights: summarize(true) };
  });
}
export type TrialStopDecision = 'effect present' | 'too small to matter' | 'continue';
/** Applies the requested exploratory rule. See the pointwise/sequential limits above. */
export function trialStopDecision(result: FactorEffect, minimumEffect: number): TrialStopDecision {
  if (!Number.isFinite(minimumEffect) || minimumEffect <= 0) throw new Error('Supply a positive finite minimum effect.');
  if (result.effect === null || !Number.isFinite(result.effect) || !result.interval90) return 'continue';
  const [lower, upper] = result.interval90;
  if (!Number.isFinite(lower) || !Number.isFinite(upper) || lower > upper) return 'continue';
  if ((lower > 0 || upper < 0) && Math.abs(result.effect) >= minimumEffect) return 'effect present';
  if (lower >= -minimumEffect && upper <= minimumEffect) return 'too small to matter';
  return 'continue';
}

export type TrialDoseLimit = Readonly<{
  upperDailyMg: number | null;
  status: 'established' | 'to verify';
  source: string;
  sourceUrls: readonly string[];
}>;
/**
 * Adults only. Magnesium means elemental magnesium, not the bisglycinate mass.
 * Use the lower European limit in Atlas. A UL is not a recommended intake or a
 * guarantee of safety for an individual. Null never means an unlimited dose.
 * Checked 2026-11-16. Agreed trial doses above are protocol data, not proof of a
 * safe upper limit. A later dose suggestion must pass checkSuggestedTrialDose.
 */
export const TRIAL_DOSE_LIMITS: Readonly<Record<TrialSubstance, TrialDoseLimit>> = Object.freeze({
  magnesium: Object.freeze({
    upperDailyMg: 250, status: 'established',
    source: 'SCF (2001), retained by EFSA (2024 opinion, 2025 summary): 250 mg/day of readily dissociable supplemental magnesium salts and compounds such as MgO. This excludes naturally occurring food magnesium. US IOM/FNB (1997), NIH ODS: 350 mg/day from supplements and medicines. Atlas uses 250 mg/day, counting elemental magnesium from supplements, medicines and fortified foods.',
    sourceUrls: Object.freeze(['https://www.efsa.europa.eu/sites/default/files/assets/UL_Summary_tables.pdf', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10934248/', 'https://ods.od.nih.gov/factsheets/Magnesium-HealthProfessional/']),
  }),
  melatonin: Object.freeze({
    upperDailyMg: null, status: 'to verify',
    source: 'No scientific consensus safe upper dose verified. The limit is to verify. NIH NCCIH reports insufficient overall safety information, especially for higher doses and long-term use. A studied dose or a product label is not a consensus upper limit.',
    sourceUrls: Object.freeze(['https://www.nccih.nih.gov/health/melatonin-what-you-need-to-know']),
  }),
  glycine: Object.freeze({
    upperDailyMg: null, status: 'to verify',
    source: 'No established human tolerable upper intake level. The limit is to verify. VKM Report 2016:58 cites IOM (2005): insufficient data to derive a UL. Its assessment of specified doses up to 650 mg/day is not a safe upper limit and does not establish safety of 3 g or 8 g/day.',
    sourceUrls: Object.freeze(['https://vkm.no/download/18.645b840415d03a2fe8f25c8b/1502711280583/Risk%20assessment%20of%20%22other%20substances%22%20%E2%80%93%20glycine.pdf']),
  }),
});
/** Include other daily supplements, medicines and fortified foods in otherDailyMg. Exclude natural food magnesium. */
export function checkSuggestedTrialDose(substance: TrialSubstance, dose: number, unit: DoseUnit, otherDailyMg = 0): {
  allowed: boolean; reason: 'within limit' | 'above limit' | 'to verify' | 'invalid dose' | 'unsupported substance';
  totalDailyMg: number | null; limit: TrialDoseLimit | null;
} {
  if (!Object.hasOwn(TRIAL_DOSE_LIMITS, substance)) {
    return { allowed: false, reason: 'unsupported substance', totalDailyMg: null, limit: null };
  }
  const limit = TRIAL_DOSE_LIMITS[substance];
  const amount = doseMg(dose, unit);
  if (amount === null || !Number.isFinite(otherDailyMg) || otherDailyMg < 0 || !Number.isFinite(amount + otherDailyMg)) {
    return { allowed: false, reason: 'invalid dose', totalDailyMg: null, limit };
  }
  const totalDailyMg = amount + otherDailyMg;
  if (limit.upperDailyMg === null || limit.status !== 'established') return { allowed: false, reason: 'to verify', totalDailyMg, limit };
  const allowed = totalDailyMg <= limit.upperDailyMg;
  return { allowed, reason: allowed ? 'within limit' : 'above limit', totalDailyMg, limit };
}
