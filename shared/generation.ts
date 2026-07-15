import { defaultDocumentationData, parseDocumentationSchema, type DocumentationSchema } from "./documentation";
import type { CompletionRule, Item } from "./item";
import { parseCompletionRule } from "./completion";
import {
  formatOccurrenceKey,
  occurrenceKeysInHorizon,
  parseOccurrenceKey,
  type RecurrenceFrequency,
  type RecurrenceRule
} from "./recurrence";

export type GenerationSchedule = {
  time: string;
  durationMinutes: number;
};

export type OccurrenceMode = "recurrence" | "range" | "dates";

export type OccurrenceRange = {
  startDate: string;
  count: number;
  stepDays: number;
};

export type GenerationChildSpec = {
  title: string;
  body: string;
  isTask: boolean;
  isDocumentation: boolean;
  isInterval: boolean;
  inputSchema: DocumentationSchema;
  completionRule: CompletionRule | null;
  schedule: GenerationSchedule;
};

export type GenerationSpec = {
  kind: "schedule_tasks";
  occurrenceMode: OccurrenceMode;
  frequency: RecurrenceFrequency;
  interval: number;
  horizonDays: number;
  range: OccurrenceRange;
  dates: string[];
  anchor?: string;
  exclusions: string[];
  child: GenerationChildSpec;
};

const FREQUENCIES: RecurrenceFrequency[] = ["daily", "weekly", "monthly"];
const OCCURRENCE_MODES: OccurrenceMode[] = ["recurrence", "range", "dates"];
const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function defaultRange(template?: Item): OccurrenceRange {
  const anchor = template?.createdAt ? new Date(template.createdAt) : new Date();
  return {
    startDate: formatOccurrenceKey(new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate())),
    count: 10,
    stepDays: 1
  };
}

function parseOccurrenceMode(value: unknown): OccurrenceMode {
  if (typeof value === "string" && OCCURRENCE_MODES.includes(value as OccurrenceMode)) {
    return value as OccurrenceMode;
  }
  return "recurrence";
}

function parseOccurrenceRange(value: unknown, template?: Item): OccurrenceRange {
  const fallback = defaultRange(template);
  if (!value || typeof value !== "object") {
    return fallback;
  }
  const raw = value as Record<string, unknown>;
  const startDate = String(raw.startDate ?? fallback.startDate);
  const count = Number(raw.count ?? fallback.count);
  const stepDays = Number(raw.stepDays ?? fallback.stepDays);
  return {
    startDate: parseOccurrenceKey(startDate) ? startDate : fallback.startDate,
    count: Number.isFinite(count) ? Math.min(Math.max(Math.floor(count), 1), 999) : fallback.count,
    stepDays: Number.isFinite(stepDays) ? Math.min(Math.max(Math.floor(stepDays), 1), 365) : fallback.stepDays
  };
}

function parseDateList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.map((entry) => String(entry)).filter((entry) => parseOccurrenceKey(entry)))].sort();
}

export function parseGenerationSchedule(value: unknown): GenerationSchedule | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const time = String(raw.time ?? "09:00");
  if (!TIME_RE.test(time)) {
    return null;
  }
  const durationMinutes = Number(raw.durationMinutes ?? 30);
  if (!Number.isFinite(durationMinutes) || durationMinutes < 1 || durationMinutes > 24 * 60) {
    return null;
  }
  return { time, durationMinutes: Math.floor(durationMinutes) };
}

export function defaultChildSpec(template?: Item): GenerationChildSpec {
  return {
    title: template?.title ?? "Generated item",
    body: "",
    isTask: false,
    isDocumentation: false,
    isInterval: false,
    inputSchema: [],
    completionRule: null,
    schedule: { time: "09:00", durationMinutes: 30 }
  };
}

export function parseGenerationChildSpec(value: unknown, template?: Item): GenerationChildSpec {
  const fallbackTitle = template?.title ?? "Generated item";
  if (!value || typeof value !== "object") {
    return defaultChildSpec(template);
  }
  const raw = value as Record<string, unknown>;
  const schedule = parseGenerationSchedule(raw.schedule) ?? { time: "09:00", durationMinutes: 30 };
  const inputSchema = parseDocumentationSchema(raw.inputSchema ?? raw.documentationSchema);
  const completionRule = parseCompletionRule(raw.completionRule);
  const title = String(raw.title ?? fallbackTitle).trim().slice(0, 200) || fallbackTitle;
  const body = String(raw.body ?? "").slice(0, 50000);
  const isTask = raw.isTask === undefined ? true : Boolean(raw.isTask);
  const isDocumentation = raw.isDocumentation === undefined ? false : Boolean(raw.isDocumentation);
  const isInterval = raw.isInterval === undefined ? false : Boolean(raw.isInterval);

  return {
    title,
    body,
    isTask,
    isDocumentation,
    isInterval,
    inputSchema,
    completionRule: isTask ? completionRule ?? { kind: "manual" } : null,
    schedule
  };
}

export function parseGenerationSpec(value: unknown, template?: Item): GenerationSpec | null {
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

  const exclusions = Array.isArray(raw.exclusions)
    ? raw.exclusions.map((entry) => String(entry)).filter((entry) => parseOccurrenceKey(entry))
    : [];

  const anchor = typeof raw.anchor === "string" && raw.anchor.trim() ? raw.anchor.trim() : undefined;
  const occurrenceMode = parseOccurrenceMode(raw.occurrenceMode);

  if (occurrenceMode === "range") {
    const range = parseOccurrenceRange(raw.range, template);
    if (!parseOccurrenceKey(range.startDate)) {
      return null;
    }
  }

  if (occurrenceMode === "dates") {
    const dates = parseDateList(raw.dates);
    if (dates.length === 0) {
      return null;
    }
  }

  const child = raw.kind === "schedule_tasks" || raw.child ? parseGenerationChildSpec(raw.child, template) : defaultChildSpec(template);

  return {
    kind: "schedule_tasks",
    occurrenceMode,
    frequency: raw.frequency as RecurrenceFrequency,
    interval: Math.floor(interval),
    horizonDays: Math.floor(horizonDays),
    range: parseOccurrenceRange(raw.range, template),
    dates: parseDateList(raw.dates),
    anchor,
    exclusions,
    child
  };
}

export function generationSpecToRecurrenceRule(spec: GenerationSpec): unknown {
  return spec;
}

export function generationSpecLabel(spec: GenerationSpec | null): string {
  if (!spec) {
    return "None";
  }

  const scheduleSuffix = needsCalendarSchedule(spec.child) ? ` at ${spec.child.schedule.time}` : "";

  if (spec.occurrenceMode === "range") {
    return `${spec.range.count}× every ${spec.range.stepDays} day(s) from ${spec.range.startDate}${scheduleSuffix}`;
  }

  if (spec.occurrenceMode === "dates") {
    return `${spec.dates.length} explicit date(s)${scheduleSuffix}`;
  }

  const unit = spec.frequency === "daily" ? "day" : spec.frequency === "weekly" ? "week" : "month";
  const plural = spec.interval === 1 ? unit : `${unit}s`;
  return `Every ${spec.interval} ${plural}${scheduleSuffix}`;
}

export function needsCalendarSchedule(child: GenerationChildSpec): boolean {
  return child.isTask || child.isInterval;
}

export function resolveChildTitle(titleTemplate: string, occurrenceKey: string, template?: Item): string {
  const base = titleTemplate.trim() || template?.title || "Generated item";
  if (base.includes("{date}")) {
    return base.replaceAll("{date}", occurrenceKey);
  }
  if (base.includes("{index}")) {
    return base;
  }
  return `${base} · ${occurrenceKey}`;
}

export function generationAnchor(spec: GenerationSpec, template: Item): Date {
  if (spec.occurrenceMode === "range" && parseOccurrenceKey(spec.range.startDate)) {
    return parseOccurrenceKey(spec.range.startDate)!;
  }
  if (spec.anchor) {
    const parsed = new Date(spec.anchor);
    if (!Number.isNaN(parsed.getTime())) {
      return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
    }
  }
  const created = new Date(template.createdAt);
  return new Date(created.getFullYear(), created.getMonth(), created.getDate());
}

function recurrenceRuleFromSpec(spec: GenerationSpec): RecurrenceRule {
  return {
    frequency: spec.frequency,
    interval: spec.interval,
    horizonDays: spec.horizonDays
  };
}

function keysFromRange(range: OccurrenceRange): string[] {
  const start = parseOccurrenceKey(range.startDate);
  if (!start) {
    return [];
  }
  const keys: string[] = [];
  for (let index = 0; index < range.count; index += 1) {
    keys.push(formatOccurrenceKey(addDays(start, index * range.stepDays)));
  }
  return keys;
}

export function plannedOccurrenceKeys(spec: GenerationSpec, template: Item, now: Date): string[] {
  const excluded = new Set(spec.exclusions);
  let keys: string[] = [];

  if (spec.occurrenceMode === "range") {
    keys = keysFromRange(spec.range);
  } else if (spec.occurrenceMode === "dates") {
    keys = [...spec.dates];
  } else {
    const anchor = generationAnchor(spec, template);
    keys = occurrenceKeysInHorizon(recurrenceRuleFromSpec(spec), anchor, now);
  }

  return keys.filter((key) => !excluded.has(key));
}

export function slotTimesForOccurrence(occurrenceKey: string, schedule: GenerationSchedule): {
  startsAt: string;
  endsAt: string;
} {
  const day = parseOccurrenceKey(occurrenceKey);
  if (!day) {
    throw new Error("Invalid occurrence key");
  }
  const [hours, minutes] = schedule.time.split(":").map(Number);
  const startsAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes, 0, 0);
  const endsAt = new Date(startsAt.getTime() + schedule.durationMinutes * 60_000);
  return { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() };
}

export function isPastOccurrenceKey(occurrenceKey: string, now: Date): boolean {
  const today = formatOccurrenceKey(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  return occurrenceKey < today;
}

export function childDocumentationData(spec: GenerationChildSpec): Record<string, unknown> {
  return defaultDocumentationData(spec.inputSchema);
}

export const OVERRIDE_FIELDS = {
  title: "title",
  body: "body",
  isTask: "isTask",
  isDocumentation: "isDocumentation",
  isInterval: "isInterval",
  completionRule: "completionRule",
  inputSchema: "inputSchema",
  taskStatus: "taskStatus",
  scheduleStartsAt: "schedule.startsAt",
  scheduleEndsAt: "schedule.endsAt"
} as const;

export function mergeOverriddenFields(current: string[], additions: string[]): string[] {
  return [...new Set([...current, ...additions])];
}

export { formatOccurrenceKey, parseOccurrenceKey, OCCURRENCE_MODES, FREQUENCIES };
