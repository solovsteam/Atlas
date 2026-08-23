import { Link } from "react-router-dom";
import { useMemo } from "react";
import type { Item } from "@shared/item";
import type { ItemLink } from "@shared/links";
import { buildMonthSummaries, sameDay, startOfDay } from "@shared/calendar";
import type { ScheduleSlot } from "@shared/schedule";

export function CalendarMonthView({
  anchor,
  slots,
  tasks,
  links
}: {
  anchor: Date;
  slots: ScheduleSlot[];
  tasks: Item[];
  links: ItemLink[];
}) {
  const summaries = useMemo(() => buildMonthSummaries(anchor, slots, tasks, links), [anchor, slots, tasks, links]);
  const today = startOfDay(new Date());
  const weekdays = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

  return (
    <section>
      <div className="grid grid-cols-7 border border-neutral-800 text-center text-xs uppercase tracking-wide text-neutral-500">
        {weekdays.map((label) => (
          <div className="border-b border-r border-neutral-800 px-2 py-2 last:border-r-0" key={label}>
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 border-x border-b border-neutral-800">
        {summaries.map((summary) => {
          const visibleIntervals = summary.intervals.slice(0, 3);
          const hiddenCount = summary.intervals.length - visibleIntervals.length;

          return (
            <div
              className={
                summary.inMonth
                  ? "min-h-28 border-b border-r border-neutral-800 p-2 last:border-r-0"
                  : "min-h-28 border-b border-r border-neutral-900 bg-neutral-950/60 p-2 last:border-r-0"
              }
              key={summary.date.toISOString()}
            >
              <p
                className={
                  sameDay(summary.date, today)
                    ? "mb-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-medium text-black"
                    : summary.inMonth
                      ? "mb-2 text-xs text-neutral-300"
                      : "mb-2 text-xs text-neutral-600"
                }
              >
                {summary.date.getDate()}
              </p>

              <div className="space-y-1">
                {visibleIntervals.map((slot) => (
                  <Link
                    className="block truncate rounded border border-violet-900/70 bg-violet-950/40 px-1.5 py-0.5 text-[10px] text-violet-200 hover:border-violet-600"
                    key={slot.id}
                    title={slot.label}
                    to={`/item/${slot.id}`}
                  >
                    {slot.label || "Interval"}
                  </Link>
                ))}
                {hiddenCount > 0 ? <p className="text-[10px] text-neutral-500">+{hiddenCount} more</p> : null}
                {summary.taskCount > 0 ? (
                  <p className="text-[10px] text-emerald-400/80">
                    {summary.taskCount} task{summary.taskCount === 1 ? "" : "s"}
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
