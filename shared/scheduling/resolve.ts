import type { Item } from "../item";
import { generatorRule, occurrenceRule } from "../recurringReferences";
import type { TaskScheduleInput } from "./types";

function inherit<T>(
  own: T | null | undefined,
  parent: T | null | undefined,
  empty: T,
): T {
  if (own !== null && own !== undefined && own !== empty) {
    return own;
  }
  if (parent !== null && parent !== undefined && parent !== empty) {
    return parent;
  }
  return own ?? parent ?? empty;
}

export function itemToScheduleInput(
  item: Item,
  items: Item[],
): TaskScheduleInput {
  const parent = item.parentTaskId
    ? items.find((entry) => entry.id === item.parentTaskId)
    : undefined;
  const dueAt = inherit(item.taskDueAt, parent?.taskDueAt, "");
  const fixedStartsAt = inherit(
    item.taskFixedStartsAt,
    parent?.taskFixedStartsAt,
    "",
  );
  const fixedEndsAt = inherit(
    item.taskFixedEndsAt,
    parent?.taskFixedEndsAt,
    "",
  );
  const duration =
    item.expectedDurationMinutes ?? parent?.expectedDurationMinutes ?? null;
  const importance = item.manualRelevance || parent?.manualRelevance || 0;

  return {
    id: item.id,
    title: item.title,
    createdAt: item.createdAt,
    importance,
    durationMinutes: duration,
    dueAt: dueAt || null,
    fixedStartsAt: fixedStartsAt || null,
    fixedEndsAt: fixedEndsAt || null,
    parentTaskId: item.parentTaskId,
    tags: item.tags,
    notBeforeAt: item.recurrenceView?.availableFrom ?? null,
  };
}

export function itemsToScheduleInputs(items: Item[]): TaskScheduleInput[] {
  return items
    .filter(
      (item) =>
        !generatorRule(item) &&
        !item.recurrenceView?.needsReview &&
        ((item.isTask && item.taskStatus === "active") ||
          (occurrenceRule(item) &&
            item.isInterval &&
            item.intervalStatus !== "archived" &&
            item.intervalStatus !== "completed")),
    )
    .map((item) => {
      const task = itemToScheduleInput(item, items);
      if (
        occurrenceRule(item) &&
        item.isInterval &&
        item.intervalStartsAt &&
        item.intervalEndsAt
      ) {
        task.fixedStartsAt = item.intervalStartsAt;
        task.fixedEndsAt = item.intervalEndsAt;
      }
      return task;
    });
}
