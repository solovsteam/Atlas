import type { ServerContext } from "lakebed/server";
import { parseJson, toJson } from "../shared/item";
import {
  applySlotPatch,
  assignmentFromRow,
  findOverlappingBox,
  newScheduleSlotRow,
  slotFromRow,
  type CreateTimeBoxInput,
  type ScheduleSlot,
  type ScheduleSlotPatch,
  type ScheduleSlotRow,
  type SlotAssignment,
  type SlotAssignmentRow,
  type SlotKind
} from "../shared/schedule";
import { getOwnedItem } from "./items";
import { trackGeneratedScheduleOverridesForSlot } from "./generation";

type Db = ServerContext["db"];

const migratedUsers = new Set<string>();

function migrateLegacySlots(db: Db, userId: string): void {
  if (migratedUsers.has(userId)) {
    return;
  }
  const rows = db.scheduleSlots.where("ownerId", userId).all() as Array<ScheduleSlotRow & { itemId?: string }>;
  for (const row of rows) {
    const legacyItemId = row.itemId;
    if (!legacyItemId) {
      continue;
    }
    const existing = db.slotAssignments
      .where("ownerId", userId)
      .all()
      .find(
        (entry) =>
          (entry as SlotAssignmentRow).slotId === row.id && (entry as SlotAssignmentRow).itemId === legacyItemId
      );
    if (!existing) {
      db.slotAssignments.insert({ ownerId: userId, slotId: row.id, itemId: legacyItemId });
    }
    db.scheduleSlots.update(row.id, { itemId: "" });
  }
  migratedUsers.add(userId);
}

export function listOwnedScheduleSlots(db: Db, userId: string): ScheduleSlot[] {
  migrateLegacySlots(db, userId);
  return db.scheduleSlots
    .where("ownerId", userId)
    .orderBy("startsAt", "asc")
    .all()
    .map((row) => slotFromRow(row as ScheduleSlotRow));
}

export function listOwnedSlotAssignments(db: Db, userId: string): SlotAssignment[] {
  migrateLegacySlots(db, userId);
  return db.slotAssignments
    .where("ownerId", userId)
    .all()
    .map((row) => assignmentFromRow(row as SlotAssignmentRow));
}

export function getOwnedScheduleSlot(db: Db, userId: string, id: string): ScheduleSlot | null {
  migrateLegacySlots(db, userId);
  const row = db.scheduleSlots.get(id) as ScheduleSlotRow | null;
  if (!row || row.ownerId !== userId) {
    return null;
  }
  return slotFromRow(row);
}

function activeSlots(db: Db, userId: string): ScheduleSlot[] {
  return listOwnedScheduleSlots(db, userId).filter((slot) => slot.slotStatus === "scheduled");
}

function overlapError(candidate: ScheduleSlot, existing: ScheduleSlot[], excludeId?: string): string | null {
  const conflict = findOverlappingBox(candidate, existing, excludeId);
  if (!conflict) {
    return null;
  }
  return "Time box overlaps an existing box";
}

function insertAssignment(db: Db, userId: string, slotId: string, itemId: string): { ok: true } | { error: string } {
  const item = getOwnedItem(db, userId, itemId);
  if (!item) {
    return { error: "Item not found" };
  }
  const slot = getOwnedScheduleSlot(db, userId, slotId);
  if (!slot) {
    return { error: "Time box not found" };
  }

  const existing = db.slotAssignments.where("ownerId", userId).all() as SlotAssignmentRow[];
  const duplicate = existing.find((entry) => entry.slotId === slotId && entry.itemId === itemId);
  if (duplicate) {
    return { ok: true };
  }

  db.slotAssignments.insert({ ownerId: userId, slotId, itemId });
  return { ok: true };
}

export function createTimeBox(
  db: Db,
  userId: string,
  kind: string,
  startsAt: string = "",
  endsAt: string = "",
  label: string = ""
): { id: string } | { error: string } {
  migrateLegacySlots(db, userId);

  const input: CreateTimeBoxInput = {
    kind: (kind || "fixed") as SlotKind,
    startsAt: startsAt || null,
    endsAt: endsAt || null,
    label
  };

  const candidate = slotFromRow({
    id: "candidate",
    ownerId: userId,
    kind: input.kind,
    startsAt: input.startsAt ?? "",
    endsAt: input.endsAt ?? "",
    slotStatus: "scheduled",
    label: input.label ?? "",
    recurrenceRule: "",
    createdAt: "",
    updatedAt: ""
  });

  const conflict = overlapError(candidate, activeSlots(db, userId));
  if (conflict) {
    return { error: conflict };
  }

  const inserted = db.scheduleSlots.insert(newScheduleSlotRow(userId, input)) as ScheduleSlotRow;
  return { id: inserted.id };
}

export function createScheduleSlot(
  db: Db,
  userId: string,
  itemId: string,
  kind: string,
  startsAt: string = "",
  endsAt: string = ""
): { id: string } | { error: string } {
  const created = createTimeBox(db, userId, kind, startsAt, endsAt);
  if ("error" in created) {
    return created;
  }
  const assigned = insertAssignment(db, userId, created.id, itemId);
  if ("error" in assigned) {
    db.scheduleSlots.delete(created.id);
    return assigned;
  }
  return created;
}

export function assignItemToSlot(
  db: Db,
  userId: string,
  slotId: string,
  itemId: string
): { ok: true } | { error: string } {
  migrateLegacySlots(db, userId);
  return insertAssignment(db, userId, slotId, itemId);
}

export function unassignItemFromSlot(db: Db, userId: string, slotId: string, itemId: string): boolean {
  migrateLegacySlots(db, userId);
  const rows = db.slotAssignments.where("ownerId", userId).all() as SlotAssignmentRow[];
  const match = rows.find((entry) => entry.slotId === slotId && entry.itemId === itemId);
  if (!match) {
    return false;
  }
  db.slotAssignments.delete(match.id);
  return true;
}

export function updateScheduleSlot(
  db: Db,
  userId: string,
  id: string,
  patchJson: string
): { ok: true } | { error: string } {
  migrateLegacySlots(db, userId);
  const row = db.scheduleSlots.get(id) as ScheduleSlotRow | null;
  if (!row || row.ownerId !== userId) {
    return { error: "Time box not found" };
  }

  const patch = parseJson<ScheduleSlotPatch>(patchJson, {});
  const updates = applySlotPatch(row, patch);
  const nextRow = { ...row, ...updates };
  const candidate = slotFromRow(nextRow);

  if (candidate.slotStatus === "scheduled") {
    const conflict = overlapError(candidate, activeSlots(db, userId), id);
    if (conflict) {
      return { error: conflict };
    }
  }

  trackGeneratedScheduleOverridesForSlot(db, userId, id, patch);

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
  const assignments = db.slotAssignments.where("ownerId", userId).all() as SlotAssignmentRow[];
  for (const entry of assignments) {
    if (entry.slotId === id) {
      db.slotAssignments.delete(entry.id);
    }
  }
  db.scheduleSlots.delete(id);
  return true;
}

export function archiveSlotsForItem(db: Db, userId: string, itemId: string): void {
  migrateLegacySlots(db, userId);
  const assignments = listOwnedSlotAssignments(db, userId).filter((entry) => entry.itemId === itemId);
  const slotIds = new Set(assignments.map((entry) => entry.slotId));
  for (const slotId of slotIds) {
    const slot = getOwnedScheduleSlot(db, userId, slotId);
    if (slot && slot.slotStatus !== "archived") {
      db.scheduleSlots.update(slotId, { slotStatus: "archived" });
    }
  }
}

export function deleteSlotsForItem(db: Db, userId: string, itemId: string): void {
  migrateLegacySlots(db, userId);
  const assignments = listOwnedSlotAssignments(db, userId).filter((entry) => entry.itemId === itemId);
  for (const entry of assignments) {
    db.slotAssignments.delete(entry.id);
  }
  const orphaned = assignments.map((entry) => entry.slotId);
  for (const slotId of orphaned) {
    const remaining = listOwnedSlotAssignments(db, userId).filter((entry) => entry.slotId === slotId);
    if (remaining.length === 0) {
      db.scheduleSlots.delete(slotId);
    }
  }
}

export function slotIdsForItem(db: Db, userId: string, itemId: string): string[] {
  return listOwnedSlotAssignments(db, userId)
    .filter((entry) => entry.itemId === itemId)
    .map((entry) => entry.slotId);
}

export function itemsAssignedToSlot(db: Db, userId: string, slotId: string): string[] {
  return listOwnedSlotAssignments(db, userId)
    .filter((entry) => entry.slotId === slotId)
    .map((entry) => entry.itemId);
}
