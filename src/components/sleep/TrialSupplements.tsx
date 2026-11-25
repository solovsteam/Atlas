import type { SleepEvening } from '@shared/sleepLog';
import { sleepTrialDisplay } from '@shared/sleepIntegration';
import { SUPPLEMENTS, type SleepScreenSettings } from '@shared/sleepScreens';
import { sleepButton } from './SleepFields';

export function TrialSupplements({ evening, settings, wakeDate, busy, historical = false, onOpenIntake, onTaken }: {
  evening: SleepEvening; settings: SleepScreenSettings; wakeDate: string; busy: boolean; historical?: boolean;
  onOpenIntake: () => void; onTaken: () => void;
}) {
  const trial = sleepTrialDisplay(settings.trial, wakeDate);
  const assignment = evening.trial?.assignment ?? trial.assignment;
  if (!assignment) return <div className="space-y-2">{trial.phase === 'normal-level' ? <p>No sleep supplements in these two weeks.</p> : null}<button type="button" className={sleepButton} onClick={onOpenIntake}>Record supplements in Intake</button></div>;
  return <div className="space-y-3">
    <p className="font-medium">Tonight’s assignment</p>
    <ul className="space-y-2 text-sm">{assignment.factors.map(factor => {
      const name = SUPPLEMENTS.find(s => s.id === factor.factorId)!.label;
      const window = factor.level?.timeWindow;
      const timing = !window ? 'This evening.' : window.approximate ? `About ${window.earliestMinutesBefore} minutes before target lights out.` : `${window.latestMinutesBefore} to ${window.earliestMinutesBefore} minutes before target lights out.`;
      return <li key={factor.factorId}>{factor.on && factor.level ? `${name}: ${factor.level.dose} ${factor.level.unit}. ${timing}` : `${name}: none tonight.`}</li>;
    })}</ul>
    {historical ? <p className="text-sm text-neutral-400">Add the actual intake and time in Intake for this past date.</p> : <button className={`${sleepButton} w-full`} disabled={busy} type="button" onClick={onTaken}>Taken as assigned</button>}
    <button type="button" className={sleepButton} onClick={onOpenIntake}>Record or correct a different intake</button>
  </div>;
}
