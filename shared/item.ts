export type TaskStatus = "active" | "done" | "cancelled";

export const TASK_STATUSES: TaskStatus[] = ["active", "done", "cancelled"];

export type StartableWindow = {
  startMinutes: number;
  endMinutes: number;
};

export type CompletionRule =
  | { kind: "manual" }
  | { kind: "documentation"; schemaField: string }
  | { kind: "allChildrenDone" };

export type ItemRow = {
  id: string;
  ownerId: string;
  title: string;
  body: string;
  isTask: boolean;
  isDocumentation: boolean;
  taskStatus: string;
  manualRelevance: string;
  tags: string;
  location: string;
  startableWindow: string;
  completionRule: string;
  documentationSchema: string;
  documentationData: string;
  recurrenceRule: string;
  generatedFromId: string;
  occurrenceKey: string;
  overriddenFields: string;
  revision: string;
  createdAt: string;
  updatedAt: string;
};

export type Item = {
  id: string;
  ownerId: string;
  title: string;
  body: string;
  isTask: boolean;
  isDocumentation: boolean;
  taskStatus: TaskStatus | null;
  manualRelevance: number;
  tags: string[];
  location: string;
  startableWindow: StartableWindow | null;
  completionRule: CompletionRule | null;
  documentationSchema: unknown | null;
  documentationData: unknown | null;
  recurrenceRule: unknown | null;
  generatedFromId: string;
  occurrenceKey: string;
  overriddenFields: string[];
  revision: number;
  createdAt: string;
  updatedAt: string;
};

export type ItemPatch = Partial<{
  title: string;
  body: string;
  isTask: boolean;
  isDocumentation: boolean;
  taskStatus: TaskStatus | null;
  manualRelevance: number;
  tags: string[];
  location: string;
  startableWindow: StartableWindow | null;
  completionRule: CompletionRule | null;
  documentationSchema: unknown | null;
  documentationData: unknown | null;
  recurrenceRule: unknown | null;
  overriddenFields: string[];
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

export function itemFromRow(row: ItemRow): Item {
  const isTask = Boolean(row.isTask);
  const isDocumentation = Boolean(row.isDocumentation);
  return {
    id: row.id,
    ownerId: row.ownerId,
    title: row.title,
    body: row.body,
    isTask,
    isDocumentation,
    taskStatus: parseTaskStatus(row.taskStatus, isTask),
    manualRelevance: Number.parseInt(row.manualRelevance || "0", 10) || 0,
    tags: parseJson<string[]>(row.tags, []),
    location: row.location,
    startableWindow: parseJson<StartableWindow | null>(row.startableWindow, null),
    completionRule: parseJson<CompletionRule | null>(row.completionRule, null),
    documentationSchema: parseJson<unknown | null>(row.documentationSchema, null),
    documentationData: parseJson<unknown | null>(row.documentationData, null),
    recurrenceRule: parseJson<unknown | null>(row.recurrenceRule, null),
    generatedFromId: row.generatedFromId,
    occurrenceKey: row.occurrenceKey,
    overriddenFields: parseJson<string[]>(row.overriddenFields, []),
    revision: Number.parseInt(row.revision || "0", 10) || 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export function newItemRow(ownerId: string, title: string): Omit<ItemRow, "id" | "createdAt" | "updatedAt"> {
  return {
    ownerId,
    title: cleanTitle(title),
    body: "",
    isTask: false,
    isDocumentation: false,
    taskStatus: "",
    manualRelevance: "0",
    tags: "[]",
    location: "",
    startableWindow: "",
    completionRule: "",
    documentationSchema: "",
    documentationData: "",
    recurrenceRule: "",
    generatedFromId: "",
    occurrenceKey: "",
    overriddenFields: "[]",
    revision: "0"
  };
}

export function applyPatch(row: ItemRow, patch: ItemPatch): Partial<ItemRow> {
  const next: Partial<ItemRow> = {};
  if (patch.title !== undefined) {
    next.title = cleanTitle(patch.title);
  }
  if (patch.body !== undefined) {
    next.body = cleanBody(patch.body);
  }
  if (patch.isTask !== undefined) {
    next.isTask = patch.isTask;
    if (!patch.isTask) {
      next.taskStatus = "";
    } else if (patch.taskStatus === undefined && !row.taskStatus) {
      next.taskStatus = "active";
    }
  }
  if (patch.isDocumentation !== undefined) {
    next.isDocumentation = patch.isDocumentation;
  }
  if (patch.taskStatus !== undefined) {
    if (patch.taskStatus === null) {
      next.taskStatus = "";
    } else if (TASK_STATUSES.includes(patch.taskStatus)) {
      next.taskStatus = patch.taskStatus;
      next.isTask = true;
    }
  }
  if (patch.manualRelevance !== undefined) {
    next.manualRelevance = String(patch.manualRelevance);
  }
  if (patch.tags !== undefined) {
    next.tags = toJson(patch.tags);
  }
  if (patch.location !== undefined) {
    next.location = patch.location.trim();
  }
  if (patch.startableWindow !== undefined) {
    next.startableWindow = patch.startableWindow ? toJson(patch.startableWindow) : "";
  }
  if (patch.completionRule !== undefined) {
    next.completionRule = patch.completionRule ? toJson(patch.completionRule) : "";
  }
  if (patch.documentationSchema !== undefined) {
    next.documentationSchema = patch.documentationSchema ? toJson(patch.documentationSchema) : "";
  }
  if (patch.documentationData !== undefined) {
    next.documentationData = patch.documentationData ? toJson(patch.documentationData) : "";
  }
  if (patch.recurrenceRule !== undefined) {
    next.recurrenceRule = patch.recurrenceRule ? toJson(patch.recurrenceRule) : "";
  }
  if (patch.overriddenFields !== undefined) {
    next.overriddenFields = toJson(patch.overriddenFields);
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
  if (parts.length === 0) {
    return "note";
  }
  return parts.join(" · ");
}
