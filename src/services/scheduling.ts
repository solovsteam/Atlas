import type { Item } from "@shared/item";
import type { ItemLink } from "@shared/links";
import { calendarIntervalFromItem, isArchivedSlot } from "@shared/schedule";
import {
  itemsToScheduleInputs,
  mergeSchedulerConfig,
  runScheduler,
  type PlacementStrategy,
  type SchedulerResult
} from "@shared/scheduling";
import { bufferedMinutes } from "@shared/scheduling/math";
import type { IntervalInput } from "@shared/scheduling/types";

export function intervalsFromItems(items: Item[]): IntervalInput[] {
  const result: IntervalInput[] = [];
  for (const item of items) {
    const slot = calendarIntervalFromItem(item);
    if (!slot) {
      continue;
    }
    result.push({
      id: item.id,
      title: item.title,
      kind: slot.kind,
      startsAt: slot.startsAt ?? "",
      endsAt: slot.endsAt ?? "",
      archived: isArchivedSlot(slot)
    });
  }
  return result;
}

export function proposeSchedule(
  items: Item[],
  now = new Date(),
  strategy: PlacementStrategy = "delta_cost_switch",
  options: { links?: ItemLink[]; taskIds?: string[]; horizonDays?: number } = {}
): SchedulerResult {
  const config = mergeSchedulerConfig(now, { strategy, ...(options.horizonDays !== undefined ? { horizonDays: options.horizonDays } : {}) });
  const allTasks = itemsToScheduleInputs(items);
  const taskById = new Map(allTasks.map((task) => [task.id, task]));
  const scheduledLinks = (options.links ?? []).filter((link) => link.kind === "scheduled_in");
  const scheduledIds = new Set(scheduledLinks.map((link) => link.fromId));
  const reserved = new Map<string, number>();
  for (const link of scheduledLinks) {
    const task = taskById.get(link.fromId);
    if (!task || (task.fixedStartsAt && task.fixedEndsAt)) continue;
    const duration = task.durationMinutes && task.durationMinutes > 0 ? task.durationMinutes : config.defaultDurationMinutes;
    reserved.set(link.toId, (reserved.get(link.toId) ?? 0) + bufferedMinutes(duration, config));
  }

  const allowed = options.taskIds ? new Set(options.taskIds) : null;
  const candidates = allTasks.filter((task) =>
    (task.fixedStartsAt && task.fixedEndsAt) ||
    (!scheduledIds.has(task.id) && (!allowed || allowed.has(task.id)))
  );
  // Existing `scheduled_in` links reserve interval capacity; fixed appointments
  // remain in the input so the engine can subtract their overlaps precisely.
  return runScheduler(candidates, intervalsFromItems(items), config, reserved);
}

export type ApplySchedulePlan = {
  create: Array<{ fromId: string; toId: string }>;
  delete: ItemLink[];
};

export function planScheduleApply(
  result: SchedulerResult,
  existing: ItemLink[],
  mode: "unassigned_only" | "replace" = "unassigned_only"
): ApplySchedulePlan {
  const scheduledIn = existing.filter((link) => link.kind === "scheduled_in");
  const already = new Set(scheduledIn.map((link) => link.fromId));
  const create: Array<{ fromId: string; toId: string }> = [];
  const deleteLinks: ItemLink[] = [];

  for (const assignment of result.assignments) {
    if (mode === "unassigned_only" && already.has(assignment.taskId)) {
      continue;
    }
    if (mode === "replace") {
      for (const link of scheduledIn) {
        if (link.fromId === assignment.taskId) {
          deleteLinks.push(link);
        }
      }
    }
    create.push({ fromId: assignment.taskId, toId: assignment.intervalId });
  }

  return { create, delete: deleteLinks };
}
