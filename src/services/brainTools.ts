import type { SupabaseClient } from "@supabase/supabase-js";
import type { Item } from "@shared/item";
import type { ItemLink } from "@shared/links";
import {
  parseSchemaSchedulePlan,
  type SchemaScheduleAction,
  type SchemaScheduleFeedback,
  type SchemaSchedulePlan,
  type SchemaScheduleRun,
  type ScheduleBaselineAction,
  type ScheduleIntervalSnapshot
} from "@shared/schemaSchedule";
import { proposeSchedule } from "./scheduling";
import { fetchOwnedItems, createItem } from "./items";
import { fetchOwnedLinks, createLink } from "./links";
import { atlasTaskIdForAction } from "./webHandoff";
import {
  createSchemaScheduleRun,
  findSchemaScheduleRun,
  fetchSchemaScheduleRuns,
  updateSchemaScheduleRun
} from "./schemaScheduleRuns";
import type { Database } from "../types/database";

type Client = SupabaseClient<Database>;

export type AtlasScheduleAssignment = {
  actionId: string;
  taskId: string;
  title: string;
  durationMinutes: number;
  intervalId: string | null;
  intervalTitle: string | null;
  unassignedReason: string | null;
  existingTask: boolean;
};

export type AtlasSchedulePreview = {
  plan: SchemaSchedulePlan;
  planDigest: string;
  contextDigest: string;
  generatedAt: string;
  horizonDays: number;
  assignments: AtlasScheduleAssignment[];
};

async function digest(value: unknown): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function schedulingContextDigest(items: Item[], links: ItemLink[]): Promise<string> {
  const relevantItems = items.map((item) => ({
    id: item.id,
    revision: item.revision,
    title: item.title,
    isTask: item.isTask,
    taskStatus: item.taskStatus,
    expectedDurationMinutes: item.expectedDurationMinutes,
    taskDueAt: item.taskDueAt,
    taskFixedStartsAt: item.taskFixedStartsAt,
    taskFixedEndsAt: item.taskFixedEndsAt,
    parentTaskId: item.parentTaskId,
    manualRelevance: item.manualRelevance,
    tags: item.tags,
    isInterval: item.isInterval,
    intervalKind: item.intervalKind,
    intervalStartsAt: item.intervalStartsAt,
    intervalEndsAt: item.intervalEndsAt,
    intervalStatus: item.intervalStatus
  })).sort((a, b) => a.id.localeCompare(b.id));
  const relevantLinks = links.map((link) => ({
    id: link.id,
    fromId: link.fromId,
    toId: link.toId,
    kind: link.kind,
    updatedAt: link.updatedAt
  })).sort((a, b) => a.id.localeCompare(b.id));
  return digest({ items: relevantItems, links: relevantLinks });
}

function taskBody(action: SchemaScheduleAction, plan: SchemaSchedulePlan, runId: string): string {
  return [
    "Schema schedule run " + runId,
    "Schema run " + plan.schemaRunId,
    "Schema action " + action.actionId,
    "Intention " + action.intention.id + ": " + action.intention.text,
    "Decision source: " + action.intention.provenance,
    "Agent proposal: " + action.reason,
    "Proposal schemas: " + action.schemaIds.join(", "),
    "Estimated duration: " + action.durationMinutes + " minutes (provisional)"
  ].join("\n\n");
}

function intervalSnapshot(item: Item | undefined): ScheduleIntervalSnapshot | null {
  if (!item || !item.isInterval) return null;
  return {
    id: item.id,
    title: item.title,
    kind: item.intervalKind,
    status: item.intervalStatus,
    startsAt: item.intervalStartsAt,
    endsAt: item.intervalEndsAt,
    revision: item.revision
  };
}

function candidateTask(action: SchemaScheduleAction, id: string, ownerId: string, now: string): Item {
  return {
    id,
    ownerId,
    title: action.title,
    body: "",
    isTask: true,
    isDocumentation: false,
    isInterval: false,
    taskStatus: "active",
    expectedDurationMinutes: action.durationMinutes,
    taskDueAt: "",
    taskFixedStartsAt: "",
    taskFixedEndsAt: "",
    parentTaskId: "",
    manualRelevance: 0,
    tags: [],
    completionRule: null,
    documentationSchema: null,
    documentationData: null,
    recurrenceRule: null,
    generatedFromId: "",
    occurrenceKey: "",
    overriddenFields: [],
    intervalKind: "",
    intervalStartsAt: "",
    intervalEndsAt: "",
    intervalStatus: "",
    revision: 0,
    createdAt: now,
    updatedAt: now
  };
}

export async function listAtlasItems(
  client: Client,
  userId: string,
  options: { kind: "all" | "tasks" | "intervals" | "notes"; query?: string; limit: number }
): Promise<Item[]> {
  let items = await fetchOwnedItems(client, userId);
  if (options.kind === "tasks") items = items.filter((item) => item.isTask);
  if (options.kind === "intervals") items = items.filter((item) => item.isInterval);
  if (options.kind === "notes") items = items.filter((item) => !item.isTask && !item.isInterval);
  const query = options.query?.trim().toLocaleLowerCase();
  if (query) items = items.filter((item) => item.title.toLocaleLowerCase().includes(query) || item.body.toLocaleLowerCase().includes(query));
  return items.slice(0, options.limit);
}

export async function getAtlasScheduleContext(client: Client, userId: string): Promise<{
  generatedAt: string;
  timeZone: string;
  tasks: Item[];
  intervals: Item[];
  scheduledIn: ItemLink[];
}> {
  const [items, links] = await Promise.all([fetchOwnedItems(client, userId), fetchOwnedLinks(client, userId)]);
  return {
    generatedAt: new Date().toISOString(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    tasks: items.filter((item) => item.isTask && (item.taskStatus === "active" || item.taskStatus === "later")).slice(0, 500),
    intervals: items.filter((item) => item.isInterval).slice(0, 500),
    scheduledIn: links.filter((link) => link.kind === "scheduled_in").slice(0, 1000)
  };
}

export async function previewAtlasSchedule(
  client: Client,
  userId: string,
  rawPlan: unknown,
  now = new Date()
): Promise<AtlasSchedulePreview> {
  const plan = parseSchemaSchedulePlan(rawPlan);
  const [items, links] = await Promise.all([fetchOwnedItems(client, userId), fetchOwnedLinks(client, userId)]);
  const taskIds = await Promise.all(plan.actions.map((action) => atlasTaskIdForAction(action)));
  const taskIdByAction = new Map(plan.actions.map((action, index) => [action.actionId, taskIds[index]!]));
  const candidates: Item[] = [];
  for (const action of plan.actions) {
    const id = taskIdByAction.get(action.actionId)!;
    const prior = items.find((item) => item.id === id);
    if (prior) {
      if (!prior.isTask || !prior.body.includes("Schema action " + action.actionId)) {
        throw new Error("Atlas item " + id + " exists but does not belong to this schema action.");
      }
    } else {
      candidates.push(candidateTask(action, id, userId, now.toISOString()));
    }
  }
  const workingItems = [...items, ...candidates];
  const schedule = proposeSchedule(workingItems, now, "delta_cost_switch", {
    links,
    taskIds,
    horizonDays: plan.horizonDays
  });
  const assignmentByTask = new Map(schedule.assignments.map((entry) => [entry.taskId, entry.intervalId]));
  const reasonByTask = new Map(schedule.unassigned.map((entry) => [entry.taskId, entry.reason]));
  const intervalById = new Map(items.filter((item) => item.isInterval).map((item) => [item.id, item]));
  const existingPlacementByTask = new Map(links.filter((link) => link.kind === "scheduled_in").map((link) => [link.fromId, link.toId]));
  const assignments = plan.actions.map((action): AtlasScheduleAssignment => {
    const taskId = taskIdByAction.get(action.actionId)!;
    const existing = items.find((item) => item.id === taskId);
    const assignedId = assignmentByTask.get(taskId) ?? existingPlacementByTask.get(taskId) ?? null;
    const interval = assignedId ? intervalById.get(assignedId) : undefined;
    const inactiveReason = existing && existing.taskStatus !== "active" ? "existing_task_not_active" : null;
    return {
      actionId: action.actionId,
      taskId,
      title: action.title,
      durationMinutes: action.durationMinutes,
      intervalId: assignedId,
      intervalTitle: interval?.title ?? null,
      unassignedReason: assignedId ? null : reasonByTask.get(taskId) ?? inactiveReason ?? "no_feasible_interval",
      existingTask: Boolean(existing)
    };
  });
  return {
    plan,
    planDigest: await digest(plan),
    contextDigest: await schedulingContextDigest(items, links),
    generatedAt: now.toISOString(),
    horizonDays: plan.horizonDays ?? 21,
    assignments
  };
}

export async function applyAtlasSchedulePreview(
  client: Client,
  userId: string,
  preview: AtlasSchedulePreview
): Promise<{ run: SchemaScheduleRun; alreadyApplied: boolean; placedCount: number }> {
  let run = await findSchemaScheduleRun(client, userId, preview.plan.schemaRunId);
  if (run && run.planDigest !== preview.planDigest) {
    throw new Error("This schema run ID already has a different plan. Create a new schedule run.");
  }
  if (run?.status === "applied") return { run, alreadyApplied: true, placedCount: run.baseline.actions.filter((action) => action.plannedIntervalId).length };
  const [itemsBefore, linksBefore] = await Promise.all([fetchOwnedItems(client, userId), fetchOwnedLinks(client, userId)]);
  if (await schedulingContextDigest(itemsBefore, linksBefore) !== preview.contextDigest) {
    throw new Error("Atlas schedule data changed after preview. Create a fresh preview before applying.");
  }
  if (!run) {
    run = await createSchemaScheduleRun(client, userId, {
      schemaRunId: preview.plan.schemaRunId,
      planDigest: preview.planDigest,
      plan: preview.plan
    });
  }
  try {
    for (const action of preview.plan.actions) {
      const assignment = preview.assignments.find((entry) => entry.actionId === action.actionId);
      if (!assignment) throw new Error("Preview is missing action " + action.actionId + ".");
      const prior = itemsBefore.find((item) => item.id === assignment.taskId);
      if (!prior) {
        await createItem(client, userId, action.title, {
          id: assignment.taskId,
          body: taskBody(action, preview.plan, run.id),
          isTask: true,
          expectedDurationMinutes: action.durationMinutes
        });
      }
    }
    for (const assignment of preview.assignments) {
      if (!assignment.intervalId) continue;
      const existing = linksBefore.find((link) => link.kind === "scheduled_in" && link.fromId === assignment.taskId);
      if (existing && existing.toId !== assignment.intervalId) {
        throw new Error("Task " + assignment.taskId + " already has a different scheduled placement. Review it in Atlas before applying.");
      }
      if (!existing) await createLink(client, userId, assignment.taskId, assignment.intervalId, "scheduled_in");
    }
    const [items, links] = await Promise.all([fetchOwnedItems(client, userId), fetchOwnedLinks(client, userId)]);
    const baselineActions: ScheduleBaselineAction[] = preview.plan.actions.map((action) => {
      const assignment = preview.assignments.find((entry) => entry.actionId === action.actionId)!;
      const task = items.find((item) => item.id === assignment.taskId);
      const linkedId = links.find((link) => link.kind === "scheduled_in" && link.fromId === assignment.taskId)?.toId ?? null;
      const intervalId = assignment.intervalId ?? linkedId;
      const interval = intervalId ? items.find((item) => item.id === intervalId) : undefined;
      return {
        actionId: action.actionId,
        taskId: assignment.taskId,
        title: task?.title ?? action.title,
        body: task?.body ?? "",
        durationMinutes: task?.expectedDurationMinutes ?? action.durationMinutes,
        manualRelevance: task?.manualRelevance ?? 0,
        dueAt: task?.taskDueAt ?? "",
        fixedStartsAt: task?.taskFixedStartsAt ?? "",
        fixedEndsAt: task?.taskFixedEndsAt ?? "",
        plannedIntervalId: intervalId,
        unassignedReason: assignment.unassignedReason,
        taskRevision: task?.revision ?? 0,
        taskStatus: task?.taskStatus ?? null,
        plannedInterval: intervalSnapshot(interval)
      };
    });
    run = await updateSchemaScheduleRun(client, userId, run.id, {
      baseline: { actions: baselineActions, appliedAt: new Date().toISOString() },
      status: "applied"
    });
    return { run, alreadyApplied: false, placedCount: baselineActions.filter((action) => action.plannedIntervalId !== null).length };
  } catch (error) {
    try {
      await updateSchemaScheduleRun(client, userId, run.id, {
        baseline: { actions: [], appliedAt: new Date().toISOString() },
        status: "failed"
      });
    } catch {
      // Preserve the failure that caused the retryable partial apply.
    }
    throw error;
  }
}

export async function listAtlasScheduleRuns(client: Client, userId: string): Promise<SchemaScheduleRun[]> {
  return fetchSchemaScheduleRuns(client, userId);
}

export { findSchemaScheduleRun };

export function buildAtlasScheduleFeedback(
  run: SchemaScheduleRun,
  items: Item[],
  links: ItemLink[],
  exportedAt = new Date().toISOString()
) {
  const changes: SchemaScheduleFeedback["changes"] = run.baseline.actions.map((baseline) => {
    const task = items.find((item) => item.id === baseline.taskId);
    const currentIntervalIds = links
      .filter((link) => link.kind === "scheduled_in" && link.fromId === baseline.taskId)
      .map((link) => link.toId)
      .sort();
    const currentIntervalId = currentIntervalIds[0] ?? null;
    const currentInterval = intervalSnapshot(currentIntervalId ? items.find((item) => item.id === currentIntervalId) : undefined);
    let kind: "unchanged" | "moved" | "unscheduled" | "removed" | "task-changed" | "task-status-changed" | "interval-changed" = "unchanged";
    if (!task) kind = "removed";
    else if (JSON.stringify(currentIntervalIds) !== JSON.stringify(baseline.plannedIntervalId ? [baseline.plannedIntervalId] : [])) kind = currentIntervalIds.length ? "moved" : "unscheduled";
    else if (task.title !== baseline.title || task.body !== baseline.body || task.expectedDurationMinutes !== baseline.durationMinutes || task.manualRelevance !== baseline.manualRelevance || task.taskDueAt !== baseline.dueAt || task.taskFixedStartsAt !== baseline.fixedStartsAt || task.taskFixedEndsAt !== baseline.fixedEndsAt) kind = "task-changed";
    else if (task.taskStatus !== baseline.taskStatus) kind = "task-status-changed";
    else if (JSON.stringify(currentInterval) !== JSON.stringify(baseline.plannedInterval)) kind = "interval-changed";
    return {
      actionId: baseline.actionId,
      taskId: baseline.taskId,
      kind,
      plannedIntervalId: baseline.plannedIntervalId,
      currentIntervalId,
      currentIntervalIds,
      plannedInterval: baseline.plannedInterval,
      currentInterval,
      title: task?.title ?? null,
      body: task?.body ?? null,
      durationMinutes: task?.expectedDurationMinutes ?? null,
      manualRelevance: task?.manualRelevance ?? null,
      dueAt: task?.taskDueAt ?? null,
      fixedStartsAt: task?.taskFixedStartsAt ?? null,
      fixedEndsAt: task?.taskFixedEndsAt ?? null,
      taskStatus: task?.taskStatus ?? null,
      taskRevision: task?.revision ?? null
    };
  });
  changes.push(...items.filter((item) =>
    item.isTask && Date.parse(item.createdAt) > Date.parse(run.baseline.appliedAt)
  ).map((item) => {
    const currentIntervalIds = links
      .filter((link) => link.kind === "scheduled_in" && link.fromId === item.id)
      .map((link) => link.toId)
      .sort();
    const currentIntervalId = currentIntervalIds[0] ?? null;
    const currentInterval = intervalSnapshot(currentIntervalId ? items.find((entry) => entry.id === currentIntervalId) : undefined);
    return {
      actionId: null,
      taskId: item.id,
      kind: "added-after-run" as const,
      plannedIntervalId: null,
      currentIntervalId,
      currentIntervalIds,
      plannedInterval: null,
      currentInterval,
      title: item.title,
      body: item.body,
      durationMinutes: item.expectedDurationMinutes,
      manualRelevance: item.manualRelevance,
      dueAt: item.taskDueAt,
      fixedStartsAt: item.taskFixedStartsAt,
      fixedEndsAt: item.taskFixedEndsAt,
      taskStatus: item.taskStatus,
      taskRevision: item.revision
    };
  }));
  return {
    format: "schema-atlas.schedule-feedback" as const,
    version: 1 as const,
    runId: run.id,
    schemaRunId: run.schemaRunId,
    planDigest: run.planDigest,
    exportedAt,
    changes
  };
}
