import { scheduledIntervalForTask, scheduledTasksByIntervalId, type ItemLink } from "../links";
import type { Item } from "../item";
import { calendarIntervalFromItem } from "../schedule";
import {
  canPlaceInInterval,
  isActiveTask,
  remainingIntervalCapacity,
  taskConstraint,
  taskDurationMinutes
} from "./constraints";
import { effectiveSchedulingItem, missingSchedulingFields } from "./readiness";
import { scoreTaskInput } from "./relevance";
import type {
  ScheduleAssignment,
  ScheduleProposal,
  SchedulerConfig,
  SchedulingContext,
  TaskEnricher,
  TaskScheduleInput,
  TaskScheduleScore
} from "./types";

export const algorithmRelevanceEnricher: TaskEnricher = {
  name: "algorithm-relevance",
  enrich(tasks, ctx) {
    return tasks.map((input) => scoreTaskInput(input, { now: ctx.now, config: ctx.config }));
  }
};

function mergeScores(scoreLists: TaskScheduleScore[][]): Map<string, TaskScheduleScore> {
  const merged = new Map<string, TaskScheduleScore>();

  for (const scores of scoreLists) {
    for (const score of scores) {
      const existing = merged.get(score.taskId);
      if (!existing || score.relevance > existing.relevance) {
        merged.set(score.taskId, score);
      }
    }
  }

  return merged;
}

function intervalStartTime(interval: Item): number {
  const slot = calendarIntervalFromItem(interval);
  if (!slot) {
    return Number.POSITIVE_INFINITY;
  }
  const iso = slot.startsAt ?? slot.endsAt;
  if (!iso) {
    return Number.POSITIVE_INFINITY;
  }
  return new Date(iso).getTime();
}

function intervalInHorizon(interval: Item, now: Date, horizonDays: number): boolean {
  const slot = calendarIntervalFromItem(interval);
  if (!slot || slot.slotStatus === "archived") {
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

export function buildSchedulingContext(
  items: Item[],
  links: ItemLink[],
  now: Date,
  config: SchedulerConfig
): SchedulingContext {
  const intervals = items.filter(
    (item) => item.isInterval && intervalInHorizon(item, now, config.horizonDays)
  );

  return {
    now,
    items,
    links,
    intervals,
    config
  };
}

function buildTaskInputs(ctx: SchedulingContext): TaskScheduleInput[] {
  const { items, links, config } = ctx;
  const inputs: TaskScheduleInput[] = [];

  for (const task of items) {
    if (!isActiveTask(task)) {
      continue;
    }

    const effective = effectiveSchedulingItem(task, items);
    const constraint = taskConstraint(effective);
    if (!constraint || constraint.mode === "fixed") {
      continue;
    }

    if (missingSchedulingFields(task, items, "items").length > 0) {
      continue;
    }

    const mode: TaskScheduleInput["mode"] = "planning";
    const locked = false;
    const existingIntervalId = scheduledIntervalForTask(links, task.id);

    if (mode === "planning" && !config.includePlanningTasks) {
      continue;
    }

    if (config.scope === "unassigned_only" && existingIntervalId) {
      continue;
    }

    inputs.push({
      task: effective,
      constraint,
      mode,
      locked,
      existingIntervalId
    });
  }

  return inputs;
}

function compareTaskOrder(
  left: TaskScheduleInput,
  right: TaskScheduleInput,
  scores: Map<string, TaskScheduleScore>
): number {
  const leftScore = scores.get(left.task.id)?.relevance ?? 0;
  const rightScore = scores.get(right.task.id)?.relevance ?? 0;
  if (leftScore !== rightScore) {
    return rightScore - leftScore;
  }

  const leftDue =
    left.constraint.mode === "deadline" ? new Date(left.constraint.dueAt).getTime() : Number.POSITIVE_INFINITY;
  const rightDue =
    right.constraint.mode === "deadline" ? new Date(right.constraint.dueAt).getTime() : Number.POSITIVE_INFINITY;
  if (leftDue !== rightDue) {
    return leftDue - rightDue;
  }

  return left.task.updatedAt.localeCompare(right.task.updatedAt);
}

function buildCapacityMap(ctx: SchedulingContext): Map<string, number | null> {
  const { items, links, config, intervals } = ctx;
  const tasks = items.filter(isActiveTask);
  const linkedByInterval = scheduledTasksByIntervalId(links, tasks);
  const capacity = new Map<string, number | null>();

  for (const interval of intervals) {
    const assigned = linkedByInterval.get(interval.id) ?? [];
    capacity.set(
      interval.id,
      remainingIntervalCapacity(interval, assigned, config.defaultTaskDurationMinutes)
    );
  }

  return capacity;
}

function pickBestInterval(
  task: Item,
  intervals: Item[],
  capacity: Map<string, number | null>,
  defaultTaskDurationMinutes: number
): Item | null {
  const candidates = intervals
    .filter((interval) => {
      const remaining = capacity.get(interval.id);
      return canPlaceInInterval(task, interval, {
        remainingMinutes: remaining,
        defaultTaskDurationMinutes
      });
    })
    .sort((left, right) => intervalStartTime(left) - intervalStartTime(right));

  return candidates[0] ?? null;
}

export function runScheduler(
  ctx: SchedulingContext,
  enrichers: TaskEnricher[],
  config: SchedulerConfig = ctx.config
): ScheduleProposal {
  const taskInputs = buildTaskInputs({ ...ctx, config });
  const scoreLists = enrichers.map((enricher) => enricher.enrich(taskInputs, { ...ctx, config }));
  const scoresMap = mergeScores(scoreLists);
  const scores = [...scoresMap.values()].sort((a, b) => b.relevance - a.relevance);

  const sortedTasks = [...taskInputs].sort((left, right) => compareTaskOrder(left, right, scoresMap));
  const capacity = buildCapacityMap({ ...ctx, config });
  const assignments: ScheduleAssignment[] = [];
  const unassigned: ScheduleProposal["unassigned"] = [];
  const defaultMinutes = config.defaultTaskDurationMinutes;
  const inputIds = new Set(taskInputs.map((entry) => entry.task.id));

  for (const task of ctx.items) {
    if (!isActiveTask(task)) {
      continue;
    }
    const effective = effectiveSchedulingItem(task, ctx.items);
    const constraint = taskConstraint(effective);
    if (!constraint || constraint.mode === "fixed") {
      continue;
    }
    if (inputIds.has(task.id)) {
      continue;
    }
    if (missingSchedulingFields(task, ctx.items, "items").length > 0) {
      unassigned.push({ taskId: task.id, reason: "missing_info" });
    }
  }

  for (const input of sortedTasks) {
    if (input.locked) {
      unassigned.push({ taskId: input.task.id, reason: "locked" });
      continue;
    }

    const existingId = input.existingIntervalId;
    if (existingId && config.scope === "all_eligible") {
      const remaining = capacity.get(existingId);
      const freed =
        remaining === null || remaining === undefined
          ? null
          : remaining + taskDurationMinutes(input.task, defaultMinutes);
      capacity.set(existingId, freed);
    }

    const interval = pickBestInterval(input.task, ctx.intervals, capacity, defaultMinutes);
    if (!interval) {
      unassigned.push({ taskId: input.task.id, reason: "no_feasible_interval" });
      if (existingId && config.scope === "all_eligible") {
        const assigned = capacity.get(existingId);
        if (assigned !== null && assigned !== undefined) {
          capacity.set(
            existingId,
            assigned - taskDurationMinutes(input.task, defaultMinutes)
          );
        }
      }
      continue;
    }

    if (existingId === interval.id) {
      if (existingId && config.scope === "all_eligible") {
        const remaining = capacity.get(existingId);
        if (remaining !== null && remaining !== undefined) {
          capacity.set(
            existingId,
            remaining - taskDurationMinutes(input.task, defaultMinutes)
          );
        }
      }
      continue;
    }

    assignments.push({
      taskId: input.task.id,
      intervalId: interval.id,
      action: existingId ? "reassign" : "assign"
    });

    const remaining = capacity.get(interval.id);
    if (remaining !== null && remaining !== undefined) {
      capacity.set(interval.id, remaining - taskDurationMinutes(input.task, defaultMinutes));
    }
  }

  return { assignments, unassigned, scores };
}
