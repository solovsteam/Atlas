import { useState } from 'react';
import { addDays, civilDate } from '@shared/recurringReferences';
import { dailyTotalData } from '@shared/trackerTotals';
import { useAtlasData } from '../../context/AtlasDataContext';
import { trackCreateEntryUndo, useUndo } from '../../context/UndoContext';
import { useEntryMutations } from '../../hooks/useDocumentationEntries';
import { useSleepSave } from '../../hooks/useSleepSave';
import { sleepButton, sleepInput } from '../sleep/SleepFields';

export function DailyTotalForm({ trackerId, date }: { trackerId: string; date?: string }) {
  const { userId } = useAtlasData();
  const { createEntry } = useEntryMutations(userId);
  const { push } = useUndo();
  const save = useSleepSave();
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = civilDate(new Date(), zone);
  const yesterday = addDays(today, -1);
  const [day, setDay] = useState(date ?? yesterday);
  const [count, setCount] = useState('');
  return <details className="mt-2 text-sm">
    <summary className="cursor-pointer text-indigo-200">Record a daily total</summary>
    <form className="mt-3 space-y-3" onSubmit={event => {
      event.preventDefault();
      void save.run(async () => {
        const data = dailyTotalData(day, Number(count), today);
        const entry = await createEntry(trackerId, new Date(), data);
        trackCreateEntryUndo(push, entry);
        setCount('');
      }, `Saved a total of ${count} for ${day}.`);
    }}>
      {!date && <label className="block">Day <input type="date" required max={yesterday} className={sleepInput} value={day} onChange={e => setDay(e.target.value)} /></label>}
      <label className="block">How many times in total? <input type="number" min="0" step="1" required inputMode="numeric" className={sleepInput + ' w-20'} value={count} onChange={e => setCount(e.target.value)} /></label>
      <p className="text-neutral-400">Include any occurrences you already logged for that day.</p>
      <button className={sleepButton} disabled={save.busy} type="submit">Save daily total</button>
    </form>
    {save.feedback}
  </details>;
}
