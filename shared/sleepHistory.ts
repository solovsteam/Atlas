import { addDays, atLocalClock, civilDate, dateInput } from './recurringReferences';
import {
  DEFAULT_SLEEP_SETTINGS, choiceNight, earlyWake, estimatedSleep, median, ordinaryDay,
  shift, sleepNightDate, sleepTags, targetLightsOut, timeInBed,
  type FollowUpWindow, type SleepNight, type SleepSettings,
} from './sleepLog';
import { legacyNightIntakes, methylphenidateOnDate, type IntakeRecord } from './intake';
import type { SleepReactionTest } from './sleepReactionTest';

/** Schedule and choice context is optional because history never fetches data. */
export type SleepHistoryContext = {
  intakes?: readonly IntakeRecord[];
  requiredWakeByDate?: Readonly<Record<string, string | null>>;
  /** Recorded choices take precedence over inferred opportunities. */
  choiceWakeDates?: readonly string[];
  followUpWindows?: readonly FollowUpWindow[];
};
export type NightHistoryRow = {
  date: string | null;
  night: SleepNight;
  lightsOut: number | null;
  wake: number | null;
  timeInBed: number | null;
  estimatedSleep: number | null;
  earlyWake: boolean | null;
  minutesEarly: number | null;
  choiceNight: boolean | null;
  shift: number | null;
  tags: string[];
  targetLightsOut: number | null;
};

/** Local clock minutes, independent of the computer's current time zone. */
export function sleepClockMinutes(instant: string | undefined, timeZone: string | undefined): number | null {
  if (!instant || !timeZone || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(instant) || !Number.isFinite(Date.parse(instant))) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(instant));
    return Number(parts.find(p => p.type === 'hour')!.value) * 60 + Number(parts.find(p => p.type === 'minute')!.value);
  } catch { return null; }
}
function localDate(instant: string | undefined, timeZone: string | undefined): string | null {
  return sleepClockMinutes(instant, timeZone) === null ? null : civilDate(new Date(instant!), timeZone!);
}
export function clockString(minutes: number): string {
  const rounded = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(rounded / 60)).padStart(2, '0')}:${String(rounded % 60).padStart(2, '0')}`;
}

export function nightHistoryRows(
  nights: readonly SleepNight[], settings: SleepSettings = DEFAULT_SLEEP_SETTINGS, context: SleepHistoryContext = {},
): NightHistoryRow[] {
  return nights.map(night => {
    const date = sleepNightDate(night);
    const timeZone = night.morning?.timeZone;
    const target = date && timeZone ? targetLightsOut(nights, date, timeZone, settings) : null;
    const early = earlyWake(night, settings);
    const anchor = date && timeZone ? Date.parse(atLocalClock(date, `${settings.anchorWake}:00`, timeZone)) : null;
    const choice = date && timeZone ? choiceNight(night.evening?.lightsOut, date, timeZone,
      context.requiredWakeByDate?.[date] ?? null, settings, target?.usualFallAsleepMinutes) : null;
    return {
      date, night,
      lightsOut: sleepClockMinutes(night.evening?.lightsOut, night.evening?.timeZone),
      wake: sleepClockMinutes(night.morning?.wakeAt, timeZone),
      timeInBed: timeInBed(night), estimatedSleep: estimatedSleep(night, settings),
      earlyWake: early,
      minutesEarly: early === null || anchor === null ? null : early ? (anchor - Date.parse(night.morning!.wakeAt!)) / 60000 : 0,
      choiceNight: date && context.choiceWakeDates ? context.choiceWakeDates.includes(date) : choice?.isChoiceNight ?? null,
      shift: shift(night, settings), tags: sleepTags(night),
      targetLightsOut: target ? sleepClockMinutes(target.lightsOutAt, timeZone) : null,
    };
  }).sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'));
}

export function historyDates(throughDate: string, days: number): string[] {
  dateInput(throughDate);
  if (!Number.isInteger(days) || days < 1 || days > 3660) throw new RangeError('Choose between 1 and 3660 days.');
  return Array.from({ length: days }, (_, i) => addDays(throughDate, i - days + 1));
}
export type Spread = { count: number; standardDeviationMinutes: number | null; interquartileRangeMinutes: number | null };
/** Linear interpolation between ranks, with population standard deviation. One observation cannot establish spread. */
export function sleepSpread(values: readonly number[], clock = false): Spread {
  let sorted = values.filter(Number.isFinite).toSorted((a, b) => a - b);
  if (clock && sorted.length) {
    sorted = sorted.map(value => ((value % 1440) + 1440) % 1440).sort((a, b) => a - b);
    // Cut the circle at its largest empty arc. 23:50 and 00:10 then differ by 20 minutes.
    let cut = 0;
    let largestGap = -1;
    for (let i = 0; i < sorted.length; i += 1) {
      const gap = (sorted[(i + 1) % sorted.length] + (i === sorted.length - 1 ? 1440 : 0)) - sorted[i];
      if (gap > largestGap) { largestGap = gap; cut = (i + 1) % sorted.length; }
    }
    sorted = [...sorted.slice(cut), ...sorted.slice(0, cut).map(value => value + 1440)];
  }
  if (sorted.length < 2) return { count: sorted.length, standardDeviationMinutes: null, interquartileRangeMinutes: null };
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  const quantile = (fraction: number) => {
    const rank = (sorted.length - 1) * fraction;
    const lower = Math.floor(rank);
    return sorted[lower] + (sorted[Math.ceil(rank)] - sorted[lower]) * (rank - lower);
  };
  return {
    count: sorted.length,
    standardDeviationMinutes: Math.sqrt(sorted.reduce((sum, value) => sum + (value - mean) ** 2, 0) / sorted.length),
    interquartileRangeMinutes: quantile(0.75) - quantile(0.25),
  };
}
export type Regularity = { days: number; wake: Spread; lightsOut: Spread; estimatedSleep: Spread };
export function sleepRegularity(rows: readonly NightHistoryRow[], throughDate: string, days: number): Regularity {
  const start = historyDates(throughDate, days)[0];
  const selected = rows.filter(row => row.date && row.date >= start && row.date <= throughDate);
  const values = (key: 'wake' | 'lightsOut' | 'estimatedSleep') => selected.flatMap(row => row[key] === null ? [] : [row[key]]);
  return { days, wake: sleepSpread(values('wake'), true), lightsOut: sleepSpread(values('lightsOut'), true), estimatedSleep: sleepSpread(values('estimatedSleep')) };
}
export type WindowTest = { days: number; recordedMornings: number; earlyWakes: number; share: number | null; medianMinutesEarly: number | null };
export function sleepWindowTest(rows: readonly NightHistoryRow[], throughDate: string, days = 28): WindowTest {
  const start = historyDates(throughDate, days)[0];
  const selected = rows.filter(row => row.date && row.date >= start && row.date <= throughDate && row.earlyWake !== null);
  const early = selected.filter(row => row.earlyWake);
  return { days, recordedMornings: selected.length, earlyWakes: early.length,
    share: selected.length ? early.length / selected.length : null,
    medianMinutesEarly: median(early.flatMap(row => row.minutesEarly === null ? [] : [row.minutesEarly])), };
}

export const SLEEP_MEASURE_KEYS = ['lapses', 'sleepiness', 'dayRating', 'sleepQuality', 'fallAsleepMinutes'] as const;
export type SleepMeasureKey = typeof SLEEP_MEASURE_KEYS[number];
export type SleepMeasures = Record<SleepMeasureKey, number | null>;
export type MedicineStatus = 'with' | 'without' | 'unknown';
export type MeasureDay = SleepMeasures & { date: string; medicine: MedicineStatus; ordinary: boolean; practice: boolean; tags: string[] };
export type NormalLevel = SleepMeasures & { counts: Record<SleepMeasureKey, number> };
export type SleepNormalLevels = { with: NormalLevel; without: NormalLevel };
const emptyMeasures = (): SleepMeasures => ({ lapses: null, sleepiness: null, dayRating: null, sleepQuality: null, fallAsleepMinutes: null });

/** Ratings from the evening belong to that evening's date, not to the next morning. Latest same-day test wins, preferring non-practice tests. */
export function sleepMeasureDays(nights: readonly SleepNight[], tests: readonly SleepReactionTest[], throughDate: string, days = 28, context: SleepHistoryContext = {}): MeasureDay[] {
  const dates = historyDates(throughDate, days);
  const byDate = new Map<string, MeasureDay>();
  const get = (date: string) => {
    if (!byDate.has(date)) byDate.set(date, { ...emptyMeasures(), date, medicine: 'without', ordinary: true, practice: false, tags: [] });
    return byDate.get(date)!;
  };
  for (const night of nights) {
    const morningDate = sleepNightDate(night);
    const eveningDate = localDate(night.evening?.lightsOut, night.evening?.timeZone);
    if (morningDate) {
      const day = get(morningDate);
      day.sleepQuality = night.morning?.sleepQuality ?? day.sleepQuality;
      day.fallAsleepMinutes = night.morning?.fallAsleepMinutes ?? day.fallAsleepMinutes;
      day.tags = [...new Set([...day.tags, ...(night.morning?.tags ?? []), ...sleepTags(night).filter(tag => tag === 'travel')])];
    }
    if (eveningDate) {
      const day = get(eveningDate);
      day.dayRating = night.evening?.dayRating ?? day.dayRating;
      day.tags = [...new Set([...day.tags, ...(night.evening?.tags ?? [])])];
    }
  }
  const orderedTests = [...tests].sort((a, b) => Number(b.practice) - Number(a.practice) || Date.parse(a.startedAt) - Date.parse(b.startedAt));
  for (const test of orderedTests) {
    const date = localDate(test.startedAt, test.timeZone);
    if (!date) continue;
    const day = get(date);
    day.lapses = test.summary.lapses;
    day.sleepiness = test.sleepiness;
    day.practice = test.practice;
  }
  const intakes = context.intakes ?? nights.flatMap((night, index) => legacyNightIntakes({ id: `legacy-${index}`, itemId: '', ownerId: '', data: {}, occurredAt: night.morning?.wakeAt ?? night.evening?.lightsOut ?? '', createdAt: '' }, night));
  return dates.map(date => {
    const day = get(date);
    day.medicine = methylphenidateOnDate(intakes, date) ? 'with' : 'without';
    day.ordinary = ordinaryDay(date, day.tags, context.followUpWindows ?? []);
    return day;
  });
}
/** Calendar days, inclusive of throughDate. Practice tests never set the normal reaction-test level. */
export function sleepNormalLevels(days: readonly MeasureDay[], throughDate: string): SleepNormalLevels {
  const start = historyDates(throughDate, 28)[0];
  const level = (medicine: 'with' | 'without'): NormalLevel => {
    const result: NormalLevel = { ...emptyMeasures(), counts: { lapses: 0, sleepiness: 0, dayRating: 0, sleepQuality: 0, fallAsleepMinutes: 0 } };
    for (const key of SLEEP_MEASURE_KEYS) {
      const values = days.filter(day => day.date >= start && day.date <= throughDate && day.ordinary && day.medicine === medicine
        && (!(key === 'lapses' || key === 'sleepiness') || !day.practice)).flatMap(day => day[key] === null ? [] : [day[key]!]);
      result[key] = median(values);
      result.counts[key] = values.length;
    }
    return result;
  };
  return { with: level('with'), without: level('without') };
}
