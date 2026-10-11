import type { ItemLink } from "../links";
import { constraintMode, resolvedDuration } from "./constraints";
import { bufferedMinutes } from "./math";
import type { SchedulerConfig, TaskScheduleInput } from "./types";

/** Inputs contain active tasks only; completed work releases its capacity. */
export function scheduledReservations(
  tasks: TaskScheduleInput[], links: ItemLink[], config: SchedulerConfig
): Map<string, number> {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const reserved = new Map<string, number>();
  const tasksInInterval = new Map<string, Set<string>>();
  for (const link of links) {
    if (link.kind !== "scheduled_in") continue;
    const task = taskById.get(link.fromId);
    // Fixed appointments reserve their actual time through appointment overlaps.
    if (!task || constraintMode(task) === "fixed") continue;
    const seen = tasksInInterval.get(link.toId) ?? new Set<string>();
    if (seen.has(task.id)) continue;
    seen.add(task.id);
    tasksInInterval.set(link.toId, seen);
    reserved.set(link.toId, (reserved.get(link.toId) ?? 0) + bufferedMinutes(resolvedDuration(task, config), config));
  }
  return reserved;
}
