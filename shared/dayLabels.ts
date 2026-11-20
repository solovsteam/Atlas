import { addDays, atLocalClock, civilDate, dateInput } from './recurringReferences';
import { localClock } from './sleepScreens';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Wed 19 Nov" for the civil date 2026-11-19. */
export function shortDate(date: string): string {
  dateInput(date);
  const d = new Date(`${date}T12:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "Today", "Yesterday" or "Tomorrow", or null for other dates. */
export function relativeDay(date: string, today: string): 'Today' | 'Yesterday' | 'Tomorrow' | null {
  if (date === today) return 'Today';
  if (date === addDays(today, -1)) return 'Yesterday';
  if (date === addDays(today, 1)) return 'Tomorrow';
  return null;
}

/** "Yesterday, Wed 19 Nov" or "Mon 17 Nov". */
export function dayText(date: string, today: string): string {
  const word = relativeDay(date, today);
  return word ? `${word}, ${shortDate(date)}` : shortDate(date);
}

/** "Yesterday, Wed 19 Nov · 23:40" for an instant. */
export function instantText(instant: string, timeZone: string, today: string): string {
  return `${dayText(civilDate(new Date(instant), timeZone), today)} · ${localClock(instant, timeZone)}`;
}

export type SleepLogKind = 'evening' | 'lights-out' | 'morning';

/**
 * Names a sleep log by the day it belongs to. Evening logs and lights out
 * belong to the evening date. A morning log belongs to the wake date.
 */
export function sleepLogName(kind: SleepLogKind, date: string, today: string): string {
  const word = relativeDay(date, today);
  if (kind === 'lights-out') return word === 'Today' ? 'Tonight’s lights out' : word === 'Yesterday' ? 'Last night’s lights out' : 'Lights out';
  const part = kind === 'evening' ? 'evening' : 'morning';
  if (word === 'Today') return `This ${part}’s log`;
  if (word) return `${word}’s ${part} log`;
  return `${part === 'evening' ? 'Evening' : 'Morning'} log`;
}

/** "Yesterday’s evening log · Wed 19 Nov". */
export function sleepLogTitle(kind: SleepLogKind, date: string, today: string): string {
  return `${sleepLogName(kind, date, today)} · ${shortDate(date)}`;
}

export type DayHour = { date: string; hour: number };

/** Every hour that exists on the clock from firstDate through lastDate, in order. */
export function dayHourRows(firstDate: string, lastDate: string, timeZone: string): DayHour[] {
  const rows: DayHour[] = [];
  for (let date = firstDate; date <= lastDate; date = addDays(date, 1)) {
    for (let hour = 0; hour < 24; hour += 1) {
      if (clockExists(date, hour, timeZone)) rows.push({ date, hour });
    }
  }
  return rows;
}

function clockExists(date: string, hour: number, timeZone: string): boolean {
  for (const minute of [0, 30, 59]) {
    try { atLocalClock(date, `${pad(hour)}:${pad(minute)}:00`, timeZone); return true; } catch { /* try the next minute */ }
  }
  return false;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** The instant for a day, hour and minute. A clock that the time zone skips moves one hour later. */
export function instantAt(row: DayHour, minute: number, timeZone: string): string {
  const clock = `${pad(row.hour)}:${pad(minute)}:00`;
  try {
    return atLocalClock(row.date, clock, timeZone);
  } catch {
    return new Date(Date.parse(atLocalClock(row.date, `${pad(row.hour)}:00:00`, timeZone)) + 3600000).toISOString();
  }
}

/** The day, hour and minute of an instant in a time zone. */
export function splitInstant(instant: string, timeZone: string): DayHour & { minute: number } {
  const clock = localClock(instant, timeZone);
  return { date: civilDate(new Date(instant), timeZone), hour: Number(clock.slice(0, 2)), minute: Number(clock.slice(3, 5)) };
}
