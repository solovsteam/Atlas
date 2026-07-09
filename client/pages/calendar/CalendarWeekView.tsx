import type { Item } from "../../../shared/item";
import { addDays, slotsInRange, type ScheduleSlot, type SlotAssignment } from "../../../shared/schedule";
import { boxesForDay, CalendarBoxLink } from "./CalendarBoxLink";

export function CalendarWeekView({
  weekStart,
  slots,
  assignments,
  itemsById
}: {
  weekStart: Date;
  slots: ScheduleSlot[];
  assignments: SlotAssignment[];
  itemsById: Map<string, Item>;
}) {
  const weekEnd = addDays(weekStart, 7);
  const weekSlots = slotsInRange(slots, weekStart, weekEnd);
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));

  return (
    <div className="grid gap-3 md:grid-cols-7">
      {weekDays.map((day) => {
        const daySlots = boxesForDay(weekSlots, day);
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
                    <CalendarBoxLink assignments={assignments} itemsById={itemsById} slot={slot} />
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
