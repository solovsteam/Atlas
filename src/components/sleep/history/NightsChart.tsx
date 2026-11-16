import { useState } from 'react';
import { clockString, historyDates, type NightHistoryRow } from '@shared/sleepHistory';
import { CHART_ACCENT, CHART_AIM } from '../../tracking/chartColors';
import { HistoryPanel, type HistoryTheme } from './presentation';
import { duration, minutes, muted, shortDate } from './formatting';

/** Rows use recorded local clocks. The duration in the detail uses actual elapsed time, including DST. */
export function NightsChart({ rows, throughDate, days = 28, anchorWake = '07:30', theme }: {
  rows: readonly NightHistoryRow[]; throughDate: string; days?: number; anchorWake?: string; theme?: HistoryTheme;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const dates = historyDates(throughDate, days);
  const byDate = new Map(rows.filter(row => row.date).map(row => [row.date!, row]));
  const shown = dates.flatMap(date => byDate.has(date) ? [byDate.get(date)!] : []);
  const nightClock = (value: number) => value < 720 ? value + 1440 : value;
  const wakeClock = (value: number) => value + 1440;
  const [hours, mins] = anchorWake.split(':').map(Number);
  const anchor = (hours * 60 + mins) + 1440;
  const starts = shown.flatMap(row => row.lightsOut === null ? [] : [nightClock(row.lightsOut)]);
  const ends = shown.flatMap(row => row.wake === null ? [] : [wakeClock(row.wake)]);
  const targets = shown.flatMap(row => row.targetLightsOut === null ? [] : [nightClock(row.targetLightsOut)]);
  const start = Math.floor(Math.min(1200, ...starts, ...targets) / 120) * 120;
  const end = Math.ceil(Math.max(2160, anchor, ...ends) / 120) * 120;
  const position = (value: number) => 100 * (value - start) / (end - start);
  const ticks = Array.from({ length: Math.floor((end - start) / 240) + 1 }, (_, i) => start + i * 240);
  if (ticks.at(-1) !== end) ticks.push(end);
  const active = selected ? byDate.get(selected) : undefined;
  const undated = rows.filter(row => row.date === null).length;
  return <HistoryPanel title="Nights" theme={theme}>
    <p className={`mb-4 text-xs ${muted}`}>Each row belongs to the date when you woke. An empty row means that no night was recorded.</p>
    <div className="mb-3 flex flex-wrap gap-x-4 gap-y-2 text-xs">
      <span><span className="mr-1 inline-block h-2 w-4 rounded" style={{ background: CHART_ACCENT }} />Time in bed</span>
      <span><span className="mr-1 inline-block h-3 border-l-2" style={{ borderColor: CHART_AIM }} />Wake anchor</span>
      <span><span className="mr-1 inline-block h-3 border-l-2 border-dashed border-[var(--sleep-muted)]" />Target lights out</span>
      <span>C: Choice night</span><span>E: Early wake</span>
    </div>
    <div className="ml-14 mr-1 h-6 relative text-[10px] tabular-nums">
      {ticks.map((tick, i) => <span key={tick} className={`absolute ${muted}`} style={{ left: `${position(tick)}%`, transform: i === 0 ? undefined : i === ticks.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)' }}>{clockString(tick)}</span>)}
    </div>
    <div className="relative">
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-14 right-1">
        {ticks.map(tick => <span key={tick} className="absolute inset-y-0 border-l border-[var(--sleep-grid)]" style={{ left: `${position(tick)}%` }} />)}
        <span className="absolute inset-y-0 border-l-2" style={{ left: `${position(anchor)}%`, borderColor: CHART_AIM }} />
      </div>
      {dates.map(date => {
        const row = byDate.get(date);
        const left = row?.lightsOut === null || row?.lightsOut === undefined ? null : nightClock(row.lightsOut);
        const right = row?.wake === null || row?.wake === undefined ? null : wakeClock(row.wake);
        return <button type="button" key={date} onClick={() => setSelected(date)} aria-pressed={selected === date}
          aria-label={`${date}. ${row ? `Lights out ${row.lightsOut === null ? 'not recorded' : clockString(row.lightsOut)}. Wake ${row.wake === null ? 'not recorded' : clockString(row.wake)}. ${row.choiceNight ? 'Choice night. ' : ''}${row.earlyWake ? 'Early wake. ' : ''}Estimated sleep ${duration(row.estimatedSleep)}.` : 'No night recorded.'}`}
          className="relative flex h-9 w-full items-center rounded-md text-left hover:bg-[var(--sleep-soft)] aria-pressed:bg-[var(--sleep-soft)]">
          <span className={`w-14 shrink-0 text-[11px] tabular-nums ${muted}`}>{shortDate(date)}</span>
          <span className="relative mr-1 h-7 flex-1">
            {row?.targetLightsOut !== null && row?.targetLightsOut !== undefined ? <span className="absolute inset-y-0 border-l-2 border-dashed border-[var(--sleep-muted)]" style={{ left: `${position(nightClock(row.targetLightsOut))}%` }} /> : null}
            {left !== null && right !== null && right >= left ? <span className="absolute top-2 h-3 rounded-sm" style={{ left: `${position(left)}%`, width: `${Math.max(0.5, position(right) - position(left))}%`, background: CHART_ACCENT }} /> : null}
            {left !== null && right === null ? <span className="absolute top-2 h-3 w-1 rounded" style={{ left: `${position(left)}%`, background: CHART_ACCENT }} /> : null}
            {right !== null && left === null ? <span className="absolute top-2 h-3 w-1 rounded" style={{ left: `${position(right)}%`, background: CHART_ACCENT }} /> : null}
            {row?.choiceNight ? <span className="absolute top-0 rounded bg-[var(--sleep-bg)] px-0.5 text-[9px] font-semibold" style={{ left: `${Math.min(92, position(left ?? start))}%` }}>C</span> : null}
            {row?.earlyWake && right !== null ? <span className="absolute bottom-0 rounded bg-[var(--sleep-bg)] px-0.5 text-[9px] font-semibold" style={{ left: `${Math.min(94, position(right))}%` }}>E</span> : null}
          </span>
        </button>;
      })}
    </div>
    <div className={`mt-3 min-h-12 rounded-lg bg-[var(--sleep-soft)] p-3 text-xs ${muted}`} aria-live="polite">
      {selected ? active ? <>
        <p className="font-medium text-[var(--sleep-text)]">{shortDate(selected)}. Lights out {active.lightsOut === null ? 'not recorded' : clockString(active.lightsOut)}. Wake {active.wake === null ? 'not recorded' : clockString(active.wake)}.</p>
        <p className="mt-1">Time in bed: {duration(active.timeInBed)}. Estimated sleep: {duration(active.estimatedSleep)}.</p>
        <p className="mt-1">Later than the anchor: {minutes(active.shift)}.{active.earlyWake ? ` Woke by yourself ${minutes(active.minutesEarly)} early.` : ''}</p>
        {active.tags.length ? <p className="mt-1">Tags: {active.tags.join(', ')}.</p> : null}
      </> : <p>{shortDate(selected)}. No night recorded.</p> : <p>Tap a row to see the recorded times and estimates.</p>}
    </div>
    {undated ? <p className={`mt-2 text-xs ${muted}`}>{undated} incomplete {undated === 1 ? 'night has' : 'nights have'} no known wake date yet.</p> : null}
  </HistoryPanel>;
}
