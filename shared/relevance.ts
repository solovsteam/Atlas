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

type RelevanceMembership = {
  activeTags: ReadonlySet<string>;
  activeStatusBoosts: ReadonlySet<TaskStatus>;
};

function hasTagMatch(item: Item, ctx: RelevanceContext, membership?: RelevanceMembership): boolean {
  return ctx.activeTags.length > 0 && item.tags.some((tag) =>
    membership ? membership.activeTags.has(tag) : ctx.activeTags.includes(tag)
  );
}

function hasStatusBoost(item: Item, ctx: RelevanceContext, membership?: RelevanceMembership): boolean {
  return (
    item.isTask &&
    item.taskStatus !== null &&
    ctx.activeStatusBoosts.length > 0 &&
    (membership ? membership.activeStatusBoosts.has(item.taskStatus) : ctx.activeStatusBoosts.includes(item.taskStatus))
  );
}

function rankSignals(item: Item, ctx: RelevanceContext, membership?: RelevanceMembership): RankSignals {
  const status = item.taskStatus ?? "active";
  const activeTask = item.isTask && status === "active";
  const inactiveTask = item.isTask && status !== "active";

  return {
    activeTask,
    inactiveTask,
    isNote: !item.isTask,
    tagMatch: hasTagMatch(item, ctx, membership),
    statusBoost: hasStatusBoost(item, ctx, membership),
    manualRelevance: item.manualRelevance
  };
}

function compareBooleanSignal(a: boolean, b: boolean): number {
  if (a === b) {
    return 0;
  }
  return a ? -1 : 1;
}

function compareUpdatedAt(a: Item, b: Item): number {
  const left = Date.parse(a.updatedAt);
  const right = Date.parse(b.updatedAt);
  if (Number.isNaN(left) || Number.isNaN(right)) {
    return b.updatedAt.localeCompare(a.updatedAt);
  }
  return right - left;
}

export function compareItems(a: Item, b: Item, ctx: RelevanceContext): number {
  const left = rankSignals(a, ctx);
  const right = rankSignals(b, ctx);

  return compareRankSignals(left, right, a, b, ctx);
}

function compareRankSignals(
  left: RankSignals,
  right: RankSignals,
  a: Item,
  b: Item,
  ctx: RelevanceContext
): number {

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

  return compareUpdatedAt(a, b);
}

export function sortItemsByRelevance(items: Item[], ctx: RelevanceContext): Item[] {
  const membership: RelevanceMembership = {
    activeTags: new Set(ctx.activeTags),
    activeStatusBoosts: new Set(ctx.activeStatusBoosts)
  };
  const decorated = items.map((item, index) => ({ item, index, signals: rankSignals(item, ctx, membership) }));
  decorated.sort((a, b) =>
    compareRankSignals(a.signals, b.signals, a.item, b.item, ctx) || a.index - b.index
  );
  return decorated.map(({ item }) => item);
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

export function isArchivedTask(item: Item): boolean {
  return item.isTask && (item.taskStatus === "done" || item.taskStatus === "cancelled");
}

export function isParkedTask(item: Item): boolean {
  return item.isTask && item.taskStatus === "later";
}

export function isLibraryItem(item: Item): boolean {
  return !isArchivedTask(item);
}

export function searchItems(items: Item[], query: string): Item[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return [];
  }
  return items
    .filter((item) => item.title.toLowerCase().includes(needle) || item.body.toLowerCase().includes(needle))
    .sort(compareUpdatedAt);
}
