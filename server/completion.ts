import type { ServerContext } from "lakebed/server";
import { evaluateAutoTaskStatus, itemsNeedingCompletionCheck } from "../shared/completion";
import { itemFromRow, type ItemRow } from "../shared/item";
import { linkFromRow, type ItemLinkRow } from "../shared/links";
import { archiveSlotsForItem } from "./schedule";

type Db = ServerContext["db"];

function listOwnedItems(db: Db, userId: string) {
  return db.items
    .where("ownerId", userId)
    .all()
    .map((row) => itemFromRow(row as ItemRow));
}

function listOwnedLinks(db: Db, userId: string) {
  return db.itemLinks
    .where("ownerId", userId)
    .all()
    .map((row) => linkFromRow(row as ItemLinkRow));
}

function setTaskStatusInternal(db: Db, userId: string, id: string, status: "done"): void {
  const row = db.items.get(id) as ItemRow | null;
  if (!row || row.ownerId !== userId) {
    return;
  }
  const current = itemFromRow(row);
  if (!current.isTask || current.taskStatus === status || current.taskStatus === "cancelled") {
    return;
  }
  const revision = current.revision + 1;
  db.items.update(id, { taskStatus: status, revision: String(revision), isTask: true });
  archiveSlotsForItem(db, userId, id);
}

export function applyCompletionCascade(db: Db, userId: string, changedItemId: string, skipChangedItem = false): void {
  const links = listOwnedLinks(db, userId);
  const queue = [...itemsNeedingCompletionCheck(changedItemId, listOwnedItems(db, userId), links)];
  const visited = new Set<string>();

  for (let index = 0; index < queue.length; index += 1) {
    const itemId = queue[index];
    if (!itemId || visited.has(itemId)) {
      continue;
    }
    visited.add(itemId);

    if (skipChangedItem && itemId === changedItemId) {
      continue;
    }

    const freshItems = listOwnedItems(db, userId);
    const item = freshItems.find((entry) => entry.id === itemId);
    if (!item) {
      continue;
    }

    const nextStatus = evaluateAutoTaskStatus(item, freshItems, links);
    if (nextStatus && item.taskStatus !== nextStatus) {
      setTaskStatusInternal(db, userId, itemId, nextStatus);
      const parentChecks = itemsNeedingCompletionCheck(itemId, listOwnedItems(db, userId), links);
      for (const parentId of parentChecks) {
        if (!visited.has(parentId)) {
          queue.push(parentId);
        }
      }
    }
  }
}
