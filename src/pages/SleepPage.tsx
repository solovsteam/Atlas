import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { addDays, civilDate, dateInput } from '@shared/recurringReferences';
import { missingData } from '@shared/missingData';
import { targetLightsOut } from '@shared/sleepLog';
import { localClock, requiredWakeForDate, sleepScreenState, type SleepScreenSettings } from '@shared/sleepScreens';
import { sleepHistoryContext, sleepTrialDisplay } from '@shared/sleepIntegration';
import { SleepHistory } from '../components/sleep/history/SleepHistory';
import { newSleepSeed } from '../lib/sleepRandom';
import { useSleepLog } from '../hooks/useSleepLog';
import { ClockField, Field, sleepButton, sleepInput } from '../components/sleep/SleepFields';
import { useSleepSave } from '../hooks/useSleepSave';
import { useSleepClock } from '../hooks/useSleepClock';

export function SleepPage() {
  const store = useSleepLog();
  const location = useLocation();
  useEffect(() => {
    if (!store.loading && location.hash === '#missing') document.getElementById('missing')?.scrollIntoView();
  }, [store.loading, location.hash]);
  const now = useSleepClock();
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const ready = useRef(false);
  if (!store.loading) ready.current = true;
  if (store.loading && !ready.current) return <p role="status">Loading the sleep log…</p>;
  if (store.error) return <p role="alert">{store.error}</p>;
  const state = sleepScreenState(store.entries, now, zone, addDays(civilDate(now, zone), 1));
  const target = targetLightsOut(store.nights.map(row => row.night), state.wakeDate, zone, store.settings);
  const required = requiredWakeForDate(state.wakeDate, zone, store.settings, state.evening?.night.evening?.earlyObligationAt);
  const missing = missingData(store.entries, now, zone, store.settings);
  const alarm = state.evening?.night.evening?.alarm ?? store.settings.anchorWake;
  const morningUrl = state.morningEntry ? `/sleep/morning?entry=${state.morningEntry.id}` : '/sleep/morning';
  const eveningUrl = state.evening ? `/sleep/evening?entry=${state.evening.entry.id}` : `/sleep/evening?for=${state.wakeDate}`;
  return <section className="mx-auto max-w-xl space-y-6 pb-4">
    <h1 className="text-3xl font-semibold tracking-tight">Sleep</h1>
    <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/10 p-5"><p className="text-sm text-neutral-400">Tonight’s target lights out</p><p className="mt-1 text-4xl font-semibold tabular-nums">{target.lightsOut}</p><p className="mt-3 text-sm text-neutral-300">Tomorrow’s alarm: {alarm === 'none' ? 'no alarm' : alarm}.</p><p className="mt-1 text-sm text-neutral-400">{required ? `Required wake time: ${localClock(required, zone)}.` : 'There is no required wake time.'}</p></div>
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <Link className={sleepButton} to={morningUrl}>Morning log <span className="float-right text-neutral-400">{state.morningMissing ? 'Not recorded' : 'Saved'}</span></Link>
      <Link className={sleepButton} to={eveningUrl}>Evening log <span className="float-right text-neutral-400">{state.eveningMissing ? 'Not recorded' : 'Saved'}</span></Link>
      <Link className={sleepButton} to={state.evening ? `/sleep/lights-out?entry=${state.evening.entry.id}` : `/sleep/lights-out?for=${state.wakeDate}`}>Lights out <span className="float-right text-neutral-400">{state.evening?.night.evening?.lightsOut ? 'Saved' : 'Not recorded'}</span></Link>
      <Link className={sleepButton} to="/sleep/test">Reaction test <span className="float-right text-neutral-400">{store.tests.some(row => civilDate(new Date(row.result.startedAt), zone) === state.today) ? 'Saved' : '3 minutes'}</span></Link>
    </div>
    <section id="missing" className="space-y-3 rounded-xl border border-neutral-800 p-4"><h2 className="text-lg font-semibold">Missing</h2><p className="text-xs text-neutral-400">The last 7 days. Today’s entries appear when they are due.</p>{missing.length ? <ul className="divide-y divide-neutral-800">{missing.map(row => <li key={`${row.date}:${row.kind}`}><Link className="flex min-h-11 items-center justify-between gap-3 py-3 text-sm text-indigo-200" to={row.to}><span>{row.label}</span><span className="shrink-0 text-neutral-400">{row.date}</span></Link></li>)}</ul> : <p className="text-sm text-neutral-400">Nothing is missing.</p>}</section>
    <SleepSettings settings={store.settings} saveSettings={store.saveSettings} today={state.today} reminderAt={new Date(Date.parse(target.lightsOutAt) - store.settings.eveningReminderLeadMinutes * 60000)} timeZone={zone} />
    <SleepHistory nights={store.nights.map(row => row.night)} tests={store.tests.map(row => row.result)} settings={store.settings} throughDate={state.today} context={sleepHistoryContext(store.entries, store.settings)} />
    {store.nights.length ? <details className="rounded-xl border border-neutral-800 p-4"><summary className="cursor-pointer font-medium">Correct a saved night</summary><ul className="mt-3 space-y-4">{store.nights.map(({ entry, night }) => <li key={entry.id} className="space-y-2 text-sm"><p className="text-neutral-400">{new Date(night.morning?.wakeAt ?? night.evening?.lightsOut ?? entry.occurredAt).toLocaleDateString(undefined, { timeZone: zone })}</p><div className="flex flex-wrap gap-2"><Link className={sleepButton} to={`/sleep/evening?entry=${entry.id}`}>Evening</Link><Link className={sleepButton} to={`/sleep/lights-out?entry=${entry.id}`}>Lights out</Link><Link className={sleepButton} to={`/sleep/morning?entry=${entry.id}`}>Morning</Link></div></li>)}</ul></details> : null}
  </section>;
}
function SleepSettings({ settings, saveSettings, reminderAt, timeZone, today }: { settings: SleepScreenSettings; saveSettings: (settings: SleepScreenSettings) => Promise<unknown>; reminderAt: Date; timeZone: string; today: string }) {
  const [draft, setDraft] = useState(settings);
  useEffect(() => setDraft(settings), [settings]);
  const save = useSleepSave();
  const [startDate, setStartDate] = useState(today);
  const trial = sleepTrialDisplay(settings.trial, today);
  const patch = (value: Partial<SleepScreenSettings>) => setDraft(current => ({ ...current, ...value }));
  return <details className="rounded-xl border border-neutral-800 p-4"><summary className="cursor-pointer text-lg font-medium">Sleep settings</summary><div className="mt-5 space-y-6">
    <Field title="Supplement trial">
      {settings.trial ? <div className="space-y-2 text-sm"><p>Phase: {trial.phase === 'normal-level' ? 'Normal level' : trial.phase === 'trial' ? 'Trial' : 'Not started yet'}.</p><p>Normal level: {trial.normalStart} to {trial.normalEnd}.</p><p>The trial starts on {trial.trialStart} and continues until the answer is clear.</p><p className="text-xs text-neutral-400">Dates refer to the morning after each night.</p></div> : <><label className="block space-y-2 text-sm"><span>Normal-level start date (wake date)</span><input aria-label="Normal-level start date" className={sleepInput} type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></label><button type="button" className={sleepButton} disabled={save.busy} onClick={() => void save.run(async () => {
        dateInput(startDate);
        await saveSettings({ ...settings, trial: { normalLevelStartDate: startDate, seed: newSleepSeed() } });
      }, 'The trial was started.')}>Start</button></>}
    </Field>
    <Field title="Weekday obligation"><p className="text-xs text-neutral-400">The obligation includes work, travel and groceries. Weekends have no obligation by default.</p>{['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map((day, i) => {
      const weekday = i + 1;
      const obligation = draft.weekdayObligation[weekday];
      const wakeDate = addDays(today, (weekday - dateInput(today).weekday + 7) % 7);
      const required = requiredWakeForDate(wakeDate, timeZone, draft);
      const update = (value: Partial<NonNullable<typeof obligation>>) => obligation && patch({ weekdayObligation: { ...draft.weekdayObligation, [weekday]: { ...obligation, ...value } } });
      return <div key={day} className="space-y-3 rounded-xl border border-neutral-800 p-3">
        <label className="flex items-center gap-3 text-sm"><input className="size-5 accent-indigo-400" type="checkbox" checked={!!obligation} onChange={e => patch({ weekdayObligation: { ...draft.weekdayObligation, [weekday]: e.target.checked ? { start: '09:30', end: '19:30', label: 'Work, travel and groceries' } : null } })} />{day}</label>
        {obligation ? <><div className="grid min-w-0 grid-cols-2 gap-3"><ClockField label={`${day} start`} value={obligation.start} onChange={start => update({ start })} /><ClockField label={`${day} end`} value={obligation.end} onChange={end => update({ end })} /></div><label className="block space-y-2 text-sm"><span className="block">{day} label</span><input className={`${sleepInput} w-full`} value={obligation.label} onChange={e => update({ label: e.target.value })} /></label></> : null}
        <p className="text-sm text-neutral-400">{required ? `Up by ${localClock(required, timeZone)}, ${draft.preparationMinutes} min to get ready` : 'There is no required wake time.'}</p>
        {draft.weekdayWake[weekday] ? <p className="text-xs text-neutral-400">The saved explicit wake time is {draft.weekdayWake[weekday]}.</p> : null}
      </div>;
    })}</Field>
    <label className="flex items-center justify-between gap-3 text-sm">Preparation (minutes)<input className={`${sleepInput} w-24`} aria-label="Preparation minutes" type="number" min="0" max="1440" step="5" value={draft.preparationMinutes} onChange={e => patch({ preparationMinutes: e.target.valueAsNumber })} /></label>
    <ClockField label="Anchor wake time" value={draft.anchorWake} onChange={anchorWake => patch({ anchorWake })} />
    <p className="text-sm text-neutral-400">Set the evening automation to {localClock(reminderAt, timeZone)}. Set the reaction test automation to {settings.testTime}.</p>
    <button className={`${sleepButton} w-full bg-indigo-500 font-semibold`} disabled={save.busy} type="button" onClick={() => void save.run(async () => {
      if (!Number.isFinite(draft.preparationMinutes) || draft.preparationMinutes < 0 || draft.preparationMinutes > 1440) throw new Error('Enter preparation minutes from 0 to 1440.');
      if (Object.values(draft.weekdayObligation).some(value => value && (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value.start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.end) || !value.label.trim()))) throw new Error('Enter a start time, end time and label for each obligation.');
      await saveSettings(draft);
    }, 'The settings were saved.')}>{save.busy ? 'Saving…' : 'Save the settings'}</button>{save.feedback}
  </div></details>;
}
