import { isQuickDuration } from "../duration";
import {
  appointmentOverlapMinutes,
  constraintMode,
  hasMissingInfo,
  intervalCapacityMinutes,
  intervalIsOpen,
  intervalRange,
  resolvedDuration,
  taskFitsInterval
} from "./constraints";
import { nowMotivation, postponementCost, waitHorizon } from "./deferral";
import { bufferedMinutes, valueScore } from "./math";
import { switchCost } from "./switching";
import type {
  Assignment,
  IntervalInput,
  SchedulerConfig,
  SchedulerMetrics,
  SchedulerResult,
  TaskScheduleInput,
  UnassignedTask
} from "./types";

function placementBenefit(
  task: TaskScheduleInput,
  interval: IntervalInput,
  previous: TaskScheduleInput | null,
  later: IntervalInput[],
  remaining: Map<string, number>,
  config: SchedulerConfig
): number {
  const range = intervalRange(interval);
  const slotTime = range ? (range.start.getTime() < config.now.getTime() ? config.now : range.start) : config.now;
  const delayCostHere = postponementCost(task, slotTime, config);
  const delayCostIfWait = postponementCost(task, waitHorizon(task, config), config);
  const duration = bufferedMinutes(resolvedDuration(task, config), config);
  const wspt = valueScore(task.importance) / duration;
  const switching = config.strategy === "delta_cost_switch" ? switchCost(previous, task, config.switchPenalty) : 0;
  const laterFit = later.some((candidate) =>
    taskFitsInterval(task, candidate, remaining.get(candidate.id) ?? 0, config)
  );
  const lastChance = laterFit ? 0 : constraintMode(task) === "deadline" ? 500 : 80;
  return lastChance + (delayCostIfWait - delayCostHere) - switching + config.wsptWeight * wspt;
}

function openIntervals(intervals: IntervalInput[], config: SchedulerConfig): IntervalInput[] {
  return intervals
    .filter((interval) => intervalIsOpen(interval, config))
    .sort((a, b) => {
      const aStart = intervalRange(a)?.start.getTime() ?? 0;
      const bStart = intervalRange(b)?.start.getTime() ?? 0;
      return aStart - bStart;
    });
}

function remainingFor(interval: IntervalInput, appointments: TaskScheduleInput[], assignedDurations: number): number {
  return Math.max(
    0,
    intervalCapacityMinutes(interval) - appointmentOverlapMinutes(interval, appointments) - assignedDurations
  );
}

function eligibleTasks(tasks: TaskScheduleInput[]): {
  candidates: TaskScheduleInput[];
  unassigned: UnassignedTask[];
  appointments: TaskScheduleInput[];
} {
  const candidates: TaskScheduleInput[] = [];
  const unassigned: UnassignedTask[] = [];
  const appointments: TaskScheduleInput[] = [];

  for (const task of tasks) {
    const mode = constraintMode(task);
    if (mode === "fixed") {
      appointments.push(task);
      unassigned.push({ taskId: task.id, reason: "excluded" });
      continue;
    }
    if (hasMissingInfo(task)) {
      unassigned.push({ taskId: task.id, reason: "missing_info" });
      continue;
    }
    if (isQuickDuration(task.durationMinutes)) {
      unassigned.push({ taskId: task.id, reason: "quick" });
      continue;
    }
    candidates.push(task);
  }

  return { candidates, unassigned, appointments };
}

function metricsFor(
  assignments: Assignment[],
  unassigned: UnassignedTask[],
  byId: Map<string, TaskScheduleInput>,
  intervalById: Map<string, IntervalInput>,
  config: SchedulerConfig,
  remainingCandidates: Set<string>
): SchedulerMetrics {
  let totalPostponement = 0;
  const assignedInInterval = new Map<string, string[]>();

  for (const assignment of assignments) {
    const task = byId.get(assignment.taskId);
    const interval = intervalById.get(assignment.intervalId);
    if (!task) {
      continue;
    }
    const range = interval ? intervalRange(interval) : null;
    const at = range?.start ?? config.now;
    totalPostponement += postponementCost(task, at, config);
    const list = assignedInInterval.get(assignment.intervalId) ?? [];
    list.push(assignment.taskId);
    assignedInInterval.set(assignment.intervalId, list);
  }

  for (const taskId of remainingCandidates) {
    const task = byId.get(taskId);
    if (!task) {
      continue;
    }
    totalPostponement += postponementCost(task, waitHorizon(task, config), config);
  }

  let contextSwitches = 0;
  if (config.strategy === "delta_cost_switch") {
    for (const taskIds of assignedInInterval.values()) {
      for (let index = 1; index < taskIds.length; index += 1) {
        const prev = byId.get(taskIds[index - 1]!);
        const next = byId.get(taskIds[index]!);
        if (prev && next && switchCost(prev, next, config.switchPenalty) > 0) {
          contextSwitches += 1;
        }
      }
    }
  } else {
    for (const taskIds of assignedInInterval.values()) {
      for (let index = 1; index < taskIds.length; index += 1) {
        const prev = byId.get(taskIds[index - 1]!);
        const next = byId.get(taskIds[index]!);
        if (prev && next && switchCost(prev, next, config.switchPenalty) > 0) {
          contextSwitches += 1;
        }
      }
    }
  }

  return {
    totalPostponement,
    contextSwitches,
    assignedCount: assignments.length,
    unassignedCount: unassigned.length + remainingCandidates.size
  };
}

function runEarliestFit(
  candidates: TaskScheduleInput[],
  intervals: IntervalInput[],
  appointments: TaskScheduleInput[],
  config: SchedulerConfig
): { assignments: Assignment[]; leftover: TaskScheduleInput[] } {
  const remaining = new Map<string, number>();
  for (const interval of intervals) {
    remaining.set(interval.id, remainingFor(interval, appointments, 0));
  }
  const ordered = [...candidates].sort((a, b) => nowMotivation(b, config) - nowMotivation(a, config));
  const assignments: Assignment[] = [];
  const leftover: TaskScheduleInput[] = [];

  for (const task of ordered) {
    let placed = false;
    for (const interval of intervals) {
      const left = remaining.get(interval.id) ?? 0;
      if (!taskFitsInterval(task, interval, left, config)) {
        continue;
      }
      const duration = bufferedMinutes(resolvedDuration(task, config), config);
      remaining.set(interval.id, left - duration);
      assignments.push({ taskId: task.id, intervalId: interval.id });
      placed = true;
      break;
    }
    if (!placed) {
      leftover.push(task);
    }
  }

  return { assignments, leftover };
}

function runDeltaCost(
  candidates: TaskScheduleInput[],
  intervals: IntervalInput[],
  appointments: TaskScheduleInput[],
  config: SchedulerConfig
): { assignments: Assignment[]; leftover: TaskScheduleInput[] } {
  const remaining = new Map<string, number>();
  for (const interval of intervals) {
    remaining.set(interval.id, remainingFor(interval, appointments, 0));
  }
  const open = new Set(candidates.map((task) => task.id));
  const byId = new Map(candidates.map((task) => [task.id, task]));
  const assignments: Assignment[] = [];
  const lastInInterval = new Map<string, TaskScheduleInput>();

  for (let index = 0; index < intervals.length; index += 1) {
    const interval = intervals[index]!;
    const later = intervals.slice(index + 1);
    while (true) {
      const left = remaining.get(interval.id) ?? 0;
      const previous = lastInInterval.get(interval.id) ?? null;
      let best: { task: TaskScheduleInput; benefit: number } | null = null;
      for (const id of open) {
        const task = byId.get(id);
        if (!task) {
          continue;
        }
        if (!taskFitsInterval(task, interval, left, config)) {
          continue;
        }
        const benefit = placementBenefit(task, interval, previous, later, remaining, config);
        if (!best || benefit > best.benefit) {
          best = { task, benefit };
        }
      }
      if (!best) {
        break;
      }
      const duration = bufferedMinutes(resolvedDuration(best.task, config), config);
      remaining.set(interval.id, left - duration);
      assignments.push({ taskId: best.task.id, intervalId: interval.id });
      lastInInterval.set(interval.id, best.task);
      open.delete(best.task.id);
    }
  }

  const leftover = [...open].map((id) => byId.get(id)!).filter(Boolean);
  return { assignments, leftover };
}

export function runScheduler(
  tasks: TaskScheduleInput[],
  intervals: IntervalInput[],
  config: SchedulerConfig
): SchedulerResult {
  const { candidates, unassigned, appointments } = eligibleTasks(tasks);
  const intervalsOpen = openIntervals(intervals, config);
  const packed =
    config.strategy === "earliest_fit"
      ? runEarliestFit(candidates, intervalsOpen, appointments, config)
      : runDeltaCost(candidates, intervalsOpen, appointments, config);

  const leftoverUnassigned: UnassignedTask[] = packed.leftover.map((task) => ({
    taskId: task.id,
    reason: "no_feasible_interval"
  }));

  const allUnassigned = [...unassigned, ...leftoverUnassigned];
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const intervalById = new Map(intervals.map((interval) => [interval.id, interval]));
  const leftoverIds = new Set(packed.leftover.map((task) => task.id));

  return {
    assignments: packed.assignments,
    unassigned: allUnassigned,
    metrics: metricsFor(packed.assignments, allUnassigned, byId, intervalById, config, leftoverIds)
  };
}
