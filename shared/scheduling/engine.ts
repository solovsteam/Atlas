import {
  appointmentOverlapMinutes,
  constraintMode,
  intervalCapacityMinutes,
  intervalIsOpen,
  intervalRange,
  resolvedDuration,
  taskFitsInterval
} from "./constraints";
import { nowMotivation, postponementCost, waitHorizon } from "./deferral";
import { bufferedMinutes, valueScore } from "./math";
import { switchCost } from "./switching";
import { eligibleTasks } from "./eligible";
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
  constants: { duration: number; valueScore: number; delayCostIfWait: number },
  interval: IntervalInput,
  previous: TaskScheduleInput | null,
  later: IntervalInput[],
  remaining: Map<string, number>,
  config: SchedulerConfig
): number {
  const range = intervalRange(interval);
  const slotTime = range ? (range.start.getTime() < config.now.getTime() ? config.now : range.start) : config.now;
  const delayCostHere = postponementCost(task, slotTime, config);
  const switching = config.strategy === "delta_cost_switch" ? switchCost(previous, task, config.switchPenalty) : 0;
  const laterFit = later.some((candidate) =>
    taskFitsInterval(task, candidate, remaining.get(candidate.id) ?? 0, config)
  );
  const lastChance = laterFit ? 0 : constraintMode(task) === "deadline" ? 500 : 80;
  return lastChance + (constants.delayCostIfWait - delayCostHere) - switching +
    config.wsptWeight * (constants.valueScore / constants.duration);
}

function openIntervals(intervals: IntervalInput[], config: SchedulerConfig): IntervalInput[] {
  return intervals
    .filter((interval) => intervalIsOpen(interval, config))
    .map((interval, index) => ({ interval, index, start: intervalRange(interval)?.start.getTime() ?? 0 }))
    .sort((a, b) => a.start - b.start || a.index - b.index)
    .map(({ interval }) => interval);
}

function remainingFor(
  interval: IntervalInput,
  appointments: TaskScheduleInput[],
  reservedMinutesByInterval: Map<string, number>,
  config: SchedulerConfig
): number {
  return Math.max(
    0,
    intervalCapacityMinutes(interval, config) - appointmentOverlapMinutes(interval, appointments, config) - (reservedMinutesByInterval.get(interval.id) ?? 0)
  );
}

function initializeRemaining(
  intervals: IntervalInput[],
  appointments: TaskScheduleInput[],
  reservedMinutesByInterval: Map<string, number>,
  config: SchedulerConfig
): Map<string, number> {
  return new Map(intervals.map((interval) => [
    interval.id,
    remainingFor(interval, appointments, reservedMinutesByInterval, config)
  ]));
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
    const range = interval ? intervalRange(interval, config) : null;
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
    unassignedCount: unassigned.length
  };
}

function runEarliestFit(
  candidates: TaskScheduleInput[],
  intervals: IntervalInput[],
  appointments: TaskScheduleInput[],
  config: SchedulerConfig,
  reservedMinutesByInterval: Map<string, number>
): { assignments: Assignment[]; leftover: TaskScheduleInput[] } {
  const remaining = initializeRemaining(intervals, appointments, reservedMinutesByInterval, config);
  const ordered = candidates
    .map((task, index) => ({ task, index, motivation: nowMotivation(task, config) }))
    .sort((a, b) => b.motivation - a.motivation || a.index - b.index)
    .map(({ task }) => task);
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
  config: SchedulerConfig,
  reservedMinutesByInterval: Map<string, number>
): { assignments: Assignment[]; leftover: TaskScheduleInput[] } {
  const remaining = initializeRemaining(intervals, appointments, reservedMinutesByInterval, config);
  const open = new Set(candidates.map((task) => task.id));
  const byId = new Map(candidates.map((task) => [task.id, task]));
  const constantsById = new Map(candidates.map((task) => [task.id, {
    duration: bufferedMinutes(resolvedDuration(task, config), config),
    valueScore: valueScore(task.importance),
    delayCostIfWait: postponementCost(task, waitHorizon(task, config), config)
  }]));
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
        const constants = constantsById.get(task.id);
        if (!constants) {
          continue;
        }
        const benefit = placementBenefit(task, constants, interval, previous, later, remaining, config);
        if (!best || benefit > best.benefit) {
          best = { task, benefit };
        }
      }
      if (!best) {
        break;
      }
      const duration = constantsById.get(best.task.id)!.duration;
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
  config: SchedulerConfig,
  reservedMinutesByInterval: Map<string, number> = new Map()
): SchedulerResult {
  const { candidates, unassigned, appointments } = eligibleTasks(tasks);
  const intervalsOpen = openIntervals(intervals, config);
  const packed =
    config.strategy === "earliest_fit"
      ? runEarliestFit(candidates, intervalsOpen, appointments, config, reservedMinutesByInterval)
      : runDeltaCost(candidates, intervalsOpen, appointments, config, reservedMinutesByInterval);

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
