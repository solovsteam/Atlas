export type TaskStatus = "active" | "done" | "cancelled";

export const TASK_STATUSES: TaskStatus[] = ["active", "done", "cancelled"];

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
  revision: number;
  createdAt: string;
  updatedAt: string;
};

export type ItemPatch = Partial<{
  title: string;
  body: string;
  isTask: boolean;
  taskStatus: TaskStatus | null;
  manualRelevance: number;
  tags: string[];
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
  task_status: string;
  manual_relevance: number;
  tags: unknown;
  revision: number;
  created_at: string;
  updated_at: string;
}): Item {
  const isTask = Boolean(row.is_task);
  const tags = Array.isArray(row.tags) ? row.tags.filter((tag): tag is string => typeof tag === "string") : [];
  return {
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    body: row.body,
    isTask,
    isDocumentation: false,
    isInterval: false,
    isGenerator: false,
    taskStatus: parseTaskStatus(row.task_status, isTask),
    manualRelevance: Number(row.manual_relevance) || 0,
    tags,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function applyPatch(item: Item, patch: ItemPatch): Partial<{
  title: string;
  body: string;
  is_task: boolean;
  task_status: string;
  manual_relevance: number;
  tags: string[];
}> {
  const next: Partial<{
    title: string;
    body: string;
    is_task: boolean;
    task_status: string;
    manual_relevance: number;
    tags: string[];
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

  return next;
}

export function cleanTitle(value: string): string {
  return value.trim().slice(0, 200);
}

export function cleanBody(value: string): string {
  return value.slice(0, 50000);
}

export function itemKindLabel(item: Item): string {
  if (item.isTask) {
    return `task · ${item.taskStatus ?? "active"}`;
  }
  return "note";
}

export function newItemInsert(ownerId: string, title: string) {
  return {
    owner_id: ownerId,
    title: cleanTitle(title),
    body: "",
    is_task: false,
    task_status: "",
    manual_relevance: 0,
    tags: [] as string[],
    revision: 0
  };
}
