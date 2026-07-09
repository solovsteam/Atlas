import { parseJson, toJson } from "./item";
import { formatIsoDateTime } from "./locale";

export type SlotKind = "fixed" | "due" | "window" | "allDay";
export type SlotStatus = "scheduled" | "archived";

export const SLOT_KINDS: SlotKind[] = ["fixed", "due", "window", "allDay"];
export const SLOT_STATUSES: SlotStatus[] = ["scheduled", "archived"];

export type ScheduleSlotRow = {
  id: string;
  ownerId: string;
  kind: string;
  startsAt: string;
  endsAt: string;
  slotStatus: string;
  label: string;
  recurrenceRule: string;
  createdAt: string;
  updatedAt: string;
  /** @deprecated legacy migration only */
  itemId?: string;
};

export type ScheduleSlot = {
  id: string;
  ownerId: string;
  kind: SlotKind;
  startsAt: string | null;
  endsAt: string | null;
  slotStatus: SlotStatus;
  label: string;
  recurrenceRule: unknown | null;
  createdAt: string;
  updatedAt: string;
};

export type SlotAssignmentRow = {
  id: string;
  ownerId: string;
  slotId: string;
  itemId: string;
  createdAt: string;
  updatedAt: string;
};

export type SlotAssignment = {
  id: string;
  ownerId: string;
  slotId: string;
  itemId: string;
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

export type CreateTimeBoxInput = {
  kind: SlotKind;
  startsAt?: string | null;
  endsAt?: string | null;
  label?: string;
};

export type DayLayoutEntry = {
  slot: ScheduleSlot;
  topPct: number;
  heightPct: number;
  lane: number;
};

const DAY_GRID_START_HOUR = 6;
const DAY_GRID_END_HOUR = 22;
const DAY_GRID_MINUTES = (DAY_GRID_END_HOUR - DAY_GRID_START_HOUR) * 60;

export function parseSlotKind(value: string): SlotKind {
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

export function slotFromRow(row: ScheduleSlotRow): ScheduleSlot {
  return {
    id: row.id,
    ownerId: row.ownerId,
    kind: parseSlotKind(row.kind),
    startsAt: row.startsAt || null,
    endsAt: row.endsAt || null,
    slotStatus: parseSlotStatus(row.slotStatus),
    label: row.label ?? "",
    recurrenceRule: parseJson<unknown | null>(row.recurrenceRule, null),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export function assignmentFromRow(row: SlotAssignmentRow): SlotAssignment {
  return {
    id: row.id,
    ownerId: row.ownerId,
    slotId: row.slotId,
    itemId: row.itemId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export function newScheduleSlotRow(
  ownerId: string,
  input: CreateTimeBoxInput
): Omit<ScheduleSlotRow, "id" | "createdAt" | "updatedAt"> {
  return {
    ownerId,
    kind: input.kind,
    startsAt: input.startsAt ?? "",
    endsAt: input.endsAt ?? "",
    slotStatus: "scheduled",
    label: input.label?.trim().slice(0, 120) ?? "",
    recurrenceRule: ""
  };
}

export function applySlotPatch(row: ScheduleSlotRow, patch: ScheduleSlotPatch): Partial<ScheduleSlotRow> {
  const next: Partial<ScheduleSlotRow> = {};
  if (patch.kind !== undefined && SLOT_KINDS.includes(patch.kind)) {
    next.kind = patch.kind;
  }
  if (patch.startsAt !== undefined) {
    next.startsAt = patch.startsAt ?? "";
  }
  if (patch.endsAt !== undefined) {
    next.endsAt = patch.endsAt ?? "";
  }
  if (patch.slotStatus !== undefined && SLOT_STATUSES.includes(patch.slotStatus)) {
    next.slotStatus = patch.slotStatus;
  }
  if (patch.label !== undefined) {
    next.label = patch.label.trim().slice(0, 120);
  }
  return next;
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

export function slotOverlapsRange(slot: ScheduleSlot, rangeStart: Date, rangeEnd: Date): boolean {
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

export function boxIntervalMs(slot: ScheduleSlot): { start: number; end: number } | null {
  if (slot.kind === "due") {
    return null;
  }
  if (slot.kind === "allDay") {
    const anchor = slotRangeStart(slot) ?? slotRangeEnd(slot);
    if (!anchor) {
      return null;
    }
    const day = startOfDay(anchor);
    return { start: day.getTime(), end: endOfDay(day).getTime() };
  }
  const start = slotRangeStart(slot);
  const end = slotRangeEnd(slot);
  if (!start && !end) {
    return null;
  }
  const startMs = (start ?? end!).getTime();
  const endMs = (end ?? start!).getTime();
  if (endMs <= startMs) {
    return null;
  }
  return { start: startMs, end: endMs };
}

export function boxesOverlap(a: ScheduleSlot, b: ScheduleSlot): boolean {
  if (a.slotStatus === "archived" || b.slotStatus === "archived") {
    return false;
  }
  if (a.kind === "due" || b.kind === "due") {
    return false;
  }
  const aInterval = boxIntervalMs(a);
  const bInterval = boxIntervalMs(b);
  if (!aInterval || !bInterval) {
    return false;
  }
  return aInterval.start < bInterval.end && aInterval.end > bInterval.start;
}

export function findOverlappingBox(candidate: ScheduleSlot, existing: ScheduleSlot[], excludeId?: string): ScheduleSlot | null {
  for (const slot of existing) {
    if (excludeId && slot.id === excludeId) {
      continue;
    }
    if (boxesOverlap(candidate, slot)) {
      return slot;
    }
  }
  return null;
}

export function slotsInRange(slots: ScheduleSlot[], rangeStart: Date, rangeEnd: Date): ScheduleSlot[] {
  return slots.filter((slot) => slotOverlapsRange(slot, rangeStart, rangeEnd));
}

export function assignmentsForSlot(assignments: SlotAssignment[], slotId: string): SlotAssignment[] {
  return assignments.filter((entry) => entry.slotId === slotId);
}

export function assignmentsForItem(assignments: SlotAssignment[], itemId: string): SlotAssignment[] {
  return assignments.filter((entry) => entry.itemId === itemId);
}

export function slotsForItem(
  slots: ScheduleSlot[],
  assignments: SlotAssignment[],
  itemId: string
): ScheduleSlot[] {
  const slotIds = new Set(assignmentsForItem(assignments, itemId).map((entry) => entry.slotId));
  return slots
    .filter((slot) => slotIds.has(slot.id))
    .sort((a, b) => {
      const aTime = slotRangeStart(a)?.getTime() ?? slotRangeEnd(a)?.getTime() ?? 0;
      const bTime = slotRangeStart(b)?.getTime() ?? slotRangeEnd(b)?.getTime() ?? 0;
      return aTime - bTime;
    });
}

export function itemIdsInSlot(assignments: SlotAssignment[], slotId: string): string[] {
  return assignmentsForSlot(assignments, slotId).map((entry) => entry.itemId);
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

export function minutesFromDayStart(date: Date, day: Date): number {
  const dayStart = startOfDay(day);
  return Math.round((date.getTime() - dayStart.getTime()) / 60_000);
}

export function layoutBoxesOnDay(slots: ScheduleSlot[], day: Date): DayLayoutEntry[] {
  const dayStart = startOfDay(day);
  const gridStartMinutes = DAY_GRID_START_HOUR * 60;
  const entries: DayLayoutEntry[] = [];

  const timed = slots.filter((slot) => slot.kind !== "allDay" && slot.kind !== "due" && slotOverlapsRange(slot, dayStart, endOfDay(day)));
  for (const slot of timed) {
    const start = slotRangeStart(slot) ?? slotRangeEnd(slot);
    const end = slotRangeEnd(slot) ?? slotRangeStart(slot);
    if (!start || !end) {
      continue;
    }
    const startMinutes = minutesFromDayStart(start, day);
    const endMinutes = minutesFromDayStart(end, day);
    const clampedStart = Math.max(startMinutes, gridStartMinutes);
    const clampedEnd = Math.min(endMinutes, DAY_GRID_END_HOUR * 60);
    if (clampedEnd <= clampedStart) {
      continue;
    }
    entries.push({
      slot,
      topPct: ((clampedStart - gridStartMinutes) / DAY_GRID_MINUTES) * 100,
      heightPct: ((clampedEnd - clampedStart) / DAY_GRID_MINUTES) * 100,
      lane: 0
    });
  }

  return entries.sort((a, b) => a.topPct - b.topPct);
}

export function dueMarkersOnDay(slots: ScheduleSlot[], day: Date): Array<{ slot: ScheduleSlot; topPct: number }> {
  const dayStart = startOfDay(day);
  const gridStartMinutes = DAY_GRID_START_HOUR * 60;
  return slots
    .filter((slot) => slot.kind === "due" && slotOverlapsRange(slot, dayStart, endOfDay(day)))
    .map((slot) => {
      const due = slotRangeEnd(slot) ?? slotRangeStart(slot);
      if (!due) {
        return null;
      }
      const minutes = minutesFromDayStart(due, day);
      return {
        slot,
        topPct: ((Math.max(minutes, gridStartMinutes) - gridStartMinutes) / DAY_GRID_MINUTES) * 100
      };
    })
    .filter((entry): entry is { slot: ScheduleSlot; topPct: number } => Boolean(entry));
}

export function allDayBoxesOnDay(slots: ScheduleSlot[], day: Date): ScheduleSlot[] {
  const dayStart = startOfDay(day);
  return slots.filter((slot) => slot.kind === "allDay" && slotOverlapsRange(slot, dayStart, endOfDay(day)));
}

export { DAY_GRID_START_HOUR, DAY_GRID_END_HOUR, DAY_GRID_MINUTES };

export { formatDayLabel } from "./locale";

export function formatTimeRange(slot: ScheduleSlot): string {
  if (slot.kind === "allDay") {
    return slot.label ? `All day · ${slot.label}` : "All day";
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
    case "window":
      return "Work window";
    case "allDay":
      return "All day";
  }
}

export function isArchivedSlot(slot: ScheduleSlot): boolean {
  return slot.slotStatus === "archived";
}

export function toSlotPatchJson(patch: ScheduleSlotPatch): string {
  return JSON.stringify(patch);
}

export function serializeRecurrenceRule(value: unknown | null): string {
  return value ? toJson(value) : "";
}

export function boxDisplayLabel(
  slot: ScheduleSlot,
  assignments: SlotAssignment[],
  itemTitles: Map<string, string>
): string {
  if (slot.label.trim()) {
    return slot.label;
  }
  const ids = itemIdsInSlot(assignments, slot.id);
  if (ids.length === 0) {
    return "Free";
  }
  if (ids.length === 1) {
    return itemTitles.get(ids[0]) ?? "Untitled";
  }
  const first = itemTitles.get(ids[0]) ?? "Untitled";
  return `${first} +${ids.length - 1}`;
}
