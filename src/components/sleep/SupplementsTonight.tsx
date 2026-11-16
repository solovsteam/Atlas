import type { ReactNode } from 'react';
import { SUPPLEMENTS, type SleepScreenSettings, type SupplementIntake } from '@shared/sleepScreens';
import { InstantField, sleepButton, sleepInput } from './SleepFields';

/** The trial agent can provide tonight's assignment and its one-tap confirmation here. */
export function SupplementsTonight({ value, settings, timeZone, onChange, assignment }: {
  value: SupplementIntake[]; settings: SleepScreenSettings; timeZone: string;
  onChange: (value: SupplementIntake[]) => void; assignment?: ReactNode;
}) {
  if (assignment) return <>{assignment}</>;
  return <div className="space-y-3"><p className="text-xs text-neutral-400">Tap each supplement that you took. The time starts at now.</p>{SUPPLEMENTS.map(supplement => {
    const intake = value.find(row => row.supplement === supplement.id);
    const update = (patch: Partial<SupplementIntake>) => onChange(value.map(row => row.supplement === supplement.id ? { ...row, ...patch } : row));
    return <div key={supplement.id}><button aria-pressed={!!intake} className={`${sleepButton} w-full text-left ${intake ? 'border-indigo-400 bg-indigo-500/20' : ''}`} type="button" onClick={() => onChange(intake ? value.filter(row => row !== intake) : [...value, { supplement: supplement.id, dose: settings.usualDoses[supplement.id], takenAt: new Date().toISOString(), timeZone }])}>{intake ? '✓ ' : ''}{supplement.label} · {intake?.dose ?? settings.usualDoses[supplement.id]} {supplement.unit}{intake ? ' · taken' : ' · now'}</button>{intake ? <details className="mt-2 rounded-xl bg-neutral-900 p-3"><summary className="cursor-pointer text-sm text-neutral-400">Change the dose or time</summary><div className="mt-3 space-y-3"><label className="flex items-center justify-between gap-3 text-sm">{supplement.label} ({supplement.unit})<input aria-label={`${supplement.label}: dose`} className={`${sleepInput} w-24`} type="number" min="0.01" step="any" value={intake.dose} onChange={e => update({ dose: e.target.valueAsNumber })} /></label><InstantField label={`${supplement.label}: taken at`} value={intake.takenAt} timeZone={timeZone} onChange={takenAt => update({ takenAt })} /></div></details> : null}</div>;
  })}</div>;
}
