import type { WindowTest } from '@shared/sleepHistory';
import { HistoryPanel, type HistoryTheme } from './presentation';
import { minutes, muted } from './formatting';
export function WindowTestPanel({ result, theme }: { result: WindowTest; theme?: HistoryTheme }) {
  return <HistoryPanel title="The window test" theme={theme}>
    <p className={`text-xs ${muted}`}>Last {result.days} days. An early wake means that you woke by yourself before the wake anchor.</p>
    {result.share === null ? <p className="mt-4 text-sm">No mornings with a recorded wake time and wake cause yet.</p> : <>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div><p className="text-2xl font-semibold tabular-nums">{Math.round(result.share * 100)}%</p><p className={`mt-1 text-xs ${muted}`}>{result.earlyWakes} of {result.recordedMornings} recorded mornings</p></div>
        <div><p className="text-2xl font-semibold tabular-nums">{result.medianMinutesEarly === null ? 'No early wakes' : minutes(result.medianMinutesEarly)}</p><p className={`mt-1 text-xs ${muted}`}>Median time early, among early wakes</p></div>
      </div>
      <p className={`mt-4 text-xs ${muted}`}>Frequent early wakes over several weeks may suggest that you use less than the full window. This view does not change your settings.</p>
    </>}
  </HistoryPanel>;
}
