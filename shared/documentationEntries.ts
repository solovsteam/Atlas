import type { Item } from "./item";
import { formatEuropeanDate, pad2 } from "./locale";

/**
 * One observation recorded for a documentation item (a tracker), such as
 * "scrolled at 22:30" or "weighed 72.4 kg". `data` holds optional values keyed
 * like the item's documentation schema; an event-only tracker leaves it empty.
 * All day and hour arithmetic here uses the device's local time.
 */
export type DocumentationEntry = {
  id: string;
  ownerId: string;
  itemId: string;
  occurredAt: string;
  data: Record<string, unknown>;
  createdAt: string;
};

export type DocumentationEntryRow = {
  id: string;
  owner_id: string;
  item_id: string;
  occurred_at: string;
  data: unknown;
  created_at: string;
};

export function entryFromDbRow(row: DocumentationEntryRow): DocumentationEntry {
  const data = row.data && typeof row.data === "object" && !Array.isArray(row.data) ? (row.data as Record<string, unknown>) : {};
  return {
    id: row.id,
    ownerId: row.owner_id,
    itemId: row.item_id,
    occurredAt: new Date(row.occurred_at).toISOString(),
    data,
    createdAt: row.created_at
  };
}

export function entryToDbInsert(entry: DocumentationEntry): DocumentationEntryRow {
  return {
    id: entry.id,
    owner_id: entry.ownerId,
    item_id: entry.itemId,
    occurred_at: entry.occurredAt,
    data: entry.data,
    created_at: entry.createdAt
  };
}

/**
 * A tracker is a plain documentation item: not a task, interval or recurring
 * generator. (A documentation task, such as a daily weighing, is a different
 * use of the same storage.)
 */
export function isTracker(item: Item): boolean {
  const schema = item.documentationSchema;
  const isRoutine = !!schema && typeof schema === "object" && !Array.isArray(schema) && "routine" in schema;
  return item.isDocumentation && !isRoutine && !item.isTask && !item.isInterval && !item.recurrenceRule && !item.generatedFromId;
}

export function trackersOf(items: Item[]): Item[] {
  return items.filter(isTracker).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

// ---------------------------------------------------------------------------
// Tracker kinds. A tracker's behaviour comes from its configuration, stored in
// the item's documentation_schema as { tracker: { kind, dailyGoal } }.

/** "break": a habit to break (Urge now, stages). "build": a habit to build (triggers, daily aim). */
export type TrackerKind = "break" | "build";
export type TrackerConfig = { kind: TrackerKind; dailyGoal: number | null };
export const MAX_DAILY_GOAL = 100;

export function trackerConfig(item: Item): TrackerConfig {
  const schema = item.documentationSchema;
  const raw = schema && typeof schema === "object" && !Array.isArray(schema) ? (schema as Record<string, unknown>).tracker : null;
  const config = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const kind: TrackerKind = config.kind === "build" ? "build" : "break";
  const goal = config.dailyGoal;
  const dailyGoal =
    kind === "build" && typeof goal === "number" && Number.isInteger(goal) && goal > 0 && goal <= MAX_DAILY_GOAL ? goal : null;
  return { kind, dailyGoal };
}

/** The documentation_schema value for a configuration; other schema fields are kept. */
export function schemaWithTrackerConfig(item: Item, config: TrackerConfig): Record<string, unknown> {
  const schema = item.documentationSchema;
  const base = schema && typeof schema === "object" && !Array.isArray(schema) ? (schema as Record<string, unknown>) : {};
  return { ...base, tracker: { kind: config.kind, dailyGoal: config.kind === "build" ? config.dailyGoal : null } };
}

/** What a tracker's optional tags mean: the situation of a habit to break, the trigger of a habit to build. */
export function tagPrompt(config: TrackerConfig): string {
  return config.kind === "build" ? "What triggered it? (optional)" : "Situation (optional)";
}

// ---------------------------------------------------------------------------
// Noticing: when an episode was noticed, and in which situation. Both live in
// the entry's data, so entries recorded before this existed simply have no
// stage and no situations.

/** When the behaviour was noticed: at the urge (before it started), while it happened, or only afterwards. */
export type EntryStage = "urge" | "during" | "after";
export const ENTRY_STAGES: EntryStage[] = ["urge", "during", "after"];

export const STAGE_TEXT: Record<EntryStage, { label: string; short: string }> = {
  urge: { label: "Caught the urge", short: "urge" },
  during: { label: "While doing it", short: "while doing it" },
  after: { label: "In hindsight", short: "in hindsight" }
};

/** An entry recorded more than this long after its time counts as recorded in hindsight. */
export const HINDSIGHT_MINUTES = 5;

export const MAX_TAG_LENGTH = 40;

/** The stage stored with the entry, if any. */
export function recordedStage(entry: DocumentationEntry): EntryStage | null {
  const stage = entry.data.stage;
  return stage === "urge" || stage === "during" || stage === "after" ? stage : null;
}

/**
 * When the episode was noticed. Entries saved before stages existed get it
 * from the recording delay: recorded more than a few minutes after their
 * time means in hindsight. (The time wheel moves in 5-minute steps, so
 * "now" on the wheel can be up to 5 minutes before the save.)
 */
export function entryStage(entry: DocumentationEntry): EntryStage {
  const recorded = recordedStage(entry);
  if (recorded) {
    return recorded;
  }
  const delay = new Date(entry.createdAt).getTime() - new Date(entry.occurredAt).getTime();
  return delay > HINDSIGHT_MINUTES * 60_000 ? "after" : "during";
}

/** The stage for an entry saved from the time wheel: moved into the past means in hindsight. */
export function stageFromWheel(touched: boolean, chosen: Date, wheelStart: Date): EntryStage {
  return touched && chosen.getTime() < wheelStart.getTime() ? "after" : "during";
}

export function cleanTag(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, MAX_TAG_LENGTH);
}

/** Cleaned, without empty tags or case-insensitive duplicates, in their original order. */
export function cleanTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of tags) {
    const tag = cleanTag(raw);
    const key = tag.toLowerCase();
    if (tag && !seen.has(key)) {
      seen.add(key);
      result.push(tag);
    }
  }
  return result;
}

export function entryTags(entry: DocumentationEntry): string[] {
  const tags = entry.data.tags;
  return Array.isArray(tags) ? cleanTags(tags.filter((tag): tag is string => typeof tag === "string")) : [];
}

export function entryData(stage: EntryStage | null, tags: string[] = []): Record<string, unknown> {
  const clean = cleanTags(tags);
  return { ...(stage ? { stage } : {}), ...(clean.length ? { tags: clean } : {}) };
}

/** The entry's data with its situations replaced; other fields stay as they are. */
export function dataWithTags(entry: DocumentationEntry, tags: string[]): Record<string, unknown> {
  const { tags: _old, ...rest } = entry.data;
  const clean = cleanTags(tags);
  return clean.length ? { ...rest, tags: clean } : rest;
}

export function toggleTag(tags: string[], tag: string): string[] {
  const key = cleanTag(tag).toLowerCase();
  return tags.some((existing) => existing.toLowerCase() === key) ? tags.filter((existing) => existing.toLowerCase() !== key) : cleanTags([...tags, tag]);
}

/** Situations used before, most frequent first (ties: most recently used first). */
export function tagVocabulary(entries: DocumentationEntry[], limit = 12): string[] {
  const stats = new Map<string, { tag: string; count: number; last: string }>();
  for (const entry of sortEntriesNewestFirst(entries)) {
    for (const tag of entryTags(entry)) {
      const key = tag.toLowerCase();
      const current = stats.get(key);
      if (current) {
        current.count += 1;
      } else {
        stats.set(key, { tag, count: 1, last: entry.occurredAt });
      }
    }
  }
  return [...stats.values()]
    .sort((a, b) => b.count - a.count || b.last.localeCompare(a.last))
    .slice(0, limit)
    .map((stat) => stat.tag);
}

/** Share of entries noticed at the urge; null without entries. */
export function urgeShare(entries: DocumentationEntry[]): number | null {
  return entries.length ? entries.filter((entry) => entryStage(entry) === "urge").length / entries.length : null;
}

export function sortEntriesNewestFirst(entries: DocumentationEntry[]): DocumentationEntry[] {
  return [...entries].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.id.localeCompare(a.id));
}

// ---------------------------------------------------------------------------
// Time wheel: day, hour and minute columns, like the iPhone date picker.

export const WHEEL_MINUTE_STEP = 5;
/** The day column offers today and this many earlier days. */
export const WHEEL_DAYS_BACK = 30;

/** `dayOffset` 0 is today, 1 is yesterday, and so on. */
export type WheelSelection = { dayOffset: number; hour: number; minute: number };

export function wheelSelectionForNow(now: Date, step = WHEEL_MINUTE_STEP): WheelSelection {
  return { dayOffset: 0, hour: now.getHours(), minute: Math.floor(now.getMinutes() / step) * step };
}

export function dateFromWheel(selection: WheelSelection, now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - selection.dayOffset, selection.hour, selection.minute);
}

/** The wheel shows minutes in steps, so "now" may sit up to one step in the future of the wheel's value. */
export function isWheelInFuture(selection: WheelSelection, now: Date): boolean {
  return dateFromWheel(selection, now).getTime() > now.getTime();
}

const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function wheelDayLabel(dayOffset: number, now: Date): string {
  if (dayOffset === 0) {
    return "Today";
  }
  if (dayOffset === 1) {
    return "Yesterday";
  }
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOffset);
  return `${WEEKDAYS_SHORT[day.getDay()]} ${pad2(day.getDate())}.${pad2(day.getMonth() + 1)}.`;
}

/** "just now", "25 min ago", "3 h 10 min ago", "2 days ago". */
export function describeAgo(date: Date, now: Date): string {
  const minutes = Math.round((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  if (minutes < 24 * 60) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours} h ${rest} min ago` : `${hours} h ago`;
  }
  const days = Math.round(minutes / (24 * 60));
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

export function formatClock(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** "today 14:35", "yesterday 22:10", "Mon 26.10.2026 09:00". */
export function entryTimeLabel(date: Date, now: Date): string {
  const offset = daysBetween(date, now);
  const day = offset === 0 ? "today" : offset === 1 ? "yesterday" : `${WEEKDAYS_SHORT[date.getDay()]} ${formatEuropeanDate(date)}`;
  return `${day} ${formatClock(date)}`;
}

// ---------------------------------------------------------------------------
// History: counts per day, week or month, with a trailing average.

export type HistoryRange = "30d" | "90d" | "1y" | "all";
export type HistoryGranularity = "day" | "week" | "month";

export const HISTORY_RANGES: { id: HistoryRange; label: string }[] = [
  { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" },
  { id: "1y", label: "1 year" },
  { id: "all", label: "All" }
];

/** How many buckets the trailing average covers, per granularity. */
export const TRAILING_BUCKETS: Record<HistoryGranularity, number> = { day: 7, week: 4, month: 3 };

export type HistoryBucket = {
  start: Date;
  /** Exclusive. */
  end: Date;
  /** null before tracking started: no observation was possible, so it is not a zero. */
  count: number | null;
  /** Mean count of this bucket and the earlier ones in the trailing window, from tracking start on. */
  average: number | null;
  /** Counts by when the episode was noticed. */
  stages: Record<EntryStage, number>;
  /** Share noticed at the urge over the trailing window; null without entries in it. */
  urgeShare: number | null;
};

export type History = {
  granularity: HistoryGranularity;
  trailing: number;
  buckets: HistoryBucket[];
  /** Entries per hour of the day (0 to 23), inside the range and from tracking start on. */
  byHour: number[];
  /** Entries inside the range. */
  total: number;
  /** Mean entries per tracked day inside the range; null when no day was tracked. */
  perDay: number | null;
  /** Situations inside the range, most frequent first. */
  byTag: { tag: string; count: number }[];
};

export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Weeks start on Monday. */
export function startOfLocalWeek(date: Date): Date {
  const day = startOfLocalDay(date);
  const mondayOffset = (day.getDay() + 6) % 7;
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() - mondayOffset);
}

export function startOfLocalMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function bucketStart(date: Date, granularity: HistoryGranularity): Date {
  return granularity === "day" ? startOfLocalDay(date) : granularity === "week" ? startOfLocalWeek(date) : startOfLocalMonth(date);
}

function nextBucket(start: Date, granularity: HistoryGranularity): Date {
  if (granularity === "day") {
    return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
  }
  if (granularity === "week") {
    return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
  }
  return new Date(start.getFullYear(), start.getMonth() + 1, 1);
}

function daysBetween(start: Date, end: Date): number {
  // Calendar days, safe across daylight saving changes.
  const a = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const b = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((b - a) / 86_400_000);
}

/**
 * Tracking starts at the earlier of the tracker's creation and its first
 * entry, because entries may be recorded after the fact.
 */
export function trackingStart(entries: DocumentationEntry[], trackerCreatedAt: string | null): Date | null {
  let earliest = trackerCreatedAt ? new Date(trackerCreatedAt).getTime() : Number.POSITIVE_INFINITY;
  for (const entry of entries) {
    earliest = Math.min(earliest, new Date(entry.occurredAt).getTime());
  }
  return Number.isFinite(earliest) ? new Date(earliest) : null;
}

export function historyWindow(range: HistoryRange, now: Date, start: Date | null): { from: Date; granularity: HistoryGranularity } {
  const today = startOfLocalDay(now);
  if (range === "30d") {
    return { from: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29), granularity: "day" };
  }
  if (range === "90d") {
    return { from: startOfLocalWeek(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 89)), granularity: "week" };
  }
  if (range === "1y") {
    return { from: startOfLocalWeek(new Date(today.getFullYear() - 1, today.getMonth(), today.getDate() + 1)), granularity: "week" };
  }
  const first = start ? startOfLocalDay(start) : today;
  const span = daysBetween(first, today);
  const granularity: HistoryGranularity = span < 60 ? "day" : span <= 730 ? "week" : "month";
  return { from: bucketStart(first, granularity), granularity };
}

export function buildHistory(
  entries: DocumentationEntry[],
  options: { range: HistoryRange; now: Date; trackerCreatedAt: string | null }
): History {
  const { now } = options;
  const start = trackingStart(entries, options.trackerCreatedAt);
  const { from, granularity } = historyWindow(options.range, now, start);
  const trailing = TRAILING_BUCKETS[granularity];
  const trackedFrom = start ? startOfLocalDay(start) : null;

  const buckets: HistoryBucket[] = [];
  for (let cursor = from; cursor.getTime() <= now.getTime(); cursor = nextBucket(cursor, granularity)) {
    const end = nextBucket(cursor, granularity);
    const tracked = trackedFrom !== null && end.getTime() > trackedFrom.getTime();
    buckets.push({ start: cursor, end, count: tracked ? 0 : null, average: null, stages: { urge: 0, during: 0, after: 0 }, urgeShare: null });
  }

  const byHour = new Array<number>(24).fill(0);
  const tagCounts = new Map<string, { tag: string; count: number }>();
  let total = 0;
  for (const entry of entries) {
    const at = new Date(entry.occurredAt);
    if (at.getTime() < from.getTime() || at.getTime() > now.getTime()) {
      continue;
    }
    const index = findBucket(buckets, at);
    if (index === -1 || buckets[index].count === null) {
      continue;
    }
    buckets[index].count = (buckets[index].count ?? 0) + 1;
    buckets[index].stages[entryStage(entry)] += 1;
    byHour[at.getHours()] += 1;
    for (const tag of entryTags(entry)) {
      const stat = tagCounts.get(tag.toLowerCase()) ?? { tag, count: 0 };
      stat.count += 1;
      tagCounts.set(tag.toLowerCase(), stat);
    }
    total += 1;
  }

  for (let index = 0; index < buckets.length; index += 1) {
    const window = buckets.slice(Math.max(0, index - trailing + 1), index + 1).filter((bucket) => bucket.count !== null);
    buckets[index].average = window.length ? window.reduce((sum, bucket) => sum + (bucket.count ?? 0), 0) / window.length : null;
    const urge = window.reduce((sum, bucket) => sum + bucket.stages.urge, 0);
    const all = window.reduce((sum, bucket) => sum + (bucket.count ?? 0), 0);
    buckets[index].urgeShare = all ? urge / all : null;
  }
  const byTag = [...tagCounts.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

  const firstTrackedDay = trackedFrom && trackedFrom.getTime() > from.getTime() ? trackedFrom : from;
  const trackedDays = trackedFrom ? daysBetween(firstTrackedDay, now) + 1 : 0;

  return { granularity, trailing, buckets, byHour, total, perDay: trackedDays > 0 ? total / trackedDays : null, byTag };
}

function findBucket(buckets: HistoryBucket[], at: Date): number {
  const time = at.getTime();
  let low = 0;
  let high = buckets.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (time < buckets[mid].start.getTime()) {
      high = mid - 1;
    } else if (time >= buckets[mid].end.getTime()) {
      low = mid + 1;
    } else {
      return mid;
    }
  }
  return -1;
}

/** The daily aim summed over the bucket's days; null before tracking started or without an aim. */
export function bucketGoal(bucket: HistoryBucket, dailyGoal: number | null): number | null {
  return dailyGoal === null || bucket.count === null ? null : dailyGoal * daysBetween(bucket.start, bucket.end);
}

export function bucketLabel(bucket: HistoryBucket, granularity: HistoryGranularity): string {
  if (granularity === "day") {
    return `${WEEKDAYS_SHORT[bucket.start.getDay()]} ${formatEuropeanDate(bucket.start)}`;
  }
  if (granularity === "week") {
    return `Week of ${formatEuropeanDate(bucket.start)}`;
  }
  return `${MONTHS_SHORT[bucket.start.getMonth()]} ${bucket.start.getFullYear()}`;
}

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Short axis tick: "27.10." for days and weeks, "Oct" for months. */
export function bucketTick(bucket: HistoryBucket, granularity: HistoryGranularity): string {
  if (granularity === "month") {
    return MONTHS_SHORT[bucket.start.getMonth()];
  }
  return `${pad2(bucket.start.getDate())}.${pad2(bucket.start.getMonth() + 1)}.`;
}

/**
 * Entries in `days` calendar days ending `skipDays` days before today (0:
 * the window ends with today, up to now).
 */
export function entriesInDays(entries: DocumentationEntry[], days: number, now: Date, skipDays = 0): DocumentationEntry[] {
  const today = startOfLocalDay(now);
  const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - skipDays - days + 1).getTime();
  const until = skipDays === 0 ? now.getTime() : new Date(today.getFullYear(), today.getMonth(), today.getDate() - skipDays + 1).getTime() - 1;
  return entries.filter((entry) => {
    const time = new Date(entry.occurredAt).getTime();
    return time >= from && time <= until;
  });
}

/** Entries in the last `days` calendar days, today included. */
export function countInLastDays(entries: DocumentationEntry[], days: number, now: Date): number {
  return entriesInDays(entries, days, now).length;
}

export type EntryDay = { day: Date; label: string; entries: DocumentationEntry[] };

/** Entries grouped by local day, newest day first, newest entry first. */
export function groupEntriesByDay(entries: DocumentationEntry[], now: Date): EntryDay[] {
  const groups = new Map<number, EntryDay>();
  for (const entry of sortEntriesNewestFirst(entries)) {
    const day = startOfLocalDay(new Date(entry.occurredAt));
    let group = groups.get(day.getTime());
    if (!group) {
      const offset = daysBetween(day, now);
      group = {
        day,
        label: offset === 0 ? "Today" : offset === 1 ? "Yesterday" : `${WEEKDAYS_SHORT[day.getDay()]} ${formatEuropeanDate(day)}`,
        entries: []
      };
      groups.set(day.getTime(), group);
    }
    group.entries.push(entry);
  }
  return [...groups.values()];
}
