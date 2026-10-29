import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { advanceRun, durationText, MORNING_STEPS, routineConfig, routineRun, skipStep, startRun, type RoutineRun } from '@shared/timedRoutines';
import type { DocumentationEntry } from '@shared/documentationEntries';
import { useAtlasData } from '../context/AtlasDataContext';
import { trackCreateEntryUndo, trackCreateUndo, trackItemPatchUndo, trackUpdateEntryUndo, useUndo } from '../context/UndoContext';
import { useDocumentationEntries, useEntryMutations } from '../hooks/useDocumentationEntries';

const button = 'rounded border border-neutral-600 px-3 py-2 text-sm text-neutral-100 hover:border-white disabled:opacity-50';
const input = 'w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-100';
function localInput(d: Date) { const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return local.toISOString().slice(0, 16); }
function toLocal(iso: string) { return localInput(new Date(iso)); }

export function RoutinesPage() {
  const { items, createItem } = useAtlasData();
  const { push } = useUndo();
  const routines = items.filter(item => routineConfig(item));
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function create(title: string, steps: string[]) {
    if (!title.trim()) return;
    setBusy(true);
    try { const result = await createItem(title.trim(), { isDocumentation: true, documentationSchema: { routine: { steps } } }); trackCreateUndo(push, result.id); setName(''); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not create routine'); }
    finally { setBusy(false); }
  }
  return <section className="max-w-2xl space-y-5">
    <h1 className="text-4xl font-bold">Timed routines</h1>
    <p className="text-sm text-neutral-400">Record how long each step takes. Edit a routine whenever your plans change.</p>
    <ul className="space-y-2">{routines.map(item => <li key={item.id}><Link className="block rounded border border-neutral-700 p-4 hover:border-white" to={`/routines/${item.id}`}>{item.title}</Link></li>)}</ul>
    {routines.length === 0 ? <button className={button} disabled={busy} onClick={() => void create('Morning', MORNING_STEPS)}>Add a suggested morning routine</button> : null}
    <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void create(name, []); }}><input className={input} value={name} onChange={e => setName(e.target.value)} placeholder="New routine name" aria-label="New routine name"/><button className={button} disabled={busy || !name.trim()}>Add</button></form>
    {error ? <p className="text-sm text-red-400" role="alert">{error}</p> : null}
  </section>;
}

export function RoutinePage() {
  const { id = '' } = useParams();
  const { items, userId, updateItem } = useAtlasData();
  const { push } = useUndo();
  const routine = items.find(item => item.id === id && routineConfig(item));
  const { entries, loading, error: loadError } = useDocumentationEntries(userId, routine?.id);
  const { createEntry, updateEntry } = useEntryMutations(userId);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [started, setStarted] = useState(() => localInput(new Date()));
  const [extra, setExtra] = useState('');
  const [, tick] = useState(0);
  useEffect(() => { const timer = window.setInterval(() => tick(n => n + 1), 30000); return () => window.clearInterval(timer); }, []);
  const runs = useMemo(() => entries.map(entry => ({ entry, run: routineRun(entry) })).filter((x): x is { entry: DocumentationEntry; run: RoutineRun } => x.run !== null).sort((a, b) => Date.parse(b.run.startedAt) - Date.parse(a.run.startedAt)), [entries]);
  const active = runs.find(x => !x.run.endedAt);
  if (!routine) return <p>Routine not found. <Link className="underline" to="/routines">Back to routines</Link></p>;
  const config = routineConfig(routine)!;
  async function saveSteps(event: FormEvent) {
    event.preventDefault(); const steps = draft.split('\n').map(s => s.trim()).filter(Boolean);
    const old = routine!; const schema = old.documentationSchema && typeof old.documentationSchema === 'object' && !Array.isArray(old.documentationSchema) ? old.documentationSchema : {};
    setBusy(true); try { const result = await updateItem(old.id, JSON.stringify({ documentationSchema: { ...schema, routine: { steps } } }), old.revision); if ('conflict' in result) throw new Error('The routine changed. Please try again.'); trackItemPatchUndo(push, old.id, { documentationSchema: old.documentationSchema }); setEditing(false); setError(''); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save routine'); } finally { setBusy(false); }
  }
  async function begin() {
    const time = new Date(started); if (!Number.isFinite(time.getTime()) || time.getTime() > Date.now()) { setError('Choose a start time that is not in the future.'); return; }
    setBusy(true); try { const run = startRun(time, config.steps); const entry = await createEntry(routine!.id, time, { routine: run }); trackCreateEntryUndo(push, entry); setError(''); } catch (e) { setError(e instanceof Error ? e.message : 'Could not start'); } finally { setBusy(false); }
  }
  async function saveRun(entry: DocumentationEntry, run: RoutineRun) {
    setBusy(true); try { await updateEntry(entry, { ...entry.data, routine: run }); trackUpdateEntryUndo(push, entry); if (run.endedAt) setStarted(localInput(new Date())); setError(''); return true; } catch (e) { setError(e instanceof Error ? e.message : 'Could not save the change'); return false; } finally { setBusy(false); }
  }
  function movePending(index: number, direction: -1 | 1) {
    if (!active) return;
    const positions = active.run.steps.flatMap((step, i) => step.status === 'pending' ? [i] : []);
    const other = positions[positions.indexOf(index) + direction];
    if (other === undefined) return;
    const steps = [...active.run.steps];
    [steps[index], steps[other]] = [steps[other], steps[index]];
    void saveRun(active.entry, { ...active.run, steps });
  }
  function addExtra() { if (!active || !extra.trim()) return; void saveRun(active.entry, { ...active.run, steps: [...active.run.steps, { name: extra.trim(), status: 'pending', start: null, end: null }] }); setExtra(''); }
  return <section className="max-w-2xl space-y-5">
    <Link to="/routines" className="text-sm underline">Back to routines</Link><h1 className="text-4xl font-bold">{routine.title}</h1>
    {loadError || error ? <p className="text-sm text-red-400" role="alert">{error || loadError}</p> : null}
    {loading ? <p>Loading routine…</p> : active ? <div className="space-y-3 rounded-xl border border-neutral-700 p-4">
      <p>Started {new Date(active.run.startedAt).toLocaleString()} · {durationText(active.run.startedAt, new Date().toISOString())} elapsed</p>
      <p className="text-neutral-300">{active.run.steps.find(s => s.status === 'active') ? `Now: ${active.run.steps.find(s => s.status === 'active')!.name}` : 'Time before the first step'}</p>
      <button className={button} disabled={busy} onClick={() => void saveRun(active.entry, advanceRun(active.run, new Date()))}>{active.run.steps.find(s => s.status === 'active') ? (active.run.steps.some(s => s.status === 'pending') ? `Done · Start ${active.run.steps.find(s => s.status === 'pending')!.name}` : 'Done · Finish routine') : (active.run.steps.some(s => s.status === 'pending') ? `Start ${active.run.steps.find(s => s.status === 'pending')!.name}` : 'Finish routine')}</button>
      <ul className="space-y-2">{active.run.steps.map((step, i) => <li key={i} className="flex items-center justify-between gap-2 text-sm"><span>{step.name} · {step.status === 'done' && step.start && step.end ? durationText(step.start, step.end) : step.status}</span>{step.status === 'pending' ? <span className="flex flex-wrap justify-end gap-1"><button className={button} disabled={busy || !active.run.steps.slice(0, i).some(s => s.status === 'pending')} onClick={() => movePending(i, -1)}>Move up</button><button className={button} disabled={busy || !active.run.steps.slice(i + 1).some(s => s.status === 'pending')} onClick={() => movePending(i, 1)}>Move down</button><button className={button} disabled={busy} onClick={() => void saveRun(active.entry, skipStep(active.run, i))}>Skip</button></span> : null}</li>)}</ul>
      <div className="flex gap-2"><input className={input} value={extra} onChange={e => setExtra(e.target.value)} placeholder="Add a step for today" aria-label="Add a step for today"/><button className={button} disabled={busy || !extra.trim()} onClick={addExtra}>Add</button></div>
    </div> : <div className="space-y-3 rounded-xl border border-neutral-700 p-4"><label className="block text-sm">Start time. For a morning routine, enter your alarm time.<input className={`${input} mt-2`} type="datetime-local" value={started} onChange={e => setStarted(e.target.value)}/></label><button className={button} disabled={busy || loading || !config.steps.length} onClick={() => void begin()}>Start routine</button>{!config.steps.length ? <p className="text-sm text-neutral-400">Add steps before starting.</p> : null}</div>}
    <div className="space-y-3"><div className="flex items-center justify-between"><h2 className="text-xl font-semibold">Routine steps</h2><button className={button} onClick={() => { setDraft(config.steps.join('\n')); setEditing(!editing); }}>{editing ? 'Cancel' : 'Edit steps'}</button></div>
      {editing ? <form onSubmit={e => void saveSteps(e)} className="space-y-2"><label className="block text-sm">One step per line<textarea className={`${input} mt-2`} rows={8} value={draft} onChange={e => setDraft(e.target.value)} /></label><button className={button} disabled={busy}>Save steps</button></form> : <ol className="list-inside list-decimal text-neutral-300">{config.steps.map((step, i) => <li key={i}>{step}</li>)}</ol>}
    </div>
    <h2 className="text-xl font-semibold">History</h2>{runs.filter(x => x.run.endedAt).length === 0 ? <p className="text-sm text-neutral-400">No completed routines yet.</p> : runs.filter(x => x.run.endedAt).map(({ entry, run }) => <RunHistory key={entry.id} entry={entry} run={run} busy={busy} saveRun={saveRun}/>)}
  </section>;
}

function RunHistory({entry, run, busy, saveRun}: {entry: DocumentationEntry; run: RoutineRun; busy: boolean; saveRun: (entry: DocumentationEntry, run: RoutineRun) => Promise<boolean>}) {
  const [editing, setEditing] = useState(false); const [draft, setDraft] = useState(run); const [error, setError] = useState('');
  function save() {
    const times = [draft.startedAt, ...draft.steps.flatMap(s => [s.start, s.end].filter((x): x is string => !!x)), draft.endedAt].filter((x): x is string => !!x).map(Date.parse);
    if (times.some(t => !Number.isFinite(t)) || times.some((t, i) => i > 0 && t < times[i-1])) { setError('Times must be valid and in order.'); return; }
    void saveRun(entry, draft).then(saved => { if (saved) setEditing(false); });
  }
  function changeStep(i: number, field: 'start' | 'end', value: string) { const date = new Date(value); if (!Number.isFinite(date.getTime())) return; setDraft({...draft, steps: draft.steps.map((s, n) => n === i ? {...s, [field]: date.toISOString()} : s)}); }
  return <div className="space-y-2 rounded border border-neutral-700 p-4"><div className="flex justify-between"><p>{new Date(run.startedAt).toLocaleString()} · {durationText(run.startedAt, run.endedAt!)}</p><button className={button} onClick={() => { setDraft(run); setEditing(!editing); }}>{editing ? 'Cancel' : 'Adjust times'}</button></div>
    {editing ? <div className="space-y-2"><label className="block text-sm">Routine started<input className={input} type="datetime-local" value={toLocal(draft.startedAt)} onChange={e => { const d = new Date(e.target.value); if (Number.isFinite(d.getTime())) setDraft({...draft, startedAt: d.toISOString()}); }}/></label>{draft.steps.map((s,i) => s.start && s.end ? <div key={i}><p>{s.name}</p><label className="block text-sm">Start<input className={input} type="datetime-local" value={toLocal(s.start)} onChange={e => changeStep(i,'start',e.target.value)}/></label><label className="block text-sm">End<input className={input} type="datetime-local" value={toLocal(s.end)} onChange={e => changeStep(i,'end',e.target.value)}/></label></div> : null)}<label className="block text-sm">Routine finished<input className={input} type="datetime-local" value={toLocal(draft.endedAt!)} onChange={e => {const d = new Date(e.target.value); if (Number.isFinite(d.getTime())) setDraft({...draft, endedAt: d.toISOString()});}}/></label>{error ? <p className="text-red-400">{error}</p> : null}<button className={button} disabled={busy} onClick={save}>Save corrections</button></div> : <ul className="text-sm text-neutral-300"><li>Before first step · {durationText(run.startedAt, run.steps.find(s => s.start)?.start ?? run.endedAt!)}</li>{run.steps.map((s,i) => <li key={i}>{s.name} · {s.status === 'skipped' ? 'Skipped' : s.start && s.end ? durationText(s.start, s.end) : s.status}</li>)}</ul>}
  </div>;
}
