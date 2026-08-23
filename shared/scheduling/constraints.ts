import { bufferedMinutes, parseTime } from "./math";
import type { IntervalInput, SchedulerConfig, TaskScheduleInput } from "./types";

export function constraintMode(task: TaskScheduleInput): "fixed" | "deadline" | "flexible" {
  const hasStart = Boolean(task.fixedStartsAt);
  const hasEnd = Boolean(task.fixedEndsAt);
  if (hasStart && hasEnd) {
    return "fixed";
  }
  if (task.dueAt) {
    return "deadline";
  }
  return "flexible";
}

export function hasMissingInfo(task: TaskScheduleInput): boolean {
  const hasStart = Boolean(task.fixedStartsAt);
  const hasEnd = Boolean(task.fixedEndsAt);
  return hasStart !== hasEnd;
}

export function resolvedDuration(task: TaskScheduleInput, config: SchedulerConfig): number {
  return task.durationMinutes && task.durationMinutes > 0 ? task.durationMinutes : config.defaultDurationMinutes;
}

export function intervalRange(interval: IntervalInput): { start: Date; end: Date } | null {
  const start = parseTime(interval.startsAt);
  const end = parseTime(interval.endsAt);
  if (!start || !end || end.getTime() <= start.getTime()) {
    if (interval.kind === "allDay" && start) {
      const dayEnd = new Date(start);
      dayEnd.setHours(23, 59, 59, 999);
      return { start, end: dayEnd };
    }
    return null;
  }
  return { start, end };
}

export function intervalCapacityMinutes(interval: IntervalInput): number {
  if (interval.kind === "allDay") {
    return 24 * 60;
  }
  const range = intervalRange(interval);
  if (!range) {
    return 0;
  }
  return Math.max(0, (range.end.getTime() - range.start.getTime()) / 60_000);
}

export function overlapMinutes(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): number {
  const start = Math.max(aStart.getTime(), bStart.getTime());
  const end = Math.min(aEnd.getTime(), bEnd.getTime());
  return Math.max(0, (end - start) / 60_000);
}

export function appointmentOverlapMinutes(interval: IntervalInput, appointments: TaskScheduleInput[]): number {
  const range = intervalRange(interval);
  if (!range) {
    return 0;
  }
  let used = 0;
  for (const task of appointments) {
    const start = parseTime(task.fixedStartsAt);
    const end = parseTime(task.fixedEndsAt);
    if (!start || !end) {
      continue;
    }
    used += overlapMinutes(range.start, range.end, start, end);
  }
  return used;
}

export function intervalIsOpen(interval: IntervalInput, config: SchedulerConfig): boolean {
  if (interval.archived) {
    return false;
  }
  const range = intervalRange(interval);
  if (!range) {
    return false;
  }
  const horizon = new Date(config.now.getTime() + config.horizonDays * 86_400_000);
  return range.start.getTime() <= horizon.getTime() && range.end.getTime() >= config.now.getTime();
}

export function taskFitsInterval(
  task: TaskScheduleInput,
  interval: IntervalInput,
  remainingMinutes: number,
  config: SchedulerConfig
): boolean {
  const duration = bufferedMinutes(resolvedDuration(task, config), config);
  if (duration > remainingMinutes + 1e-6) {
    return false;
  }
  if (constraintMode(task) === "deadline" && task.dueAt) {
    const due = parseTime(task.dueAt);
    const range = intervalRange(interval);
    if (!due || !range) {
      return false;
    }
    if (range.end.getTime() > due.getTime()) {
      return false;
    }
  }
  return true;
}
