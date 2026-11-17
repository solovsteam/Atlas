import type { Item } from './item';
import type { DocumentationEntry } from './documentationEntries';
import { addDays, atLocalClock, civilDate, dateInput } from './recurringReferences';

export type SleepRating = 1 | 2 | 3 | 4 | 5;
export type KarolinskaRating = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type NightAwake = 'none' | 'short' | 'over30';
export type WokeBy = 'alarm' | 'self' | 'other';

/** Times are ISO instants with an offset. Zones are IANA names, never device defaults. */
export type SleepLogPart = {
  timeZone?: string;
  fromMemory?: boolean;
};
export type CoffeeEntry = SleepLogPart & {
  takenAt?: string;
  teaspoons?: number;
};
export type MethylphenidateEntry = SleepLogPart & {
  taken?: boolean;
  takenAt?: string;
};
export type SleepEvening = SleepLogPart & {
  choice?: {
    wakeDate: string;
    outcome: import('./sleepTrial').SleepChoice;
    random: boolean;
    alarmAt: string;
    followUpWindow: FollowUpWindow;
  };
  trial?: {
    assignment: import('./sleepTrial').SleepTrialAssignment;
    adherence: import('./sleepTrial').AdherenceStatus;
    confirmation?: 'self-report' | 'edited';
    confirmedAt?: string;
    targetLightsOutAt: string;
    /** Separate intake entries are the source of evidence. */
    intakeLog?: boolean;
  };
  lightsOut?: string;
  supplements?: import('./sleepScreens').SupplementIntake[];
  /** Start of an appointment, before preparation time is subtracted. */
  earlyObligationAt?: string;
  /** A local HH:mm clock, or an explicit absence of an alarm. */
  alarm?: string | 'none';
  dayRating?: SleepRating;
  tags?: string[];
  lateReasons?: string[];
  sleepiness?: KarolinskaRating;
  /** Recorded before the night, for example before an important appointment. */
  hardNight?: boolean;
};
export type SleepMorning = SleepLogPart & {
  wakeAt?: string;
  wokeBy?: WokeBy;
  fallAsleepMinutes?: number;
  awakeDuringNight?: NightAwake;
  sleepQuality?: SleepRating;
  tags?: string[];
  methylphenidate?: MethylphenidateEntry;
  coffee?: CoffeeEntry[];
};
/** Stored as documentation_entries.data.sleepLog. An empty or half-filled night is valid. */
export type SleepNight = {
  evening?: SleepEvening;
  morning?: SleepMorning;
};

export type SleepSettings = {
  anchorWake: string;
  sleepMinutes: number;
  defaultFallAsleepMinutes: number;
  awakeMinutes: Record<NightAwake, number>;
  testTime: string;
  preparationMinutes: number;
  eveningReminderLeadMinutes: number;
};
export const DEFAULT_SLEEP_SETTINGS: Readonly<SleepSettings> = Object.freeze({
  anchorWake: '07:30',
  sleepMinutes: 540,
  defaultFallAsleepMinutes: 15,
  awakeMinutes: Object.freeze({ none: 0, short: 10, over30: 45 }),
  testTime: '15:00',
  preparationMinutes: 90,
  eveningReminderLeadMinutes: 30,
});

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
function clock(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : fallback;
}
function minutes(value: unknown, fallback: number, minimum = 0): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= 1440
    ? value : fallback;
}
export function parseSleepSettings(value: unknown): SleepSettings {
  const raw = object(value) ?? {};
  const awake = object(raw.awakeMinutes) ?? {};
  const defaults = DEFAULT_SLEEP_SETTINGS;
  return {
    anchorWake: clock(raw.anchorWake, defaults.anchorWake),
    sleepMinutes: minutes(raw.sleepMinutes, defaults.sleepMinutes, 1),
    defaultFallAsleepMinutes: minutes(raw.defaultFallAsleepMinutes, defaults.defaultFallAsleepMinutes),
    awakeMinutes: {
      none: minutes(awake.none, defaults.awakeMinutes.none),
      short: minutes(awake.short, defaults.awakeMinutes.short),
      over30: minutes(awake.over30, defaults.awakeMinutes.over30),
    },
    testTime: clock(raw.testTime, defaults.testTime),
    preparationMinutes: minutes(raw.preparationMinutes, defaults.preparationMinutes),
    eveningReminderLeadMinutes: minutes(raw.eveningReminderLeadMinutes, defaults.eveningReminderLeadMinutes),
  };
}
/** The marker is reserved even if its settings are damaged, like the routine marker. */
export function isSleepLog(item: Pick<Item, 'documentationSchema'>): boolean {
  const schema = object(item.documentationSchema);
  return schema !== null && Object.hasOwn(schema, 'sleepLog');
}
export function sleepSettings(item: Pick<Item, 'documentationSchema'>): SleepSettings {
  const marker = object(object(item.documentationSchema)?.sleepLog);
  return parseSleepSettings(marker?.settings);
}
export function sleepNight(entry: Pick<DocumentationEntry, 'data'>): SleepNight | null {
  if (entry.data.kind !== undefined && entry.data.kind !== 'night') return null;
  const raw = object(entry.data.sleepLog);
  if (!raw) return null;
  // Ignore another entry kind (for example a reaction test) rather than inventing a night.
  const evening = object(raw.evening);
  const morning = object(raw.morning);
  return {
    ...(evening ? { evening: evening as SleepEvening } : {}),
    ...(morning ? { morning: morning as SleepMorning } : {}),
  };
}

function instant(value: string | undefined): number | null {
  if (typeof value !== 'string' || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}
/** Match by elapsed time before the reported wake, not by calendar date or save time. */
export function matchingSleepNight(
  entries: readonly DocumentationEntry[],
  morningAt: string,
): DocumentationEntry | null {
  const end = instant(morningAt);
  if (end === null) throw new Error('Choose a valid morning time with a time zone offset.');
  return entries.flatMap(entry => {
    const night = sleepNight(entry);
    if (!night?.evening || night.morning) return [];
    const start = instant(night.evening.lightsOut ?? entry.occurredAt);
    return start !== null && start <= end && end - start <= 20 * 3600000 ? [{ entry, start }] : [];
  }).sort((a, b) => b.start - a.start || a.entry.id.localeCompare(b.entry.id))[0]?.entry ?? null;
}

function zone(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new Intl.DateTimeFormat('en', { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}
/** No wake time means no known night date. Do not guess it from an evening log. */
export function sleepNightDate(night: SleepNight): string | null {
  const wake = instant(night.morning?.wakeAt);
  const timeZone = zone(night.morning?.timeZone);
  return wake === null || timeZone === null ? null : civilDate(new Date(wake), timeZone);
}
export function timeInBed(night: SleepNight): number | null {
  const start = instant(night.evening?.lightsOut);
  const end = instant(night.morning?.wakeAt);
  return start === null || end === null || end < start ? null : (end - start) / 60000;
}
/** Optional correction fields use documented settings. A missing log stays missing. */
export function estimatedSleep(night: SleepNight, settings: SleepSettings = DEFAULT_SLEEP_SETTINGS): number | null {
  const inBed = timeInBed(night);
  if (inBed === null) return null;
  const onset = minutes(night.morning?.fallAsleepMinutes, settings.defaultFallAsleepMinutes);
  const awake = settings.awakeMinutes[night.morning?.awakeDuringNight ?? 'none'] ?? settings.awakeMinutes.none;
  return Math.max(0, inBed - onset - awake);
}
export function sleepTags(night: SleepNight): string[] {
  const tags = [...(night.evening?.tags ?? []), ...(night.morning?.tags ?? [])];
  const eveningZone = zone(night.evening?.timeZone);
  const morningZone = zone(night.morning?.timeZone);
  if (eveningZone && morningZone && eveningZone !== morningZone) tags.push('travel');
  return [...new Set(tags.map(tag => tag.trim().toLowerCase()).filter(Boolean))];
}
export function isComparableNight(night: SleepNight): boolean {
  return !sleepTags(night).some(tag => tag === 'sick' || tag === 'travel');
}
export function median(values: readonly number[]): number | null {
  const sorted = values.filter(Number.isFinite).toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length === 0 ? null : sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
function recentValues(nights: readonly SleepNight[], throughDate: string, value: (night: SleepNight) => number | null): number[] {
  dateInput(throughDate);
  return nights
    .filter(isComparableNight)
    .map(night => ({ date: sleepNightDate(night), value: value(night) }))
    .filter((row): row is { date: string; value: number } => row.date !== null && row.date <= throughDate && row.value !== null)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 28)
    .map(row => row.value);
}
/** Last 28 usable logged nights, not 28 calendar days. Future nights are excluded. */
export function usualSleep(nights: readonly SleepNight[], throughDate: string, settings: SleepSettings = DEFAULT_SLEEP_SETTINGS): number | null {
  return median(recentValues(nights, throughDate, night => estimatedSleep(night, settings)));
}
export function shortfall(sleepMinutes: number | null, usualSleepMinutes: number | null): number | null {
  return sleepMinutes === null || usualSleepMinutes === null ? null : Math.max(0, usualSleepMinutes - sleepMinutes);
}
function anchorFor(night: SleepNight, settings: SleepSettings): number | null {
  const date = sleepNightDate(night);
  const timeZone = zone(night.morning?.timeZone);
  return date && timeZone ? Date.parse(atLocalClock(date, `${settings.anchorWake}:00`, timeZone)) : null;
}
export function shift(night: SleepNight, settings: SleepSettings = DEFAULT_SLEEP_SETTINGS): number | null {
  const wake = instant(night.morning?.wakeAt);
  const anchor = anchorFor(night, settings);
  return wake === null || anchor === null ? null : Math.max(0, (wake - anchor) / 60000);
}
export function earlyWake(night: SleepNight, settings: SleepSettings = DEFAULT_SLEEP_SETTINGS): boolean | null {
  const wake = instant(night.morning?.wakeAt);
  const anchor = anchorFor(night, settings);
  return wake === null || anchor === null || !night.morning?.wokeBy ? null : night.morning.wokeBy === 'self' && wake < anchor;
}
export function requiredWakeTime(firstObligationAt: string | null | undefined, settings: SleepSettings = DEFAULT_SLEEP_SETTINGS): string | null {
  const start = instant(firstObligationAt ?? undefined);
  return start === null ? null : new Date(start - settings.preparationMinutes * 60000).toISOString();
}

export type SleepTarget = {
  recalculatedOn: string;
  usualFallAsleepMinutes: number;
  windowMinutes: number;
  /** Local clock for this wake date, adjusted for a DST change during the night. */
  lightsOut: string;
  lightsOutAt: string;
  /** The local date offset relative to the wake date (usually -1). */
  dayOffset: number;
};
/** Freeze the onset estimate for each week, using nights before that Monday. */
export function targetLightsOut(nights: readonly SleepNight[], wakeDate: string, timeZone: string, settings: SleepSettings = DEFAULT_SLEEP_SETTINGS): SleepTarget {
  const weekday = dateInput(wakeDate).weekday;
  const monday = addDays(wakeDate, -((weekday + 6) % 7));
  const measured = recentValues(nights, addDays(monday, -1), night => {
    const value = night.morning?.fallAsleepMinutes;
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1440 ? value : null;
  });
  const onset = Math.round((median(measured) ?? settings.defaultFallAsleepMinutes) / 5) * 5;
  const windowMinutes = settings.sleepMinutes + onset;
  const anchor = Date.parse(atLocalClock(wakeDate, `${settings.anchorWake}:00`, timeZone));
  const target = new Date(Math.round((anchor - windowMinutes * 60000) / 300000) * 300000);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(target);
  const get = (name: string) => parts.find(part => part.type === name)!.value;
  const targetDate = civilDate(target, timeZone);
  return {
    recalculatedOn: monday,
    usualFallAsleepMinutes: onset,
    windowMinutes,
    lightsOut: `${get('hour')}:${get('minute')}`,
    lightsOutAt: target.toISOString(),
    dayOffset: Math.round((Date.parse(`${targetDate}T12:00:00Z`) - Date.parse(`${wakeDate}T12:00:00Z`)) / 86400000),
  };
}
export type ChoiceNight = {
  isChoiceNight: boolean;
  anchorWakeAt: string;
  fullSleepWakeAt: string;
  extendWakeAt: string;
  extensionMinutes: number;
};
/** Required wake caps Extend. A choice needs at least 30 actual extra minutes. */
export function choiceNight(
  lightsOut: string | undefined,
  wakeDate: string,
  timeZone: string,
  requiredWakeAt: string | null,
  settings: SleepSettings = DEFAULT_SLEEP_SETTINGS,
  usualFallAsleepMinutes = settings.defaultFallAsleepMinutes,
): ChoiceNight | null {
  const start = instant(lightsOut);
  if (start === null) return null;
  const anchor = Date.parse(atLocalClock(wakeDate, `${settings.anchorWake}:00`, timeZone));
  const required = requiredWakeAt === null ? null : instant(requiredWakeAt);
  if (requiredWakeAt !== null && required === null) return null;
  const full = start + (settings.sleepMinutes + minutes(usualFallAsleepMinutes, settings.defaultFallAsleepMinutes)) * 60000;
  const extend = required === null ? full : Math.min(full, required);
  const extensionMinutes = Math.max(0, (extend - anchor) / 60000);
  return {
    isChoiceNight: full > anchor && extensionMinutes >= 30,
    anchorWakeAt: new Date(anchor).toISOString(),
    fullSleepWakeAt: new Date(full).toISOString(),
    extendWakeAt: new Date(extend).toISOString(),
    extensionMinutes,
  };
}

export type FollowUpWindow = {
  startDate: string;
  /** Null means the supplied horizon did not reach a second required wake day. */
  endDate: string | null;
  dates: string[];
};
/** Pass the date of the evening choice. Its next day is usually the night's wake date. */
export function followUpWindow(
  choiceEveningDate: string,
  requiredWakeDates: readonly string[] | ((date: string) => boolean),
  maxDays = 366,
): FollowUpWindow {
  if (!Number.isInteger(maxDays) || maxDays < 1 || maxDays > 3660) throw new Error('Choose a horizon from 1 to 3660 days.');
  const required = typeof requiredWakeDates === 'function' ? requiredWakeDates : (date: string) => requiredWakeDates.includes(date);
  const dates: string[] = [];
  let count = 0;
  for (let day = 1; day <= maxDays; day += 1) {
    const date = addDays(choiceEveningDate, day);
    dates.push(date);
    if (required(date)) count += 1;
    if (count === 2) return { startDate: dates[0], endDate: date, dates };
  }
  return { startDate: dates[0], endDate: null, dates };
}
export function ordinaryDay(date: string, tags: readonly string[], windows: readonly FollowUpWindow[]): boolean {
  dateInput(date);
  const excluded = tags.some(tag => ['sick', 'travel'].includes(tag.trim().toLowerCase()));
  return !excluded && !windows.some(window => date >= window.startDate && (window.endDate === null || date <= window.endDate));
}
