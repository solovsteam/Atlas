import type { DocumentationEntry } from './documentationEntries';
import { addDays, civilDate, dateInput } from './recurringReferences';

export function dailyTotalData(date: string, count: number, today: string) {
  dateInput(date);
  if (date >= today) throw new Error('Choose a completed day.');
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('Enter a whole number of zero or more.');
  return { kind: 'trackerDailyTotal', date, count };
}

export function isDailyTotal(entry: DocumentationEntry): boolean {
  return entry.data.kind === 'trackerDailyTotal' && typeof entry.data.date === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(entry.data.date) && Number.isSafeInteger(entry.data.count) && Number(entry.data.count) >= 0;
}

export function trackerDay(entry: DocumentationEntry, zone: string): string {
  return isDailyTotal(entry) ? String(entry.data.date) : civilDate(new Date(entry.occurredAt), zone);
}

// Each report describes the whole day. A newer report corrects an older one.
// Timed occurrences are evidence for the same total. Urges are separate observations.
export function summarizeTrackerDay(entries: readonly DocumentationEntry[]) {
  const reports = entries.filter(isDailyTotal).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  const report = reports[0];
  const events = entries.filter(entry => !isDailyTotal(entry));
  const timedOccurrences = events.filter(entry => entry.data.stage !== 'urge').length;
  const untimed = report ? Math.max(0, Number(report.data.count) - timedOccurrences) : 0;
  return { report, untimed, count: events.length + untimed };
}

const numbers = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const quantity = '(\\d+|' + numbers.join('|') + ')';
const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim();

export function parseTrackerTotal(text: string, trackers: readonly { id: string; title: string }[], today: string) {
  const sentence = normalize(text).replace(/[.!]$/, '').replace(/^yesterday,? (.+)$/, '$1 yesterday');
  const match = /^(.*?)\s+(yesterday|\d{4}-\d{2}-\d{2})$/.exec(sentence);
  if (!match) return null;
  const phrase = match[1].replace(/^i (?:did |made )?/, '').replace(/ on$/, '').replace(/ in total$/, '').replace(/ twice$/, ' two times').replace(/ once$/, ' one time');
  const afterName = new RegExp('^(.+?) ' + quantity + ' times?$').exec(phrase);
  const beforeName = new RegExp('^' + quantity + ' (.+)$').exec(phrase);
  if (!afterName && !beforeName) return null;
  const name = afterName ? afterName[1] : beforeName![2];
  const raw = afterName ? afterName[2] : beforeName![1];
  function key(value: string) {
    return normalize(value).replace(/^(?:scrolling|scrolls?|scrolled)$/, 'scrolled').replace(/ checks$/, ' check');
  }
  const matches = trackers.filter(tracker => key(tracker.title) === key(name));
  if (!matches.length) return null;
  if (matches.length > 1) return { error: 'More than one tracker matches. Open the intended tracker to record its daily total.' } as const;
  const date = match[2] === 'yesterday' ? addDays(today, -1) : match[2];
  const count = /^\d+$/.test(raw) ? Number(raw) : numbers.indexOf(raw);
  try {
    return { tracker: matches[0], data: dailyTotalData(date, count, today) } as const;
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Check the day and total.' } as const;
  }
}
