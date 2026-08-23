import type { Item } from "./item";

export type PropertyFilter = "notes" | "active";

export type ArchivePropertyFilter = "done" | "cancelled";

export type RelevanceContext = {
  now: Date;
  activeTags: string[];
  activePropertyFilter: PropertyFilter | null;
  userLocation?: string;
};

export type InboxEntry = Item;

type RankSignals = {
  activeTask: boolean;
  inactiveTask: boolean;
  isNote: boolean;
  manualRelevance: number;
};

export function isArchivedTask(item: Item): boolean {
  return item.isTask && (item.taskStatus === "done" || item.taskStatus === "cancelled");
}

export function isLibraryItem(item: Item): boolean {
  return !isArchivedTask(item);
}

export function matchesArchivePropertyFilter(item: Item, filter: ArchivePropertyFilter | null): boolean {
  if (filter === null) {
    return true;
  }
  return item.isTask && item.taskStatus === filter;
}

export function filterArchiveItems(
  items: Item[],
  ctx: { activeTags: string[]; activePropertyFilter: ArchivePropertyFilter | null }
): Item[] {
  return items
    .filter(isArchivedTask)
    .filter(
      (item) => matchesArchivePropertyFilter(item, ctx.activePropertyFilter) && matchesTagFilter(item, ctx.activeTags)
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function matchesPropertyFilter(item: Item, filter: PropertyFilter | null): boolean {
  if (filter === null) {
    return true;
  }
  if (filter === "notes") {
    return !item.isTask;
  }
  return item.isTask && item.taskStatus === filter;
}

export function matchesTagFilter(item: Item, activeTags: string[]): boolean {
  if (activeTags.length === 0) {
    return true;
  }
  return activeTags.every((tag) => item.tags.includes(tag));
}

export function filterItems(
  items: Item[],
  ctx: Pick<RelevanceContext, "activeTags" | "activePropertyFilter">
): Item[] {
  return items.filter(
    (item) => matchesPropertyFilter(item, ctx.activePropertyFilter) && matchesTagFilter(item, ctx.activeTags)
  );
}

function rankSignals(item: Item): RankSignals {
  const status = item.taskStatus ?? "active";
  const activeTask = item.isTask && status === "active";
  const inactiveTask = item.isTask && status !== "active";

  return {
    activeTask,
    inactiveTask,
    isNote: !item.isTask,
    manualRelevance: item.manualRelevance
  };
}

function compareBooleanSignal(a: boolean, b: boolean): number {
  if (a === b) {
    return 0;
  }
  return a ? -1 : 1;
}

export function compareItems(a: Item, b: Item, _ctx: RelevanceContext): number {
  const left = rankSignals(a);
  const right = rankSignals(b);

  let result = compareBooleanSignal(left.activeTask, right.activeTask);
  if (result !== 0) {
    return result;
  }

  if (left.isNote && right.inactiveTask) {
    return -1;
  }
  if (left.inactiveTask && right.isNote) {
    return 1;
  }

  if (left.manualRelevance !== right.manualRelevance) {
    return right.manualRelevance - left.manualRelevance;
  }

  return b.updatedAt.localeCompare(a.updatedAt);
}

export function sortItemsByRelevance(items: Item[], ctx: RelevanceContext): Item[] {
  return [...items].sort((a, b) => compareItems(a, b, ctx));
}

export function buildInboxEntries(items: Item[], ctx: RelevanceContext): InboxEntry[] {
  const libraryItems = items.filter(isLibraryItem);
  return sortItemsByRelevance(filterItems(libraryItems, ctx), ctx);
}

export function collectTags(items: Item[]): string[] {
  const tags = new Set<string>();
  for (const item of items) {
    for (const tag of item.tags) {
      if (tag) {
        tags.add(tag);
      }
    }
  }
  return [...tags].sort();
}

export function searchItems(items: Item[], query: string): Item[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return [];
  }
  return items
    .filter((item) => item.title.toLowerCase().includes(needle) || item.body.toLowerCase().includes(needle))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
