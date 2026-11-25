import { dailyIntakeSummary } from '@shared/intake';
import { civilDate } from '@shared/recurringReferences';
import { useMemo, useState } from 'react';
import type { SleepNight, SleepSettings } from '@shared/sleepLog';
import type { SleepReactionTest } from '@shared/sleepReactionTest';
import { historyDates, nightHistoryRows, sleepMeasureDays, sleepNormalLevels, sleepRegularity, sleepWindowTest, type SleepHistoryContext } from '@shared/sleepHistory';
import { NightsChart } from './NightsChart';
import { RegularityPanel } from './RegularityPanel';
import { WindowTestPanel } from './WindowTestPanel';
import { MeasuresChart } from './MeasuresChart';
import { type HistoryTheme } from './presentation';
import { muted } from './formatting';

export type SleepHistoryProps = {
  nights: readonly SleepNight[];
  tests: readonly SleepReactionTest[];
  settings: SleepSettings;
  /** An explicit local date gives reproducible windows. Otherwise use the latest recorded date. */
  throughDate?: string;
  theme?: HistoryTheme;
  /** Supply recorded choices, wake obligations and follow-up windows when available. No schedule is assumed. */
  context?: SleepHistoryContext;
};

/** Props only. No clock, network access, hooks for data, or writes. */
export function SleepHistory({ nights, tests, settings, throughDate, theme = 'dark', context }: SleepHistoryProps) {
  const [days, setDays] = useState(28);
  const rows = useMemo(() => nightHistoryRows(nights, settings, context), [nights, settings, context]);
  const recordedDates = [...rows.flatMap(row => row.date ? [row.date] : []), ...tests.flatMap(test => {
    try {
      return [civilDate(new Date(test.startedAt), test.timeZone)];
    } catch { return []; }
  })].sort();
  const end = throughDate ?? recordedDates.at(-1);
  if (!end) return <section aria-label="Sleep history" className="sleep-history-panel" data-theme={theme}>
    <h2 className="text-lg font-semibold">Sleep history</h2>
    <p className={`mt-2 text-sm ${muted}`}>Your history will appear after a wake time or a reaction test is recorded.</p>
    {nights.length ? <p className={`mt-2 text-xs ${muted}`}>{nights.length} incomplete {nights.length === 1 ? 'night has' : 'nights have'} no known wake date yet.</p> : null}
  </section>;
  const measureDays = sleepMeasureDays(nights, tests, end, 28, context);
  const normalLevels = sleepNormalLevels(measureDays, end);
  return <section aria-label="Sleep history" className="min-w-0 space-y-4">
    <div className="sleep-history-panel" data-theme={theme}>
      <h2 className="text-lg font-semibold">Sleep history</h2>
      <p className={`mt-1 text-xs ${muted}`}>Through {end}. The same dates are shown even when a log is missing.</p>
      <div aria-label="History period" className="mt-3 flex gap-2">
        {[7, 28].map(period => <button key={period} type="button" aria-pressed={days === period} onClick={() => setDays(period)} className="rounded-lg border border-[var(--sleep-grid)] px-4 py-2 text-sm aria-pressed:border-indigo-400 aria-pressed:bg-indigo-500/15">{period} days</button>)}
      </div>
    </div>
    {context?.entries ? <details className="rounded-xl border border-neutral-800 p-4 text-sm"><summary>Daily intake counts</summary><ul className="mt-3 space-y-2">{historyDates(end, days).toReversed().map(date => {
      const review = context.entries!.find(entry => (entry.data.kind === 'dayConfirmation' || entry.data.kind === 'dayReview') && (entry.data[entry.data.kind] as { date?: string })?.date === date);
      const zone = (review?.data[String(review.data.kind)] as { timeZone?: string })?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
      return <li key={date}>{date}: {dailyIntakeSummary(context.entries!, date, zone, context.intakes ?? [])}</li>;
    })}</ul></details> : null}
    <NightsChart rows={rows} throughDate={end} days={days} anchorWake={settings.anchorWake} theme={theme} />
    {!context?.choiceWakeDates ? <p className={`px-1 text-xs ${theme === 'light' ? 'text-neutral-600' : 'text-neutral-400'}`}>Choice marks show the opportunity to extend the night. A wake obligation can limit that opportunity.</p> : null}
    <RegularityPanel periods={[sleepRegularity(rows, end, 7), sleepRegularity(rows, end, 28)]} theme={theme} />
    <WindowTestPanel result={sleepWindowTest(rows, end, days)} theme={theme} />
    <MeasuresChart days={measureDays.slice(-days)} normalLevels={normalLevels} theme={theme} />
  </section>;
}
