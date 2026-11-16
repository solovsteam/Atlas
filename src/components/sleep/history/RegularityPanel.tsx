import type { Regularity } from '@shared/sleepHistory';
import { HistoryPanel, type HistoryTheme } from './presentation';
import { minutes, muted } from './formatting';

export function RegularityPanel({ periods, theme }: { periods: readonly Regularity[]; theme?: HistoryTheme }) {
  return <HistoryPanel title="Regularity" theme={theme}>
    <p className={`mb-4 text-xs ${muted}`}>Smaller spreads mean more similar nights. Missing nights do not count as zero.</p>
    {periods.map(period => <div key={period.days} className="mt-4 first:mt-0">
      <h4 className="mb-2 text-sm font-medium">Last {period.days} days</h4>
      <div className={`mb-2 grid grid-cols-[1.2fr_1fr_1fr] gap-2 text-[11px] ${muted}`}><span /><span>Standard deviation</span><span>Middle half spread</span></div>
      {([['wake', 'Wake time'], ['lightsOut', 'Lights out'], ['estimatedSleep', 'Estimated sleep']] as const).map(([key, label]) => {
        const spread = period[key];
        return <div key={key} className="grid grid-cols-[1.2fr_1fr_1fr] items-center gap-2 border-t border-[var(--sleep-grid)] py-2 text-xs">
          <span>{label}<span className={`mt-1 block text-[10px] ${muted}`}>{spread.count} {spread.count === 1 ? 'night' : 'nights'}</span></span>
          <span>{spread.standardDeviationMinutes === null ? 'Need 2 nights' : minutes(spread.standardDeviationMinutes)}</span>
          <span>{spread.interquartileRangeMinutes === null ? 'Need 2 nights' : minutes(spread.interquartileRangeMinutes)}</span>
        </div>;
      })}
    </div>)}
    <p className={`mt-3 text-xs ${muted}`}>Standard deviation describes the usual distance from the average. The middle half spread is the interquartile range.</p>
  </HistoryPanel>;
}
