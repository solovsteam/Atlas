import type { SleepEvening } from '@shared/sleepLog';
import type { sleepChoiceCard } from '@shared/sleepIntegration';
import { localClock } from '@shared/sleepScreens';
import type { SleepChoice } from '@shared/sleepTrial';
import { sleepButton } from './SleepFields';

type Opportunity = NonNullable<ReturnType<typeof sleepChoiceCard>>;
export function SleepChoiceCard({ opportunity, choice, timeZone, busy, ownChoiceOnly, onChoose }: {
  opportunity: Opportunity; choice?: SleepEvening['choice']; timeZone: string; busy: boolean; ownChoiceOnly: boolean;
  onChoose: (outcome: SleepChoice | 'random') => void;
}) {
  return <section aria-label="Choice night" className="space-y-3 rounded-xl border border-indigo-400/40 bg-indigo-500/10 p-4">
    <h2 className="text-lg font-medium">Choice night</h2>
    <p className="text-sm text-neutral-300">Keep: {Math.round(opportunity.keepShortfall)} minutes of shortfall. Shift: 0 minutes.</p>
    <p className="text-sm text-neutral-300">Extend: {Math.round(opportunity.extendShortfall)} minutes of shortfall. Shift: {Math.round(opportunity.extensionMinutes)} minutes.</p>
    {opportunity.usesWindowEstimate ? <p className="text-xs text-neutral-400">No usual sleep amount is recorded yet. Shortfall uses your sleep-duration setting.</p> : null}
    <div className="flex flex-wrap gap-2">{(['keep', 'extend'] as const).map(outcome => <button key={outcome} className={sleepButton} type="button" disabled={busy} aria-pressed={choice?.outcome === outcome} onClick={() => onChoose(outcome)}>{outcome === 'keep' ? 'Keep' : 'Extend'} · {localClock(outcome === 'keep' ? opportunity.anchorWakeAt : opportunity.extendWakeAt, timeZone)}</button>)}
      {!ownChoiceOnly ? <button className={sleepButton} type="button" disabled={busy} onClick={() => onChoose('random')}>Decide for me</button> : null}
    </div>
    {ownChoiceOnly ? <p className="text-xs text-neutral-400">Keep was chosen on the two previous nights. Choose Keep or Extend yourself tonight.</p> : null}
    {choice ? <p className="text-sm text-indigo-200">{choice.outcome === 'keep' ? 'Keep' : 'Extend'} was {choice.random ? 'chosen at random' : 'your choice'}. Save the evening log to record the choice.</p> : null}
  </section>;
}
