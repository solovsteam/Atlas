import { useMemo, useState } from "react";
import {
  bucketLabel,
  bucketTick,
  buildHistory,
  countInLastDays,
  formatClock,
  groupEntriesByDay,
  HISTORY_RANGES,
  type DocumentationEntry,
  type HistoryRange
} from "@shared/documentationEntries";
import { pad2 } from "@shared/locale";
import { CHART_ACCENT, CHART_CONTEXT, ColumnChart } from "./ColumnChart";

const UNIT_LABEL = { day: "day", week: "week", month: "month" } as const;
const TRAILING_LABEL = { day: "7-day", week: "4-week", month: "3-month" } as const;
const DAYS_SHOWN_STEP = 14;

function times(count: number): string {
  return count === 1 ? "1 time" : `${count} times`;
}

function oneDecimal(value: number): string {
  return value.toFixed(1).replace(/\.0$/, "");
}

function StatTile({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
      {detail ? <p className="mt-0.5 text-xs text-neutral-500">{detail}</p> : null}
    </div>
  );
}

/** Charts and the full list of entries for one tracker. */
export function TrackerHistory({
  entries,
  trackerCreatedAt,
  now,
  onDelete
}: {
  entries: DocumentationEntry[];
  trackerCreatedAt: string | null;
  now: Date;
  onDelete: (entry: DocumentationEntry) => void;
}) {
  const [range, setRange] = useState<HistoryRange>("30d");
  const [daysShown, setDaysShown] = useState(DAYS_SHOWN_STEP);
  const history = useMemo(() => buildHistory(entries, { range, now, trackerCreatedAt }), [entries, range, now, trackerCreatedAt]);
  const days = useMemo(() => groupEntriesByDay(entries, now), [entries, now]);
  const today = countInLastDays(entries, 1, now);
  const lastWeek = countInLastDays(entries, 7, now);
  const previousWeek = countInLastDays(entries, 14, now) - lastWeek;
  const unit = UNIT_LABEL[history.granularity];
  const trailingLabel = TRAILING_LABEL[history.granularity];
  const latestAverage = [...history.buckets].reverse().find((bucket) => bucket.average !== null)?.average ?? null;
  const tickEvery = Math.max(1, Math.ceil(history.buckets.length / 5));
  const lastIndex = history.buckets.length - 1;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-2">
        <StatTile label="Today" value={String(today)} />
        <StatTile label="Last 7 days" value={String(lastWeek)} detail={`${previousWeek} in the week before`} />
        <StatTile
          label="Per day"
          value={history.perDay === null ? "–" : oneDecimal(history.perDay)}
          detail={HISTORY_RANGES.find((option) => option.id === range)?.label}
        />
      </div>

      <div className="flex flex-wrap gap-1" role="group" aria-label="Time range">
        {HISTORY_RANGES.map((option) => (
          <button
            aria-pressed={range === option.id}
            className={`rounded-full px-3 py-1.5 text-sm ${
              range === option.id ? "bg-indigo-500/15 font-semibold text-indigo-200" : "text-neutral-400 hover:bg-neutral-900 hover:text-white"
            }`}
            key={option.id}
            type="button"
            onClick={() => setRange(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <section className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
        <h2 className="text-sm font-semibold text-neutral-200">How often, per {unit}</h2>
        <div className="mb-4 mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-400">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART_CONTEXT }} />
            Times per {unit}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="h-0.5 w-4 rounded-full" style={{ background: CHART_ACCENT }} />
            {trailingLabel} average{latestAverage !== null ? `, now ${oneDecimal(latestAverage)}` : ""}
          </span>
        </div>
        <ColumnChart
          columnColor={CHART_CONTEXT}
          columns={history.buckets.map((bucket) => bucket.count)}
          label={`Times per ${unit}, with the ${trailingLabel} average`}
          line={history.buckets.map((bucket) => bucket.average)}
          tick={(index) => ((lastIndex - index) % tickEvery === 0 ? bucketTick(history.buckets[index], history.granularity) : null)}
          tooltip={(index) => {
            const bucket = history.buckets[index];
            return {
              value: bucket.count === null ? "Not tracked yet" : `${times(bucket.count)}${bucket.end.getTime() > now.getTime() ? " so far" : ""}`,
              label: bucketLabel(bucket, history.granularity),
              detail: bucket.average === null ? undefined : `${trailingLabel} average ${oneDecimal(bucket.average)}`
            };
          }}
        />
      </section>

      <section className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
        <h2 className="mb-4 text-sm font-semibold text-neutral-200">Time of day</h2>
        <ColumnChart
          columnColor={CHART_ACCENT}
          columns={history.byHour}
          label="Entries per hour of the day"
          tick={(hour) => (hour % 6 === 0 ? pad2(hour) : hour === 23 ? "24" : null)}
          tooltip={(hour) => ({ value: times(history.byHour[hour]), label: `${pad2(hour)}:00–${pad2((hour + 1) % 24)}:00` })}
        />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-neutral-200">All entries</h2>
        {days.length === 0 ? <p className="text-sm text-neutral-500">No entries yet.</p> : null}
        <ul className="divide-y divide-neutral-800 rounded-xl border border-neutral-800 empty:hidden">
          {days.slice(0, daysShown).map((day) => (
            <li className="px-4 py-3" key={day.day.getTime()}>
              <p className="text-sm text-neutral-300">
                {day.label} <span className="text-neutral-500">· {times(day.entries.length)}</span>
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {day.entries.map((entry) => (
                  <li key={entry.id}>
                    <span className="inline-flex items-center gap-1 rounded-full border border-neutral-800 py-1 pl-3 pr-1 text-sm tabular-nums text-neutral-200">
                      {formatClock(new Date(entry.occurredAt))}
                      <button
                        aria-label={`Delete ${day.label} ${formatClock(new Date(entry.occurredAt))}`}
                        className="flex h-6 w-6 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-800 hover:text-white"
                        type="button"
                        onClick={() => onDelete(entry)}
                      >
                        ×
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
        {days.length > daysShown ? (
          <button
            className="mt-2 text-sm text-neutral-400 underline hover:text-white"
            type="button"
            onClick={() => setDaysShown((shown) => shown + DAYS_SHOWN_STEP)}
          >
            Show earlier days
          </button>
        ) : null}
      </section>
    </div>
  );
}
