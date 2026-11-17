import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { entryData, trackerConfig, trackersOf } from '@shared/documentationEntries';
import { parseQuickLogLocally, resolveQuickLog, type QuickLogContext, type QuickLogMethod, type QuickLogOutput } from '@shared/quickLog';
import { useAtlasData } from '../context/AtlasDataContext';
import { trackCreateUndo, useUndo } from '../context/UndoContext';
import { useEntryMutations } from '../hooks/useDocumentationEntries';
import { useSleepLog } from '../hooks/useSleepLog';
import { interpretWithModel } from '../services/quickLog';
import { supabase } from '../lib/supabase';
import { sleepButton, sleepInput } from './sleep/SleepFields';
import type { SleepEntryChange } from '../services/sleepLog';

type Store = ReturnType<typeof useSleepLog>;
type Saved = { text: string; lines: { summary: string; to: string }[]; method: QuickLogMethod; unmatched: string | null };
type Problem = { text: string; reason: string; partial?: boolean };

/** For pages that do not already read the sleep log. */
export function QuickLogWithStore() {
  const store = useSleepLog();
  return <QuickLog store={store} />;
}

/**
 * One sentence becomes drink, intake, tracker and task records.
 * Simple sentences are read on the device. Others go to the interpreter.
 * Records are saved at once and share one Undo.
 */
export function QuickLog({ store }: { store: Store }) {
  const { items, userId, createItem } = useAtlasData();
  const { createEntry } = useEntryMutations(userId);
  const { push, undo, canUndo } = useUndo();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<'' | 'reading' | 'interpreting' | 'saving'>('');
  const [saved, setSaved] = useState<Saved | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [noteSaved, setNoteSaved] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const trackers = useMemo(() => trackersOf(items).map(t => ({ id: t.id, title: t.title || 'Untitled tracker', kind: trackerConfig(t).kind })), [items]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const sentence = text.trim();
    if (!sentence || busy) return;
    setProblem(null); setSaved(null); setNoteSaved('');
    const ctx: QuickLogContext = { now: new Date(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      buttons: store.settings.intakeButtons, drinks: store.settings.drinks, trackers };
    let output: QuickLogOutput | null = parseQuickLogLocally(sentence, ctx);
    let method: QuickLogMethod = { method: 'local' };
    if (!output) {
      setBusy('interpreting');
      const started = performance.now();
      try {
        const answer = await interpretWithModel(supabase, sentence, ctx);
        output = answer.output;
        // The waiting time includes the network, not only the model.
        method = { method: 'model', model: answer.model, ms: Math.round(performance.now() - started) };
      } catch (cause) {
        setBusy('');
        setProblem({ text: sentence, reason: cause instanceof Error ? cause.message : 'The interpreter failed.' });
        return;
      }
    }
    // The clock may have moved while the interpreter worked. Times are checked against now.
    const result = resolveQuickLog(output, { ...ctx, now: new Date() });
    if (!result.ok) {
      setBusy('');
      setProblem({ text: sentence, reason: result.reason });
      return;
    }
    setBusy('saving');
    const quickLog = { text: sentence, ...method, savedAt: new Date().toISOString() };
    const changes: SleepEntryChange[] = [];
    const lines: Saved['lines'] = [];
    let failure: Error | null = null;
    const intakes = result.records.flatMap(r => r.type === 'intake' ? [r] : []);
    if (intakes.length) {
      try {
        const done = await store.recordIntakes(intakes.map(r => ({ intake: r.intake, meta: { quickLog } })));
        done.changes.forEach((change, i) => { changes.push(change); lines.push({ summary: intakes[i].summary, to: `/intake?edit=${change.entry.id}` }); });
        failure = done.error;
      } catch (cause) { failure = cause instanceof Error ? cause : new Error(String(cause)); }
    }
    for (const r of result.records) {
      if (failure || r.type !== 'tracker') continue;
      try {
        const entry = await createEntry(r.trackerId, new Date(r.occurredAt), { ...entryData(r.stage, []), quickLog });
        changes.push({ entry });
        lines.push({ summary: r.summary, to: `/track/${r.trackerId}` });
      } catch (cause) { failure = cause instanceof Error ? cause : new Error(String(cause)); }
    }
    const createdItems: string[] = [];
    for (const r of result.records) {
      if (failure || r.type !== 'task') continue;
      try {
        const created = await createItem(r.title, { isTask: true, body: `Saved from the Log box: “${sentence}”.` });
        createdItems.push(created.id);
        lines.push({ summary: r.summary, to: `/item/${created.id}` });
      } catch (cause) { failure = cause instanceof Error ? cause : new Error(String(cause)); }
    }
    if (changes.length || createdItems.length) push({ kind: 'batchEntries', changes, createdItems });
    setBusy('');
    if (failure) {
      const partial = changes.length + createdItems.length > 0;
      setProblem({ text: sentence, partial, reason: `${partial ? 'Only part of the sentence was saved. Undo removes that part. ' : ''}${failure.message}` });
      return;
    }
    setSaved({ text: sentence, lines, method, unmatched: result.unmatched });
    setText('');
  }

  async function saveNote(note: string, isTask = false) {
    try {
      const created = await createItem(note, { isTask, body: `Saved from the Log box on ${new Date().toLocaleString()}.` });
      trackCreateUndo(push, created.id);
      setNoteSaved(`Saved “${note}” as ${isTask ? 'a task' : 'a note in Items'}.`);
      setProblem(current => current?.text === note ? null : current);
      if (problem?.text === note) setText('');
    } catch (cause) {
      setProblem({ text: note, reason: cause instanceof Error ? cause.message : `Could not save the ${isTask ? 'task' : 'note'}.` });
    }
  }

  return <section aria-label="Log" className="space-y-2">
    <form className="flex gap-2" onSubmit={event => void submit(event)}>
      <input ref={input} aria-label="Log a sentence" autoComplete="off" enterKeyHint="send" className={`${sleepInput} flex-1`} disabled={store.loading}
        placeholder="cola 250 ml at 15:00, buy milk…" value={text} onChange={event => { setText(event.target.value); setProblem(null); }} />
      <button className={`${sleepButton} shrink-0 bg-indigo-500 text-white`} disabled={!text.trim() || !!busy || store.loading} type="submit">
        {busy === 'interpreting' ? 'Reading…' : busy === 'saving' ? 'Saving…' : 'Log'}
      </button>
    </form>
    <div aria-live="polite" className="space-y-2 text-sm">
      {busy === 'interpreting' ? <p className="text-neutral-400" role="status">The interpreter is reading the sentence…</p> : null}
      {saved ? <div className="rounded-xl border border-indigo-500/40 p-3" role="status">
        <p className="text-neutral-300">Recorded{saved.method.method === 'model' ? ` with the interpreter in ${(saved.method.ms / 1000).toFixed(1)} s` : ''}:</p>
        <ul className="mt-1 space-y-1">{saved.lines.map(line => <li key={line.to + line.summary}><Link className="text-indigo-200 underline" to={line.to}>{line.summary}</Link></li>)}</ul>
        {saved.unmatched ? <p className="mt-2 text-amber-200">Not recorded: “{saved.unmatched}”. <button className="min-h-11 underline" type="button" onClick={() => void saveNote(saved.unmatched!, true)}>Save it as a task</button> · <button className="min-h-11 underline" type="button" onClick={() => void saveNote(saved.unmatched!)}>Save it as a note</button></p> : null}
        {canUndo ? <button className="min-h-11 underline" type="button" onClick={() => void undo().then(() => { setText(saved.text); setSaved(null); input.current?.focus(); })}>Undo and edit the sentence</button> : null}
      </div> : null}
      {problem ? <div className="rounded-xl border border-amber-600/50 p-3" role="alert">
        <p className="break-words text-amber-100">{problem.reason}</p>
        {problem.partial ? null : <p className="mt-1 text-neutral-400">Nothing was saved. Change the sentence and press Log again.</p>}
        <div className="flex flex-wrap gap-x-4">
          <button className="min-h-11 underline" type="button" onClick={() => void saveNote(problem.text, true)}>Save the sentence as a task</button>
          <button className="min-h-11 underline" type="button" onClick={() => void saveNote(problem.text)}>Save it as a note</button>
        </div>
      </div> : null}
      {noteSaved ? <p className="text-neutral-300" role="status">{noteSaved}</p> : null}
    </div>
  </section>;
}
