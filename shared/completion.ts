import type { Item } from "./item";

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
