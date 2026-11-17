import type { MeasureDay, SleepMeasureKey, SleepNormalLevels } from '@shared/sleepHistory';
import { ColumnChart } from '../../tracking/ColumnChart';
import { CHART_ACCENT, CHART_AIM, CHART_CONTEXT } from '../../tracking/chartColors';
import { HistoryPanel, type HistoryTheme } from './presentation';
import { muted, shortDate } from './formatting';

const MEDICINE = { with: 'With methylphenidate', without: 'Without methylphenidate', unknown: 'Medicine not recorded' } as const;
const COLORS = { with: CHART_ACCENT, without: CHART_CONTEXT, unknown: '#97a1b3' };
function valueText(value: number | null, key: SleepMeasureKey): string {
  return value === null ? 'Not recorded' : `${Number(value.toFixed(1))}${key === 'fallAsleepMinutes' ? ' min' : ''}`;
}
function MeasurePlot({ days, normalLevels, measure, title, maximum }: {
  days: readonly MeasureDay[]; normalLevels: SleepNormalLevels; measure: SleepMeasureKey; title: string; maximum?: number;
}) {
  const reference = days.map(day => day.medicine === 'unknown' ? null : normalLevels[day.medicine][measure]);
  const observed = days.filter(day => day.medicine !== 'unknown' && day[measure] !== null).length;
  return <div className="min-w-0">
    <h5 className="mb-2 text-sm font-medium">{title}</h5>
    {observed ? <div className="sleep-measure-plot">
      <ColumnChart count={days.length}
        stacks={(['with', 'without'] as const).map(medicine => ({ color: COLORS[medicine], values: days.map(day => day.medicine === medicine ? day[measure] ?? 0 : 0) }))}
        line={days.map(day => day.medicine === 'unknown' ? null : day[measure])} lineColor={CHART_ACCENT} reference={reference}
        scale={maximum ? { top: maximum, ticks: maximum === 9 ? [0, 3, 6, 9] : [0, 1, 2, 3, 4, 5], format: String } : undefined}
        tick={index => index === 0 || index === days.length - 1 || index === Math.floor(days.length / 2) ? shortDate(days[index].date) : null}
        tooltip={index => {
          const day = days[index];
          const practice = day.practice && (measure === 'lapses' || measure === 'sleepiness');
          return { value: day.medicine === 'unknown' ? 'Excluded. Medicine answer missing.' : valueText(day[measure], measure), label: shortDate(day.date),
            detail: `${MEDICINE[day.medicine]}${practice ? '. Practice test' : ''}\nNormal: ${valueText(reference[index], measure)}` };
        }} label={`${title}. Columns distinguish days with and without methylphenidate. The gold marks show the normal level. Open daily values below for all numbers.`} />
    </div> : <p className={`rounded-lg bg-[var(--sleep-soft)] p-3 text-xs ${muted}`}>No values with a medicine answer in this period.</p>}
    <p className={`mt-2 text-xs leading-relaxed ${muted}`}>
      Normal with medicine: {valueText(normalLevels.with[measure], measure)} ({normalLevels.with.counts[measure]} days).<br />
      Normal without medicine: {valueText(normalLevels.without[measure], measure)} ({normalLevels.without.counts[measure]} days).
    </p>
    <details className="mt-3 text-xs">
      <summary className={muted}>Daily values for {title.toLowerCase()}</summary>
      <ul className="mt-2 divide-y divide-[var(--sleep-grid)]">
        {days.map(day => <li key={day.date} className="py-2">
          <p>{shortDate(day.date)}: {valueText(day[measure], measure)}.</p>
          <p className={`mt-0.5 ${muted}`}>{MEDICINE[day.medicine]}.{day.practice && (measure === 'lapses' || measure === 'sleepiness') ? ' Practice test.' : ''}{!day.ordinary ? ' Outside the normal level.' : ''}</p>
        </li>)}
      </ul>
    </details>
  </div>;
}

export function MeasuresChart({ days, normalLevels, theme }: { days: readonly MeasureDay[]; normalLevels: SleepNormalLevels; theme?: HistoryTheme }) {
  return <HistoryPanel title="Measures" theme={theme}>
    <p className={`text-xs leading-relaxed ${muted}`}>The normal level is the median of ordinary days in the last 28 calendar days. Days with and without methylphenidate have separate normal levels. Practice tests do not set the normal level.</p>
    <div className="my-4 flex flex-wrap gap-x-4 gap-y-2 text-xs">
      {(['with', 'without', 'unknown'] as const).map(status => <span key={status}><span className="mr-1 inline-block h-2 w-3 rounded-sm" style={{ background: COLORS[status] }} />{MEDICINE[status]}</span>)}
      <span><span className="mr-1 inline-block w-4 border-t-2" style={{ borderColor: CHART_AIM }} />Normal for that day’s medicine status</span>
    </div>
    <p className={`mb-5 text-xs ${muted}`}>Gaps mean no value or no medicine answer was recorded. Days without a medicine answer are excluded from this chart. Zero lapses sit on the bottom line. Tap a day or open its daily values.</p>
    <div className="space-y-6">
      <div><h4 className="mb-3 text-sm font-semibold">1. Alertness</h4><MeasurePlot days={days} normalLevels={normalLevels} measure="lapses" title="Lapses in the reaction test" /></div>
      <div><h4 className="mb-3 text-sm font-semibold">2. Sleepiness at the test</h4><MeasurePlot days={days} normalLevels={normalLevels} measure="sleepiness" title="Karolinska rating, 1 to 9" maximum={9} /></div>
      <div><h4 className="mb-3 text-sm font-semibold">3. How the day went</h4><MeasurePlot days={days} normalLevels={normalLevels} measure="dayRating" title="Day rating, 1 to 5" maximum={5} /></div>
      <div><h4 className="mb-3 text-sm font-semibold">4. How the night felt</h4><MeasurePlot days={days} normalLevels={normalLevels} measure="sleepQuality" title="Sleep quality, 1 to 5" maximum={5} />
        <div className="mt-5"><MeasurePlot days={days} normalLevels={normalLevels} measure="fallAsleepMinutes" title="Time to fall asleep, in minutes" /></div>
      </div>
    </div>
  </HistoryPanel>;
}
