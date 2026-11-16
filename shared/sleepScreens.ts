import { parseStoredSleepTrial, type StoredSleepTrial } from './sleepTrial';
import type { DocumentationEntry } from './documentationEntries';
import { addDays, atLocalClock, civilDate, dateInput } from './recurringReferences';
import { median, matchingSleepNight, parseSleepSettings, sleepNight, sleepNightDate, type SleepNight, type SleepSettings } from './sleepLog';

export const SUPPLEMENTS = [
  { id: 'melatonin', label: 'Melatonin', unit: 'mg', dose: 0.5 },
  { id: 'glycine', label: 'Glycine', unit: 'g', dose: 3 },
  { id: 'magnesium', label: 'Magnesium', unit: 'mg', dose: 200 },
] as const;
export type SupplementId = typeof SUPPLEMENTS[number]['id'];
export type SupplementIntake = { supplement: SupplementId; dose: number; takenAt: string; timeZone: string };
export type SleepScreenSettings = SleepSettings & {
  trial?: StoredSleepTrial | null;
  choiceSeed?: string;
  usualDoses: Record<SupplementId, number>;
  coffeeTeaspoons: number;
  /** Local latest wake times. These already include preparation. Sunday = 0. */
  weekdayWake: Record<number, string | null>;
  weekdayObligation: Record<number, { start: string; end: string; label: string } | null>;
};
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function positive(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}
export function sleepScreenSettings(schema: unknown): SleepScreenSettings {
  const settings = record(record(record(schema).sleepLog).settings);
  const doses = record(settings.usualDoses);
  const weekdays = record(settings.weekdayWake);
  const obligations = record(settings.weekdayObligation);
  const validClock = (value: unknown): value is string => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  return {
    ...parseSleepSettings(settings),
    trial: parseStoredSleepTrial(settings.trial),
    choiceSeed: typeof settings.choiceSeed === 'string' && settings.choiceSeed.length ? settings.choiceSeed : undefined,
    usualDoses: Object.fromEntries(SUPPLEMENTS.map(s => [s.id, positive(doses[s.id], s.dose)])) as Record<SupplementId, number>,
    coffeeTeaspoons: positive(settings.coffeeTeaspoons, 1),
    weekdayObligation: Object.fromEntries(Array.from({ length: 7 }, (_, day) => {
      const value = obligations[day];
      const obligation = record(value);
      const fallback = day > 0 && day < 6 ? { start: '09:30', end: '19:30', label: 'Work, travel and groceries' } : null;
      return [day, value === null ? null : validClock(obligation.start) && validClock(obligation.end) && typeof obligation.label === 'string' && obligation.label.trim()
        ? { start: obligation.start, end: obligation.end, label: obligation.label } : fallback];
    })),
    weekdayWake: Object.fromEntries(Array.from({ length: 7 }, (_, day) => {
      const value = weekdays[day];
      return [day, validClock(value) ? value : null];
    })),
  };
}
export function sleepSettingsSchema(schema: unknown, settings: SleepScreenSettings): Record<string, unknown> {
  const root = record(schema);
  const sleepLog = record(root.sleepLog);
  return { ...root, sleepLog: { ...sleepLog, settings: { ...record(sleepLog.settings), ...settings } } };
}
/** Appointment inputs must already be classified as work. No title guessing. */
export function requiredWakeForDate(wakeDate: string, timeZone: string, settings: SleepScreenSettings, earlyObligationAt?: string, workAppointments: readonly string[] = []): string | null {
  const weekday = dateInput(wakeDate).weekday;
  const clock = settings.weekdayWake[weekday];
  const candidates: number[] = clock ? [Date.parse(atLocalClock(wakeDate, `${clock}:00`, timeZone))] : [];
  const obligation = settings.weekdayObligation[weekday];
  if (obligation) candidates.push(Date.parse(atLocalClock(wakeDate, `${obligation.start}:00`, timeZone)) - settings.preparationMinutes * 60000);
  for (const value of [earlyObligationAt, ...workAppointments]) {
    if (!value || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) continue;
    const start = new Date(value);
    if (!Number.isFinite(start.getTime()) || civilDate(start, timeZone) !== wakeDate) continue;
    candidates.push(start.getTime() - settings.preparationMinutes * 60000);
  }
  return candidates.length ? new Date(Math.min(...candidates)).toISOString() : null;
}
export function localClock(value: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value));
}
/** Before noon the active bedtime belongs to the preceding evening. */
export function activeSleepWakeDate(now: Date, timeZone: string): string {
  return addDays(civilDate(now, timeZone), Number(localClock(now, timeZone).slice(0, 2)) < 12 ? 0 : 1);
}
export function sleepScreenState(entries: readonly DocumentationEntry[], now: Date, timeZone: string, wakeDate = activeSleepWakeDate(now, timeZone)) {
  const today = civilDate(now, timeZone);
  const start = Date.parse(atLocalClock(addDays(wakeDate, -1), '12:00:00', timeZone));
  const end = Date.parse(atLocalClock(wakeDate, '12:00:00', timeZone));
  const rows = entries.flatMap(entry => { const night = sleepNight(entry); return night ? [{ entry, night }] : []; });
  const morning = rows.find(row => sleepNightDate(row.night) === today);
  const evening = rows.filter(({ entry, night }) => {
    const time = Date.parse(night.evening?.lightsOut ?? entry.occurredAt);
    return !!night.evening && time >= start && time < end;
  }).sort((a, b) => b.entry.occurredAt.localeCompare(a.entry.occurredAt))[0];
  const unmatched = matchingSleepNight(entries, now.toISOString());
  return { today, wakeDate, morning, evening, morningEntry: morning?.entry ?? unmatched,
    morningMissing: !morning?.night.morning, eveningMissing: !evening?.night.evening?.dayRating, lightsOutMissing: !!evening && !evening.night.evening?.lightsOut };
}
export function usualOnset(nights: readonly SleepNight[]): number {
  const values = nights.map(n => n.morning?.fallAsleepMinutes).filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1440);
  return Math.round((median(values.slice(0, 28)) ?? 15) / 5) * 5;
}
