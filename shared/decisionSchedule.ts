import type { Item } from "./item";
import type { ItemLink } from "./links";
import { itemsToScheduleInputs } from "./scheduling/resolve";
import { appointmentOverlapMinutes, intervalCapacityMinutes, intervalIsOpen, resolvedDuration } from "./scheduling/constraints";
import { bufferedMinutes } from "./scheduling/math";
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
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const appointments = tasks.filter((task) => task.fixedStartsAt && task.fixedEndsAt);
  const needed = bufferedMinutes(durationMinutes, config);
  const blocks = items.flatMap((item) => {
    const slot = calendarIntervalFromItem(item);
    if (!slot || slot.kind !== "fixed" || isArchivedSlot(slot) || !slot.startsAt || !slot.endsAt) return [];
    return [{ id: item.id, title: item.title, kind: slot.kind, startsAt: slot.startsAt, endsAt: slot.endsAt, archived: false }];
  }).filter((interval) => intervalIsOpen(interval, config) && Date.parse(interval.startsAt) > now.getTime())
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  for (const block of blocks) {
    const committed = links
      .filter((link) => link.kind === "scheduled_in" && link.toId === block.id)
      .reduce((minutes, link) => {
        const task = tasksById.get(link.fromId);
        return minutes + (task ? bufferedMinutes(resolvedDuration(task, config), config) : config.defaultDurationMinutes * config.durationBuffer);
      }, 0);
    const free = intervalCapacityMinutes(block) - appointmentOverlapMinutes(block, appointments) - committed;
    if (free >= needed) return block.id;
  }
  return null;
}
