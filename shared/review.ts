import { isQuickDuration } from "./duration";
import { isOverdue } from "./due";
import type { Item } from "./item";
import { scheduledTaskIds, type ItemLink } from "./links";
import { constraintMode, hasMissingInfo } from "./scheduling/constraints";
import { itemToScheduleInput } from "./scheduling/resolve";

export type ReviewBuckets = {
  overdue: Item[];
  unscheduled: Item[];
  later: Item[];
};

function byDueThenTitle(a: Item, b: Item): number {
  const aDue = a.taskDueAt || "9999";
  const bDue = b.taskDueAt || "9999";
  if (aDue !== bDue) {
    return aDue.localeCompare(bDue);
  }
  return a.title.localeCompare(b.title);
}

/** GTD-style weekly look: hard dates that slipped, next actions not on the calendar, someday/maybe. */
export function buildReview(items: Item[], links: ItemLink[], now: Date): ReviewBuckets {
  const scheduled = scheduledTaskIds(links);
  const overdue: Item[] = [];
  const unscheduled: Item[] = [];
  const later: Item[] = [];

  for (const item of items) {
    if (!item.isTask) {
      continue;
    }
    if (item.taskStatus === "later") {
      later.push(item);
      continue;
    }
    if (item.taskStatus !== "active") {
      continue;
    }
    if (isOverdue(item.taskDueAt, now)) {
      overdue.push(item);
      continue;
    }
    const input = itemToScheduleInput(item, items);
    if (constraintMode(input) === "fixed" || hasMissingInfo(input) || isQuickDuration(item.expectedDurationMinutes)) {
      continue;
    }
    if (!scheduled.has(item.id)) {
      unscheduled.push(item);
    }
  }

  return {
    overdue: overdue.sort(byDueThenTitle),
    unscheduled: unscheduled.sort((a, b) => b.manualRelevance - a.manualRelevance || a.title.localeCompare(b.title)),
    later: later.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  };
}
