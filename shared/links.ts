import type { Item } from "./item";

export type LinkKind = "context" | "documentation" | "generates" | "scheduled_in";

export const LINK_KINDS: LinkKind[] = ["context", "documentation", "generates", "scheduled_in"];

export type ItemLink = {
  id: string;
  ownerId: string;
  fromId: string;
  toId: string;
  kind: LinkKind;
  createdAt: string;
  updatedAt: string;
};

export function parseLinkKind(value: string): LinkKind {
  return LINK_KINDS.includes(value as LinkKind) ? (value as LinkKind) : "context";
}

export function linkFromDbRow(row: {
  id: string;
  owner_id: string;
  from_id: string;
  to_id: string;
  kind: string;
  created_at: string;
  updated_at: string;
}): ItemLink {
  return {
    id: row.id,
    ownerId: row.owner_id,
    fromId: row.from_id,
    toId: row.to_id,
    kind: parseLinkKind(row.kind),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function tasksScheduledIn(intervalId: string, links: ItemLink[]): string[] {
  return links.filter((link) => link.kind === "scheduled_in" && link.toId === intervalId).map((link) => link.fromId);
}

export function scheduledIntervalIds(taskId: string, links: ItemLink[]): string[] {
  return links.filter((link) => link.kind === "scheduled_in" && link.fromId === taskId).map((link) => link.toId);
}

export function taskCountInInterval(intervalId: string, links: ItemLink[]): number {
  return tasksScheduledIn(intervalId, links).length;
}

export function scheduledTaskIds(links: ItemLink[]): Set<string> {
  return new Set(links.filter((link) => link.kind === "scheduled_in").map((link) => link.fromId));
}

export function intervalItemsForTask(items: Item[], links: ItemLink[], taskId: string): Item[] {
  const ids = new Set(scheduledIntervalIds(taskId, links));
  return items.filter((item) => ids.has(item.id) && item.isInterval);
}
