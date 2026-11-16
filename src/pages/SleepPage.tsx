import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { addDays, civilDate, dateInput } from '@shared/recurringReferences';
import { targetLightsOut } from '@shared/sleepLog';
import { localClock, requiredWakeForDate, sleepScreenState, SUPPLEMENTS, type SleepScreenSettings } from '@shared/sleepScreens';
import { sleepHistoryContext, sleepTrialDisplay } from '@shared/sleepIntegration';
import { SleepHistory } from '../components/sleep/history/SleepHistory';
import { newSleepSeed } from '../lib/sleepRandom';
import { useSleepLog } from '../hooks/useSleepLog';
import { ClockField, Field, sleepButton, sleepInput } from '../components/sleep/SleepFields';
import { useSleepSave } from '../hooks/useSleepSave';
import { useSleepClock } from '../hooks/useSleepClock';

export function SleepPage() {
  const store = useSleepLog();
  const now = useSleepClock();
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const ready = useRef(false);
  if (!store.loading) ready.current = true;
  if (store.loading && !ready.current) return <p role="status">Loading the sleep log…</p>;
  if (store.error) return <p role="alert">{store.error}</p>;
  const state = sleepScreenState(store.entries, now, zone, addDays(civilDate(now, zone), 1));
  const target = targetLightsOut(store.nights.map(row => row.night), state.wakeDate, zone, store.settings);
  const required = requiredWakeForDate(state.wakeDate, zone, store.settings, state.evening?.night.evening?.earlyObligationAt);
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
    <Field title="Usual evening doses">{SUPPLEMENTS.map(s => <label className="flex items-center justify-between gap-3 text-sm" key={s.id}>{s.label} ({s.unit})<input className={`${sleepInput} w-24`} aria-label={`${s.label}: usual dose`} type="number" min="0.01" step="any" value={draft.usualDoses[s.id]} onChange={e => patch({ usualDoses: { ...draft.usualDoses, [s.id]: e.target.valueAsNumber } })} /></label>)}</Field>
    <label className="flex items-center justify-between gap-3 text-sm">Instant coffee (teaspoons)<input className={`${sleepInput} w-24`} aria-label="Usual coffee amount" type="number" min="0.01" step="any" value={draft.coffeeTeaspoons} onChange={e => patch({ coffeeTeaspoons: e.target.valueAsNumber })} /></label>
    <Field title="Required wake time"><p className="text-xs text-neutral-400">These are wake times. Preparation is already included. Weekends have no required wake time.</p>{['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map((day, i) => <div key={day} className="space-y-2"><label className="flex items-center gap-3 text-sm"><input className="size-5 accent-indigo-400" type="checkbox" checked={!!draft.weekdayWake[i + 1]} onChange={e => patch({ weekdayWake: { ...draft.weekdayWake, [i + 1]: e.target.checked ? '08:00' : null } })} />{day} has a required wake time</label>{draft.weekdayWake[i + 1] ? <ClockField label={day} value={draft.weekdayWake[i + 1]!} onChange={clock => patch({ weekdayWake: { ...draft.weekdayWake, [i + 1]: clock } })} /> : null}</div>)}</Field>
    <label className="flex items-center justify-between gap-3 text-sm">Preparation (minutes)<input className={`${sleepInput} w-24`} aria-label="Preparation minutes" type="number" min="0" max="1440" step="5" value={draft.preparationMinutes} onChange={e => patch({ preparationMinutes: e.target.valueAsNumber })} /></label>
    <ClockField label="Anchor wake time" value={draft.anchorWake} onChange={anchorWake => patch({ anchorWake })} />
    <p className="text-sm text-neutral-400">Set the evening automation to {localClock(reminderAt, timeZone)}. Set the reaction test automation to {settings.testTime}.</p>
    <button className={`${sleepButton} w-full bg-indigo-500 font-semibold`} disabled={save.busy} type="button" onClick={() => void save.run(async () => {
      if ([...Object.values(draft.usualDoses), draft.coffeeTeaspoons].some(n => !Number.isFinite(n) || n <= 0)) throw new Error('Enter an amount greater than zero.');
      if (!Number.isFinite(draft.preparationMinutes) || draft.preparationMinutes < 0 || draft.preparationMinutes > 1440) throw new Error('Enter preparation minutes from 0 to 1440.');
      await saveSettings(draft);
    }, 'The settings were saved.')}>{save.busy ? 'Saving…' : 'Save the settings'}</button>{save.feedback}
  </div></details>;
}
