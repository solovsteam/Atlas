import { RecallChoices, RecallList, dinnerSubject } from './DayRecall';
import { summarizeTrackerDay, trackerDay } from '@shared/trackerTotals';
import { DailyTotalForm } from '../tracking/DailyTotalForm';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { atLocalClock, civilDate, dateInput } from '@shared/recurringReferences';
import { confirmedDay, dayEvidence, reviewedDay, medicineAnswer, recallsOnDate, recallText } from '@shared/dayEvidence';
import { dailyIntakeSummary, DEFAULT_INTAKE_BUTTONS, intakeNow, intakesOnDate, methylphenidateStatus } from '@shared/intake';
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
export function DayReview({ store, date, timeZone, forceMedicine = false, onOpenIntake }: { store: Store; date: string; timeZone: string; forceMedicine?: boolean; onOpenIntake: () => void }) {
  const { items } = useAtlasData();
  const trackers = trackersOf(items);
  const [ready, setReady] = useState<Record<string, boolean>>({});
  const loaded = useCallback((id: string, value: boolean) => setReady(previous => previous[id] === value ? previous : { ...previous, [id]: value }), []);
  const save = useSleepSave();
  const [correctionDate, setCorrectionDate] = useState(date);
  const confirmed = confirmedDay(store.entries, date, timeZone);
  const reviewed = reviewedDay(store.entries, date, timeZone);
  const reviewKind = confirmed ? 'dayConfirmation' : 'dayReview';
  const dinnerMemory = recallsOnDate(store.entries, date, timeZone).get(dinnerSubject.subject);
  const confirmations = store.entries.filter(entry => { const day = dayEvidence(entry, reviewKind); return day?.date === date && day.timeZone === timeZone; });
  const weekday = dateInput(date).weekday;
  const dayIntakes = intakesOnDate(store.intakes, date, timeZone);
  const grouped = new Map<string, number>();
  for (const row of dayIntakes) grouped.set(row.intake.label, (grouped.get(row.intake.label) ?? 0) + 1);
  return <section className="space-y-5 rounded-xl border border-neutral-800 p-4" aria-label="Review the day">
    <p className="text-sm text-neutral-400">Review {date}. Time zone: {timeZone}.</p>
    {weekday >= 1 && weekday <= 5 || forceMedicine || methylphenidateStatus(store.entries, date, timeZone) !== 'unknown' ? <MedicineQuestion onOpenIntake={onOpenIntake} store={store} date={date} timeZone={timeZone} /> : null}
    <Field title={`Records for ${date}`}>
      <p className="text-sm text-neutral-400">{confirmed ? 'List confirmed. Your uncertain answers stay unknown.' : reviewed ? 'Review finished. The list may be incomplete.' : 'Record what you remember. You can finish with gaps.'}</p>
      <h3 className="text-sm font-medium">Intakes</h3>
      <ul className="space-y-2 text-sm">{[...grouped].map(([name, count]) => <li key={name}>{name}: {count} recorded</li>)}</ul>
      {!grouped.size ? <p className="text-sm text-neutral-400">{dailyIntakeSummary(store.entries, date, timeZone, store.intakes)}</p> : null}
      <button type="button" className={sleepButton} onClick={onOpenIntake}>Add or correct an intake</button>
      <h3 className="text-sm font-medium">Evening meal</h3>
      {mealsOnDate(store.meals, date, timeZone).map(row => <p key={row.id} className="text-sm">Finished eating at {localClock(row.meal.finishedAt, timeZone)}.</p>)}
      {!mealsOnDate(store.meals, date, timeZone).length && !dinnerMemory && <p className="text-sm text-neutral-400">No evening meal recorded.</p>}
      <button type="button" className={sleepButton} onClick={onOpenIntake}>Add or correct the meal time</button>
      {!mealsOnDate(store.meals, date, timeZone).length && !dinnerMemory && <RecallChoices store={store} date={date} timeZone={timeZone} {...dinnerSubject} />}
      <RecallList store={store} date={date} timeZone={timeZone} />
      <h3 className="text-sm font-medium">Trackers</h3>
      {trackers.map(tracker => <TrackerDay key={`${tracker.id}:${date}:${timeZone}`} tracker={tracker} date={date} timeZone={timeZone} confirmed={confirmed} onReady={loaded} />)}
      {!trackers.length ? <p className="text-sm text-neutral-400">There are no trackers.</p> : null}
      {!confirmed && <p className="text-sm text-neutral-400">Finish with gaps if other events may be missing. Confirm the full list only if all events are accounted for. You can leave times unknown either way.</p>}
      {!reviewed && <button className={sleepButton} type="button" disabled={save.busy} onClick={() => void save.run(() => store.saveDayEvidence('dayReview', { date, timeZone }), 'Review finished with gaps.')}>I’ve recorded everything I remember</button>}
      {!confirmed && <button className={`${sleepButton} w-full`} type="button" disabled={save.busy || trackers.some(tracker => !ready[tracker.id])} onClick={() => void save.run(() => store.saveDayEvidence('dayConfirmation', { date, timeZone }, confirmations[0]?.id), 'The day was confirmed.')}>The list for {date} is complete</button>}
      {reviewed && <>
        <button className={sleepButton} type="button" disabled={save.busy} onClick={() => void save.run(async () => { for (const entry of confirmations) await store.deleteEntry(entry.id); }, 'The day confirmation was removed.')}>{confirmed ? 'Remove the day confirmation' : 'Reopen the review'}</button>
        <details className="space-y-3 text-sm"><summary>Correct the confirmation date</summary><label className="block">Confirmation date <input aria-label="Confirmation date" type="date" className={sleepInput} value={correctionDate} onChange={e => setCorrectionDate(e.target.value)} /></label><button className={sleepButton} disabled={save.busy} type="button" onClick={() => void save.run(() => store.saveDayEvidence(reviewKind, { date: correctionDate, timeZone }, confirmations[0].id), 'The confirmation date was corrected.')}>Save the confirmation date</button></details>
      </>}
    </Field>
    {save.feedback}
  </section>;
}
function TrackerDay({ tracker, date, timeZone, confirmed, onReady }: { tracker: Item; date: string; timeZone: string; confirmed: boolean; onReady: (id: string, ready: boolean) => void }) {
  const { userId } = useAtlasData();
  const { entries, loading, error } = useDocumentationEntries(userId, tracker.id);
  useEffect(() => { onReady(tracker.id, !loading && !error); return () => onReady(tracker.id, false); }, [tracker.id, loading, error, onReady]);
  const { count, report } = summarizeTrackerDay(entries.filter(entry => trackerDay(entry, timeZone) === date));
  return <div className="text-sm"><Link className="text-indigo-300 underline" to={`/track/${tracker.id}`}>{tracker.title || 'Untitled tracker'}</Link>: {loading ? 'Loading…' : error ? <span role="alert">{error}</span> : `${count} recorded${confirmed || report ? '' : '. Not confirmed'}`}{date < civilDate(new Date(), timeZone) && <DailyTotalForm trackerId={tracker.id} date={date} />}</div>;
}

export function MedicineQuestion({ store, date, timeZone, onOpenIntake }: { store: Store; date: string; timeZone: string; onOpenIntake?: () => void }) {
  const save = useSleepSave();
  const [takenAt, setTakenAt] = useState(atLocalClock(date, '08:00:00', timeZone));
  const [taking, setTaking] = useState(false);
  const memory = recallsOnDate(store.entries, date, timeZone).get('intake:methylphenidate');
  const status = methylphenidateStatus(store.entries, date, timeZone);
  const legacyAnswer = !memory && status === 'not-taken' ? store.entries.find(entry => {
    const answer = medicineAnswer(entry);
    return answer?.date === date && answer.timeZone === timeZone && answer.answer === 'not-taken';
  }) : undefined;
  const button = store.settings.intakeButtons.find(b => b.substance === 'methylphenidate') ?? DEFAULT_INTAKE_BUTTONS[0];
  const times = intakesOnDate(store.intakes, date, timeZone)
    .filter(row => row.intake.substance === 'methylphenidate' && row.timeKnown)
    .map(row => localClock(row.intake.takenAt, timeZone));
  return <><Field title={status === 'unknown' ? "Did you take methylphenidate?" : "Methylphenidate"}>
      {status === 'taken' ? <><p className="text-sm">{times.length ? `You recorded methylphenidate at ${times.join(', ')}.` : 'You recorded taking methylphenidate.'} {onOpenIntake ? <button type="button" className={sleepButton} onClick={onOpenIntake}>Correct the intake</button> : <Link className="text-indigo-300 underline" to={`/intake?date=${date}`}>Correct the intake</Link>}</p></> : <>
        <p className="text-sm text-neutral-400">{memory ? recallText(memory.recall) : status === 'not-taken' ? 'Not taken.' : 'No answer recorded.'}</p>
        <button className={sleepButton} type="button" disabled={save.busy} onClick={() => setTaking(!taking)}>Taken at …</button>
        {taking ? <div className="space-y-3"><InstantField label="Methylphenidate taken at" value={takenAt} timeZone={timeZone} onChange={setTakenAt} /><button className={sleepButton} type="button" disabled={save.busy} onClick={() => void save.run(async () => { await store.saveIntake(intakeNow(button, new Date(takenAt), timeZone), civilDate(new Date(takenAt), timeZone) === date ? memory?.entry.id : undefined); setTaking(false); }, 'The intake was recorded.')}>Save the intake</button></div> : null}
        {!memory && status === 'not-taken' && <button className={sleepButton} type="button" disabled={save.busy} onClick={() => void save.run(() => store.saveDayEvidence('medicineAnswer', { date, timeZone, answer: 'unknown' }, legacyAnswer?.id), 'The medicine answer was removed.')}>Remove the medicine answer</button>}
        <RecallChoices store={store} date={date} timeZone={timeZone} subject="intake:methylphenidate" label="Methylphenidate" />
      </>}
    </Field>{save.feedback}</>;
}
