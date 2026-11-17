import { useSearchParams } from 'react-router-dom';
import { confirmedDay } from '@shared/dayEvidence';
import { useEffect, useState } from 'react';
import { addDays, civilDate } from '@shared/recurringReferences';
import { DEFAULT_INTAKE_BUTTONS, intakeNow, intakesOnDate, lastTakenToday, type Intake, type IntakeButton, type IntakeRecord } from '@shared/intake';
import { localClock } from '@shared/sleepScreens';
import { sleepTrialDisplay } from '@shared/sleepIntegration';
import { useSleepLog } from '../hooks/useSleepLog';
import { useSleepClock } from '../hooks/useSleepClock';
import { useSleepSave } from '../hooks/useSleepSave';
import { Field, InstantField, sleepButton, sleepInput } from '../components/sleep/SleepFields';

type Store = ReturnType<typeof useSleepLog>;
export function IntakePage() {
  const store = useSleepLog();
  const [params] = useSearchParams();
  const clock = useSleepClock();
  const now = new Date(Math.max(Date.now(), clock.getTime()));
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [selectedDate, setSelectedDate] = useState<string | null>(() => { const date = params.get('date'); return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null; });
  const [editor, setEditor] = useState<{ intake: Intake; row?: IntakeRecord } | null>(null);
  const save = useSleepSave();
  if (store.loading) return <p role="status">Loading intakes…</p>;
  if (store.error) return <p role="alert">{store.error}</p>;
  const date = selectedDate ?? civilDate(now, zone);
  const assignment = sleepTrialDisplay(store.settings.trial, addDays(civilDate(now, zone), 1)).assignment;
  const buttons = store.settings.intakeButtons;
  return <section className="mx-auto max-w-xl space-y-6 pb-4">
    <h1 className="text-3xl font-semibold tracking-tight">Intake</h1>
    <p className="text-sm text-neutral-400">Tap once to record what you took now.</p>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{buttons.filter(b => !b.hidden).map(button => {
      const last = lastTakenToday(store.intakes, button.substance, now, zone);
      const factor = assignment?.factors.find(f => f.factorId === button.substance);
      const matches = factor?.on && factor.level?.dose === button.dose && factor.level.unit === button.unit;
      return <button key={button.id} type="button" disabled={save.busy} className={`${sleepButton} min-h-24 w-full break-words p-4 text-left`} onClick={() => void save.run(() => store.saveIntake(intakeNow(button, new Date(), zone)), `${button.label} was recorded.`)}>
        <span className="block text-lg font-medium">{button.label}</span>
        <span className="block text-sm text-neutral-300">{button.dose} {button.unit}</span>
        <span className="mt-2 block text-xs text-neutral-400">{last ? last.timeKnown ? `Taken at ${localClock(last.intake.takenAt, zone)}` : 'Taken today. Time not recorded.' : 'No intake recorded today'}</span>
        {factor ? <span className="mt-1 block text-xs text-indigo-200">{matches ? 'Assigned tonight' : button.substance === 'glycine' && button.dose === 5 && button.unit === 'g' ? 'Daytime dose. Outside tonight’s assignment.' : 'Not assigned tonight at this dose'}</span> : null}
      </button>;
    })}</div>
    {save.message || save.error ? <div className="fixed inset-x-4 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-xl rounded-xl border border-neutral-700 bg-neutral-950 px-4 shadow-xl lg:bottom-4">{save.feedback}</div> : null}
    <button className="min-h-11 text-sm text-indigo-300 underline" type="button" onClick={() => {
      const button = buttons.find(b => !b.hidden) ?? buttons[0];
      if (button) setEditor({ intake: intakeNow(button, new Date(), zone) });
    }} disabled={!buttons.length}>Taken earlier</button>
    {editor ? <IntakeEditor key={editor.row?.id ?? 'new'} value={editor.intake} row={editor.row} buttons={buttons} busy={save.busy} onCancel={() => setEditor(null)} onSave={intake => void save.run(async () => {
      const row = editor.row;
      const separate = row?.entry.data.kind === 'intake';
      await store.saveIntake(intake, separate ? row.entry.id : undefined, row?.legacyKey);
      setEditor(null);
    }, 'The intake was saved.')} onDelete={editor.row ? () => void save.run(async () => { await store.deleteIntake(editor.row!); setEditor(null); }, 'The intake was deleted.') : undefined} /> : null}
    <Field title={date === civilDate(now, zone) ? 'Today’s intakes' : `Intakes on ${date}`}>
      <div className="flex flex-wrap items-center gap-2">
        <button className={sleepButton} type="button" onClick={() => setSelectedDate(addDays(date, -1))}>Previous day</button>
        <label className="text-sm">Date <input aria-label="Intake history date" className={`${sleepInput} max-w-full`} type="date" value={date} onChange={e => { if (e.target.value) setSelectedDate(e.target.value); }} /></label>
        {selectedDate ? <button className={sleepButton} type="button" onClick={() => setSelectedDate(null)}>Today</button> : null}
      </div>
      <p className="text-sm text-neutral-400">{confirmedDay(store.entries, date, zone) ? `${intakesOnDate(store.intakes, date, zone).length} intakes. The day is confirmed.` : 'Not confirmed. The daily count is unknown.'}</p>
      <ul className="space-y-2">{intakesOnDate(store.intakes, date, zone).map(row => <li key={row.id}><button className={`${sleepButton} flex w-full items-center justify-between gap-3 text-left`} type="button" onClick={() => setEditor({ intake: { ...row.intake, dose: row.doseKnown ? row.intake.dose : buttons.find(b => b.substance === row.intake.substance)?.dose ?? 1 }, row })}>
        <span className="min-w-0 break-words">{row.intake.label}<span className="block text-xs text-neutral-400">{row.doseKnown ? `${row.intake.dose} ${row.intake.unit}` : 'Dose not recorded'}</span></span><span className="shrink-0 text-sm text-neutral-400">{row.timeKnown ? localClock(row.intake.takenAt, zone) : 'Time not recorded'}</span>
      </button></li>)}</ul>
      {!intakesOnDate(store.intakes, date, zone).length ? <p className="text-sm text-neutral-400">No intakes recorded for this day.</p> : null}
    </Field>
    <IntakeSettings store={store} />
  </section>;
}
function IntakeEditor({ value, row, buttons, busy, onCancel, onSave, onDelete }: { value: Intake; row?: IntakeRecord; buttons: IntakeButton[]; busy: boolean; onCancel: () => void; onSave: (value: Intake) => void; onDelete?: () => void }) {
  const [draft, setDraft] = useState(value);
  const patch = (value: Partial<Intake>) => setDraft(current => ({ ...current, ...value }));
  const selection = buttons.find(b => b.substance === draft.substance && b.dose === draft.dose && b.unit === draft.unit)?.id ?? '';
  return <form className="space-y-4 rounded-xl border border-indigo-500/40 p-4" onSubmit={e => { e.preventDefault(); onSave(draft); }}>
    <h2 className="text-lg font-medium">{row ? 'Edit intake' : 'Taken earlier'}</h2>
    {row && (!row.timeKnown || !row.doseKnown) ? <p className="text-sm text-neutral-400">The old record is incomplete. Enter the actual time and dose before saving.</p> : null}
    <label className="block space-y-2 text-sm"><span>Substance</span><select aria-label="Intake substance" className={`${sleepInput} w-full`} value={selection} onChange={e => { const b = buttons.find(b => b.id === e.target.value); if (b) patch({ substance: b.substance, label: b.label, dose: b.dose, unit: b.unit }); }}>
      {!selection ? <option value="">{draft.label}</option> : null}{buttons.map(b => <option key={b.id} value={b.id}>{b.label} · {b.dose} {b.unit}</option>)}
    </select></label>
    <div className="grid grid-cols-2 gap-3"><label className="space-y-2 text-sm"><span className="block">Dose</span><input aria-label="Intake dose" className={`${sleepInput} w-full`} type="number" required min="0.001" step="any" value={Number.isFinite(draft.dose) ? draft.dose : ''} onChange={e => patch({ dose: e.target.valueAsNumber })} /></label><label className="space-y-2 text-sm"><span className="block">Unit</span><input aria-label="Intake unit" className={`${sleepInput} w-full`} required value={draft.unit} onChange={e => patch({ unit: e.target.value })} /></label></div>
    <InstantField label="Taken at" value={draft.takenAt} timeZone={draft.timeZone} onChange={takenAt => patch({ takenAt })} />
    <p className="text-xs text-neutral-400">Time zone: {draft.timeZone}</p>
    <div className="flex flex-wrap gap-2"><button className={`${sleepButton} bg-indigo-500`} disabled={busy} type="submit">Save</button><button className={sleepButton} disabled={busy} type="button" onClick={onCancel}>Cancel</button>{onDelete ? <button className={`${sleepButton} text-red-300`} disabled={busy} type="button" onClick={onDelete}>Delete</button> : null}</div>
  </form>;
}
function IntakeSettings({ store }: { store: Store }) {
  const [draft, setDraft] = useState(store.settings.intakeButtons);
  useEffect(() => setDraft(store.settings.intakeButtons), [store.settings.intakeButtons]);
  const save = useSleepSave();
  const patch = (id: string, value: Partial<IntakeButton>) => setDraft(current => current.map(b => b.id === id ? { ...b, ...value } : b));
  function move(index: number, delta: number) {
    setDraft(current => { const next = [...current]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; return next; });
  }
  return <details className="rounded-xl border border-neutral-800 p-4"><summary className="cursor-pointer font-medium">Intake settings</summary><div className="mt-4 space-y-4">
    {draft.map((b, index) => <fieldset className="space-y-3 rounded-xl border border-neutral-800 p-3" key={b.id}><legend className="px-1 text-sm">Button {index + 1}</legend>
      <label className="block space-y-1 text-sm"><span>Substance</span><select aria-label={`Button ${index + 1}: substance`} className={`${sleepInput} w-full`} value={b.substance} onChange={e => patch(b.id, { substance: e.target.value })}>
        {[...new Map(DEFAULT_INTAKE_BUTTONS.map(button => [button.substance, button])).values()].map(button => <option key={button.substance} value={button.substance}>{button.label}</option>)}
        {!DEFAULT_INTAKE_BUTTONS.some(button => button.substance === b.substance) ? <option value={b.substance}>{b.label}</option> : null}
      </select></label>
      <label className="block space-y-1 text-sm"><span>Name</span><input aria-label={`Button ${index + 1}: name`} className={`${sleepInput} w-full`} value={b.label} onChange={e => patch(b.id, { label: e.target.value })} /></label>
      <div className="grid grid-cols-2 gap-2"><label className="space-y-1 text-sm"><span className="block">Usual dose</span><input aria-label={`Button ${index + 1}: dose`} className={`${sleepInput} w-full`} type="number" min="0.001" step="any" value={Number.isFinite(b.dose) ? b.dose : ''} onChange={e => patch(b.id, { dose: e.target.valueAsNumber })} /></label><label className="space-y-1 text-sm"><span className="block">Unit</span><input aria-label={`Button ${index + 1}: unit`} className={`${sleepInput} w-full`} value={b.unit} onChange={e => patch(b.id, { unit: e.target.value })} /></label></div>
      <div className="flex flex-wrap items-center gap-2"><label className="mr-auto flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={b.hidden} onChange={e => patch(b.id, { hidden: e.target.checked })} />Hide</label><button className={sleepButton} type="button" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Move ${b.label} up`}>Up</button><button className={sleepButton} type="button" disabled={index === draft.length - 1} onClick={() => move(index, 1)} aria-label={`Move ${b.label} down`}>Down</button></div>
    </fieldset>)}
    <button className={sleepButton} type="button" onClick={() => { const id = `custom-${crypto.randomUUID()}`; setDraft(current => [...current, { id, substance: id, label: 'New substance', dose: 1, unit: 'dose', hidden: false }]); }}>Add a button</button>
    <button className={`${sleepButton} w-full bg-indigo-500`} type="button" disabled={save.busy} onClick={() => void save.run(async () => {
      for (const b of draft) intakeNow(b, new Date(), 'UTC');
      await store.saveSettings({ ...store.settings, intakeButtons: draft });
    }, 'The intake settings were saved.')}>Save intake settings</button>{save.feedback}
  </div></details>;
}
