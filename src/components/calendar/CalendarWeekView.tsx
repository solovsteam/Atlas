import { Link } from "react-router-dom";
import { useMemo } from "react";
import type { Item } from "@shared/item";
import type { ItemLink } from "@shared/links";
import { buildDayLayout, layoutTimedBlock, sameDay, startOfDay, weekDays } from "@shared/calendar";
import type { ScheduleSlot } from "@shared/schedule";
import { formatEuropeanDate } from "@shared/locale";

const HOUR_HEIGHT = 48;

export function CalendarWeekView({
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
  const days = useMemo(() => weekDays(anchor), [anchor]);
  const layouts = useMemo(
    () => days.map((day) => ({ day, layout: buildDayLayout(day, slots, tasks, links) })),
    [days, slots, tasks, links]
  );
  const startHour = Math.min(...layouts.map((entry) => entry.layout.startHour));
  const endHour = Math.max(...layouts.map((entry) => entry.layout.endHour));
  const gridHeight = (endHour - startHour) * HOUR_HEIGHT;
  const today = startOfDay(new Date());

  return (
    <section>
      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-[3rem_repeat(7,minmax(0,1fr))] border border-neutral-800">
            <div className="border-r border-neutral-800 bg-neutral-950" />
            {days.map((day) => (
              <div
                className={
                  sameDay(day, today)
                    ? "border-r border-neutral-800 bg-neutral-900 px-2 py-2 text-center last:border-r-0"
                    : "border-r border-neutral-800 px-2 py-2 text-center last:border-r-0"
                }
                key={day.toISOString()}
              >
                <p className="text-xs text-neutral-500">
                  {new Intl.DateTimeFormat("de-DE", { weekday: "short" }).format(day)}
                </p>
                <p className="text-sm font-medium">{formatEuropeanDate(day)}</p>
              </div>
            ))}

            <div className="border-r border-neutral-800 bg-neutral-950" style={{ height: gridHeight }} />
            {layouts.map(({ day, layout }) => (
              <div className="relative border-r border-neutral-800 last:border-r-0" key={day.toISOString()} style={{ height: gridHeight }}>
                {layout.allDay.map((slot) => (
                  <Link
                    className="mb-1 block truncate rounded border border-violet-900/80 bg-violet-950/50 px-1 py-0.5 text-[10px] text-violet-200"
                    key={slot.id}
                    title={slot.label}
                    to={`/item/${slot.id}`}
                  >
                    {slot.label || "All day"}
                  </Link>
                ))}

                {layout.timed.map((block) => {
                  const position = layoutTimedBlock(block.startsAt, block.endsAt, day, startHour, endHour);
                  const top = (position.topPercent / 100) * gridHeight;
                  const height = Math.max((position.heightPercent / 100) * gridHeight, 22);
                  const isInterval = block.kind === "interval";

                  return (
                    <Link
                      className={
                        isInterval
                          ? "absolute inset-x-0.5 overflow-hidden rounded border border-violet-800 bg-violet-950/70 px-1 py-0.5 text-[10px] text-violet-100"
                          : "absolute inset-x-0.5 overflow-hidden rounded border border-emerald-800 bg-emerald-950/70 px-1 py-0.5 text-[10px] text-emerald-100"
                      }
                      key={`${block.kind}-${block.id}-${day.toISOString()}`}
                      style={{ top, height }}
                      title={block.label}
                      to={`/item/${block.id}`}
                    >
                      <span className="line-clamp-2">{block.label}</span>
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
