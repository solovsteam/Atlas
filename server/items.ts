import type { ServerContext } from "lakebed/server";
import {
  applyPatch,
  cleanTitle,
  itemFromRow,
  newItemRow,
  parseJson,
  type Item,
  type ItemPatch,
  type ItemRow,
  type UpdateItemResult
} from "../shared/item";
import { applyCompletionCascade } from "./completion";
import { deleteOccurrencesForTemplate, syncOccurrences, trackGeneratedItemOverrides } from "./generation";
import { archiveSlotsForItem, deleteSlotsForItem } from "./schedule";

type Db = ServerContext["db"];

export function getOwnedItem(db: Db, userId: string, id: string): Item | null {
  const row = db.items.get(id) as ItemRow | null;
  if (!row || row.ownerId !== userId) {
    return null;
  }
  return itemFromRow(row);
}

export function listOwnedItems(db: Db, userId: string): Item[] {
  return db.items
    .where("ownerId", userId)
    .orderBy("updatedAt", "desc")
    .all()
    .map((row) => itemFromRow(row as ItemRow));
}

export function createItem(db: Db, userId: string, title: string): { id: string; revision: number } {
  const clean = cleanTitle(title);
  if (!clean) {
    throw new Error("Title required");
  }
  const inserted = db.items.insert(newItemRow(userId, clean)) as ItemRow;
  return { id: inserted.id, revision: 0 };
}

export function updateItem(
  db: Db,
  userId: string,
  id: string,
  patchJson: string,
  expectedRevision: number
): UpdateItemResult {
  const row = db.items.get(id) as ItemRow | null;
  if (!row || row.ownerId !== userId) {
    throw new Error("Item not found");
  }

  const current = itemFromRow(row);
  if (current.revision !== expectedRevision) {
    return { conflict: true, serverItem: current };
  }

  const patch = parseJson<ItemPatch>(patchJson, {});
  const overrideFields = trackGeneratedItemOverrides(current, Object.keys(patch));
  const mergedPatch =
    overrideFields && !patch.overriddenFields ? { ...patch, overriddenFields: overrideFields } : patch;
  const updates = applyPatch(row, mergedPatch);
  if (Object.keys(updates).length === 0) {
    return { ok: true, revision: current.revision };
  }

  const nextRevision = current.revision + 1;
  db.items.update(id, { ...updates, revision: String(nextRevision) });

  if (patch.taskStatus === "done" || patch.taskStatus === "cancelled") {
    archiveSlotsForItem(db, userId, id);
  }

  if (mergedPatch.recurrenceRule !== undefined) {
    if (mergedPatch.recurrenceRule === null) {
      deleteOccurrencesForTemplate(db, userId, id);
    } else {
      syncOccurrences(db, userId, id);
    }
  }

  applyCompletionCascade(db, userId, id, patch.taskStatus !== undefined);

  return { ok: true, revision: nextRevision };
}

export function deleteItem(db: Db, userId: string, id: string): boolean {
  const row = db.items.get(id) as ItemRow | null;
  if (!row || row.ownerId !== userId) {
    return false;
  }

  deleteOccurrencesForTemplate(db, userId, id);

  const links = db.itemLinks.where("ownerId", userId).all() as Array<{ id: string; fromId: string; toId: string }>;
  for (const link of links) {
    if (link.fromId === id || link.toId === id) {
      db.itemLinks.delete(link.id);
    }
  }

  deleteSlotsForItem(db, userId, id);
  db.items.delete(id);
  return true;
}
