import { intervalRange } from "./constraints";
import { postponementCost, waitHorizon } from "./deferral";
import { switchCost } from "./switching";
import type { Assignment, IntervalInput, SchedulerConfig, SchedulerMetrics, TaskScheduleInput, UnassignedTask } from "./types";

export function calculateSchedulerMetrics(
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
    if (!task) continue;
    const range = interval ? intervalRange(interval, config) : null;
    totalPostponement += postponementCost(task, range?.start ?? config.now, config);
    const list = assignedInInterval.get(assignment.intervalId) ?? [];
    list.push(assignment.taskId);
    assignedInInterval.set(assignment.intervalId, list);
  }

  for (const taskId of remainingCandidates) {
    const task = byId.get(taskId);
    if (task) totalPostponement += postponementCost(task, waitHorizon(task, config), config);
  }

  let contextSwitches = 0;
  for (const taskIds of assignedInInterval.values()) {
    for (let index = 1; index < taskIds.length; index += 1) {
      const prev = byId.get(taskIds[index - 1]!);
      const next = byId.get(taskIds[index]!);
      if (prev && next && switchCost(prev, next, config.switchPenalty) > 0) contextSwitches += 1;
    }
  }

  return { totalPostponement, contextSwitches, assignedCount: assignments.length, unassignedCount: unassigned.length };
}
