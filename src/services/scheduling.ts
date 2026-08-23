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
  strategy: PlacementStrategy = "delta_cost_switch"
): SchedulerResult {
  return runScheduler(itemsToScheduleInputs(items), intervalsFromItems(items), mergeSchedulerConfig(now, { strategy }));
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
