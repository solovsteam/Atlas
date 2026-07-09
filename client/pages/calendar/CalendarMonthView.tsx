import {
  addDays,
  daysInMonthGrid,
  itemIdsInSlot,
  slotOverlapsRange,
  startOfDay,
  startOfMonth,
  type ScheduleSlot,
  type SlotAssignment
} from "../../../shared/schedule";

export function CalendarMonthView({
  monthStart,
  slots,
  assignments,
  onSelectDay
}: {
  monthStart: Date;
  slots: ScheduleSlot[];
  assignments: SlotAssignment[];
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
          const withTasks = daySlots.filter((slot) => itemIdsInSlot(assignments, slot.id).length > 0).length;
          const freeOnly = daySlots.length - withTasks;
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
                  {withTasks > 0 ? <p>{withTasks} scheduled</p> : null}
                  {freeOnly > 0 ? <p>{freeOnly} free</p> : null}
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
