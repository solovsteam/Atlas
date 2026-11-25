import { useSearchParams } from 'react-router-dom';
import { confirmedDay } from '@shared/dayEvidence';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { addDays, civilDate } from '@shared/recurringReferences';
import { dayText, instantAt, instantText, splitInstant } from '@shared/dayLabels';
import { DateTimeWheel } from '../components/tracking/DateTimeWheel';
import { DEFAULT_INTAKE_BUTTONS, intakeAmountText, intakeNow, intakesOnDate, type Intake, type IntakeButton, type IntakeRecord } from '@shared/intake';
import { caffeineMg, withAmountMl } from '@shared/drinks';
import { mealsOnDate, type EveningMeal, type MealRecord } from '@shared/meals';
import { DrinkSettings } from '../components/DrinkSettings';
import { localClock } from '@shared/sleepScreens';
import { sleepTrialDisplay } from '@shared/sleepIntegration';
import { useSleepLog } from '../hooks/useSleepLog';
import { useSleepClock } from '../hooks/useSleepClock';
import { useSleepSave } from '../hooks/useSleepSave';
import { InstantField, sleepButton, sleepInput } from '../components/sleep/SleepFields';

type Store = ReturnType<typeof useSleepLog>;
type Editor = { intake: Intake; row?: IntakeRecord } | { meal: EveningMeal; row?: MealRecord };
type Picker = { title: string; save: (at: string) => Promise<unknown>; success: string };

export function EveningIntakes({ date, timeZone, onReturn }: { date: string; timeZone: string; onReturn: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  return <dialog ref={dialog} aria-label="Intakes for the evening log" onCancel={event => {
    event.preventDefault();
    if (!dialog.current?.querySelector('[role="dialog"]')) onReturn();
  }} className="fixed inset-0 m-auto max-h-dvh w-full max-w-xl overflow-y-auto overscroll-contain rounded-xl bg-neutral-950 px-4 pb-6 text-white backdrop:bg-black/75">
    <div className="sticky top-0 z-10 bg-neutral-950 py-3"><button type="button" className={sleepButton} onClick={onReturn}>Back to evening log</button></div>
    <IntakePage reviewDate={date} reviewZone={timeZone} />
  </dialog>;
}

export function IntakePage({ reviewDate, reviewZone }: { reviewDate?: string; reviewZone?: string } = {}) {
  const store = useSleepLog();
  const [params, setParams] = useSearchParams();
  const clock = useSleepClock();
  const now = new Date(Math.max(Date.now(), clock.getTime()));
  const zone = reviewZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [selectedDate, setSelectedDate] = useState<string | null>(() => { const date = reviewDate ?? params.get('date'); return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null; });
  const [editor, setEditor] = useState<Editor | null>(null);
  const [picker, setPicker] = useState<Picker | null>(null);
  const save = useSleepSave();
  const editId = reviewDate ? null : params.get('edit');
  // A link from the Log box opens that intake in the editor once it has loaded.
  useEffect(() => {
    if (!editId || store.loading) return;
    const row = store.intakes.find(r => r.id === editId);
    if (row) {
      setEditor({ intake: row.intake, row });
      setSelectedDate(civilDate(new Date(row.intake.takenAt), Intl.DateTimeFormat().resolvedOptions().timeZone));
    }
    setParams(current => { const next = new URLSearchParams(current); next.delete('edit'); return next; }, { replace: true });
  }, [editId, store.loading, store.intakes, setParams]);
  if (store.loading) return <p role="status">Loading intakes…</p>;
  if (store.error) return <p role="alert">{store.error}</p>;
  const today = civilDate(now, zone);
  const date = selectedDate ?? today;
  const past = date !== today;
  const assignment = past ? undefined : sleepTrialDisplay(store.settings.trial, addDays(today, 1)).assignment;
  const buttons = store.settings.intakeButtons;
  const dayIntakes = intakesOnDate(store.intakes, date, zone);
  const dayMeals = mealsOnDate(store.meals, date, zone);
  const lastMeal = dayMeals.find(row => Date.parse(row.meal.finishedAt) <= now.getTime());
  const history = [
    ...dayIntakes.map(row => ({ at: row.intake.takenAt, row, kind: 'intake' as const })),
    ...dayMeals.map(row => ({ at: row.meal.finishedAt, row, kind: 'meal' as const })),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || a.row.id.localeCompare(b.row.id));
  const showDate = (at: string) => setSelectedDate(civilDate(new Date(at), zone) === today ? null : civilDate(new Date(at), zone));
  return <section className="mx-auto max-w-xl space-y-5 pb-4">
    <div className="flex items-baseline justify-between gap-3"><h1 className="text-3xl font-semibold tracking-tight">Intake</h1><p className="text-sm text-neutral-400">{dayText(date, today)}</p></div>
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {buttons.filter(b => !b.hidden).map(button => {
        const shared = buttons.some(other => !other.hidden && other.id !== button.id && other.substance === button.substance);
        const last = dayIntakes.find(row => row.intake.substance === button.substance && Date.parse(row.intake.takenAt) <= now.getTime()
          && (!shared || row.doseKnown && row.intake.dose === button.dose && row.intake.unit === button.unit));
        const factor = assignment?.factors.find(f => f.factorId === button.substance);
        const matches = !!factor?.on && factor.level?.dose === button.dose && factor.level.unit === button.unit;
        const badge = !factor ? undefined : matches ? { text: 'Tonight', on: true } : button.substance === 'glycine' && button.dose === 5 && button.unit === 'g' ? { text: 'Daytime', on: false } : { text: 'Not tonight', on: false };
        return <IntakeTile past={past} key={button.id} name={button.label} amount={`${button.dose} ${button.unit}`} icon={<Monogram text={button.label} seed={button.substance} />} status={last ? last.timeKnown ? localClock(last.intake.takenAt, zone) : 'Recorded' : undefined} badge={badge} busy={save.busy}
          onNow={() => void save.run(() => store.saveIntake(intakeNow(button, new Date(), zone)), `${button.label} was recorded.`)}
          onEarlier={() => setPicker({ title: `${button.label} · ${button.dose} ${button.unit}`, success: `${button.label} was recorded.`, save: async at => { await store.saveIntake(intakeNow(button, new Date(at), zone)); showDate(at); } })} />;
      })}
      <IntakeTile past={past} name="Finished eating" amount="Evening meal" icon={<MealIcon />} status={lastMeal ? localClock(lastMeal.meal.finishedAt, zone) : undefined} busy={save.busy}
        onNow={() => void save.run(async () => { await store.saveMeal({ finishedAt: new Date().toISOString(), timeZone: zone }); setSelectedDate(null); }, 'The evening meal was recorded.')}
        onEarlier={() => setPicker({ title: 'Finished eating', success: 'The evening meal was recorded.', save: async at => { await store.saveMeal({ finishedAt: at, timeZone: zone }); showDate(at); } })} />
    </div>
    <p className="text-xs text-neutral-500">{past ? 'Choose an intake or meal to set its time on this day.' : 'The top of a tile records the intake now. “Earlier” lets you choose the time.'}</p>
    {save.message || save.error ? <div className="fixed inset-x-4 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-xl rounded-xl border border-neutral-700 bg-neutral-950 px-4 shadow-xl lg:bottom-4">{save.feedback}</div> : null}
    {picker ? <MomentSheet date={date} title={picker.title} timeZone={zone} busy={save.busy} onClose={() => setPicker(null)} onSave={at => void save.run(async () => { await picker.save(at); setPicker(null); }, picker.success)} /> : null}
    {editor ? <Sheet label={'meal' in editor ? 'Evening meal' : 'Intake'} onClose={() => setEditor(null)}>{'meal' in editor
      ? <MealEditor key={editor.row?.id ?? 'new-meal'} value={editor.meal} busy={save.busy} onCancel={() => setEditor(null)} onSave={meal => void save.run(async () => {
        await store.saveMeal(meal, editor.row?.id);
        showDate(meal.finishedAt);
        setEditor(null);
      }, 'The evening meal was saved.')} onDelete={editor.row ? () => void save.run(async () => { await store.deleteEntry(editor.row!.id); setEditor(null); }, 'The evening meal was deleted.') : undefined} />
      : <IntakeEditor key={editor.row?.id ?? 'new'} value={editor.intake} row={editor.row} buttons={buttons} busy={save.busy} onCancel={() => setEditor(null)} onSave={intake => void save.run(async () => {
        const row = editor.row;
        const separate = row?.entry.data.kind === 'intake';
        await store.saveIntake(intake, separate ? row.entry.id : undefined, row?.legacyKey);
        showDate(intake.takenAt);
        setEditor(null);
      }, 'The intake was saved.')} onDelete={editor.row ? () => void save.run(async () => { await store.deleteIntake(editor.row!); setEditor(null); }, 'The intake was deleted.') : undefined} />}</Sheet> : null}
    <section aria-label="Intake history" className="rounded-2xl border border-neutral-800">
      <div className="flex items-center gap-1 border-b border-neutral-800 p-1">
        <button aria-label="Previous day" className="min-h-11 min-w-11 rounded-xl text-xl text-neutral-300 hover:bg-neutral-800" type="button" onClick={() => setSelectedDate(addDays(date, -1))}>‹</button>
        <label className="relative flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-xl text-sm font-medium hover:bg-neutral-800">{dayText(date, today)}<input aria-label="Intake history date" className="absolute inset-0 cursor-pointer opacity-0" type="date" max={today} value={date} onChange={e => { if (e.target.value) setSelectedDate(e.target.value === today ? null : e.target.value); }} /></label>
        <button aria-label="Next day" className="min-h-11 min-w-11 rounded-xl text-xl text-neutral-300 hover:bg-neutral-800 disabled:opacity-30" type="button" disabled={date >= today} onClick={() => { const next = addDays(date, 1); setSelectedDate(next >= today ? null : next); }}>›</button>
      </div>
      {history.length ? <ul className="divide-y divide-neutral-800">{history.map(record => <li key={record.row.id}><button className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left hover:bg-neutral-900" type="button" onClick={() => {
        if (record.kind === 'meal') { setEditor({ meal: record.row.meal, row: record.row }); return; }
        const row = record.row;
        setEditor({ intake: { ...row.intake, dose: row.doseKnown ? row.intake.dose : buttons.find(b => b.substance === row.intake.substance)?.dose ?? 1 }, row });
      }}>
        <span className="w-12 shrink-0 text-sm tabular-nums text-neutral-400">{record.kind === 'meal' || record.row.timeKnown ? localClock(record.at, zone) : '—'}</span>
        <span className="min-w-0 flex-1 break-words text-sm">{record.kind === 'meal' ? 'Finished eating' : record.row.intake.label}</span>
        <span className="shrink-0 text-xs text-neutral-400">{record.kind === 'meal' ? 'Evening meal' : record.row.doseKnown ? intakeAmountText(record.row.intake) : 'Dose not recorded'}</span>
      </button></li>)}</ul> : <p className="px-4 py-4 text-sm text-neutral-400">Nothing recorded on this day.</p>}
      <p className="border-t border-neutral-800 px-4 py-2 text-xs text-neutral-500">{confirmedDay(store.entries, date, zone) ? `The day is confirmed: ${dayIntakes.length} intakes and ${dayMeals.length} evening meals.` : 'The day is not confirmed, so the daily count is unknown.'}</p>
    </section>
    {!reviewDate && <><IntakeSettings store={store} /><DrinkSettings store={store} /></>}
  </section>;
}

const TILE_COLOURS = [
  'from-indigo-400 to-indigo-600', 'from-sky-400 to-sky-600', 'from-emerald-400 to-emerald-600', 'from-amber-400 to-amber-600',
  'from-rose-400 to-rose-600', 'from-violet-400 to-violet-600', 'from-teal-400 to-teal-600', 'from-orange-400 to-orange-600',
];
function Monogram({ text, seed }: { text: string; seed: string }) {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return <span aria-hidden="true" className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-lg font-semibold text-white shadow ${TILE_COLOURS[hash % TILE_COLOURS.length]}`}>{text.trim().charAt(0).toUpperCase()}</span>;
}
function MealIcon() {
  return <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-lime-400 to-green-600 text-white shadow"><svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" viewBox="0 0 24 24"><path d="M7 3v8M4 3v5a3 3 0 0 0 6 0V3M7 11v10M17 21V3c-2 1-3 4-3 8h3" /></svg></span>;
}
function ClockIcon() {
  return <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
}
/** An app-icon tile with two halves: the top records now, the bottom opens a time picker. */
function IntakeTile({ past, name, amount, icon, status, badge, busy, onNow, onEarlier }: { past: boolean; name: string; amount: string; icon: ReactNode; status?: string; badge?: { text: string; on: boolean }; busy: boolean; onNow: () => void; onEarlier: () => void }) {
  return <div className={`flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-neutral-900 ${badge?.on ? 'border-indigo-500/60' : 'border-neutral-800'}`}>
    <button aria-label={`${name}, ${amount}: ${past ? "choose time" : "record now"}`} className="relative flex flex-1 flex-col items-center gap-1 px-2 pb-2 pt-3 text-center transition hover:bg-neutral-800 active:scale-95 disabled:opacity-40" disabled={busy} type="button" onClick={past ? onEarlier : onNow}>
      {status ? <span className="absolute right-1.5 top-1.5 rounded-full bg-emerald-500/15 px-1.5 text-[10px] tabular-nums text-emerald-300">✓ {status}</span> : null}
      {icon}
      <span className="line-clamp-2 text-xs font-medium leading-tight">{name}</span>
      <span className="text-[11px] text-neutral-400">{amount}</span>
      {past && <span className="text-xs text-indigo-200 underline">Choose time</span>}
      {badge ? <span className={`text-[10px] ${badge.on ? 'text-indigo-300' : 'text-neutral-500'}`}>{badge.text}</span> : null}
    </button>
    {!past && <button aria-label={`${name}, ${amount}: choose an earlier time`} className="flex min-h-9 items-center justify-center gap-1 border-t border-neutral-800 bg-neutral-950/60 text-[11px] text-neutral-400 hover:bg-neutral-800 hover:text-white disabled:opacity-40" disabled={busy} type="button" onClick={onEarlier}><ClockIcon />Earlier</button>}
  </div>;
}
function Sheet({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return <div aria-label={label} aria-modal="true" className="fixed inset-0 z-50 flex items-end justify-center md:items-center" role="dialog">
    <button aria-label="Close" className="absolute inset-0 bg-black/70" type="button" onClick={onClose} />
    <div className="relative max-h-[90dvh] w-full max-w-sm overflow-y-auto rounded-t-2xl border border-neutral-800 bg-neutral-900 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 shadow-2xl md:rounded-2xl md:pb-4">{children}</div>
  </div>;
}
/** The small sheet behind "Earlier": one wheel for the day and hour, one for the minute. */
function MomentSheet({ date, title, timeZone, busy, onClose, onSave }: { date: string; title: string; timeZone: string; busy: boolean; onClose: () => void; onSave: (at: string) => void }) {
  const [openedAt] = useState(() => new Date());
  const [value, setValue] = useState(() => {
    const parts = splitInstant(openedAt.toISOString(), timeZone);
    if (date === parts.date) return new Date(Math.floor(openedAt.getTime() / 60000) * 60000).toISOString();
    return instantAt({ date, hour: parts.hour }, parts.minute, timeZone);
  });
  const future = Date.parse(value) > openedAt.getTime();
  const minutesAgo = Math.round((openedAt.getTime() - Date.parse(value)) / 60000);
  const ago = minutesAgo < 1 ? 'now' : minutesAgo < 60 ? `${minutesAgo} min ago` : `${Math.floor(minutesAgo / 60)} h ${minutesAgo % 60} min ago`;
  return <Sheet label={`${title}: when?`} onClose={onClose}>
    <h2 className="text-lg font-semibold">{title}</h2>
    <p className={`mb-3 text-sm ${future ? 'text-amber-300' : 'text-neutral-400'}`} role="status">{future ? 'That time is in the future.' : `${instantText(value, timeZone, civilDate(openedAt, timeZone))} · ${ago}`}</p>
    <DateTimeWheel label="Taken at" value={value} timeZone={timeZone} onChange={setValue} daysAfter={0} max={openedAt.toISOString()} />
    <div className="mt-4 grid grid-cols-[1fr_2fr] gap-2">
      <button className="rounded-xl border border-neutral-700 px-4 py-3 text-sm text-neutral-300 hover:border-neutral-500" type="button" onClick={onClose}>Cancel</button>
      <button className="rounded-xl bg-indigo-500 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-40" disabled={busy || future} type="button" onClick={() => onSave(value)}>{busy ? 'Saving…' : 'Save'}</button>
    </div>
  </Sheet>;
}
function MealEditor({ value, busy, onCancel, onSave, onDelete }: { value: EveningMeal; busy: boolean; onCancel: () => void; onSave: (meal: EveningMeal) => void; onDelete?: () => void }) {
  const [draft, setDraft] = useState(value);
  return <form aria-label="Evening meal time" className="space-y-4" onSubmit={e => { e.preventDefault(); onSave(draft); }}>
    <h2 className="text-lg font-medium">{onDelete ? 'Edit evening meal' : 'Record evening meal'}</h2>
    <InstantField label="Finished eating" value={draft.finishedAt} timeZone={draft.timeZone} onChange={finishedAt => setDraft(current => ({ ...current, finishedAt }))} />
    <p className="text-xs text-neutral-400">Time zone: {draft.timeZone}</p>
    <div className="flex flex-wrap gap-2"><button className={`${sleepButton} bg-indigo-500`} disabled={busy} type="submit">Save the meal time</button><button className={sleepButton} disabled={busy} type="button" onClick={onCancel}>Cancel</button>{onDelete ? <button className={`${sleepButton} text-red-300`} disabled={busy} type="button" onClick={onDelete}>Delete</button> : null}</div>
  </form>;
}
function IntakeEditor({ value, row, buttons, busy, onCancel, onSave, onDelete }: { value: Intake; row?: IntakeRecord; buttons: IntakeButton[]; busy: boolean; onCancel: () => void; onSave: (value: Intake) => void; onDelete?: () => void }) {
  const [draft, setDraft] = useState(value);
  const patch = (value: Partial<Intake>) => setDraft(current => ({ ...current, ...value }));
  const selection = buttons.find(b => b.substance === draft.substance && b.dose === draft.dose && b.unit === draft.unit)?.id ?? '';
  return <form className="space-y-4" onSubmit={e => { e.preventDefault(); onSave(draft); }}>
    <h2 className="text-lg font-medium">{row ? 'Edit intake' : 'Taken earlier'}</h2>
    {row && (!row.timeKnown || !row.doseKnown) ? <p className="text-sm text-neutral-400">The old record is incomplete. Enter the actual time and dose before saving.</p> : null}
    {draft.drink ? null : <label className="block space-y-2 text-sm"><span>Substance</span><select aria-label="Intake substance" className={`${sleepInput} w-full`} value={selection} onChange={e => { const b = buttons.find(b => b.id === e.target.value); if (b) patch({ substance: b.substance, label: b.label, dose: b.dose, unit: b.unit }); }}>
      {!selection ? <option value="">{draft.label}</option> : null}{buttons.map(b => <option key={b.id} value={b.id}>{b.label} · {b.dose} {b.unit}</option>)}
    </select></label>}
    {draft.drink ? <label className="block space-y-2 text-sm"><span className="block">Amount of {draft.drink.name} in ml</span><input aria-label="Drink amount in ml" className={`${sleepInput} w-full`} type="number" required min="1" max="5000" step="any" value={draft.drink.amountMl} onChange={e => {
      const drink = withAmountMl(draft.drink!, e.target.valueAsNumber);
      if (drink) patch({ drink, dose: caffeineMg(drink) });
    }} /><span className="block text-xs text-neutral-400">{draft.dose} mg caffeine at {draft.drink.caffeineMgPer100Ml} mg per 100 ml{draft.drink.estimate ? ' (estimate)' : ''}. {draft.drink.source}</span></label> : null}
    {draft.drink ? null : <div className="grid grid-cols-2 gap-3"><label className="space-y-2 text-sm"><span className="block">Dose</span><input aria-label="Intake dose" className={`${sleepInput} w-full`} type="number" required min="0.001" step="any" value={Number.isFinite(draft.dose) ? draft.dose : ''} onChange={e => patch({ dose: e.target.valueAsNumber })} /></label><label className="space-y-2 text-sm"><span className="block">Unit</span><input aria-label="Intake unit" className={`${sleepInput} w-full`} required value={draft.unit} onChange={e => patch({ unit: e.target.value })} /></label></div>}
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
