import type { Item } from "./item";

export type RecurrenceFrequency = "daily" | "weekly" | "monthly";

export type RecurrenceRule = {
  frequency: RecurrenceFrequency;
  interval: number;
  horizonDays: number;
};

const FREQUENCIES: RecurrenceFrequency[] = ["daily", "weekly", "monthly"];

export function parseRecurrenceRule(value: unknown): RecurrenceRule | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as Record<string, unknown>;
  if (!FREQUENCIES.includes(raw.frequency as RecurrenceFrequency)) {
    return null;
  }
  const interval = Number(raw.interval ?? 1);
  const horizonDays = Number(raw.horizonDays ?? 90);
  if (!Number.isFinite(interval) || interval < 1 || interval > 365) {
    return null;
  }
  if (!Number.isFinite(horizonDays) || horizonDays < 1 || horizonDays > 365) {
    return null;
  }
  return {
    frequency: raw.frequency as RecurrenceFrequency,
    interval: Math.floor(interval),
    horizonDays: Math.floor(horizonDays)
  };
}

export function recurrenceRuleLabel(rule: RecurrenceRule | null): string {
  if (!rule) {
    return "None";
  }
  const unit = rule.frequency === "daily" ? "day" : rule.frequency === "weekly" ? "week" : "month";
  const plural = rule.interval === 1 ? unit : `${unit}s`;
  return `Every ${rule.interval} ${plural}`;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatOccurrenceKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseOccurrenceKey(key: string): Date | null {
  const match = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (formatOccurrenceKey(date) !== key) {
    return null;
  }
  return date;
}

function daysBetween(left: Date, right: Date): number {
  const ms = startOfDay(right).getTime() - startOfDay(left).getTime();
  return Math.round(ms / 86_400_000);
}

function occursOn(rule: RecurrenceRule, anchor: Date, day: Date): boolean {
  const delta = daysBetween(anchor, day);
  if (delta < 0) {
    return false;
  }
  if (rule.frequency === "daily") {
    return delta % rule.interval === 0;
  }
  if (rule.frequency === "weekly") {
    return delta % (rule.interval * 7) === 0;
  }
  const months =
    (day.getFullYear() - anchor.getFullYear()) * 12 + (day.getMonth() - anchor.getMonth());
  if (months < 0 || months % rule.interval !== 0) {
    return false;
  }
  return day.getDate() === anchor.getDate();
}

export function occurrenceKeysInHorizon(rule: RecurrenceRule, anchor: Date, now: Date): string[] {
  const start = startOfDay(now);
  const end = addDays(start, rule.horizonDays);
  const anchorDay = startOfDay(anchor);
  const keys: string[] = [];

  for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 1)) {
    if (occursOn(rule, anchorDay, cursor)) {
      keys.push(formatOccurrenceKey(cursor));
    }
  }

  return keys;
}

export function occurrenceTitle(template: Item, occurrenceKey: string): string {
  return `${template.title} · ${occurrenceKey}`;
}

export function isGeneratedOccurrence(item: Item): boolean {
  return Boolean(item.generatedFromId && item.occurrenceKey);
}

export { formatOccurrenceKey, parseOccurrenceKey };
