import type { Item } from "./item";

export type ItemLinkKind = "scheduled_in";

export const ITEM_LINK_KINDS: ItemLinkKind[] = ["scheduled_in"];

export type ItemLink = {
  id: string;
  ownerId: string;
  fromId: string;
  toId: string;
  kind: ItemLinkKind;
  createdAt: string;
};

export function parseItemLinkKind(value: string): ItemLinkKind | null {
  if (ITEM_LINK_KINDS.includes(value as ItemLinkKind)) {
    return value as ItemLinkKind;
  }
  return null;
}

export function itemLinkFromDbRow(row: {
  id: string;
  owner_id: string;
  from_id: string;
  to_id: string;
  kind: string;
  created_at: string;
}): ItemLink | null {
  const kind = parseItemLinkKind(row.kind);
  if (!kind) {
    return null;
  }
  return {
    id: row.id,
    ownerId: row.owner_id,
    fromId: row.from_id,
    toId: row.to_id,
    kind,
    createdAt: row.created_at
  };
}

/** Task scheduled in interval: fromId = task, toId = interval. */
export function scheduledTasksByIntervalId(links: ItemLink[], tasks: Item[]): Map<string, Item[]> {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const map = new Map<string, Item[]>();

  for (const link of links) {
    if (link.kind !== "scheduled_in") {
      continue;
    }
    const task = taskById.get(link.fromId);
    if (!task) {
      continue;
    }
    const list = map.get(link.toId) ?? [];
    list.push(task);
    map.set(link.toId, list);
  }

  for (const [intervalId, intervalTasks] of map) {
    map.set(
      intervalId,
      intervalTasks.sort((a, b) => a.title.localeCompare(b.title))
    );
  }

  return map;
}

export function scheduledIntervalForTask(links: ItemLink[], taskId: string): string | null {
  const link = links.find((entry) => entry.kind === "scheduled_in" && entry.fromId === taskId);
  return link?.toId ?? null;
}

export function scheduledInLinksForTask(links: ItemLink[], taskId: string): ItemLink[] {
  return links.filter((entry) => entry.kind === "scheduled_in" && entry.fromId === taskId);
}
