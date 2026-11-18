import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { atLocalClock, civilDate, dateInput } from '@shared/recurringReferences';
import { confirmedDay, dayEvidence, medicineAnswer } from '@shared/dayEvidence';
import { DEFAULT_INTAKE_BUTTONS, intakeNow, intakesOnDate, methylphenidateStatus } from '@shared/intake';
import { mealsOnDate } from '@shared/meals';
import { localClock } from '@shared/sleepScreens';
import { trackersOf } from '@shared/documentationEntries';
import type { Item } from '@shared/item';
import { useAtlasData } from '../../context/AtlasDataContext';
import { useDocumentationEntries } from '../../hooks/useDocumentationEntries';
import { useSleepLog } from '../../hooks/useSleepLog';
import { useSleepSave } from '../../hooks/useSleepSave';
import { Field, InstantField, sleepButton, sleepInput } from './SleepFields';

type Store = ReturnType<typeof useSleepLog>;
export function DayReview({ store, date, timeZone, forceMedicine = false }: { store: Store; date: string; timeZone: string; forceMedicine?: boolean }) {
  const { items } = useAtlasData();
  const trackers = trackersOf(items);
  const [ready, setReady] = useState<Record<string, boolean>>({});
  const loaded = useCallback((id: string, value: boolean) => setReady(previous => previous[id] === value ? previous : { ...previous, [id]: value }), []);
  const save = useSleepSave();
  const [takenAt, setTakenAt] = useState(atLocalClock(date, '08:00:00', timeZone));
  const [taking, setTaking] = useState(false);
  const [correctionDate, setCorrectionDate] = useState(date);
  const confirmed = confirmedDay(store.entries, date, timeZone);
  const confirmations = store.entries.filter(entry => { const day = dayEvidence(entry, 'dayConfirmation'); return day?.date === date && day.timeZone === timeZone; });
  const answers = store.entries.filter(entry => { const day = medicineAnswer(entry); return day?.date === date && day.timeZone === timeZone; }).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  const status = methylphenidateStatus(store.entries, date, timeZone);
  const weekday = dateInput(date).weekday;
  const dayIntakes = intakesOnDate(store.intakes, date, timeZone);
  const grouped = new Map<string, number>();
  for (const row of dayIntakes) grouped.set(row.intake.label, (grouped.get(row.intake.label) ?? 0) + 1);
  const button = store.settings.intakeButtons.find(b => b.substance === 'methylphenidate') ?? DEFAULT_INTAKE_BUTTONS[0];
  return <section className="space-y-5 rounded-xl border border-neutral-800 p-4" aria-label="Review the day">
    <p className="text-sm text-neutral-400">Review {date}. Time zone: {timeZone}.</p>
    {weekday >= 1 && weekday <= 5 || forceMedicine || status !== 'unknown' ? <Field title="Methylphenidate today?">
      {status === 'taken' ? <><p className="text-sm">Taken. <Link className="text-indigo-300 underline" to={`/intake?date=${date}`}>Correct the intake</Link>.</p></> : <>
        <p className="text-sm text-neutral-400">{status === 'not-taken' ? 'Not taken.' : 'No answer recorded.'}</p>
        <button className={sleepButton} type="button" disabled={save.busy} onClick={() => setTaking(!taking)}>Taken at …</button>
        {taking ? <div className="space-y-3"><InstantField label="Methylphenidate taken at" value={takenAt} timeZone={timeZone} onChange={setTakenAt} /><button className={sleepButton} type="button" disabled={save.busy} onClick={() => void save.run(async () => { await store.saveIntake(intakeNow(button, new Date(takenAt), timeZone)); setTaking(false); }, 'The intake was recorded.')}>Save the intake</button></div> : null}
        {status !== 'not-taken' ? <button className={sleepButton} type="button" disabled={save.busy} onClick={() => void save.run(() => store.saveDayEvidence('medicineAnswer', { date, timeZone, answer: 'not-taken' }, answers[0]?.id), 'Not taken was recorded.')}>Not taken</button> : <button className={sleepButton} type="button" disabled={save.busy} onClick={() => void save.run(() => store.saveDayEvidence('medicineAnswer', { date, timeZone, answer: 'unknown' }, answers[0]?.id), 'The medicine answer was removed.')}>Remove the medicine answer</button>}
      </>}
    </Field> : null}
    <Field title="Today’s list">
      <p className="text-sm text-neutral-400">{confirmed ? 'The day is confirmed. Later entries will also count.' : 'The day is not confirmed. These are the recorded events so far.'}</p>
      <h3 className="text-sm font-medium">Intakes</h3>
      <ul className="space-y-2 text-sm">{[...grouped].map(([name, count]) => <li key={name}>{name}: {count} recorded</li>)}</ul>
      {!grouped.size ? <p className="text-sm text-neutral-400">{confirmed ? '0 intakes' : 'No intakes recorded. Not confirmed.'}</p> : null}
      <Link className="inline-block text-sm text-indigo-300 underline" to={`/intake?date=${date}`}>Add or correct an intake</Link>
      <h3 className="text-sm font-medium">Evening meal</h3>
      {mealsOnDate(store.meals, date, timeZone).map(row => <p key={row.id} className="text-sm">Finished eating at {localClock(row.meal.finishedAt, timeZone)}.</p>)}
      {!mealsOnDate(store.meals, date, timeZone).length ? <p className="text-sm text-neutral-400">No evening meal recorded.</p> : null}
      <Link className="inline-block text-sm text-indigo-300 underline" to={`/intake?date=${date}`}>Add or correct the meal time</Link>
      <h3 className="text-sm font-medium">Trackers</h3>
      {trackers.map(tracker => <TrackerDay key={`${tracker.id}:${date}:${timeZone}`} tracker={tracker} date={date} timeZone={timeZone} confirmed={confirmed} onReady={loaded} />)}
      {!trackers.length ? <p className="text-sm text-neutral-400">There are no trackers.</p> : null}
      {!confirmed ? <button className={`${sleepButton} w-full`} type="button" disabled={save.busy || trackers.some(tracker => !ready[tracker.id])} onClick={() => void save.run(() => store.saveDayEvidence('dayConfirmation', { date, timeZone }), 'The day was confirmed.')}>Today’s list is complete</button> : <>
        <button className={sleepButton} type="button" disabled={save.busy} onClick={() => void save.run(async () => { for (const entry of confirmations) await store.deleteEntry(entry.id); }, 'The day confirmation was removed.')}>Remove the day confirmation</button>
        <details className="space-y-3 text-sm"><summary>Correct the confirmation date</summary><label className="block">Confirmation date <input aria-label="Confirmation date" type="date" className={sleepInput} value={correctionDate} onChange={e => setCorrectionDate(e.target.value)} /></label><button className={sleepButton} disabled={save.busy} type="button" onClick={() => void save.run(() => store.saveDayEvidence('dayConfirmation', { date: correctionDate, timeZone }, confirmations[0].id), 'The confirmation date was corrected.')}>Save the confirmation date</button></details>
      </>}
    </Field>
    {save.feedback}
  </section>;
}
function TrackerDay({ tracker, date, timeZone, confirmed, onReady }: { tracker: Item; date: string; timeZone: string; confirmed: boolean; onReady: (id: string, ready: boolean) => void }) {
  const { userId } = useAtlasData();
  const { entries, loading, error } = useDocumentationEntries(userId, tracker.id);
  useEffect(() => { onReady(tracker.id, !loading && !error); return () => onReady(tracker.id, false); }, [tracker.id, loading, error, onReady]);
  const count = entries.filter(entry => civilDate(new Date(entry.occurredAt), timeZone) === date).length;
  return <p className="text-sm"><Link className="text-indigo-300 underline" to={`/track/${tracker.id}`}>{tracker.title || 'Untitled tracker'}</Link>: {loading ? 'Loading…' : error ? <span role="alert">{error}</span> : `${count} recorded${confirmed ? '' : '. Not confirmed'}`}</p>;
}
