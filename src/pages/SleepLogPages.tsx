import { useState, useRef, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { atLocalClock, addDays, dateInput } from '@shared/recurringReferences';
import { toggleTag } from '@shared/documentationEntries';
import { sleepNight, targetLightsOut, type SleepEvening, type SleepMorning, type SleepRating } from '@shared/sleepLog';
import { KAROLINSKA_SLEEPINESS_SCALE } from '@shared/reactionTest';
import { localClock, requiredWakeForDate, sleepScreenState, usualOnset } from '@shared/sleepScreens';
import { useSleepLog } from '../hooks/useSleepLog';
import { Choices, ClockField, Field, InstantField, SleepFrame, sleepButton } from '../components/sleep/SleepFields';
import { useSleepSave } from '../hooks/useSleepSave';
import { TrialSupplements } from '../components/sleep/TrialSupplements';
import { SleepChoiceCard } from '../components/sleep/SleepChoiceCard';
import { previousSleepChoices, recordedSleepWakeDate, sleepChoiceCard, sleepTrialDisplay } from '@shared/sleepIntegration';
import { randomSleepChoice, type SleepChoice } from '@shared/sleepTrial';
import { newSleepSeed } from '../lib/sleepRandom';
import { SituationChips } from '../components/tracking/SituationChips';
import { WheelColumn } from '../components/tracking/TimeWheel';

type Store = ReturnType<typeof useSleepLog>;
type LogKind = 'evening' | 'lights-out' | 'morning';
const DAY_RATINGS = [
  { value: 1, label: 'I could not do what I planned. I fought to stay awake.' },
  { value: 2, label: 'I was clearly slower than usual and tired for most of the day.' },
  { value: 3, label: 'I functioned, with some tired periods.' },
  { value: 4, label: 'A normal good day.' },
  { value: 5, label: 'Clear and energetic all day.' },
] as const;
const QUALITY = ['Very poor', 'Poor', 'Fair', 'Good', 'Very good'].map((label, i) => ({ value: (i + 1) as SleepRating, label }));

export function SleepLogPage({ kind }: { kind: LogKind }) {
  const store = useSleepLog();
  const [params] = useSearchParams();
  const ready = useRef(false);
  if (!store.loading) ready.current = true;
  if (store.loading && !ready.current) return <p role="status">Loading the sleep log…</p>;
  if (store.error) return <p role="alert">{store.error}</p>;
  const entryId = params.get('entry') ?? undefined;
  const requestedWakeDate = params.get('for') ?? undefined;
  if (requestedWakeDate) {
    try { dateInput(requestedWakeDate); } catch { return <p role="alert">Choose a valid date for this night.</p>; }
  }
  if (entryId && !store.nights.some(row => row.entry.id === entryId)) return <SleepFrame title="Night unavailable"><p>This night no longer exists.</p></SleepFrame>;
  return <LogForm key={`${kind}:${entryId ?? requestedWakeDate ?? 'current'}`} kind={kind} store={store} requestedId={entryId} requestedWakeDate={requestedWakeDate} />;
}
function LogForm({ kind, store, requestedId, requestedWakeDate }: { kind: LogKind; store: Store; requestedId?: string; requestedWakeDate?: string }) {
  const [deviceZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [openedAt] = useState(() => new Date());
  const state = sleepScreenState(store.entries, openedAt, deviceZone, requestedWakeDate);
  const initial = requestedId ? store.nights.find(row => row.entry.id === requestedId)?.entry : kind === 'morning' ? state.morningEntry : state.evening?.entry;
  const [timeZone] = useState(() => {
    const night = initial ? sleepNight(initial) : null;
    return (kind === 'morning' ? night?.morning?.timeZone : night?.evening?.timeZone) ?? deviceZone;
  });
  const [savedId, setSavedId] = useState(initial?.id);
  // Undo may delete a newly created row. Never reuse that row's id after deletion.
  const seenId = useRef(initial?.id);
  const exists = store.entries.some(row => row.id === savedId);
  if (exists) seenId.current = savedId;
  const entryId = savedId && (exists || seenId.current !== savedId) ? savedId : undefined;
  const original = initial ? sleepNight(initial) : null;
  const [evening, setEvening] = useState<SleepEvening>(() => ({ alarm: store.settings.anchorWake, dayRating: 4, tags: [], lateReasons: [], ...original?.evening, timeZone }));
  const [morning, setMorning] = useState<SleepMorning>(() => ({
    wokeBy: 'alarm', fallAsleepMinutes: usualOnset(store.nights.map(row => row.night)), awakeDuringNight: 'none', sleepQuality: 4,
    ...original?.morning, timeZone,
  }));
  const [wakeAt, setWakeAt] = useState(original?.morning?.wakeAt);
  const [lightsAt, setLightsAt] = useState(original?.evening?.lightsOut);
  const [memory, setMemory] = useState(!!original?.morning && !original?.evening || !!original?.evening?.fromMemory);
  const [obligation, setObligation] = useState(!!original?.evening?.earlyObligationAt);
  const save = useSleepSave();
  const wakeDate = original && initial ? recordedSleepWakeDate(initial, original) : state.wakeDate;
  const target = targetLightsOut(store.nights.map(row => row.night), wakeDate, timeZone, store.settings);
  const late = Date.parse(lightsAt ?? openedAt.toISOString()) > Date.parse(target.lightsOutAt);
  const required = requiredWakeForDate(wakeDate, timeZone, store.settings, obligation ? evening.earlyObligationAt : undefined);
  const opportunity = sleepChoiceCard(lightsAt ?? initial?.occurredAt ?? openedAt.toISOString(), wakeDate, timeZone, store.nights.map(row => row.night), store.settings, obligation ? evening.earlyObligationAt : undefined);
  const previousTwo = previousSleepChoices(store.nights, wakeDate);
  const ownChoiceOnly = randomSleepChoice(store.settings.choiceSeed ?? 'eligibility', wakeDate, previousTwo) === 'own-choice-only';
  const trial = sleepTrialDisplay(store.settings.trial, wakeDate);
  const choiceSeed = useRef<string | undefined>(store.settings.choiceSeed);
  const [choosing, setChoosing] = useState(false);
  async function choose(outcome: SleepChoice | 'random') {
    if (!opportunity || choosing) return;
    setChoosing(true);
    try {
      let selected: SleepChoice;
      if (outcome === 'random') {
        // Persist the seed before drawing. Reopening the night must not redraw it.
        if (!choiceSeed.current) choiceSeed.current = newSleepSeed();
        if (!store.settings.choiceSeed) await store.saveSettings({ ...store.settings, choiceSeed: choiceSeed.current });
        const result = randomSleepChoice(choiceSeed.current, wakeDate, previousTwo);
        if (result === 'own-choice-only') return;
        selected = result;
      } else selected = outcome;
      const alarmAt = selected === 'keep' ? opportunity.anchorWakeAt : opportunity.extendWakeAt;
      patchEvening({ alarm: localClock(alarmAt, timeZone), choice: { wakeDate, outcome: selected, random: outcome === 'random', alarmAt, followUpWindow: opportunity.followUpWindow } });
    } finally { setChoosing(false); }
  }
  const patchEvening = (patch: Partial<SleepEvening>) => setEvening(value => ({ ...value, ...patch }));
  const patchMorning = (patch: Partial<SleepMorning>) => setMorning(value => ({ ...value, ...patch }));
  async function persistEvening(value: SleepEvening) {
    const assignment = value.trial?.assignment ?? trial.assignment;
    const entry = await store.saveEvening(kind === 'evening' && assignment ? { ...value, trial: value.trial ?? { assignment, adherence: 'unknown', targetLightsOutAt: target.lightsOutAt } } : value, entryId, initial ? new Date(initial.occurredAt) : openedAt);
    setSavedId(entry.id);
  }
  const currentNight = entryId ? store.nights.find(row => row.entry.id === entryId)?.night : undefined;
  useEffect(() => {
    if (!currentNight) return;
    setEvening({ alarm: store.settings.anchorWake, dayRating: 4, tags: [], lateReasons: [], ...currentNight.evening, timeZone });
    setLightsAt(currentNight.evening?.lightsOut);
    setMemory(!!currentNight.evening?.fromMemory || !!currentNight.morning && !currentNight.evening);
    setObligation(!!currentNight.evening?.earlyObligationAt);
    if (currentNight.morning) {
      setMorning({ wokeBy: 'alarm', fallAsleepMinutes: 15, awakeDuringNight: 'none', sleepQuality: 4,
        ...currentNight.morning, timeZone });
      setWakeAt(currentNight.morning.wakeAt);
    }
  }, [currentNight, store.settings.anchorWake, timeZone, state.today]);
  const lightsRecorded = currentNight ? !!currentNight.evening?.lightsOut : !!entryId && !!lightsAt && save.message !== 'Undone.';
  const title = kind === 'evening' ? 'Evening log' : kind === 'morning' ? 'Morning log' : 'Lights out';
  return <SleepFrame title={title}>
    {kind === 'evening' ? <>
      <p className="text-sm text-neutral-400">Tonight’s target lights out: <span className="text-white">{target.lightsOut}</span>. {required ? `Required wake time: ${localClock(required, timeZone)}.` : 'Tomorrow has no required wake time.'}</p>
      <Field title="Supplements tonight"><TrialSupplements evening={evening} settings={store.settings} wakeDate={wakeDate} busy={save.busy} onTaken={() => void save.run(async () => {
        const assignment = evening.trial?.assignment ?? trial.assignment;
        if (!assignment) return;
        const saved = await store.saveAssignedIntakes(evening, assignment, target.lightsOutAt, entryId);
        setSavedId(saved.id);
      }, 'The assigned intakes were recorded.')} /></Field>
      {opportunity && !memory ? <SleepChoiceCard opportunity={opportunity} choice={evening.choice} timeZone={timeZone} busy={choosing || save.busy} ownChoiceOnly={ownChoiceOnly} onChoose={outcome => void save.run(() => choose(outcome), 'The alarm was selected. Save the evening log to record the choice.')} /> : null}
      <Field title="Alarm for tomorrow"><Choices label="Alarm" value={evening.alarm === 'none' ? 'none' : 'time'} options={[{ value: 'time', label: 'Set an alarm' }, { value: 'none', label: 'No alarm' }]} onChange={value => patchEvening({ alarm: value === 'none' ? 'none' : store.settings.anchorWake, choice: undefined })} />{evening.alarm !== 'none' ? <ClockField label="Alarm" value={evening.alarm ?? store.settings.anchorWake} onChange={alarm => patchEvening({ alarm, choice: undefined })} /> : null}</Field>
      <Field title="How did today go?"><div className="space-y-2">{DAY_RATINGS.map(row => <button key={row.value} type="button" aria-pressed={evening.dayRating === row.value} className={`${sleepButton} w-full text-left ${evening.dayRating === row.value ? 'border-indigo-400 bg-indigo-500/20' : ''}`} onClick={() => patchEvening({ dayRating: row.value })}><span className="mr-2 text-indigo-300">{row.value}</span>{row.label}</button>)}</div></Field>
      <button aria-pressed={!!evening.hardNight} className={`${sleepButton} w-full text-left ${evening.hardNight ? 'border-indigo-400 bg-indigo-500/20' : ''}`} type="button" onClick={() => patchEvening({ hardNight: !evening.hardNight })}>{evening.hardNight ? '✓ ' : ''}Tonight will be hard</button>
      <Field title="Early obligation tomorrow"><p className="text-xs text-neutral-400">Enter when the appointment starts. Atlas subtracts {store.settings.preparationMinutes} minutes for preparation.</p><button aria-pressed={obligation} className={sleepButton} type="button" onClick={() => { setObligation(!obligation); patchEvening({ choice: undefined }); if (!evening.earlyObligationAt) patchEvening({ earlyObligationAt: atLocalClock(wakeDate, '08:00:00', timeZone) }); }}>{obligation ? 'Remove the early obligation' : 'Add an early obligation'}</button>{obligation ? <ClockField label="Appointment starts" value={localClock(evening.earlyObligationAt!, timeZone)} onChange={clock => patchEvening({ earlyObligationAt: atLocalClock(wakeDate, `${clock}:00`, timeZone), choice: undefined })} /> : null}</Field>
      <Field title="Unusual today"><SituationChips options={['alcohol', 'nap', 'late caffeine', 'sick', 'travel']} selected={evening.tags ?? []} onToggle={tag => patchEvening({ tags: toggleTag(evening.tags ?? [], tag) })} /></Field>
      {late ? <Field title="Reason for a late night"><SituationChips options={['party', 'work', 'stress', 'screen time']} selected={evening.lateReasons ?? []} onToggle={tag => patchEvening({ lateReasons: toggleTag(evening.lateReasons ?? [], tag) })} /></Field> : null}
      {memory ? <Field title="Evening from memory"><p className="text-sm text-neutral-400">This evening will be marked as recorded from memory.</p><InstantField label="Lights out" value={lightsAt ?? atLocalClock(addDays(wakeDate, -1), `${target.lightsOut}:00`, timeZone)} timeZone={timeZone} onChange={setLightsAt} /></Field> : <button className="text-sm text-neutral-400 underline" type="button" onClick={() => setMemory(true)}>Fill the evening from memory</button>}
      <button className={`${sleepButton} w-full bg-indigo-500 font-semibold text-white`} disabled={save.busy} type="button" onClick={() => void save.run(() => persistEvening({ ...evening, earlyObligationAt: obligation ? evening.earlyObligationAt : undefined, fromMemory: memory, lightsOut: memory ? lightsAt ?? atLocalClock(addDays(wakeDate, -1), `${target.lightsOut}:00`, timeZone) : evening.lightsOut }), 'The evening log was saved.')}>{save.busy ? 'Saving…' : 'Save the evening log'}</button>
    </> : null}
    {kind === 'lights-out' ? <>
      {lightsRecorded ? <>
        <h2 className="text-2xl font-medium">Good night</h2>
        <p className="text-sm text-neutral-400">Lights out: {localClock(currentNight?.evening?.lightsOut ?? lightsAt!, timeZone)}. Sleepiness: {currentNight?.evening?.sleepiness ?? evening.sleepiness} of 9.</p>
        <details className="rounded-xl border border-neutral-800 p-3"><summary className="cursor-pointer text-sm">Correct the time</summary><div className="mt-3 space-y-3"><InstantField label="Lights out" value={lightsAt ?? currentNight!.evening!.lightsOut!} timeZone={timeZone} onChange={setLightsAt} /><button className={sleepButton} disabled={save.busy} type="button" onClick={() => void save.run(() => persistEvening({ ...currentNight?.evening, timeZone, lightsOut: lightsAt ?? currentNight?.evening?.lightsOut }), 'The time was corrected.')}>Save the corrected time</button></div></details>
        <details className="rounded-xl border border-neutral-800 p-3"><summary className="cursor-pointer text-sm">Correct sleepiness</summary><div className="mt-3 space-y-2">{KAROLINSKA_SLEEPINESS_SCALE.map(row => <button className={`${sleepButton} w-full text-left`} key={row.value} disabled={save.busy} type="button" onClick={() => void save.run(() => persistEvening({ ...currentNight?.evening, timeZone, lightsOut: currentNight?.evening?.lightsOut ?? lightsAt, sleepiness: row.value }), 'Sleepiness was corrected.')}>{row.value}. {row.label}</button>)}</div></details>
      </> : <>
        <p className="text-sm text-neutral-400">How sleepy are you? One tap records lights out now.</p>
        <div className="space-y-2">{KAROLINSKA_SLEEPINESS_SCALE.map(row => <button className={`${sleepButton} flex w-full items-center gap-3 text-left`} key={row.value} disabled={save.busy} type="button" onClick={() => void save.run(async () => { const value = { ...currentNight?.evening, timeZone, sleepiness: row.value, lightsOut: new Date().toISOString() }; await persistEvening(value); setEvening(value); setLightsAt(value.lightsOut); }, 'Lights out was saved.')}><span className="text-lg text-indigo-300">{row.value}</span><span>{row.label}</span></button>)}</div>
      </>}
    </> : null}
    {kind === 'morning' ? <>
      <Field title="Wake time"><InstantField label="Wake time" value={wakeAt ?? openedAt.toISOString()} timeZone={timeZone} onChange={setWakeAt} /></Field>
      <Field title="What woke me"><Choices label="What woke me" value={morning.wokeBy!} options={[{ value: 'alarm', label: 'The alarm' }, { value: 'self', label: 'I woke by myself' }, { value: 'other', label: 'Something else' }]} onChange={wokeBy => patchMorning({ wokeBy })} /></Field>
      <Field title="Time to fall asleep"><p className="text-sm text-neutral-400">From lights out until you fell asleep.</p><div className="relative max-w-48"><div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-20 h-10 rounded-lg bg-neutral-800" /><WheelColumn label="Minutes to fall asleep" options={Array.from({ length: 289 }, (_, i) => ({ value: i * 5, label: `${i * 5} min` }))} value={morning.fallAsleepMinutes!} onChange={fallAsleepMinutes => patchMorning({ fallAsleepMinutes })} /></div></Field>
      <Field title="Awake during the night"><Choices label="Awake during the night" value={morning.awakeDuringNight!} options={[{ value: 'none', label: 'None' }, { value: 'short', label: 'Short' }, { value: 'over30', label: 'Over 30 minutes' }]} onChange={awakeDuringNight => patchMorning({ awakeDuringNight })} /></Field>
      <Field title="Sleep quality"><Choices label="Sleep quality" value={morning.sleepQuality!} options={QUALITY} onChange={sleepQuality => patchMorning({ sleepQuality })} /></Field>
      <button className={`${sleepButton} w-full bg-indigo-500 font-semibold text-white`} disabled={save.busy} type="button" onClick={() => void save.run(async () => { const entry = await store.saveMorning({ ...morning, wakeAt: wakeAt ?? new Date().toISOString() }, entryId); setSavedId(entry.id); setWakeAt(sleepNight(entry)?.morning?.wakeAt); }, 'The morning log was saved.')}>{save.busy ? 'Saving…' : 'Save the morning log'}</button>
      {!(entryId ? store.nights.find(row => row.entry.id === entryId)?.night.evening : original?.evening) ? <p className="text-sm text-neutral-400">The evening log is missing. {entryId ? <Link className="text-indigo-300 underline" to={`/sleep/evening?entry=${entryId}`}>Fill the evening from memory</Link> : 'Save the morning first to fill the evening from memory.'}</p> : null}
    </> : null}
    {save.feedback}
  </SleepFrame>;
}
