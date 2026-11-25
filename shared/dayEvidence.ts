import type { DocumentationEntry } from './documentationEntries';
import { atLocalClock, dateInput } from './recurringReferences';

export type DayEvidence = { date: string; timeZone: string };
export type MedicineAnswer = DayEvidence & { answer: 'not-taken' | 'unknown' };
export function validateDay(value: DayEvidence): void {
  dateInput(value.date);
  new Intl.DateTimeFormat('en', { timeZone: value.timeZone });
  if (!value.timeZone) throw new Error('A time zone is required.');
}
export function dayEvidence(entry: Pick<DocumentationEntry, 'data'>, kind: EvidenceKind): DayEvidence | null {
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
export function dayEvidenceData(kind: EvidenceKind, value: EvidenceValue): Record<string, unknown> {
  validateDay(value);
  if (kind === 'dayRecall') {
    const r = value as DayRecall;
    if (!r.subject || !r.label || !['happened', 'unsure', 'absent'].includes(r.state)) throw new Error('Choose what you remember.');
  }
  if (kind === 'medicineAnswer' && !['not-taken', 'unknown'].includes((value as MedicineAnswer).answer)) throw new Error('Choose a valid medicine answer.');
  return { kind, [kind]: { ...value } };
}
export function dayEvidenceTime(value: DayEvidence): Date {
  validateDay(value);
  return new Date(atLocalClock(value.date, '12:00:00', value.timeZone));
}

export type RecallState = 'happened' | 'unsure' | 'absent';
export type DayRecall = DayEvidence & { subject: string; label: string; state: RecallState };
export type EvidenceKind = 'dayConfirmation' | 'dayReview' | 'medicineAnswer' | 'dayRecall';
export type EvidenceValue = DayEvidence | MedicineAnswer | DayRecall;

export function reviewedDay(entries: readonly DocumentationEntry[], date: string, timeZone: string): boolean {
  return confirmedDay(entries, date, timeZone) || entries.some(entry => {
    const day = dayEvidence(entry, 'dayReview');
    return day?.date === date && day.timeZone === timeZone;
  });
}

export function recallsOnDate(entries: readonly DocumentationEntry[], date: string, timeZone?: string) {
  const bySubject = new Map<string, { entry: DocumentationEntry; recall: DayRecall }>();
  for (const entry of entries) {
    if (entry.data.kind !== 'dayRecall') continue;
    const recall = entry.data.dayRecall as DayRecall | undefined;
    if (!recall || recall.date !== date || (timeZone && recall.timeZone !== timeZone)
      || !recall.subject || !['happened', 'unsure', 'absent'].includes(recall.state)) continue;
    const prior = bySubject.get(recall.subject)?.entry;
    if (!prior || prior.createdAt < entry.createdAt || (prior.createdAt === entry.createdAt && prior.id < entry.id))
      bySubject.set(recall.subject, { entry, recall });
  }
  return bySubject;
}

export function recallText(recall: DayRecall): string {
  if (recall.subject === 'meal:dinner') return recall.state === 'happened' ? 'Ate dinner. Time unknown.' : recall.state === 'absent' ? 'Skipped dinner.' : 'Unsure whether I ate dinner.';
  return recall.state === 'happened' ? 'Taken. Time and dose unknown.' : recall.state === 'absent' ? 'Not taken.' : 'Unsure whether I took it.';
}
