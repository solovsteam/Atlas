import type { DocumentationEntry } from './documentationEntries';
import { atLocalClock, dateInput } from './recurringReferences';

export type DayEvidence = { date: string; timeZone: string };
export type MedicineAnswer = DayEvidence & { answer: 'not-taken' | 'unknown' };
export function validateDay(value: DayEvidence): void {
  dateInput(value.date);
  new Intl.DateTimeFormat('en', { timeZone: value.timeZone });
  if (!value.timeZone) throw new Error('A time zone is required.');
}
export function dayEvidence(entry: Pick<DocumentationEntry, 'data'>, kind: 'dayConfirmation' | 'medicineAnswer'): DayEvidence | null {
  if (entry.data.kind !== kind) return null;
  const raw = entry.data[kind];
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as DayEvidence;
  try { validateDay(value); return { date: value.date, timeZone: value.timeZone }; } catch { return null; }
}
export function medicineAnswer(entry: Pick<DocumentationEntry, 'data'>): MedicineAnswer | null {
  const day = dayEvidence(entry, 'medicineAnswer');
  const answer = (entry.data.medicineAnswer as MedicineAnswer | undefined)?.answer;
  return day && (answer === 'not-taken' || answer === 'unknown') ? { ...day, answer } : null;
}
export function confirmedDay(entries: readonly DocumentationEntry[], date: string, timeZone?: string): boolean {
  return entries.some(entry => {
    const day = dayEvidence(entry, 'dayConfirmation');
    return day?.date === date && (!timeZone || day.timeZone === timeZone);
  });
}
/** Even a positive observed count is incomplete until the day is confirmed. */
export function dayCount(observed: number, entries: readonly DocumentationEntry[], date: string, timeZone?: string): number | null {
  return confirmedDay(entries, date, timeZone) ? observed : null;
}
export function dayEvidenceData(kind: 'dayConfirmation' | 'medicineAnswer', value: DayEvidence | MedicineAnswer): Record<string, unknown> {
  validateDay(value);
  if (kind === 'medicineAnswer' && !['not-taken', 'unknown'].includes((value as MedicineAnswer).answer)) throw new Error('Choose a valid medicine answer.');
  return { kind, [kind]: { ...value } };
}
export function dayEvidenceTime(value: DayEvidence): Date {
  validateDay(value);
  return new Date(atLocalClock(value.date, '12:00:00', value.timeZone));
}
