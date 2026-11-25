import { recallsOnDate, recallText, type RecallState } from '@shared/dayEvidence';
import type { useSleepLog } from '../../hooks/useSleepLog';
import { useSleepSave } from '../../hooks/useSleepSave';
import { sleepButton } from './SleepFields';

type Store = ReturnType<typeof useSleepLog>;
export type RecallSubject = { subject: string; label: string };
export const dinnerSubject = { subject: 'meal:dinner', label: 'Dinner' };

export function RecallChoices({ store, date, timeZone, subject, label, onSaved }: RecallSubject & {
  store: Store; date: string; timeZone: string; onSaved?: () => void;
}) {
  const save = useSleepSave();
  const previous = recallsOnDate(store.entries, date, timeZone).get(subject);
  const dinner = subject === dinnerSubject.subject;
  const choices: [RecallState, string][] = [
    ['happened', dinner ? 'I ate dinner. I forget when.' : 'I took it. I forget when.'],
    ['unsure', dinner ? 'I forget whether I ate dinner.' : 'I forget whether I took it.'],
    ['absent', dinner ? 'I skipped dinner.' : 'I did not take it.'],
  ];
  return <div className="space-y-2"><div className="flex flex-wrap gap-2">{choices.map(([state, text]) =>
    <button type="button" key={state} aria-pressed={previous?.recall.state === state} disabled={save.busy}
      className={sleepButton + ' aria-pressed:border-indigo-400'} onClick={() => void save.run(async () => {
        await store.saveDayEvidence('dayRecall', { subject, label, date, timeZone, state }, previous?.entry.id);
        onSaved?.();
      }, 'Your answer was saved.')}>{text}</button>)}</div>{save.feedback}</div>;
}

export function RecallList({ store, date, timeZone }: { store: Store; date: string; timeZone: string }) {
  const save = useSleepSave();
  const rows = [...recallsOnDate(store.entries, date, timeZone).values()];
  return <div className="space-y-2 text-sm">{rows.map(({ entry, recall }) =>
    <details className="rounded-lg border border-neutral-700 p-2" key={entry.id}>
      <summary className="cursor-pointer">{recall.label} · {recallText(recall)}</summary>
      <div className="mt-2 space-y-2"><RecallChoices store={store} date={date} timeZone={timeZone} subject={recall.subject} label={recall.label} />
        <button className={sleepButton} disabled={save.busy} type="button" onClick={() => void save.run(() => store.deleteEntry(entry.id), 'The answer was removed.')}>Remove answer</button></div>
    </details>)}{save.feedback}</div>;
}
