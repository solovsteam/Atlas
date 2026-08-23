import type { Item } from "./item";
import { scheduledIntervalForTask, scheduledTasksByIntervalId, type ItemLink } from "./links";
import { calendarIntervalFromItem, isArchivedSlot, type ScheduleSlot } from "./schedule";

export type CalendarZoom = "day" | "week" | "month";

export type TimedCalendarBlock = {
  id: string;
  kind: "interval" | "task";
  label: string;
  startsAt: Date;
  endsAt: Date;
  intervalId?: string;
  linkedTasks: { id: string; title: string }[];
};

export type DayCalendarLayout = {
  allDay: ScheduleSlot[];
  timed: TimedCalendarBlock[];
  startHour: number;
  endHour: number;
};

export function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function endOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

export function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

export function addMonths(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + amount);
  return next;
}

export function startOfWeek(date: Date): Date {
  const next = startOfDay(date);
  const weekday = next.getDay();
  const diff = weekday === 0 ? -6 : 1 - weekday;
  next.setDate(next.getDate() + diff);
  return next;
}

export function startOfMonth(date: Date): Date {
  const next = startOfDay(date);
  next.setDate(1);
  return next;
}

export function sameDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export function isSameMonth(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth();
}

export function weekDays(anchor: Date): Date[] {
  const start = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

export function monthGridDays(anchor: Date): Date[] {
  const start = startOfWeek(startOfMonth(anchor));
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

export function activeScheduleSlots(items: Item[]): ScheduleSlot[] {
  return items
    .map(calendarIntervalFromItem)
    .filter((slot): slot is ScheduleSlot => slot !== null && !isArchivedSlot(slot));
}

function slotRange(slot: ScheduleSlot, day: Date): { startsAt: Date; endsAt: Date } | null {
  if (slot.kind === "allDay") {
    if (!slot.startsAt) {
      return null;
    }
    const anchor = new Date(slot.startsAt);
    if (!sameDay(anchor, day)) {
      return null;
    }
    return { startsAt: startOfDay(day), endsAt: endOfDay(day) };
  }

  if (!slot.startsAt || !slot.endsAt) {
    return null;
  }

  const startsAt = new Date(slot.startsAt);
  const endsAt = new Date(slot.endsAt);
  const dayStart = startOfDay(day);
  const dayEnd = endOfDay(day);
  if (endsAt < dayStart || startsAt > dayEnd) {
    return null;
  }

  return {
    startsAt: new Date(Math.max(startsAt.getTime(), dayStart.getTime())),
    endsAt: new Date(Math.min(endsAt.getTime(), dayEnd.getTime()))
  };
}

export function slotOccursOnDay(slot: ScheduleSlot, day: Date): boolean {
  return slotRange(slot, day) !== null;
}

export function intervalsOnDay(slots: ScheduleSlot[], day: Date): ScheduleSlot[] {
  return slots.filter((slot) => slotOccursOnDay(slot, day));
}

function taskRange(task: Item, day: Date): { startsAt: Date; endsAt: Date } | null {
  if (!task.isTask || !task.fixedStartsAt || !task.fixedEndsAt) {
    return null;
  }
  if (task.taskStatus === "done" || task.taskStatus === "cancelled") {
    return null;
  }

  const startsAt = new Date(task.fixedStartsAt);
  const endsAt = new Date(task.fixedEndsAt);
  const dayStart = startOfDay(day);
  const dayEnd = endOfDay(day);
  if (endsAt < dayStart || startsAt > dayEnd) {
    return null;
  }

  return {
    startsAt: new Date(Math.max(startsAt.getTime(), dayStart.getTime())),
    endsAt: new Date(Math.min(endsAt.getTime(), dayEnd.getTime()))
  };
}

function computeViewHours(blocks: TimedCalendarBlock[]): { startHour: number; endHour: number } {
  if (blocks.length === 0) {
    return { startHour: 8, endHour: 18 };
  }

  let minMinutes = blocks[0].startsAt.getHours() * 60 + blocks[0].startsAt.getMinutes();
  let maxMinutes = blocks[0].endsAt.getHours() * 60 + blocks[0].endsAt.getMinutes();

  for (const block of blocks.slice(1)) {
    minMinutes = Math.min(minMinutes, block.startsAt.getHours() * 60 + block.startsAt.getMinutes());
    maxMinutes = Math.max(maxMinutes, block.endsAt.getHours() * 60 + block.endsAt.getMinutes());
  }

  const startHour = Math.max(0, Math.floor(minMinutes / 60) - 1);
  const endHour = Math.min(24, Math.ceil(maxMinutes / 60) + 1);
  return { startHour, endHour: Math.max(endHour, startHour + 6) };
}

export function buildDayLayout(
  day: Date,
  slots: ScheduleSlot[],
  tasks: Item[],
  links: ItemLink[]
): DayCalendarLayout {
  const daySlots = intervalsOnDay(slots, day);
  const allDay = daySlots.filter((slot) => slot.kind === "allDay");
  const linkedByInterval = scheduledTasksByIntervalId(links, tasks);
  const timed: TimedCalendarBlock[] = [];

  for (const slot of daySlots.filter((entry) => entry.kind === "fixed")) {
    const range = slotRange(slot, day);
    if (!range) {
      continue;
    }
    const linkedTasks = (linkedByInterval.get(slot.id) ?? [])
      .filter((task) => !task.fixedStartsAt || !task.fixedEndsAt)
      .map((task) => ({
        id: task.id,
        title: task.title
      }));
    timed.push({
      id: slot.id,
      kind: "interval",
      label: slot.label || "Interval",
      startsAt: range.startsAt,
      endsAt: range.endsAt,
      intervalId: slot.id,
      linkedTasks
    });
  }

  for (const task of tasks) {
    const range = taskRange(task, day);
    if (!range) {
      continue;
    }
    timed.push({
      id: task.id,
      kind: "task",
      label: task.title,
      startsAt: range.startsAt,
      endsAt: range.endsAt,
      linkedTasks: [],
      intervalId: scheduledIntervalForTask(links, task.id) ?? undefined
    });
  }

  timed.sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime());
  const { startHour, endHour } = computeViewHours(timed);

  return { allDay, timed, startHour, endHour };
}

export function layoutTimedBlock(
  startsAt: Date,
  endsAt: Date,
  day: Date,
  startHour: number,
  endHour: number
): { topPercent: number; heightPercent: number } {
  const dayAnchor = startOfDay(day);
  const rangeStart = new Date(dayAnchor);
  rangeStart.setHours(startHour, 0, 0, 0);
  const rangeEnd = new Date(dayAnchor);
  rangeEnd.setHours(endHour, 0, 0, 0);
  const rangeMs = rangeEnd.getTime() - rangeStart.getTime();
  if (rangeMs <= 0) {
    return { topPercent: 0, heightPercent: 100 };
  }

  const clampedStart = new Date(Math.max(startsAt.getTime(), rangeStart.getTime()));
  const clampedEnd = new Date(Math.min(endsAt.getTime(), rangeEnd.getTime()));
  const top = clampedStart.getTime() - rangeStart.getTime();
  const height = Math.max(clampedEnd.getTime() - clampedStart.getTime(), 15 * 60_000);

  return {
    topPercent: (top / rangeMs) * 100,
    heightPercent: Math.max((height / rangeMs) * 100, 3)
  };
}

export function formatHourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

export function formatPeriodLabel(zoom: CalendarZoom, anchor: Date): string {
  const dayFormatter = new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });
  const shortDateFormatter = new Intl.DateTimeFormat("de-DE", {
    day: "numeric",
    month: "short"
  });
  const monthFormatter = new Intl.DateTimeFormat("de-DE", {
    month: "long",
    year: "numeric"
  });

  if (zoom === "day") {
    return dayFormatter.format(anchor);
  }
  if (zoom === "week") {
    const days = weekDays(anchor);
    return `${shortDateFormatter.format(days[0])} – ${shortDateFormatter.format(days[6])}`;
  }
  return monthFormatter.format(anchor);
}

export function navigateAnchor(zoom: CalendarZoom, anchor: Date, direction: -1 | 1): Date {
  if (zoom === "day") {
    return addDays(anchor, direction);
  }
  if (zoom === "week") {
    return addDays(anchor, direction * 7);
  }
  return addMonths(anchor, direction);
}

export type MonthDaySummary = {
  date: Date;
  inMonth: boolean;
  intervals: ScheduleSlot[];
  taskCount: number;
};

export function buildMonthSummaries(
  anchor: Date,
  slots: ScheduleSlot[],
  tasks: Item[],
  links: ItemLink[]
): MonthDaySummary[] {
  const linkedByInterval = scheduledTasksByIntervalId(links, tasks);

  return monthGridDays(anchor).map((date) => {
    const dayIntervals = intervalsOnDay(slots, date);
    const linkedTaskIds = new Set<string>();
    for (const slot of dayIntervals) {
      for (const task of linkedByInterval.get(slot.id) ?? []) {
        linkedTaskIds.add(task.id);
      }
    }

    let taskCount = linkedTaskIds.size;
    for (const task of tasks) {
      if (taskRange(task, date)) {
        taskCount += 1;
      }
    }

    return {
      date,
      inMonth: isSameMonth(date, anchor),
      intervals: dayIntervals,
      taskCount
    };
  });
}
