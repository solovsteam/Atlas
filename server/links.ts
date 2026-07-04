import type { ServerContext } from "lakebed/server";
import { linkFromRow, type ItemLink, type ItemLinkRow, type LinkKind } from "../shared/links";
import { getOwnedItem } from "./items";

type Db = ServerContext["db"];

export function listOwnedLinks(db: Db, userId: string): ItemLink[] {
  return db.itemLinks
    .where("ownerId", userId)
    .all()
    .map((row) => linkFromRow(row as ItemLinkRow));
}

export function linkItems(
  db: Db,
  userId: string,
  fromId: string,
  toId: string,
  kind: LinkKind = "context"
): { ok: true } | { error: string } {
  if (fromId === toId) {
    return { error: "Cannot link item to itself" };
  }

  const from = getOwnedItem(db, userId, fromId);
  const to = getOwnedItem(db, userId, toId);
  if (!from || !to) {
    return { error: "Item not found" };
  }

  const existing = db.itemLinks
    .where("ownerId", userId)
    .all()
    .find(
      (row) =>
        (row as ItemLinkRow).fromId === fromId &&
        (row as ItemLinkRow).toId === toId &&
        (row as ItemLinkRow).kind === kind
    );

  if (existing) {
    return { ok: true };
  }

  db.itemLinks.insert({
    ownerId: userId,
    fromId,
    toId,
    kind
  });

  return { ok: true };
}

export function unlinkItems(
  db: Db,
  userId: string,
  fromId: string,
  toId: string,
  kind: LinkKind = "context"
): boolean {
  const links = db.itemLinks.where("ownerId", userId).all() as ItemLinkRow[];
  const match = links.find((row) => row.fromId === fromId && row.toId === toId && row.kind === kind);
  if (!match) {
    return false;
  }
  db.itemLinks.delete(match.id);
  return true;
}
