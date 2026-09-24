import type { TaskStatus } from "./item";

export type SchemaScheduleAction = {
  actionId: string;
  intention: {
    id: string;
    createdAt: string;
    text: string;
    provenance: string;
  };
  title: string;
  durationMinutes: number;
  reason: string;
  schemaIds: string[];
};

export type SchemaSchedulePlan = {
  format: "schema-atlas.schedule-plan";
  version: 1;
  schemaRunId: string;
  createdAt: string;
  horizonDays?: number;
  actions: SchemaScheduleAction[];
};

export type ScheduleIntervalSnapshot = {
  id: string;
  title: string;
  kind: string;
  status: string;
  startsAt: string;
  endsAt: string;
  revision: number;
};

export type ScheduleBaselineAction = {
  actionId: string;
  taskId: string;
  title: string;
  body: string;
  durationMinutes: number;
  manualRelevance: number;
  dueAt: string;
  fixedStartsAt: string;
  fixedEndsAt: string;
  plannedIntervalId: string | null;
  unassignedReason: string | null;
  taskRevision: number;
  taskStatus: TaskStatus | null;
  plannedInterval: ScheduleIntervalSnapshot | null;
};

export type ScheduleRunBaseline = { actions: ScheduleBaselineAction[]; appliedAt: string };

export type SchemaScheduleRun = {
  id: string;
  ownerId: string;
  schemaRunId: string;
  planDigest: string;
  plan: SchemaSchedulePlan;
  baseline: ScheduleRunBaseline;
  status: "applying" | "applied" | "failed";
  createdAt: string;
  updatedAt: string;
};

export type SchemaScheduleFeedback = {
  format: "schema-atlas.schedule-feedback";
  version: 1;
  runId: string;
  schemaRunId: string;
  planDigest: string;
  exportedAt: string;
  changes: Array<{
    actionId: string | null;
    taskId: string;
    kind: "unchanged" | "moved" | "unscheduled" | "removed" | "task-changed" | "task-status-changed" | "interval-changed" | "added-after-run";
    plannedIntervalId: string | null;
    currentIntervalId: string | null;
    currentIntervalIds: string[];
    plannedInterval: ScheduleIntervalSnapshot | null;
    currentInterval: ScheduleIntervalSnapshot | null;
    title: string | null;
    body: string | null;
    durationMinutes: number | null;
    manualRelevance: number | null;
    dueAt: string | null;
    fixedStartsAt: string | null;
    fixedEndsAt: string | null;
    taskStatus: string | null;
    taskRevision: number | null;
  }>;
};

type RecordValue = Record<string, unknown>;

function record(value: unknown, label: string): RecordValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as RecordValue;
}

function text(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(`${label} is missing or too long.`);
  return value;
}

function timestamp(value: unknown, label: string): string {
  const result = text(value, label, 40);
  if (!Number.isFinite(Date.parse(result))) throw new Error(`${label} is not a timestamp.`);
  return result;
}

export function parseSchemaSchedulePlan(value: unknown): SchemaSchedulePlan {
  const root = record(value, "Schedule plan");
  if (root.format !== "schema-atlas.schedule-plan" || root.version !== 1) throw new Error("Unsupported schedule plan format.");
  const schemaRunId = text(root.schemaRunId, "Schema run ID", 40);
  if (!/^R-[a-f0-9]{32}$/.test(schemaRunId)) throw new Error("Invalid schema run ID.");
  if (!Array.isArray(root.actions) || root.actions.length < 1 || root.actions.length > 8) throw new Error("Schedule plan must contain 1–8 actions.");
  if (root.horizonDays !== undefined && (!Number.isInteger(root.horizonDays) || Number(root.horizonDays) < 1 || Number(root.horizonDays) > 90)) throw new Error("Schedule horizon must be 1–90 days.");
  const ids = new Set<string>();
  const actions = root.actions.map((entry, index): SchemaScheduleAction => {
    const action = record(entry, `Action ${index + 1}`);
    const actionId = text(action.actionId, "Action ID", 80);
    if (!/^A-[A-Za-z0-9-]{1,70}$/.test(actionId) || ids.has(actionId)) throw new Error("Invalid or duplicate action ID.");
    ids.add(actionId);
    const intention = record(action.intention, "Intention");
    const intentionId = text(intention.id, "Intention ID", 20);
    if (!/^I-[a-f0-9]{8}$/.test(intentionId)) throw new Error("Invalid intention ID.");
    if (typeof action.durationMinutes !== "number" || !Number.isInteger(action.durationMinutes) || action.durationMinutes < 3 || action.durationMinutes > 240) throw new Error("Action duration must be 3–240 minutes.");
    if (!Array.isArray(action.schemaIds) || action.schemaIds.length < 1 || action.schemaIds.length > 4 || !action.schemaIds.every((id) => typeof id === "string" && /^J-[a-f0-9]{8}$/.test(id))) throw new Error("Each action must cite 1–4 agent schema IDs.");
    return {
      actionId,
      intention: {
        id: intentionId,
        createdAt: timestamp(intention.createdAt, "Intention creation time"),
        text: text(intention.text, "Intention text", 2000),
        provenance: text(intention.provenance, "Intention provenance", 1000)
      },
      title: text(action.title, "Task title", 240),
      durationMinutes: action.durationMinutes,
      reason: text(action.reason, "Action reason", 1000),
      schemaIds: action.schemaIds as string[]
    };
  });
  return {
    format: "schema-atlas.schedule-plan",
    version: 1,
    schemaRunId,
    createdAt: timestamp(root.createdAt, "Plan creation time"),
    ...(root.horizonDays !== undefined ? { horizonDays: Number(root.horizonDays) } : {}),
    actions
  };
}

export function schemaScheduleRunFromRow(row: {
  id: string; owner_id: string; schema_run_id: string; plan_digest: string;
  plan: unknown; baseline: unknown; status: string; created_at: string; updated_at: string;
}): SchemaScheduleRun {
  const plan = parseSchemaSchedulePlan(row.plan);
  const baselineRecord = record(row.baseline, "Schedule baseline");
  const actions = Array.isArray(baselineRecord.actions) ? baselineRecord.actions as ScheduleBaselineAction[] : [];
  const appliedAt = typeof baselineRecord.appliedAt === "string" && Number.isFinite(Date.parse(baselineRecord.appliedAt))
    ? baselineRecord.appliedAt
    : row.updated_at;
  return {
    id: row.id,
    ownerId: row.owner_id,
    schemaRunId: row.schema_run_id,
    planDigest: row.plan_digest,
    plan,
    baseline: { actions, appliedAt },
    status: row.status === "applied" || row.status === "failed" ? row.status : "applying",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
