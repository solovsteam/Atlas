import { isDocumentationFieldComplete, parseDocumentationSchema } from "./documentation";
import type { Item, TaskStatus } from "./item";
import { getChildIds } from "./links";
import type { ItemLink } from "./links";

export function defaultCompletionRule(isTask: boolean) {
  return isTask ? ({ kind: "manual" } as const) : null;
}

export function parseCompletionRule(value: unknown): Item["completionRule"] {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as Record<string, unknown>;
  if (raw.kind === "manual") {
    return { kind: "manual" };
  }
  if (raw.kind === "allChildrenDone") {
    return { kind: "allChildrenDone" };
  }
  if (raw.kind === "documentation" && typeof raw.schemaField === "string" && raw.schemaField.trim()) {
    return { kind: "documentation", schemaField: raw.schemaField.trim() };
  }
  return null;
}

export function completionRuleLabel(rule: Item["completionRule"]): string {
  if (!rule || rule.kind === "manual") {
    return "Manual";
  }
  if (rule.kind === "allChildrenDone") {
    return "All children done";
  }
  return `Documentation: ${rule.schemaField}`;
}

export function evaluateAutoTaskStatus(item: Item, items: Item[], links: ItemLink[]): TaskStatus | null {
  if (!item.isTask) {
    return null;
  }

  if (item.taskStatus === "cancelled" || item.taskStatus === "done") {
    return null;
  }

  const rule = item.completionRule ?? { kind: "manual" as const };
  if (rule.kind === "manual") {
    return null;
  }

  if (rule.kind === "allChildrenDone") {
    const childIds = getChildIds(item.id, links);
    const childTasks = childIds
      .map((childId) => items.find((entry) => entry.id === childId))
      .filter((entry): entry is Item => Boolean(entry?.isTask));

    if (childTasks.length === 0) {
      return null;
    }

    const allDone = childTasks.every(
      (child) => child.taskStatus === "done" || child.taskStatus === "cancelled"
    );
    return allDone ? "done" : null;
  }

  const schema = parseDocumentationSchema(item.documentationSchema);
  const data = (item.documentationData ?? {}) as Record<string, unknown>;
  const field = schema.find((entry) => entry.key === rule.schemaField);
  if (!field) {
    return null;
  }

  return isDocumentationFieldComplete(field, data) ? "done" : null;
}

export function itemsNeedingCompletionCheck(changedItemId: string, items: Item[], links: ItemLink[]): string[] {
  const ids = new Set<string>();

  for (const item of items) {
    if (!item.isTask) {
      continue;
    }
    const rule = item.completionRule;
    if (!rule || rule.kind === "manual") {
      continue;
    }
    if (rule.kind === "allChildrenDone") {
      const childIds = getChildIds(item.id, links);
      if (childIds.includes(changedItemId)) {
        ids.add(item.id);
      }
    } else if (rule.kind === "documentation" && item.id === changedItemId) {
      ids.add(item.id);
    }
  }

  return [...ids];
}
