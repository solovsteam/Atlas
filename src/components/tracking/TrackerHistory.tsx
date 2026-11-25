import { isDailyTotal, summarizeTrackerDay, trackerDay } from '@shared/trackerTotals';
import { addDays, civilDate } from '@shared/recurringReferences';
import { dayEvidence } from '@shared/dayEvidence';
import { useSleepLog } from '../../hooks/useSleepLog';
import { InstantField, sleepButton } from '../sleep/SleepFields';
import { useSleepSave } from '../../hooks/useSleepSave';
import { useMemo, useState } from "react";
import {
  bucketGoal,
  bucketLabel,
  bucketTick,
  buildHistory,
  countInLastDays,
  ENTRY_STAGES,
  entriesInDays,
  entryStage,
  entryTags,
  formatClock,
  groupEntriesByDay,
  HISTORY_RANGES,
  STAGE_TEXT,
  urgeShare,
  type DocumentationEntry,
  type EntryStage,
  type HistoryRange,
  type TrackerConfig
} from "@shared/documentationEntries";
import { pad2 } from "@shared/locale";
import { CHART_ACCENT, CHART_AIM, CHART_LINE, STAGE_COLORS } from "./chartColors";
import { ColumnChart } from "./ColumnChart";

const UNIT_LABEL = { day: "day", week: "week", month: "month" } as const;
const TRAILING_LABEL = { day: "7-day", week: "4-week", month: "3-month" } as const;
const DAYS_SHOWN_STEP = 14;
const STAGE_LEGEND: Record<EntryStage, string> = {
  urge: "At the urge",
  during: "While doing it",
  after: "In hindsight"
};
const PERCENT_SCALE = { top: 1, ticks: [0, 0.5, 1], format: (value: number) => `${Math.round(value * 100)}%` };

function times(count: number): string {
  return count === 1 ? "1 time" : `${count} times`;
}

function oneDecimal(value: number): string {
  return value.toFixed(1).replace(/\.0$/, "");
}

function percent(value: number | null): string {
  return value === null ? "–" : `${Math.round(value * 100)}%`;
}

function StatTile({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 break-words text-xl font-semibold text-white">{value}</p>
      {detail ? <p className="mt-0.5 text-xs text-neutral-500">{detail}</p> : null}
    </div>
  );
}

function Swatch({ color, line = false }: { color: string; line?: boolean }) {
  return <span aria-hidden="true" className={line ? "h-0.5 w-4 rounded-full" : "h-2.5 w-2.5 rounded-sm"} style={{ background: color }} />;
}

/**
 * Charts and the full list of entries for one tracker. A habit to break shows
 * when each episode was noticed; a habit to build shows its daily aim and
 * what triggered each entry.
 */
export function TrackerHistory({
  entries,
  config,
  trackerCreatedAt,
  now,
  onDelete,
  onCorrect
}: {
  entries: DocumentationEntry[];
  config: TrackerConfig;
  trackerCreatedAt: string | null;
  now: Date;
  onDelete: (entry: DocumentationEntry) => void;
  onCorrect: (entry: DocumentationEntry, at: Date) => Promise<void>;
}) {
  const sleep = useSleepLog();
  const correction = useSleepSave();
  const [editing, setEditing] = useState<{ entry: DocumentationEntry; at: string } | null>(null);
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const confirmedDates = sleep.entries.flatMap(entry => { const day = dayEvidence(entry, 'dayConfirmation'); return day?.timeZone === zone ? [day.date] : []; });
  const confirmed = new Set([...confirmedDates, ...entries.filter(isDailyTotal).map(entry => String(entry.data.date))]);
  const todayDate = civilDate(now, zone);
  const todayConfirmed = confirmed.has(todayDate);
  const weekConfirmed = Array.from({ length: 7 }, (_, i) => addDays(todayDate, -i)).some(date => confirmed.has(date));
  const priorWeekConfirmed = Array.from({ length: 7 }, (_, i) => addDays(todayDate, -i - 7)).some(date => confirmed.has(date));
  const build = config.kind === "build";
  const [range, setRange] = useState<HistoryRange>("30d");
  const [daysShown, setDaysShown] = useState(DAYS_SHOWN_STEP);
  const history = buildHistory(entries, { range, now, trackerCreatedAt, confirmedDates });
  const days = useMemo(() => groupEntriesByDay(entries, now), [entries, now]);
  const knownEntries = entries.filter(entry => confirmed.has(trackerDay(entry, zone)));
  const lastWeek = entriesInDays(knownEntries, 7, now);
  const weekBefore = entriesInDays(knownEntries, 7, now, 7);
  const weeklyCount = (rows: DocumentationEntry[]) => groupEntriesByDay(rows, now)
    .reduce((sum, day) => sum + summarizeTrackerDay(day.entries).count, 0);
  const untimed = history.buckets.map(bucket => (bucket.count ?? 0) - bucket.stages.after - bucket.stages.during - bucket.stages.urge);
  const unit = UNIT_LABEL[history.granularity];
  const trailingLabel = TRAILING_LABEL[history.granularity];
  const latestAverage = [...history.buckets].reverse().find((bucket) => bucket.average !== null)?.average ?? null;
  const tickEvery = Math.max(1, Math.ceil(history.buckets.length / 5));
  const lastIndex = history.buckets.length - 1;
  const tick = (index: number) => ((lastIndex - index) % tickEvery === 0 ? bucketTick(history.buckets[index], history.granularity) : null);
  const stagesInRange = ENTRY_STAGES.filter((stage) => history.buckets.some((bucket) => bucket.stages[stage] > 0));
  const maxTag = history.byTag[0]?.count ?? 0;
  const today = countInLastDays(entries, 1, now);
  const goal = config.dailyGoal;

  return (
    <div className="space-y-6">
      {editing ? <section className="space-y-3 rounded-xl border border-neutral-800 p-4"><h2 className="font-medium">Correct an event</h2><InstantField label="Event time" value={editing.at} timeZone={zone} onChange={at => setEditing({ ...editing, at })} /><div className="flex gap-2"><button className={sleepButton} type="button" disabled={correction.busy} onClick={() => void correction.run(async () => { await onCorrect(editing.entry, new Date(editing.at)); setEditing(null); }, 'The event time was corrected.')}>Save the event time</button><button className={sleepButton} type="button" onClick={() => setEditing(null)}>Cancel</button></div></section> : null}
      {correction.feedback}
      <p className="text-sm text-neutral-400">Charts include days with a saved total or a confirmed list. The time chart uses only events with known times.</p>
      {build ? (
        <div className="grid grid-cols-3 gap-2">
          <StatTile label="Today" value={todayConfirmed ? goal !== null ? `${today} of ${goal}` : String(today) : "Not confirmed"} />
          <StatTile label="Last 7 days" value={weekConfirmed ? String(weeklyCount(lastWeek)) : "Not confirmed"} detail={priorWeekConfirmed ? `${weeklyCount(weekBefore)} the week before` : "The week before is not confirmed"} />
          <StatTile
            label="Per day"
            value={history.perDay === null ? "–" : oneDecimal(history.perDay)}
            detail={goal !== null ? `aim ${goal}` : HISTORY_RANGES.find((option) => option.id === range)?.label}
          />
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <StatTile
            label="At the urge, last 7 days"
            value={percent(urgeShare(lastWeek))}
            detail={`${percent(urgeShare(weekBefore))} the week before`}
          />
          <StatTile label="Last 7 days" value={weekConfirmed ? String(weeklyCount(lastWeek)) : "Not confirmed"} detail={priorWeekConfirmed ? `${weeklyCount(weekBefore)} the week before` : "The week before is not confirmed"} />
          <StatTile label="Today" value={todayConfirmed ? String(today) : "Not confirmed"} />
        </div>
      )}

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

      {build ? (
        <>
      <section className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
        <h2 className="text-sm font-semibold text-neutral-200">Per {unit}</h2>
        <div className="mb-4 mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-400">
          <span className="inline-flex items-center gap-1.5">
            <Swatch color={CHART_ACCENT} />
            Times per {unit}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Swatch color={CHART_LINE} line />
            {trailingLabel} average{latestAverage !== null ? `, now ${oneDecimal(latestAverage)}` : ""}
          </span>
          {goal !== null ? (
            <span className="inline-flex items-center gap-1.5">
              <Swatch color={CHART_AIM} line />
              Aim, {goal} a day
            </span>
          ) : null}
        </div>
        <ColumnChart
          count={history.buckets.length}
          label={`Times per ${unit}, with the ${trailingLabel} average${goal !== null ? " and the aim" : ""}`}
          line={history.buckets.map((bucket) => bucket.average)}
          reference={goal !== null ? history.buckets.map((bucket) => bucketGoal(bucket, goal)) : undefined}
          stacks={[{ color: CHART_ACCENT, values: history.buckets.map((bucket) => bucket.count ?? 0) }]}
          tick={tick}
          tooltip={(index) => {
            const bucket = history.buckets[index];
            if (bucket.count === null) {
              return { value: "Not confirmed", label: bucketLabel(bucket, history.granularity) };
            }
            const parts: string[] = [];
            const aim = bucketGoal(bucket, goal);
            if (aim !== null) {
              parts.push(`Aim: ${aim}`);
            }
            if (bucket.average !== null) {
              parts.push(`${trailingLabel} average: ${oneDecimal(bucket.average)}`);
            }
            return {
              value: `${times(bucket.count)}${bucket.end.getTime() > now.getTime() ? " so far" : ""}`,
              label: bucketLabel(bucket, history.granularity),
              detail: parts.join("\n") || undefined
            };
          }}
        />
      </section>

        </>
      ) : (
        <>
      <section className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
        <h2 className="text-sm font-semibold text-neutral-200">Per {unit}, by when you noticed</h2>
        <p className="mt-1 text-xs text-neutral-500">Noticing more often can raise the total. The share caught at the urge shows whether you notice earlier.</p>
        <div className="mb-4 mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-400">
          {untimed.some(value => value > 0) && <span className="inline-flex items-center gap-1.5"><Swatch color="#94a3b8" />Time unknown</span>}
          {stagesInRange.map((stage) => (
            <span className="inline-flex items-center gap-1.5" key={stage}>
              <Swatch color={STAGE_COLORS[stage]} />
              {STAGE_LEGEND[stage]}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <Swatch color={CHART_LINE} line />
            {trailingLabel} average{latestAverage !== null ? `, now ${oneDecimal(latestAverage)}` : ""}
          </span>
        </div>
        <ColumnChart
          count={history.buckets.length}
          label={`Episodes per ${unit} by when they were noticed, with the ${trailingLabel} average`}
          line={history.buckets.map((bucket) => bucket.average)}
          stacks={[...ENTRY_STAGES.map(stage => ({ color: STAGE_COLORS[stage], values: history.buckets.map(bucket => bucket.stages[stage]) })), { color: "#94a3b8", values: untimed }]}
          tick={tick}
          tooltip={(index) => {
            const bucket = history.buckets[index];
            if (bucket.count === null) {
              return { value: "Not confirmed", label: bucketLabel(bucket, history.granularity) };
            }
            const parts = ENTRY_STAGES.filter((stage) => bucket.stages[stage] > 0).map((stage) => `${STAGE_LEGEND[stage]}: ${bucket.stages[stage]}`);
            if (bucket.average !== null) {
              parts.push(`${trailingLabel} average: ${oneDecimal(bucket.average)}`);
            }
            return {
              value: `${times(bucket.count)}${bucket.end.getTime() > now.getTime() ? " so far" : ""}`,
              label: bucketLabel(bucket, history.granularity),
              detail: parts.join("\n")
            };
          }}
        />
      </section>

      <section className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
        <h2 className="text-sm font-semibold text-neutral-200">Caught at the urge</h2>
        <p className="mb-4 mt-1 text-xs text-neutral-500">
          Share of episodes noticed before they started, over a {trailingLabel} window. Higher means you notice earlier.
        </p>
        {history.total > 0 ? (
          <ColumnChart
            count={history.buckets.length}
            label={`Share caught at the urge, ${trailingLabel} window`}
            line={history.buckets.map((bucket) => bucket.urgeShare)}
            lineColor={STAGE_COLORS.urge}
            scale={PERCENT_SCALE}
            tick={tick}
            tooltip={(index) => ({ value: percent(history.buckets[index].urgeShare), label: bucketLabel(history.buckets[index], history.granularity) })}
          />
        ) : (
          <p className="text-sm text-neutral-500">Appears after a day with entries is confirmed.</p>
        )}
      </section>

        </>
      )}

      <section className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
        <h2 className="text-sm font-semibold text-neutral-200">{build ? "Triggers" : "Situations"}</h2>
        {history.byTag.length ? (
          <ul className="mt-3 space-y-2">
            {history.byTag.map(({ tag, count }) => (
              <li className="grid grid-cols-[minmax(0,8rem)_1fr] items-center gap-3 text-sm" key={tag}>
                <span className="truncate text-neutral-300">{tag}</span>
                <span className="flex items-center gap-2">
                  <span className="h-3.5 rounded-sm" style={{ width: `${(count / maxTag) * 85}%`, background: CHART_ACCENT }} />
                  <span className="tabular-nums text-neutral-400">{count}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-neutral-500">
            {build ? "Tag what triggered an entry to see what sets it off." : "Tag situations when you record an episode to see what sets it off."}
          </p>
        )}
      </section>

      <section className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
        <h2 className="mb-4 text-sm font-semibold text-neutral-200">Time of day</h2>
        <ColumnChart
          count={24}
          label="Episodes per hour of the day"
          stacks={[{ color: CHART_ACCENT, values: history.byHour }]}
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
                {day.label} <span className="text-neutral-500">· {confirmed.has(civilDate(day.day, zone)) ? times(summarizeTrackerDay(day.entries).count) : `${day.entries.length} recorded. Not confirmed`}</span>
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {day.entries.map((entry) => {
                  if (isDailyTotal(entry)) {
                    const latest = summarizeTrackerDay(day.entries).report?.id === entry.id;
                    return <li className="rounded-lg border border-neutral-800 px-3 py-1 text-sm" key={entry.id}>
                      {latest ? 'Reported total' : 'Earlier total'}: {Number(entry.data.count)} · Times unknown
                      <button className="ml-2 underline" type="button" onClick={() => onDelete(entry)}>Remove</button>
                    </li>;
                  }
                  const stage = build ? null : entryStage(entry);
                  const details = [stage ? STAGE_TEXT[stage].short : null, ...entryTags(entry)].filter(Boolean).join(" · ");
                  const clock = formatClock(new Date(entry.occurredAt));
                  return (
                    <li key={entry.id}>
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-800 py-1 pl-3 pr-1 text-sm text-neutral-200">
                        {stage ? <Swatch color={STAGE_COLORS[stage]} /> : null}
                        <button className="min-h-8 tabular-nums underline" type="button" aria-label={`Correct ${day.label} ${clock}`} onClick={() => setEditing({ entry, at: entry.occurredAt })}>{clock}</button>
                        {details ? <span className="text-neutral-500">{details}</span> : null}
                        <button
                          aria-label={`Delete ${day.label} ${clock}`}
                          className="flex h-6 w-6 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-800 hover:text-white"
                          type="button"
                          onClick={() => onDelete(entry)}
                        >
                          ×
                        </button>
                      </span>
                    </li>
                  );
                })}
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
