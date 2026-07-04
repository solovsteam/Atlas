import type { Item, TaskStatus } from "./item";

export type RelevanceContext = {
  now: Date;
  activeTags: string[];
  activeStatusBoosts: TaskStatus[];
  userLocation?: string;
};

export type InboxEntry = Item;

type RankSignals = {
  boostedInactive: boolean;
  activeTask: boolean;
  inactiveTask: boolean;
  isNote: boolean;
  tagMatch: boolean;
  statusBoost: boolean;
  locationMatch: boolean;
  inStartableWindow: boolean;
  manualRelevance: number;
};

function minutesSinceMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function inStartableWindow(item: Item, now: Date): boolean {
  if (!item.startableWindow) {
    return false;
  }
  const current = minutesSinceMidnight(now);
  const { startMinutes, endMinutes } = item.startableWindow;
  if (startMinutes <= endMinutes) {
    return current >= startMinutes && current <= endMinutes;
  }
  return current >= startMinutes || current <= endMinutes;
}

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

function hasBoostedInactiveStatus(item: Item, ctx: RelevanceContext): boolean {
  if (!item.isTask) {
    return false;
  }
  const status = item.taskStatus ?? "active";
  return status !== "active" && hasStatusBoost(item, ctx);
}

function rankSignals(item: Item, ctx: RelevanceContext): RankSignals {
  const status = item.taskStatus ?? "active";
  const activeTask = item.isTask && status === "active";
  const inactiveTask = item.isTask && status !== "active";

  return {
    boostedInactive: hasBoostedInactiveStatus(item, ctx),
    activeTask,
    inactiveTask,
    isNote: !item.isTask,
    tagMatch: hasTagMatch(item, ctx),
    statusBoost: hasStatusBoost(item, ctx),
    locationMatch: Boolean(item.location && ctx.userLocation && item.location === ctx.userLocation),
    inStartableWindow: inStartableWindow(item, ctx.now),
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

  let result = compareBooleanSignal(left.boostedInactive, right.boostedInactive);
  if (result !== 0) {
    return result;
  }

  result = compareBooleanSignal(left.activeTask, right.activeTask);
  if (result !== 0) {
    return result;
  }

  if (left.isNote && right.inactiveTask) {
    return -1;
  }
  if (left.inactiveTask && right.isNote) {
    return 1;
  }

  result = compareBooleanSignal(left.tagMatch, right.tagMatch);
  if (result !== 0) {
    return result;
  }

  result = compareBooleanSignal(left.statusBoost, right.statusBoost);
  if (result !== 0) {
    return result;
  }

  result = compareBooleanSignal(left.locationMatch, right.locationMatch);
  if (result !== 0) {
    return result;
  }

  result = compareBooleanSignal(left.inStartableWindow, right.inStartableWindow);
  if (result !== 0) {
    return result;
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
    .filter(
      (item) => item.title.toLowerCase().includes(needle) || item.body.toLowerCase().includes(needle)
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function sortItemsByUpdated(items: Item[]): Item[] {
  return [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
