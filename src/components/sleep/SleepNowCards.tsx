import { useState } from 'react';
import { Link } from 'react-router-dom';
import { civilDate, dateInput } from '@shared/recurringReferences';
import { dayText } from '@shared/dayLabels';
import { missingData, type MissingKind } from '@shared/missingData';
import { useSleepLog } from '../../hooks/useSleepLog';
import { useSleepClock } from '../../hooks/useSleepClock';
import { MedicineQuestion } from './DayReview';

const prompts: Record<MissingKind, string> = {
  medicine: 'Did you take methylphenidate?',
  morning: 'How did you sleep?',
  evening: 'How did your day go?',
  'lights-out': 'When did you turn out the lights?',
  reactionTest: 'Do you have a minute for your reaction test?',
  confirmation: 'Have you recorded everything you want to count for this day?',
};

export function SleepNowCards() {
  const store = useSleepLog();
  const now = useSleepClock();
  const [skipped, setSkipped] = useState<string[]>([]);
  if (store.loading || store.error) return null;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = civilDate(now, timeZone);
  const weekday = dateInput(today).weekday;
  const rows = missingData(store.entries, now, timeZone, store.settings).filter(row =>
    !skipped.includes(row.to) && (row.kind !== 'reactionTest' || row.date === today)
    && !(row.date === today && row.kind === 'medicine' && (weekday === 0 || weekday === 6)));
  const question = rows.find(row => row.date === today && row.kind === 'reactionTest')
    ?? rows.find(row => row.date === today && row.kind === 'medicine')
    ?? rows[0];
  if (!question) return null;
  return <section aria-label="Check in" className="mt-4 space-y-3 rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-4">
    <p className="text-sm text-neutral-400">{dayText(question.date, today)}</p>
    {question.kind === 'medicine'
      ? <MedicineQuestion key={question.date} store={store} date={question.date} timeZone={timeZone} />
      : <Link className="block py-2 font-medium text-indigo-200 underline" to={question.to}>{prompts[question.kind]}</Link>}
    <div className="flex flex-wrap items-center gap-x-4">
      <button type="button" className="min-h-11 text-sm text-neutral-400 underline" onClick={() => setSkipped(previous => [...previous, question.to])}>Skip for now</button>
      {question.date < today && <Link className="inline-flex min-h-11 items-center text-sm text-indigo-200 underline" to="/sleep#missing">Review past days</Link>}
    </div>
  </section>;
}
