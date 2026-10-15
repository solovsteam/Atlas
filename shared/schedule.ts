import type { Item } from "./item";
import { generatorRule } from "./recurringReferences";
import type { ItemLink } from "./links";
import { tasksScheduledIn } from "./links";
import { formatIsoDateTime } from "./locale";

export type SlotKind = "fixed" | "due" | "allDay";
export type SlotStatus = "scheduled" | "archived";

export const SLOT_KINDS: SlotKind[] = ["fixed", "due", "allDay"];
export const SLOT_STATUSES: SlotStatus[] = ["scheduled", "archived"];

export type ScheduleSlot = {
  id: string;
  ownerId: string;
  kind: SlotKind;
  startsAt: string | null;
  endsAt: string | null;
  slotStatus: SlotStatus;
  label: string;
  createdAt: string;
  updatedAt: string;
};

export type ScheduleSlotPatch = Partial<{
  kind: SlotKind;
  startsAt: string | null;
  endsAt: string | null;
  slotStatus: SlotStatus;
  label: string;
}>;

export function parseSlotKind(value: string): SlotKind {
  if (value === "window") {
    return "fixed";
  }
  if (SLOT_KINDS.includes(value as SlotKind)) {
    return value as SlotKind;
  }
  return "fixed";
}

export function parseSlotStatus(value: string): SlotStatus {
  if (SLOT_STATUSES.includes(value as SlotStatus)) {
    return value as SlotStatus;
  }
  return "scheduled";
}

export function calendarIntervalFromItem(item: Item): ScheduleSlot | null {
  if (
    !item.isInterval ||
    generatorRule(item) ||
    item.recurrenceView?.needsReview
  ) {
    return null;
  }
  return {
    id: item.id,
    ownerId: item.ownerId,
    kind: parseSlotKind(item.intervalKind),
    startsAt: item.intervalStartsAt || null,
    endsAt: item.intervalEndsAt || null,
    slotStatus: parseSlotStatus(item.intervalStatus || "scheduled"),
    label: item.title,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export function formatTimeRange(slot: ScheduleSlot): string {
  if (slot.kind === "allDay") {
    return slot.label && slot.label !== "Free time"
      ? `All day · ${slot.label}`
      : "All day";
  }
  if (slot.kind === "due" && slot.endsAt) {
    return `Due ${formatTime(slot.endsAt)}`;
  }
  if (slot.startsAt && slot.endsAt) {
    return `${formatTime(slot.startsAt)} – ${formatTime(slot.endsAt)}`;
  }
  if (slot.startsAt) {
    return formatTime(slot.startsAt);
  }
  if (slot.endsAt) {
    return formatTime(slot.endsAt);
  }
  return "Unscheduled";
}

export function formatTime(iso: string): string {
  return formatIsoDateTime(iso);
}

export function slotKindLabel(kind: SlotKind): string {
  switch (kind) {
    case "fixed":
      return "Fixed time";
    case "due":
      return "Due date";
    case "allDay":
      return "All day";
  }
}

export function isArchivedSlot(slot: ScheduleSlot): boolean {
  return slot.slotStatus === "archived";
}

export type DayLayoutEntry = {
  slot: ScheduleSlot;
  topPct: number;
  heightPct: number;
  /** Column within its cluster of overlapping entries, 0-based. */
  lane: number;
  /** Number of columns the cluster needs. */
  lanes: number;
  /** Columns the entry covers, from its lane rightwards while nothing there overlaps it; it is span/lanes wide. */
  span: number;
  startMinutes: number;
  endMinutes: number;
};

export type DayGridRange = { startHour: number; endHour: number };

export const DAY_GRID_START_HOUR = 6;
export const DAY_GRID_END_HOUR = 22;
export const DEFAULT_DAY_GRID: DayGridRange = { startHour: DAY_GRID_START_HOUR, endHour: DAY_GRID_END_HOUR };

export function intervalItemsToCalendar(items: Item[]): ScheduleSlot[] {
  return items
    .map((item) => calendarIntervalFromItem(item))
    .filter((slot): slot is ScheduleSlot => Boolean(slot))
    .sort((a, b) => {
      const aTime =
        slotRangeStart(a)?.getTime() ?? slotRangeEnd(a)?.getTime() ?? 0;
      const bTime =
        slotRangeStart(b)?.getTime() ?? slotRangeEnd(b)?.getTime() ?? 0;
      return aTime - bTime;
    });
}

export function appointmentSlotFromItem(item: Item): ScheduleSlot | null {
  if (!item.isTask || !item.taskFixedStartsAt || !item.taskFixedEndsAt) {
    return null;
  }
  return {
    id: `appt:${item.id}`,
    ownerId: item.ownerId,
    kind: "fixed",
    startsAt: item.taskFixedStartsAt,
    endsAt: item.taskFixedEndsAt,
    slotStatus: "scheduled",
    label: item.title,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export function appointmentItemsToCalendar(items: Item[]): ScheduleSlot[] {
  return items
    .map((item) => appointmentSlotFromItem(item))
    .filter((slot): slot is ScheduleSlot => Boolean(slot));
}

export function slotRangeStart(slot: ScheduleSlot): Date | null {
  if (slot.startsAt) {
    return new Date(slot.startsAt);
  }
  if (slot.endsAt) {
    return new Date(slot.endsAt);
  }
  return null;
}

export function slotRangeEnd(slot: ScheduleSlot): Date | null {
  if (slot.endsAt) {
    return new Date(slot.endsAt);
  }
  if (slot.startsAt) {
    return new Date(slot.startsAt);
  }
  return null;
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
}

export function startOfWeek(date: Date, weekStartsOnMonday = true): Date {
  const day = date.getDay();
  const diff = weekStartsOnMonday ? (day === 0 ? -6 : 1 - day) : -day;
  const start = startOfDay(date);
  start.setDate(start.getDate() + diff);
  return start;
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, date.getDate());
}

export function daysInMonthGrid(monthStart: Date): Date[] {
  const gridStart = startOfWeek(monthStart);
  const days: Date[] = [];
  for (let index = 0; index < 42; index += 1) {
    days.push(addDays(gridStart, index));
  }
  return days;
}

export function slotOverlapsRange(
  slot: ScheduleSlot,
  rangeStart: Date,
  rangeEnd: Date,
): boolean {
  if (slot.kind === "allDay") {
    const anchor = slotRangeStart(slot) ?? slotRangeEnd(slot);
    if (!anchor) {
      return false;
    }
    return anchor >= startOfDay(rangeStart) && anchor < rangeEnd;
  }
  if (slot.kind === "due") {
    const due = slotRangeEnd(slot) ?? slotRangeStart(slot);
    if (!due) {
      return false;
    }
    return due >= rangeStart && due < rangeEnd;
  }
  const start = slotRangeStart(slot);
  const end = slotRangeEnd(slot);
  if (!start && !end) {
    return false;
  }
  const effectiveStart = start ?? end!;
  const effectiveEnd = end ?? start!;
  return effectiveStart < rangeEnd && effectiveEnd >= rangeStart;
}

export function slotsInRange(
  slots: ScheduleSlot[],
  rangeStart: Date,
  rangeEnd: Date,
): ScheduleSlot[] {
  return slots.filter((slot) => slotOverlapsRange(slot, rangeStart, rangeEnd));
}

export function boxesForDay(slots: ScheduleSlot[], day: Date): ScheduleSlot[] {
  return slotsInRange(slots, startOfDay(day), endOfDay(day));
}

function minutesFromDayStart(date: Date, day: Date): number {
  return Math.round((date.getTime() - startOfDay(day).getTime()) / 60_000);
}

function timedMinutesOnDay(slot: ScheduleSlot, day: Date): [number, number] | null {
  if (slot.kind === "allDay" || slot.kind === "due") {
    return null;
  }
  if (!slotOverlapsRange(slot, startOfDay(day), endOfDay(day))) {
    return null;
  }
  const start = slotRangeStart(slot) ?? slotRangeEnd(slot);
  const end = slotRangeEnd(slot) ?? slotRangeStart(slot);
  if (!start || !end) {
    return null;
  }
  const startMinutes = Math.max(minutesFromDayStart(start, day), 0);
  const endMinutes = Math.min(minutesFromDayStart(end, day), 24 * 60);
  return endMinutes > startMinutes ? [startMinutes, endMinutes] : null;
}

/** The default 06–22 grid, widened so no timed entry on these days is hidden. */
export function dayGridRange(slots: ScheduleSlot[], days: Date[]): DayGridRange {
  let startHour = DAY_GRID_START_HOUR;
  let endHour = DAY_GRID_END_HOUR;
  for (const day of days) {
    for (const slot of slots) {
      const minutes = timedMinutesOnDay(slot, day);
      if (!minutes) {
        continue;
      }
      startHour = Math.min(startHour, Math.floor(minutes[0] / 60));
      endHour = Math.max(endHour, Math.ceil(minutes[1] / 60));
    }
  }
  return { startHour, endHour };
}

/**
 * Positions timed entries on one day's grid. Entries that overlap, directly or
 * through a chain, form a cluster and sit side by side in lanes, as in common
 * calendar apps, instead of covering each other.
 */
export function layoutBoxesOnDay(
  slots: ScheduleSlot[],
  day: Date,
  range: DayGridRange = DEFAULT_DAY_GRID,
): DayLayoutEntry[] {
  const gridStart = range.startHour * 60;
  const gridEnd = range.endHour * 60;
  const gridMinutes = gridEnd - gridStart;
  const timed: { slot: ScheduleSlot; start: number; end: number }[] = [];
  for (const slot of slots) {
    const minutes = timedMinutesOnDay(slot, day);
    if (!minutes) {
      continue;
    }
    const start = Math.max(minutes[0], gridStart);
    const end = Math.min(minutes[1], gridEnd);
    if (end > start) {
      timed.push({ slot, start, end });
    }
  }
  timed.sort((a, b) => a.start - b.start || b.end - a.end);

  const entries: DayLayoutEntry[] = [];
  let cluster: DayLayoutEntry[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;
  const closeCluster = () => {
    const lanes = laneEnds.length;
    for (const entry of cluster) {
      entry.lanes = lanes;
      const blocked = (lane: number) =>
        cluster.some(
          (other) =>
            other.lane === lane &&
            other.startMinutes < entry.endMinutes &&
            entry.startMinutes < other.endMinutes,
        );
      while (entry.lane + entry.span < lanes && !blocked(entry.lane + entry.span)) {
        entry.span += 1;
      }
    }
    cluster = [];
    laneEnds = [];
  };
  for (const { slot, start, end } of timed) {
    if (start >= clusterEnd) {
      closeCluster();
    }
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else {
      laneEnds[lane] = end;
    }
    const entry: DayLayoutEntry = {
      slot,
      topPct: ((start - gridStart) / gridMinutes) * 100,
      heightPct: ((end - start) / gridMinutes) * 100,
      lane,
      lanes: 1,
      span: 1,
      startMinutes: start,
      endMinutes: end,
    };
    cluster.push(entry);
    entries.push(entry);
    clusterEnd = Math.max(clusterEnd, end);
  }
  closeCluster();
  return entries;
}

export function allDayBoxesOnDay(
  slots: ScheduleSlot[],
  day: Date,
): ScheduleSlot[] {
  return slots.filter(
    (slot) =>
      slot.kind === "allDay" &&
      slotOverlapsRange(slot, startOfDay(day), endOfDay(day)),
  );
}

export function boxDisplayLabel(
  slot: ScheduleSlot,
  links: ItemLink[],
  itemTitles: Map<string, string>,
): string {
  if (slot.id.startsWith("appt:")) {
    return slot.label;
  }
  if (slot.label.trim()) {
    const taskIds = tasksScheduledIn(slot.id, links);
    if (taskIds.length === 0) {
      return slot.label;
    }
    if (taskIds.length === 1) {
      return `${slot.label} · ${itemTitles.get(taskIds[0]!) ?? "task"}`;
    }
    return `${slot.label} · ${taskIds.length} tasks`;
  }
  const taskIds = tasksScheduledIn(slot.id, links);
  if (taskIds.length === 0) {
    return "Free";
  }
  if (taskIds.length === 1) {
    return itemTitles.get(taskIds[0]!) ?? "Untitled";
  }
  return `${itemTitles.get(taskIds[0]!) ?? "Untitled"} +${taskIds.length - 1}`;
}
