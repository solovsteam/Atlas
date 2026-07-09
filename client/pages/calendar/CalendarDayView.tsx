import { Link } from "lakebed/client";
import {
  addDays,
  allDayBoxesOnDay,
  boxDisplayLabel,
  DAY_GRID_END_HOUR,
  DAY_GRID_START_HOUR,
  dueMarkersOnDay,
  formatTimeRange,
  isArchivedSlot,
  layoutBoxesOnDay,
  type ScheduleSlot,
  type SlotAssignment
} from "../../../shared/schedule";
import type { Item } from "../../../shared/item";
import { boxesForDay } from "./CalendarBoxLink";

export function CalendarDayView({
  day,
  slots,
  assignments,
  itemsById
}: {
  day: Date;
  slots: ScheduleSlot[];
  assignments: SlotAssignment[];
  itemsById: Map<string, Item>;
}) {
  const daySlots = boxesForDay(slots, day);
  const allDay = allDayBoxesOnDay(daySlots, day);
  const layout = layoutBoxesOnDay(daySlots, day);
  const dueMarkers = dueMarkersOnDay(daySlots, day);
  const hours = Array.from({ length: DAY_GRID_END_HOUR - DAY_GRID_START_HOUR + 1 }, (_, index) => DAY_GRID_START_HOUR + index);
  const titles = new Map([...itemsById.entries()].map(([id, item]) => [id, item.title]));

  return (
    <div>
      {allDay.length > 0 ? (
        <div className="mb-4 space-y-2">
          <p className="text-xs uppercase tracking-wide text-neutral-500">All day</p>
          {allDay.map((slot) => (
            <DayBoxCard assignments={assignments} key={slot.id} slot={slot} titles={titles} />
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
              <DayBoxCard assignments={assignments} slot={slot} titles={titles} />
            </div>
          ))}

          {dueMarkers.map(({ slot, topPct }) => (
            <div className="absolute left-14 right-2" key={slot.id} style={{ top: `${topPct}%` }}>
              <Link className="block border-t-2 border-amber-500 py-1 text-xs text-amber-200 hover:text-white" to={`/calendar/box/${slot.id}`}>
                Due · {formatTimeRange(slot)}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DayBoxCard({
  slot,
  assignments,
  titles
}: {
  slot: ScheduleSlot;
  assignments: SlotAssignment[];
  titles: Map<string, string>;
}) {
  const assignmentCount = assignments.filter((entry) => entry.slotId === slot.id).length;
  const archived = isArchivedSlot(slot);
  const label = boxDisplayLabel(slot, assignments, titles);
  const borderClass = slot.kind === "window" ? "border-dashed border-neutral-600" : "border-neutral-700";
  const fillClass = assignmentCount === 0 ? "bg-neutral-950/80 text-neutral-500" : "bg-neutral-900 text-white";

  return (
    <Link
      className={`block h-full rounded border px-2 py-1 text-xs hover:border-white ${borderClass} ${fillClass} ${archived ? "opacity-60" : ""}`}
      to={`/calendar/box/${slot.id}`}
    >
      <span className="font-medium">{label}</span>
      <span className="mt-0.5 block text-neutral-500">{formatTimeRange(slot)}</span>
    </Link>
  );
}
