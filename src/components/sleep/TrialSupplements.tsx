import type { SleepEvening } from '@shared/sleepLog';
import { sleepTrialDisplay, supplementMode } from '@shared/sleepIntegration';
import { SUPPLEMENTS, type SleepScreenSettings } from '@shared/sleepScreens';
import { SupplementsTonight } from './SupplementsTonight';
import { sleepButton } from './SleepFields';

export function TrialSupplements({ evening, settings, wakeDate, targetLightsOutAt, timeZone, onChange }: {
  evening: SleepEvening; settings: SleepScreenSettings; wakeDate: string; targetLightsOutAt: string; timeZone: string;
  onChange: (patch: Partial<SleepEvening>) => void;
}) {
  const trial = sleepTrialDisplay(settings.trial, wakeDate);
  const assignment = evening.trial?.assignment ?? trial.assignment;
  const editing = evening.trial?.confirmation === 'edited';
  const mode = supplementMode(evening, trial);
  const manual = <SupplementsTonight value={evening.supplements ?? []} settings={settings} timeZone={timeZone} onChange={supplements => onChange({ supplements,
    ...(assignment ? { trial: { assignment, adherence: 'deviated', confirmation: 'edited', targetLightsOutAt } } : {}) })} />;
  if (mode === 'manual') return manual;
  if (mode === 'normal-level') return <div className="space-y-2"><p>No sleep supplements in these two weeks</p><p className="text-xs text-neutral-400">Glycine 5 g with breakfast or lunch and vitamins at lunch are daytime supplements. Do not log them here.</p></div>;
  if (!assignment) return null;
  return <div className="space-y-3">
    <p className="font-medium">Tonight’s assignment</p>
    <ul className="space-y-2 text-sm">{assignment.factors.map(factor => {
      const name = SUPPLEMENTS.find(s => s.id === factor.factorId)!.label;
      const window = factor.level?.timeWindow;
      const timing = !window ? 'This evening.' : window.approximate ? `About ${window.earliestMinutesBefore} minutes before target lights out.` : `${window.latestMinutesBefore} to ${window.earliestMinutesBefore} minutes before target lights out.`;
      return <li key={factor.factorId}>{factor.on && factor.level ? `${name}: ${factor.level.dose} ${factor.level.unit}. ${timing}` : `${name}: none tonight.`}</li>;
    })}</ul>
    <button className={`${sleepButton} w-full`} aria-pressed={evening.trial?.adherence === 'as assigned'} type="button" onClick={() => { onChange({ supplements: [], trial: { assignment, adherence: 'as assigned', confirmation: 'self-report', confirmedAt: new Date().toISOString(), targetLightsOutAt } }); }}>Taken as assigned</button>
    <button className={`${sleepButton} w-full`} aria-expanded={editing} type="button" onClick={() => { onChange({ trial: { assignment, adherence: 'deviated', confirmation: 'edited', targetLightsOutAt } }); }}>Something was different</button>
    {evening.trial?.adherence === 'as assigned' ? <p className="text-sm text-indigo-200">Confirmed. Save the evening log to record your intake.</p> : null}
    {editing ? manual : null}
  </div>;
}
