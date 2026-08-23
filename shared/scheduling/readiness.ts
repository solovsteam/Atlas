import type { Item } from "../item";
import { parentTaskOf } from "../subtasks";
import { scheduledIntervalForTask, scheduledTasksByIntervalId, type ItemLink } from "../links";
import {
  canPlaceInInterval,
  isActiveTask,
  remainingIntervalCapacity,
  taskConstraint
} from "./constraints";
import { calendarIntervalFromItem, isArchivedSlot } from "../schedule";
import type { SchedulerConfig } from "./types";
import { DEFAULT_SCHEDULER_CONFIG } from "./types";

export type TaskReadinessOrigin = "tasks" | "items";

export type MissingSchedulingField = "dueAt" | "fixedStartsAt" | "fixedEndsAt";

export type TaskScheduleReadiness =
  | { status: "ready" }
  | { status: "missing_info"; missing: MissingSchedulingField[] }
  | { status: "scheduled"; intervalId: string }
  | { status: "no_feasible_interval" }
  | { status: "excluded"; reason: "done" | "cancelled" | "fixed" };

export type EffectiveSchedulingFields = {
  expectedDurationMinutes: number | null;
  dueAt: string | null;
  fixedStartsAt: string | null;
  fixedEndsAt: string | null;
  manualRelevance: number;
};

function emptyToNull(value: string | null | undefined): string | null {
  if (!value?.trim()) {
    return null;
  }
  return value.trim();
}

function mergeEffectiveFields(task: Item, parent: Item | null): EffectiveSchedulingFields {
  return {
    expectedDurationMinutes: task.expectedDurationMinutes ?? parent?.expectedDurationMinutes ?? null,
    dueAt: emptyToNull(task.dueAt) ?? emptyToNull(parent?.dueAt) ?? null,
    fixedStartsAt: emptyToNull(task.fixedStartsAt) ?? emptyToNull(parent?.fixedStartsAt) ?? null,
    fixedEndsAt: emptyToNull(task.fixedEndsAt) ?? emptyToNull(parent?.fixedEndsAt) ?? null,
    manualRelevance: task.manualRelevance || parent?.manualRelevance || 0
  };
}

/** Resolved scheduling fields with subtask inheritance (virtual; does not mutate storage). */
export function effectiveSchedulingFields(task: Item, items: Item[]): EffectiveSchedulingFields {
  const parent = parentTaskOf(task, items);
  return mergeEffectiveFields(task, parent);
}

/** Item shape with effective scheduling fields for constraint/placement helpers. */
export function effectiveSchedulingItem(task: Item, items: Item[]): Item {
  const fields = effectiveSchedulingFields(task, items);
  return {
    ...task,
    expectedDurationMinutes: fields.expectedDurationMinutes,
    dueAt: fields.dueAt ?? "",
    fixedStartsAt: fields.fixedStartsAt ?? "",
    fixedEndsAt: fields.fixedEndsAt ?? "",
    manualRelevance: fields.manualRelevance
  };
}

export function missingSchedulingFields(
  task: Item,
  items: Item[],
  origin: TaskReadinessOrigin = "items"
): MissingSchedulingField[] {
  if (origin === "tasks") {
    return [];
  }

  const fields = effectiveSchedulingFields(task, items);
  const missing: MissingSchedulingField[] = [];
  const hasStart = Boolean(fields.fixedStartsAt);
  const hasEnd = Boolean(fields.fixedEndsAt);

  if (hasStart && !hasEnd) {
    missing.push("fixedEndsAt");
  }
  if (!hasStart && hasEnd) {
    missing.push("fixedStartsAt");
  }

  return missing;
}

function intervalInHorizon(interval: Item, now: Date, horizonDays: number): boolean {
  const slot = calendarIntervalFromItem(interval);
  if (!slot || isArchivedSlot(slot)) {
    return false;
  }

  const horizonEnd = new Date(now);
  horizonEnd.setDate(horizonEnd.getDate() + horizonDays);

  const startIso = slot.startsAt ?? slot.endsAt;
  if (!startIso) {
    return slot.kind === "allDay";
  }

  const start = new Date(startIso);
  if (start > horizonEnd) {
    return false;
  }

  const endIso = slot.endsAt ?? slot.startsAt;
  const end = endIso ? new Date(endIso) : start;
  return end >= now;
}

function hasFeasibleInterval(
  task: Item,
  items: Item[],
  links: ItemLink[],
  now: Date,
  config: SchedulerConfig
): boolean {
  const effective = effectiveSchedulingItem(task, items);
  const constraint = taskConstraint(effective);
  if (!constraint || constraint.mode === "fixed") {
    return false;
  }

  const intervals = items.filter(
    (item) => item.isInterval && intervalInHorizon(item, now, config.horizonDays)
  );
  if (intervals.length === 0) {
    return false;
  }

  const activeTasks = items.filter(isActiveTask);
  const linkedByInterval = scheduledTasksByIntervalId(links, activeTasks);
  const defaultMinutes = config.defaultTaskDurationMinutes;

  for (const interval of intervals) {
    const assigned = linkedByInterval.get(interval.id) ?? [];
    const remaining = remainingIntervalCapacity(interval, assigned, defaultMinutes);
    if (
      canPlaceInInterval(effective, interval, {
        remainingMinutes: remaining,
        defaultTaskDurationMinutes: defaultMinutes
      })
    ) {
      return true;
    }
  }

  return false;
}

export function taskScheduleReadiness(
  task: Item,
  items: Item[],
  links: ItemLink[],
  options: {
    origin?: TaskReadinessOrigin;
    now?: Date;
    config?: SchedulerConfig;
  } = {}
): TaskScheduleReadiness {
  const origin = options.origin ?? "items";
  const now = options.now ?? new Date();
  const config = options.config ?? DEFAULT_SCHEDULER_CONFIG;

  if (!task.isTask) {
    return { status: "excluded", reason: "done" };
  }

  if (task.taskStatus === "done") {
    return { status: "excluded", reason: "done" };
  }

  if (task.taskStatus === "cancelled") {
    return { status: "excluded", reason: "cancelled" };
  }

  const effective = effectiveSchedulingItem(task, items);
  const constraint = taskConstraint(effective);
  if (constraint?.mode === "fixed") {
    return { status: "excluded", reason: "fixed" };
  }

  const scheduledId = scheduledIntervalForTask(links, task.id);
  if (scheduledId) {
    return { status: "scheduled", intervalId: scheduledId };
  }

  const missing = missingSchedulingFields(task, items, origin);
  if (missing.length > 0) {
    return { status: "missing_info", missing };
  }

  if (!hasFeasibleInterval(task, items, links, now, config)) {
    return { status: "no_feasible_interval" };
  }

  return { status: "ready" };
}

export function readinessLabel(
  readiness: TaskScheduleReadiness,
  items: Item[]
): string {
  switch (readiness.status) {
    case "ready":
      return "Ready";
    case "scheduled": {
      const interval = items.find((entry) => entry.id === readiness.intervalId);
      return interval?.title ? `Scheduled · ${interval.title}` : "Scheduled";
    }
    case "missing_info":
      if (readiness.missing.includes("dueAt")) {
        return "Needs due date";
      }
      if (readiness.missing.includes("fixedStartsAt")) {
        return "Needs appointment start";
      }
      if (readiness.missing.includes("fixedEndsAt")) {
        return "Needs appointment end";
      }
      return "Missing scheduling info";
    case "no_feasible_interval":
      return "No slot";
    case "excluded":
      if (readiness.reason === "fixed") {
        return "Fixed appointment";
      }
      return readiness.reason;
  }
}
