import { parseJson, toJson } from "./item";
import { formatIsoDateTime } from "./locale";

export type SlotKind = "fixed" | "due" | "window" | "allDay";
export type SlotStatus = "scheduled" | "archived";

export const SLOT_KINDS: SlotKind[] = ["fixed", "due", "window", "allDay"];
export const SLOT_STATUSES: SlotStatus[] = ["scheduled", "archived"];

export type ScheduleSlotRow = {
  id: string;
  ownerId: string;
  itemId: string;
  kind: string;
  startsAt: string;
  endsAt: string;
  slotStatus: string;
  recurrenceRule: string;
  createdAt: string;
  updatedAt: string;
};

export type ScheduleSlot = {
  id: string;
  ownerId: string;
  itemId: string;
  kind: SlotKind;
  startsAt: string | null;
  endsAt: string | null;
  slotStatus: SlotStatus;
  recurrenceRule: unknown | null;
  createdAt: string;
  updatedAt: string;
};

export type ScheduleSlotPatch = Partial<{
  kind: SlotKind;
  startsAt: string | null;
  endsAt: string | null;
  slotStatus: SlotStatus;
}>;

export type CreateScheduleSlotInput = {
  itemId: string;
  kind: SlotKind;
  startsAt?: string | null;
  endsAt?: string | null;
};

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
    itemId: row.itemId,
    kind: parseSlotKind(row.kind),
    startsAt: row.startsAt || null,
    endsAt: row.endsAt || null,
    slotStatus: parseSlotStatus(row.slotStatus),
    recurrenceRule: parseJson<unknown | null>(row.recurrenceRule, null),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export function newScheduleSlotRow(
  ownerId: string,
  input: CreateScheduleSlotInput
): Omit<ScheduleSlotRow, "id" | "createdAt" | "updatedAt"> {
  return {
    ownerId,
    itemId: input.itemId,
    kind: input.kind,
    startsAt: input.startsAt ?? "",
    endsAt: input.endsAt ?? "",
    slotStatus: "scheduled",
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

  const start = slotRangeStart(slot);
  const end = slotRangeEnd(slot);
  if (!start && !end) {
    return false;
  }
  const effectiveStart = start ?? end!;
  const effectiveEnd = end ?? start!;
  return effectiveStart < rangeEnd && effectiveEnd >= rangeStart;
}

export function slotsInRange(slots: ScheduleSlot[], rangeStart: Date, rangeEnd: Date): ScheduleSlot[] {
  return slots.filter((slot) => slotOverlapsRange(slot, rangeStart, rangeEnd));
}

export function slotsForItem(slots: ScheduleSlot[], itemId: string): ScheduleSlot[] {
  return slots
    .filter((slot) => slot.itemId === itemId)
    .sort((a, b) => {
      const aTime = slotRangeStart(a)?.getTime() ?? slotRangeEnd(a)?.getTime() ?? 0;
      const bTime = slotRangeStart(b)?.getTime() ?? slotRangeEnd(b)?.getTime() ?? 0;
      return aTime - bTime;
    });
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

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export { formatDayLabel } from "./locale";

export function formatTimeRange(slot: ScheduleSlot): string {
  if (slot.kind === "allDay") {
    return "All day";
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
