import { parseCompletionRule } from "./completion";

export type TaskStatus = "active" | "done" | "cancelled";

export const TASK_STATUSES: TaskStatus[] = ["active", "done", "cancelled"];

export type CompletionRule =
  | { kind: "manual" }
  | { kind: "documentation"; schemaField: string }
  | { kind: "allChildrenDone" };

export type Item = {
  id: string;
  ownerId: string;
  title: string;
  body: string;
  isTask: boolean;
  isDocumentation: boolean;
  isInterval: boolean;
  isGenerator: boolean;
  taskStatus: TaskStatus | null;
  manualRelevance: number;
  tags: string[];
  completionRule: CompletionRule | null;
  documentationSchema: unknown | null;
  documentationData: unknown | null;
  recurrenceRule: unknown | null;
  generatedFromId: string;
  occurrenceKey: string;
  overriddenFields: string[];
  intervalKind: string;
  intervalStartsAt: string;
  intervalEndsAt: string;
  intervalStatus: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

export type ItemPatch = Partial<{
  title: string;
  body: string;
  isTask: boolean;
  isDocumentation: boolean;
  isInterval: boolean;
  isGenerator: boolean;
  taskStatus: TaskStatus | null;
  manualRelevance: number;
  tags: string[];
  completionRule: CompletionRule | null;
  documentationSchema: unknown | null;
  documentationData: unknown | null;
  recurrenceRule: unknown | null;
  overriddenFields: string[];
  intervalKind: string;
  intervalStartsAt: string | null;
  intervalEndsAt: string | null;
  intervalStatus: string;
}>;

export type UpdateItemResult =
  | { ok: true; revision: number }
  | { conflict: true; serverItem: Item };

export type CreateItemResult = {
  id: string;
  revision: number;
};

export function parseJson<T>(value: string, fallback: T): T {
  if (!value) {
    return fallback;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function toJson(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return JSON.stringify(value);
}

export function parseTaskStatus(value: string, isTask: boolean): TaskStatus | null {
  if (!isTask) {
    return null;
  }
  if (TASK_STATUSES.includes(value as TaskStatus)) {
    return value as TaskStatus;
  }
  return "active";
}

export function itemFromDbRow(row: {
  id: string;
  owner_id: string;
  title: string;
  body: string;
  is_task: boolean;
  is_documentation?: boolean;
  is_interval?: boolean;
  is_generator?: boolean;
  task_status: string;
  manual_relevance: number;
  tags: unknown;
  completion_rule?: unknown;
  documentation_schema?: unknown;
  documentation_data?: unknown;
  recurrence_rule?: unknown;
  generated_from_id?: string | null;
  occurrence_key?: string;
  overridden_fields?: unknown;
  interval_kind?: string;
  interval_starts_at?: string;
  interval_ends_at?: string;
  interval_status?: string;
  revision: number;
  created_at: string;
  updated_at: string;
}): Item {
  const isTask = Boolean(row.is_task);
  const tags = Array.isArray(row.tags) ? row.tags.filter((tag): tag is string => typeof tag === "string") : [];
  const overriddenFields = Array.isArray(row.overridden_fields)
    ? row.overridden_fields.filter((field): field is string => typeof field === "string")
    : [];

  return {
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    body: row.body,
    isTask,
    isDocumentation: Boolean(row.is_documentation),
    isInterval: Boolean(row.is_interval),
    isGenerator: Boolean(row.is_generator),
    taskStatus: parseTaskStatus(row.task_status, isTask),
    manualRelevance: Number(row.manual_relevance) || 0,
    tags,
    completionRule: parseCompletionRule(row.completion_rule),
    documentationSchema: row.documentation_schema ?? null,
    documentationData: row.documentation_data ?? null,
    recurrenceRule: row.recurrence_rule ?? null,
    generatedFromId: row.generated_from_id ?? "",
    occurrenceKey: row.occurrence_key ?? "",
    overriddenFields,
    intervalKind: row.interval_kind ?? "",
    intervalStartsAt: row.interval_starts_at ?? "",
    intervalEndsAt: row.interval_ends_at ?? "",
    intervalStatus: row.interval_status ?? "",
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function applyPatch(item: Item, patch: ItemPatch): Partial<{
  title: string;
  body: string;
  is_task: boolean;
  is_documentation: boolean;
  is_interval: boolean;
  is_generator: boolean;
  task_status: string;
  manual_relevance: number;
  tags: string[];
  completion_rule: unknown;
  documentation_schema: unknown;
  documentation_data: unknown;
  recurrence_rule: unknown;
  overridden_fields: unknown;
  interval_kind: string;
  interval_starts_at: string;
  interval_ends_at: string;
  interval_status: string;
}> {
  const next: Partial<{
    title: string;
    body: string;
    is_task: boolean;
    is_documentation: boolean;
    is_interval: boolean;
    is_generator: boolean;
    task_status: string;
    manual_relevance: number;
    tags: string[];
    completion_rule: unknown;
    documentation_schema: unknown;
    documentation_data: unknown;
    recurrence_rule: unknown;
    overridden_fields: unknown;
    interval_kind: string;
    interval_starts_at: string;
    interval_ends_at: string;
    interval_status: string;
  }> = {};

  if (patch.title !== undefined) {
    next.title = cleanTitle(patch.title);
  }
  if (patch.body !== undefined) {
    next.body = cleanBody(patch.body);
  }
  if (patch.isTask !== undefined) {
    next.is_task = patch.isTask;
    if (!patch.isTask) {
      next.task_status = "";
    } else if (patch.taskStatus === undefined && !item.taskStatus) {
      next.task_status = "active";
    }
  }
  if (patch.isDocumentation !== undefined) {
    next.is_documentation = patch.isDocumentation;
  }
  if (patch.isInterval !== undefined) {
    next.is_interval = patch.isInterval;
  }
  if (patch.isGenerator !== undefined) {
    next.is_generator = patch.isGenerator;
  }
  if (patch.taskStatus !== undefined) {
    if (patch.taskStatus === null) {
      next.task_status = "";
    } else if (TASK_STATUSES.includes(patch.taskStatus)) {
      next.task_status = patch.taskStatus;
      next.is_task = true;
    }
  }
  if (patch.manualRelevance !== undefined) {
    next.manual_relevance = patch.manualRelevance;
  }
  if (patch.tags !== undefined) {
    next.tags = patch.tags;
  }
  if (patch.completionRule !== undefined) {
    next.completion_rule = patch.completionRule;
  }
  if (patch.documentationSchema !== undefined) {
    next.documentation_schema = patch.documentationSchema;
  }
  if (patch.documentationData !== undefined) {
    next.documentation_data = patch.documentationData;
  }
  if (patch.recurrenceRule !== undefined) {
    next.recurrence_rule = patch.recurrenceRule;
  }
  if (patch.overriddenFields !== undefined) {
    next.overridden_fields = patch.overriddenFields;
  }
  if (patch.intervalKind !== undefined) {
    next.interval_kind = patch.intervalKind;
  }
  if (patch.intervalStartsAt !== undefined) {
    next.interval_starts_at = patch.intervalStartsAt ?? "";
  }
  if (patch.intervalEndsAt !== undefined) {
    next.interval_ends_at = patch.intervalEndsAt ?? "";
  }
  if (patch.intervalStatus !== undefined) {
    next.interval_status = patch.intervalStatus;
  }

  return next;
}

export function cleanTitle(value: string): string {
  return value.trim().slice(0, 200);
}

export function cleanBody(value: string): string {
  return value.slice(0, 50000);
}

export function itemKindLabel(item: Item): string {
  const parts: string[] = [];
  if (item.isTask) {
    parts.push(`task · ${item.taskStatus ?? "active"}`);
  }
  if (item.isDocumentation) {
    parts.push("documentation");
  }
  if (item.isInterval) {
    parts.push("interval");
  }
  if (item.isGenerator) {
    parts.push("generator");
  }
  if (parts.length === 0) {
    return "note";
  }
  return parts.join(" · ");
}

export function newItemInsert(ownerId: string, title: string) {
  return {
    owner_id: ownerId,
    title: cleanTitle(title),
    body: "",
    is_task: false,
    is_documentation: false,
    is_interval: false,
    is_generator: false,
    task_status: "",
    manual_relevance: 0,
    tags: [] as string[],
    completion_rule: null,
    documentation_schema: null,
    documentation_data: null,
    recurrence_rule: null,
    generated_from_id: null,
    occurrence_key: "",
    overridden_fields: [] as string[],
    interval_kind: "",
    interval_starts_at: "",
    interval_ends_at: "",
    interval_status: "",
    revision: 0
  };
}
