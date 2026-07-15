import type { Item } from "./item";
import { formatIsoDateTime } from "./locale";

export type SlotKind = "fixed" | "due" | "window" | "allDay";
export type SlotStatus = "scheduled" | "archived";

export const SLOT_KINDS: SlotKind[] = ["fixed", "due", "window", "allDay"];
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
  if (!item.isInterval) {
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
    updatedAt: item.updatedAt
  };
}

export function formatTimeRange(slot: ScheduleSlot): string {
  if (slot.kind === "allDay") {
    return slot.label && slot.label !== "Free time" ? `All day · ${slot.label}` : "All day";
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
