import { addDays, daysBetween, hyperbolicUrgency, parseTime, valueScore } from "./math";
import type { SchedulerConfig, TaskScheduleInput } from "./types";
import { constraintMode } from "./constraints";

/**
 * Cost of still being undone at `atTime` (0–100-ish).
 * Deadline: hyperbolic toward due, then mixed with value (value does not change curve shape).
 * Flexible: later *slots* cost more for important work; task age is ignored.
 */
export function postponementCost(task: TaskScheduleInput, atTime: Date, config: SchedulerConfig): number {
  const value = valueScore(task.importance);
  const due = parseTime(task.dueAt);

  if (constraintMode(task) === "deadline" && due) {
    const daysUntilDue = daysBetween(atTime, due);
    const urgency = hyperbolicUrgency(daysUntilDue, config.gamma);
    return config.urgencyWeight * urgency + config.valueWeight * value;
  }

  const daysUntilSlot = Math.max(0, daysBetween(config.now, atTime));
  return value * (1 - 1 / (1 + config.gamma * (daysUntilSlot / 7)));
}

export function postponementCostDelta(
  task: TaskScheduleInput,
  slotEnd: Date,
  config: SchedulerConfig
): number {
  return postponementCost(task, slotEnd, config) - postponementCost(task, config.now, config);
}

/** TMT motivation to start *now* (Now page). Flexible tasks score as value only. */
export function nowMotivation(task: TaskScheduleInput, config: SchedulerConfig): number {
  const value = valueScore(task.importance) / 100;
  const due = parseTime(task.dueAt);
  if (constraintMode(task) === "deadline" && due) {
    const delayDays = Math.max(0, daysBetween(config.now, due));
    const tmt = (1 * value) / (1 + config.gamma * delayDays);
    const overdueBoost = due.getTime() <= config.now.getTime() ? 20 : 0;
    return 100 * tmt + overdueBoost;
  }
  return valueScore(task.importance);
}

export function waitHorizon(task: TaskScheduleInput, config: SchedulerConfig): Date {
  const horizon = addDays(config.now, config.horizonDays);
  const due = parseTime(task.dueAt);
  if (due && due.getTime() < horizon.getTime()) {
    return due;
  }
  return horizon;
}
