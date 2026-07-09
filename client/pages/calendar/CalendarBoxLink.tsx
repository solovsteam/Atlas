import { Link } from "lakebed/client";
import type { Item } from "../../../shared/item";
import {
  addDays,
  boxDisplayLabel,
  formatTimeRange,
  isArchivedSlot,
  slotOverlapsRange,
  type ScheduleSlot,
  type SlotAssignment
} from "../../../shared/schedule";

export function CalendarBoxLink({
  slot,
  assignments,
  itemsById,
  compact = false
}: {
  slot: ScheduleSlot;
  assignments: SlotAssignment[];
  itemsById: Map<string, Item>;
  compact?: boolean;
}) {
  const archived = isArchivedSlot(slot);
  const titles = new Map([...itemsById.entries()].map(([id, item]) => [id, item.title]));
  const label = boxDisplayLabel(slot, assignments, titles);
  const assignmentCount = assignments.filter((entry) => entry.slotId === slot.id).length;

  return (
    <Link
      className={
        archived
          ? "block rounded border border-neutral-800 bg-neutral-950/60 px-2 py-1.5 text-xs opacity-60 hover:opacity-80"
          : assignmentCount === 0
            ? "block rounded border border-dashed border-neutral-700 bg-neutral-950 px-2 py-1.5 text-xs text-neutral-500 hover:border-neutral-500"
            : "block rounded border border-neutral-700 px-2 py-1.5 text-xs hover:border-white"
      }
      to={`/calendar/box/${slot.id}`}
    >
      <span className="font-medium">{label}</span>
      <span className="mt-0.5 block text-neutral-500">{formatTimeRange(slot)}</span>
      {!compact && assignmentCount > 1 ? (
        <span className="mt-0.5 block text-neutral-600">{assignmentCount} tasks</span>
      ) : null}
      {archived ? <span className="mt-0.5 block text-neutral-600">archived</span> : null}
    </Link>
  );
}

export function boxesForDay(slots: ScheduleSlot[], day: Date): ScheduleSlot[] {
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const dayEnd = addDays(dayStart, 1);
  return slots.filter((slot) => slotOverlapsRange(slot, dayStart, dayEnd));
}
