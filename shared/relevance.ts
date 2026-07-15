import type { Item, TaskStatus } from "./item";

export type RelevanceContext = {
  now: Date;
  activeTags: string[];
  activeStatusBoosts: TaskStatus[];
  userLocation?: string;
};

export type InboxEntry = Item;

type RankSignals = {
  activeTask: boolean;
  inactiveTask: boolean;
  isNote: boolean;
  tagMatch: boolean;
  statusBoost: boolean;
  manualRelevance: number;
};

function hasTagMatch(item: Item, ctx: RelevanceContext): boolean {
  return ctx.activeTags.length > 0 && item.tags.some((tag) => ctx.activeTags.includes(tag));
}

function hasStatusBoost(item: Item, ctx: RelevanceContext): boolean {
  return (
    item.isTask &&
    item.taskStatus !== null &&
    ctx.activeStatusBoosts.length > 0 &&
    ctx.activeStatusBoosts.includes(item.taskStatus)
  );
}

function rankSignals(item: Item, ctx: RelevanceContext): RankSignals {
  const status = item.taskStatus ?? "active";
  const activeTask = item.isTask && status === "active";
  const inactiveTask = item.isTask && status !== "active";

  return {
    activeTask,
    inactiveTask,
    isNote: !item.isTask,
    tagMatch: hasTagMatch(item, ctx),
    statusBoost: hasStatusBoost(item, ctx),
    manualRelevance: item.manualRelevance
  };
}

function compareBooleanSignal(a: boolean, b: boolean): number {
  if (a === b) {
    return 0;
  }
  return a ? -1 : 1;
}

export function compareItems(a: Item, b: Item, ctx: RelevanceContext): number {
  const left = rankSignals(a, ctx);
  const right = rankSignals(b, ctx);

  if (ctx.activeTags.length > 0) {
    const result = compareBooleanSignal(left.tagMatch, right.tagMatch);
    if (result !== 0) {
      return result;
    }
  }

  if (ctx.activeStatusBoosts.length > 0) {
    const result = compareBooleanSignal(left.statusBoost, right.statusBoost);
    if (result !== 0) {
      return result;
    }
  }

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
  return sortItemsByRelevance(items, ctx);
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
