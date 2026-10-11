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

export function intervalRange(interval: IntervalInput, config?: SchedulerConfig): { start: Date; end: Date } | null {
  let start = parseTime(interval.startsAt);
  let end = parseTime(interval.endsAt);
  if (!start) return null;
  if (!end || end.getTime() <= start.getTime()) {
    if (interval.kind !== "allDay") return null;
    end = new Date(start);
    end.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() + 1);
  }
  if (config) {
    // Existing blocks may straddle now or the horizon; only this part is usable.
    start = new Date(Math.max(start.getTime(), config.now.getTime()));
    end = new Date(Math.min(end.getTime(), config.now.getTime() + config.horizonDays * 86_400_000));
  }
  return end.getTime() > start.getTime() ? { start, end } : null;
}

export function intervalCapacityMinutes(interval: IntervalInput, config?: SchedulerConfig): number {
  const range = intervalRange(interval, config);
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

export function appointmentOverlapMinutes(
  interval: IntervalInput, appointments: TaskScheduleInput[], config?: SchedulerConfig
): number {
  const range = intervalRange(interval, config);
  if (!range) {
    return 0;
  }
  const occupied: Array<{ start: number; end: number }> = [];
  for (const task of appointments) {
    const start = parseTime(task.fixedStartsAt);
    const end = parseTime(task.fixedEndsAt);
    if (!start || !end) {
      continue;
    }
    const clippedStart = Math.max(range.start.getTime(), start.getTime());
    const clippedEnd = Math.min(range.end.getTime(), end.getTime());
    if (clippedEnd > clippedStart) occupied.push({ start: clippedStart, end: clippedEnd });
  }
  occupied.sort((a, b) => a.start - b.start);
  // Conflicting appointments still occupy each minute only once.
  let used = 0;
  let occupiedUntil = range.start.getTime();
  for (const span of occupied) {
    used += Math.max(0, span.end - Math.max(span.start, occupiedUntil));
    occupiedUntil = Math.max(occupiedUntil, span.end);
  }
  return used / 60_000;
}

export function intervalIsOpen(interval: IntervalInput, config: SchedulerConfig): boolean {
  if (interval.archived) {
    return false;
  }
  return intervalRange(interval, config) !== null;
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
