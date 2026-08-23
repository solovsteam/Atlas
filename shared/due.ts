import { addDays, startOfDay, startOfWeek } from "./schedule";

export type DuePreset = "today" | "week";

function atEndOfLocalDay(day: Date): Date {
  const end = startOfDay(day);
  end.setHours(23, 59, 59, 0);
  return end;
}

export function dueAtForPreset(now: Date, preset: DuePreset): string {
  if (preset === "today") {
    return atEndOfLocalDay(now).toISOString();
  }
  return atEndOfLocalDay(addDays(startOfWeek(now), 6)).toISOString();
}

export function parseDueAt(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isOverdue(dueAt: string | null | undefined, now: Date): boolean {
  const due = parseDueAt(dueAt);
  return due !== null && due.getTime() < now.getTime();
}

export function isDueSameLocalDay(dueAt: string | null | undefined, now: Date): boolean {
  const due = parseDueAt(dueAt);
  if (!due) {
    return false;
  }
  return startOfDay(due).getTime() === startOfDay(now).getTime();
}

export function isDueThisWeek(dueAt: string | null | undefined, now: Date): boolean {
  const due = parseDueAt(dueAt);
  if (!due) {
    return false;
  }
  const weekStart = startOfWeek(now);
  const weekEnd = addDays(weekStart, 7);
  return due.getTime() >= weekStart.getTime() && due.getTime() < weekEnd.getTime();
}
