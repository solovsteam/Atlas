import type { ServerContext } from "lakebed/server";
import { parseJson } from "../shared/item";
import {
  applySlotPatch,
  newScheduleSlotRow,
  slotFromRow,
  type CreateScheduleSlotInput,
  type ScheduleSlot,
  type ScheduleSlotPatch,
  type ScheduleSlotRow,
  type SlotKind
} from "../shared/schedule";
import { getOwnedItem } from "./items";

type Db = ServerContext["db"];

export function listOwnedScheduleSlots(db: Db, userId: string): ScheduleSlot[] {
  return db.scheduleSlots
    .where("ownerId", userId)
    .orderBy("startsAt", "asc")
    .all()
    .map((row) => slotFromRow(row as ScheduleSlotRow));
}

export function getOwnedScheduleSlot(db: Db, userId: string, id: string): ScheduleSlot | null {
  const row = db.scheduleSlots.get(id) as ScheduleSlotRow | null;
  if (!row || row.ownerId !== userId) {
    return null;
  }
  return slotFromRow(row);
}

export function createScheduleSlot(
  db: Db,
  userId: string,
  itemId: string,
  kind: string,
  startsAt: string = "",
  endsAt: string = ""
): { id: string } | { error: string } {
  const item = getOwnedItem(db, userId, itemId);
  if (!item) {
    return { error: "Item not found" };
  }

  const input: CreateScheduleSlotInput = {
    itemId,
    kind: (kind || "fixed") as SlotKind,
    startsAt: startsAt || null,
    endsAt: endsAt || null
  };

  const inserted = db.scheduleSlots.insert(newScheduleSlotRow(userId, input)) as ScheduleSlotRow;
  return { id: inserted.id };
}

export function updateScheduleSlot(
  db: Db,
  userId: string,
  id: string,
  patchJson: string
): { ok: true } | { error: string } {
  const row = db.scheduleSlots.get(id) as ScheduleSlotRow | null;
  if (!row || row.ownerId !== userId) {
    return { error: "Schedule slot not found" };
  }

  const patch = parseJson<ScheduleSlotPatch>(patchJson, {});
  const updates = applySlotPatch(row, patch);
  if (Object.keys(updates).length === 0) {
    return { ok: true };
  }

  db.scheduleSlots.update(id, updates);
  return { ok: true };
}

export function archiveScheduleSlot(db: Db, userId: string, id: string): boolean {
  const row = db.scheduleSlots.get(id) as ScheduleSlotRow | null;
  if (!row || row.ownerId !== userId) {
    return false;
  }
  db.scheduleSlots.update(id, { slotStatus: "archived" });
  return true;
}

export function deleteScheduleSlot(db: Db, userId: string, id: string): boolean {
  const row = db.scheduleSlots.get(id) as ScheduleSlotRow | null;
  if (!row || row.ownerId !== userId) {
    return false;
  }
  db.scheduleSlots.delete(id);
  return true;
}

export function archiveSlotsForItem(db: Db, userId: string, itemId: string): void {
  const slots = db.scheduleSlots.where("ownerId", userId).all() as ScheduleSlotRow[];
  for (const slot of slots) {
    if (slot.itemId === itemId && slot.slotStatus !== "archived") {
      db.scheduleSlots.update(slot.id, { slotStatus: "archived" });
    }
  }
}

export function deleteSlotsForItem(db: Db, userId: string, itemId: string): void {
  const slots = db.scheduleSlots.where("ownerId", userId).all() as ScheduleSlotRow[];
  for (const slot of slots) {
    if (slot.itemId === itemId) {
      db.scheduleSlots.delete(slot.id);
    }
  }
}
