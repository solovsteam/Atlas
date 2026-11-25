import { useMemo, useState } from 'react';
import { addDays, civilDate } from '@shared/recurringReferences';
import { dayHourRows, instantAt, dayText, splitInstant } from '@shared/dayLabels';
import { WHEEL_ROW_HEIGHT, WheelColumn, type WheelOption } from './TimeWheel';

const minuteOptions = (disabled: (minute: number) => boolean): WheelOption[] =>
  Array.from({ length: 60 }, (_, minute) => ({ value: minute, label: String(minute).padStart(2, '0'), disabled: disabled(minute) }));

/**
 * A picker for a moment: the left wheel holds the day and the hour in one
 * continuous column, so scrolling past 23 reaches 00 of the next day. The
 * right wheel holds the minute.
 */
export function DateTimeWheel({ label, value, timeZone, onChange, daysBefore = 7, daysAfter = 2, max }: {
  label: string;
  value: string;
  timeZone: string;
  onChange: (value: string) => void;
  daysBefore?: number;
  daysAfter?: number;
  /** Later moments are shown dimmed. */
  max?: string;
}) {
  const [today] = useState(() => civilDate(new Date(), timeZone));
  const parts = splitInstant(value, timeZone);
  const [anchor, setAnchor] = useState(parts.date);
  const first = addDays(anchor, -daysBefore);
  const lastAllowed = addDays(anchor, daysAfter);
  const maxDate = max ? civilDate(new Date(max), timeZone) : null;
  const last = maxDate && maxDate < lastAllowed && maxDate >= parts.date ? maxDate : lastAllowed;
  // A value outside the range (for example after a correction elsewhere) moves the range.
  if (parts.date < first || parts.date > last) setAnchor(parts.date);
  const rows = useMemo(() => dayHourRows(first, last, timeZone), [first, last, timeZone]);
  const index = Math.max(0, rows.findIndex(row => row.date === parts.date && row.hour === parts.hour));
  const maxTime = max ? Date.parse(max) : Infinity;
  const hourOptions = useMemo<WheelOption[]>(() => rows.map((row, i) => ({
    value: i,
    label: String(row.hour).padStart(2, '0'),
    detail: dayText(row.date, today),
    disabled: Date.parse(instantAt(row, 0, timeZone)) > maxTime
  })), [rows, today, timeZone, maxTime]);
  const row = rows[index];
  const minutes = useMemo(() => minuteOptions(minute => !!row && Date.parse(instantAt(row, minute, timeZone)) > maxTime), [row, timeZone, maxTime]);
  return <div className="space-y-2">
    <label className="flex items-center justify-between gap-2 text-sm font-medium">
      Day
      <input aria-label={`${label}: choose day`} className="min-h-11 rounded-lg border border-indigo-400/50 bg-neutral-950 px-3" type="date" value={parts.date} max={maxDate ?? undefined} onChange={event => {
        const date = event.target.value;
        if (!date || (maxDate && date > maxDate)) return;
        const next = instantAt({ date, hour: parts.hour }, parts.minute, timeZone);
        setAnchor(date);
        onChange(Date.parse(next) > maxTime ? max! : next);
      }} />
    </label>
    <div className="relative">
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 rounded-lg bg-neutral-800" style={{ top: 2 * WHEEL_ROW_HEIGHT, height: WHEEL_ROW_HEIGHT }} />
    <div className="relative grid grid-cols-[2fr_1fr] gap-1">
      <WheelColumn label={`${label}: day and hour`} options={hourOptions} value={index} onChange={next => { const target = rows[next]; if (target) onChange(instantAt(target, parts.minute, timeZone)); }} />
      <WheelColumn label={`${label}: minute`} options={minutes} value={parts.minute} onChange={minute => { if (row) onChange(instantAt(row, minute, timeZone)); }} />
    </div>
    </div>
  </div>;
}
