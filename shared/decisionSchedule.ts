import type { Item } from "./item";
import type { ItemLink } from "./links";
import { itemsToScheduleInputs } from "./scheduling/resolve";
import { appointmentOverlapMinutes, intervalCapacityMinutes, intervalIsOpen } from "./scheduling/constraints";
import { bufferedMinutes } from "./scheduling/math";
import { scheduledReservations } from "./scheduling/reservations";
import { mergeSchedulerConfig } from "./scheduling/types";
import { calendarIntervalFromItem, isArchivedSlot } from "./schedule";

// A narrow decision-to-calendar policy: one proposed action, one existing work block.
// It never manufactures a block, deadline, priority, or recurring task.
export function firstFeasibleWorkBlock(
  items: Item[],
  links: ItemLink[],
  durationMinutes: number,
  now: Date = new Date()
): string | null {
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 2) return null;
  const config = mergeSchedulerConfig(now);
  const tasks = itemsToScheduleInputs(items);
  const appointments = tasks.filter((task) => task.fixedStartsAt && task.fixedEndsAt);
  const reserved = scheduledReservations(tasks, links, config);
  const needed = bufferedMinutes(durationMinutes, config);
  const blocks = items.flatMap((item) => {
    const slot = calendarIntervalFromItem(item);
    if (!slot || slot.kind !== "fixed" || isArchivedSlot(slot) || !slot.startsAt || !slot.endsAt) return [];
    return [{ id: item.id, title: item.title, kind: slot.kind, startsAt: slot.startsAt, endsAt: slot.endsAt, archived: false }];
  }).filter((interval) => intervalIsOpen(interval, config) && Date.parse(interval.startsAt) > now.getTime())
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));

  for (const block of blocks) {
    const free = intervalCapacityMinutes(block, config) - appointmentOverlapMinutes(block, appointments, config) - (reserved.get(block.id) ?? 0);
    if (free >= needed) return block.id;
  }
  return null;
}
