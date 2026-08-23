import type { Item } from "../item";
import { calendarIntervalFromItem, type ScheduleSlot } from "../schedule";

export type TaskConstraint =
  | { mode: "flexible" }
  | { mode: "deadline"; dueAt: string }
  | { mode: "fixed"; startsAt: string; endsAt: string };

export function taskConstraint(item: Item): TaskConstraint | null {
  if (!item.isTask) {
    return null;
  }

  if (item.fixedStartsAt && item.fixedEndsAt) {
    return { mode: "fixed", startsAt: item.fixedStartsAt, endsAt: item.fixedEndsAt };
  }

  if (item.dueAt) {
    return { mode: "deadline", dueAt: item.dueAt };
  }

  return { mode: "flexible" };
}

export function isActiveTask(item: Item): boolean {
  return item.isTask && item.taskStatus !== "done" && item.taskStatus !== "cancelled";
}

export function isOverdue(item: Item, now: Date): boolean {
  const constraint = taskConstraint(item);
  if (!constraint || constraint.mode !== "deadline" || !isActiveTask(item)) {
    return false;
  }
  return now.getTime() > new Date(constraint.dueAt).getTime();
}

export function intervalDurationMinutes(slot: ScheduleSlot): number | null {
  if (slot.kind === "allDay") {
    return 24 * 60;
  }

  if (!slot.startsAt || !slot.endsAt) {
    return null;
  }

  const minutes = (new Date(slot.endsAt).getTime() - new Date(slot.startsAt).getTime()) / 60_000;
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return null;
  }
  return minutes;
}

export function taskDurationMinutes(task: Item, defaultMinutes: number): number {
  if (task.expectedDurationMinutes !== null && task.expectedDurationMinutes > 0) {
    return task.expectedDurationMinutes;
  }
  return defaultMinutes;
}

export function canPlaceInInterval(
  task: Item,
  interval: Item,
  options?: { remainingMinutes?: number | null; defaultTaskDurationMinutes?: number }
): boolean {
  if (!task.isTask || !interval.isInterval || !isActiveTask(task)) {
    return false;
  }

  const constraint = taskConstraint(task);
  if (!constraint) {
    return false;
  }

  if (constraint.mode === "fixed") {
    return false;
  }

  const slot = calendarIntervalFromItem(interval);
  if (!slot || slot.slotStatus === "archived") {
    return false;
  }

  const slotEndIso = slot.endsAt ?? slot.startsAt;
  if (!slotEndIso) {
    return constraint.mode === "flexible";
  }

  if (constraint.mode === "deadline") {
    if (new Date(slotEndIso).getTime() > new Date(constraint.dueAt).getTime()) {
      return false;
    }
  }

  const defaultMinutes = options?.defaultTaskDurationMinutes ?? 30;
  const needed = taskDurationMinutes(task, defaultMinutes);
  const remaining = options?.remainingMinutes;

  if (remaining !== undefined && remaining !== null) {
    return remaining >= needed;
  }

  const available = intervalDurationMinutes(slot);
  if (available === null) {
    return true;
  }

  return available >= needed;
}

export function blocksNeeded(task: Item): number {
  if (!task.isTask) {
    return 0;
  }

  const constraint = taskConstraint(task);
  if (constraint?.mode === "fixed") {
    return 1;
  }

  return 1;
}

export function intervalCapacityMinutes(interval: Item): number | null {
  const slot = calendarIntervalFromItem(interval);
  if (!slot || slot.slotStatus === "archived") {
    return null;
  }
  return intervalDurationMinutes(slot);
}

export function remainingIntervalCapacity(
  interval: Item,
  assignedTasks: Item[],
  defaultTaskDurationMinutes: number
): number | null {
  const capacity = intervalCapacityMinutes(interval);
  if (capacity === null) {
    return null;
  }

  const used = assignedTasks.reduce(
    (sum, task) => sum + taskDurationMinutes(task, defaultTaskDurationMinutes),
    0
  );
  return Math.max(0, capacity - used);
}
