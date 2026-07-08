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

export type GenerationChildSpec = {
  title: string;
  body: string;
  isTask: boolean;
  isDocumentation: boolean;
  inputSchema: DocumentationSchema;
  completionRule: CompletionRule | null;
  schedule: GenerationSchedule;
};

export type GenerationSpec = RecurrenceRule & {
  kind: "schedule_tasks";
  anchor?: string;
  exclusions: string[];
  child: GenerationChildSpec;
};

const FREQUENCIES: RecurrenceFrequency[] = ["daily", "weekly", "monthly"];

const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

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

export function parseGenerationChildSpec(value: unknown, template?: Item): GenerationChildSpec {
  const fallbackTitle = template?.title ?? "Task";
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

  return {
    title,
    body,
    isTask,
    isDocumentation,
    inputSchema,
    completionRule: isTask ? completionRule ?? { kind: "manual" } : null,
    schedule
  };
}

export function defaultChildSpec(template?: Item): GenerationChildSpec {
  return {
    title: template?.title ?? "Task",
    body: "",
    isTask: true,
    isDocumentation: false,
    inputSchema: [],
    completionRule: { kind: "manual" },
    schedule: { time: "09:00", durationMinutes: 30 }
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

  if (raw.kind === "schedule_tasks" || raw.child) {
    return {
      kind: "schedule_tasks",
      frequency: raw.frequency as RecurrenceFrequency,
      interval: Math.floor(interval),
      horizonDays: Math.floor(horizonDays),
      anchor,
      exclusions,
      child: parseGenerationChildSpec(raw.child, template)
    };
  }

  return {
    kind: "schedule_tasks",
    frequency: raw.frequency as RecurrenceFrequency,
    interval: Math.floor(interval),
    horizonDays: Math.floor(horizonDays),
    anchor,
    exclusions,
    child: defaultChildSpec(template)
  };
}

export function generationSpecToRecurrenceRule(spec: GenerationSpec): unknown {
  return spec;
}

export function generationSpecLabel(spec: GenerationSpec | null): string {
  if (!spec) {
    return "None";
  }
  const unit = spec.frequency === "daily" ? "day" : spec.frequency === "weekly" ? "week" : "month";
  const plural = spec.interval === 1 ? unit : `${unit}s`;
  return `Every ${spec.interval} ${plural} at ${spec.child.schedule.time}`;
}

export function resolveChildTitle(titleTemplate: string, occurrenceKey: string, template?: Item): string {
  const base = titleTemplate.trim() || template?.title || "Task";
  if (base.includes("{date}")) {
    return base.replaceAll("{date}", occurrenceKey);
  }
  return `${base} · ${occurrenceKey}`;
}

export function generationAnchor(spec: GenerationSpec, template: Item): Date {
  if (spec.anchor) {
    const parsed = new Date(spec.anchor);
    if (!Number.isNaN(parsed.getTime())) {
      return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
    }
  }
  const created = new Date(template.createdAt);
  return new Date(created.getFullYear(), created.getMonth(), created.getDate());
}

export function plannedOccurrenceKeys(spec: GenerationSpec, template: Item, now: Date): string[] {
  const anchor = generationAnchor(spec, template);
  const keys = occurrenceKeysInHorizon(spec, anchor, now);
  const excluded = new Set(spec.exclusions);
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
  completionRule: "completionRule",
  inputSchema: "inputSchema",
  taskStatus: "taskStatus",
  scheduleStartsAt: "schedule.startsAt",
  scheduleEndsAt: "schedule.endsAt"
} as const;

export function mergeOverriddenFields(current: string[], additions: string[]): string[] {
  return [...new Set([...current, ...additions])];
}

export { formatOccurrenceKey, parseOccurrenceKey };
