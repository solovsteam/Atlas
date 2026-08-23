import { Link } from "react-router-dom";
import type { Item } from "@shared/item";
import { taskCountInInterval, type ItemLink } from "@shared/links";
import {
  addDays,
  allDayBoxesOnDay,
  boxDisplayLabel,
  boxesForDay,
  DAY_GRID_END_HOUR,
  DAY_GRID_START_HOUR,
  daysInMonthGrid,
  formatTimeRange,
  isArchivedSlot,
  layoutBoxesOnDay,
  slotOverlapsRange,
  startOfDay,
  type ScheduleSlot
} from "@shared/schedule";

function BoxCard({
  slot,
  links,
  itemsById
}: {
  slot: ScheduleSlot;
  links: ItemLink[];
  itemsById: Map<string, Item>;
}) {
  const titles = new Map([...itemsById.entries()].map(([id, item]) => [id, item.title]));
  const label = boxDisplayLabel(slot, links, titles);
  const archived = isArchivedSlot(slot);
  const href = slot.id.startsWith("appt:") ? `/item/${slot.id.slice(5)}` : `/item/${slot.id}`;
  const assignmentCount = taskCountInInterval(slot.id, links);

  return (
    <Link
      className={
        archived
          ? "block rounded border border-neutral-800 bg-neutral-950/60 px-2 py-1.5 text-xs opacity-60 hover:opacity-80"
          : assignmentCount === 0 && !slot.id.startsWith("appt:")
            ? "block rounded border border-dashed border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs text-neutral-500 hover:border-neutral-500"
            : "block rounded border border-neutral-700 px-2 py-1.5 text-xs hover:border-white"
      }
      to={href}
    >
      <span className="font-medium">{label}</span>
      <span className="mt-0.5 block text-neutral-500">{formatTimeRange(slot)}</span>
    </Link>
  );
}

export function CalendarDayView({
  day,
  slots,
  links,
  itemsById
}: {
  day: Date;
  slots: ScheduleSlot[];
  links: ItemLink[];
  itemsById: Map<string, Item>;
}) {
  const daySlots = boxesForDay(slots, day);
  const allDay = allDayBoxesOnDay(daySlots, day);
  const layout = layoutBoxesOnDay(daySlots, day);
  const hours = Array.from(
    { length: DAY_GRID_END_HOUR - DAY_GRID_START_HOUR + 1 },
    (_, index) => DAY_GRID_START_HOUR + index
  );

  return (
    <div>
      {allDay.length > 0 ? (
        <div className="mb-4 space-y-2">
          <p className="text-xs uppercase tracking-wide text-neutral-500">All day</p>
          {allDay.map((slot) => (
            <BoxCard itemsById={itemsById} key={slot.id} links={links} slot={slot} />
          ))}
        </div>
      ) : null}
      <div className="relative rounded border border-neutral-800">
        <div className="relative" style={{ height: `${(DAY_GRID_END_HOUR - DAY_GRID_START_HOUR) * 48}px` }}>
          {hours.map((hour) => (
            <div
              className="absolute inset-x-0 border-t border-neutral-900"
              key={hour}
              style={{ top: `${((hour - DAY_GRID_START_HOUR) / (DAY_GRID_END_HOUR - DAY_GRID_START_HOUR)) * 100}%` }}
            >
              <span className="absolute -top-2 left-2 bg-black px-1 text-[10px] text-neutral-600">
                {String(hour).padStart(2, "0")}:00
              </span>
            </div>
          ))}
          {layout.map(({ slot, topPct, heightPct }) => (
            <div
              className="absolute left-14 right-2 min-h-[28px] overflow-hidden"
              key={slot.id}
              style={{ top: `${topPct}%`, height: `${Math.max(heightPct, 4)}%` }}
            >
              <BoxCard itemsById={itemsById} links={links} slot={slot} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function CalendarWeekView({
  weekStart,
  slots,
  links,
  itemsById
}: {
  weekStart: Date;
  slots: ScheduleSlot[];
  links: ItemLink[];
  itemsById: Map<string, Item>;
}) {
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));

  return (
    <div className="grid gap-3 md:grid-cols-7">
      {weekDays.map((day) => {
        const daySlots = boxesForDay(slots, day);
        return (
          <div className="min-h-40 rounded border border-neutral-800 p-3" key={day.toISOString()}>
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-neutral-500">
              {day.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
            </p>
            {daySlots.length === 0 ? (
              <p className="text-xs text-neutral-600">—</p>
            ) : (
              <ul className="space-y-2">
                {daySlots.map((slot) => (
                  <li key={slot.id}>
                    <BoxCard itemsById={itemsById} links={links} slot={slot} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function CalendarMonthView({
  monthStart,
  slots,
  links,
  onSelectDay
}: {
  monthStart: Date;
  slots: ScheduleSlot[];
  links: ItemLink[];
  onSelectDay: (day: Date) => void;
}) {
  const gridDays = daysInMonthGrid(monthStart);
  const gridEnd = addDays(gridDays[gridDays.length - 1]!, 1);
  const monthSlots = slots.filter((slot) => slotOverlapsRange(slot, gridDays[0]!, gridEnd));

  return (
    <div>
      <div className="mb-2 grid grid-cols-7 gap-1 text-center text-xs uppercase tracking-wide text-neutral-600">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => (
          <div key={label}>{label}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {gridDays.map((day) => {
          const inMonth = day.getMonth() === monthStart.getMonth();
          const dayStart = startOfDay(day);
          const dayEnd = addDays(dayStart, 1);
          const daySlots = monthSlots.filter((slot) => slotOverlapsRange(slot, dayStart, dayEnd));
          const withTasks = daySlots.filter((slot) => taskCountInInterval(slot.id, links) > 0).length;
          const isToday = startOfDay(new Date()).getTime() === dayStart.getTime();
          return (
            <button
              className={`min-h-20 rounded border p-2 text-left text-xs ${
                inMonth ? "border-neutral-800 hover:border-neutral-500" : "border-transparent text-neutral-700"
              } ${isToday ? "ring-1 ring-white" : ""}`}
              key={day.toISOString()}
              type="button"
              onClick={() => onSelectDay(dayStart)}
            >
              <span className={inMonth ? "font-medium text-neutral-300" : "text-neutral-700"}>{day.getDate()}</span>
              {inMonth && daySlots.length > 0 ? (
                <div className="mt-2 space-y-0.5 text-[10px] text-neutral-500">
                  <p>{daySlots.length} blocks</p>
                  {withTasks > 0 ? <p>{withTasks} with tasks</p> : null}
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
