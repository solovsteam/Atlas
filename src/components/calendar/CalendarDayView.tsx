import { Link } from "react-router-dom";
import { useMemo } from "react";
import type { Item } from "@shared/item";
import type { ItemLink } from "@shared/links";
import { buildDayLayout, formatHourLabel, layoutTimedBlock } from "@shared/calendar";
import type { ScheduleSlot } from "@shared/schedule";
import { formatEuropeanDate } from "@shared/locale";

const HOUR_HEIGHT = 56;

export function CalendarDayView({
  day,
  slots,
  tasks,
  links
}: {
  day: Date;
  slots: ScheduleSlot[];
  tasks: Item[];
  links: ItemLink[];
}) {
  const layout = useMemo(() => buildDayLayout(day, slots, tasks, links), [day, slots, tasks, links]);
  const hours = useMemo(() => {
    const list: number[] = [];
    for (let hour = layout.startHour; hour <= layout.endHour; hour += 1) {
      list.push(hour);
    }
    return list;
  }, [layout.endHour, layout.startHour]);
  const gridHeight = (layout.endHour - layout.startHour) * HOUR_HEIGHT;

  return (
    <section>
      {layout.allDay.length > 0 ? (
        <div className="mb-4 border border-neutral-800">
          <p className="border-b border-neutral-800 px-3 py-1 text-xs uppercase tracking-wide text-neutral-500">All day</p>
          <div className="space-y-1 p-2">
            {layout.allDay.map((slot) => (
              <AllDayIntervalRow key={slot.id} links={links} slot={slot} tasks={tasks} />
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex border border-neutral-800">
        <div className="w-14 shrink-0 border-r border-neutral-800 bg-neutral-950">
          {hours.slice(0, -1).map((hour) => (
            <div
              className="border-b border-neutral-900 pr-2 text-right text-[10px] leading-none text-neutral-600"
              key={hour}
              style={{ height: HOUR_HEIGHT }}
            >
              <span className="relative -top-2">{formatHourLabel(hour)}</span>
            </div>
          ))}
        </div>

        <div className="relative min-h-40 flex-1 bg-neutral-950/40" style={{ height: gridHeight }}>
          {hours.slice(0, -1).map((hour) => (
            <div className="absolute inset-x-0 border-b border-neutral-900" key={hour} style={{ top: (hour - layout.startHour) * HOUR_HEIGHT }} />
          ))}

          {layout.timed.map((block) => {
            const position = layoutTimedBlock(block.startsAt, block.endsAt, day, layout.startHour, layout.endHour);
            const top = (position.topPercent / 100) * gridHeight;
            const height = Math.max((position.heightPercent / 100) * gridHeight, 28);
            const isInterval = block.kind === "interval";

            return (
              <Link
                className={
                  isInterval
                    ? "absolute inset-x-1 overflow-hidden rounded border border-violet-800 bg-violet-950/70 px-2 py-1 text-xs text-violet-100 hover:border-violet-500"
                    : "absolute inset-x-1 overflow-hidden rounded border border-emerald-800 bg-emerald-950/70 px-2 py-1 text-xs text-emerald-100 hover:border-emerald-500"
                }
                key={`${block.kind}-${block.id}`}
                style={{ top, height }}
                to={`/item/${block.id}`}
              >
                <p className="truncate font-medium">{block.label}</p>
                {block.linkedTasks.length > 0 ? (
                  <ul className="mt-1 space-y-0.5 text-[10px] text-violet-200/90">
                    {block.linkedTasks.map((task) => (
                      <li className="truncate" key={task.id}>
                        · {task.title}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function AllDayIntervalRow({
  slot,
  tasks,
  links
}: {
  slot: ScheduleSlot;
  tasks: Item[];
  links: ItemLink[];
}) {
  return (
    <Link
      className="block rounded border border-violet-900/80 bg-violet-950/40 px-3 py-2 text-sm hover:border-violet-600"
      to={`/item/${slot.id}`}
    >
      <span className="font-medium">{slot.label || "All day"}</span>
      <AllDayLinkedTasks intervalId={slot.id} links={links} tasks={tasks} />
    </Link>
  );
}

function AllDayLinkedTasks({
  intervalId,
  tasks,
  links
}: {
  intervalId: string;
  tasks: Item[];
  links: ItemLink[];
}) {
  const linked = links
    .filter((link) => link.kind === "scheduled_in" && link.toId === intervalId)
    .map((link) => tasks.find((task) => task.id === link.fromId))
    .filter((task): task is Item => Boolean(task))
    .filter((task) => !task.fixedStartsAt || !task.fixedEndsAt);

  if (linked.length === 0) {
    return null;
  }

  return (
    <ul className="mt-1 space-y-0.5 text-xs text-violet-200/90">
      {linked.map((task) => (
        <li key={task.id}>· {task.title}</li>
      ))}
    </ul>
  );
}

export function CalendarDayHeader({ day }: { day: Date }) {
  return <p className="mb-2 text-xs text-neutral-500">{formatEuropeanDate(day)}</p>;
}
