import assert from "node:assert/strict";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildAtlasScheduleFeedback } from "../src/services/brainTools";
import { createServer } from "./brain-atlas-mcp";
import type { Item } from "../shared/item";
import type { ItemLink } from "../shared/links";
import type { SchemaScheduleRun, ScheduleBaselineAction, ScheduleIntervalSnapshot } from "../shared/schemaSchedule";
import type { Database } from "../src/types/database";

const appliedAt = "2026-09-26T08:00:00.000Z";
const oldInterval = item("interval-old", { title: "Old block", isInterval: true });
const newInterval = item("interval-new", { title: "New block", isInterval: true });
const movedTask = item("task-moved", { title: "Prepare memo", body: "memo", isTask: true, taskStatus: "active", expectedDurationMinutes: 30 });
const editedTask = item("task-edited", { title: "Read paper", body: "paper", isTask: true, taskStatus: "active", expectedDurationMinutes: 60 });
const newTask = item("task-new", { title: "Unexpected task", isTask: true, taskStatus: "active", createdAt: "2026-09-26T09:00:00.000Z" });
const baseline = [
  baselineAction("A-moved", movedTask, 30, snapshot(oldInterval)),
  baselineAction("A-edited", editedTask, 30, null),
  baselineAction("A-removed", item("task-removed", { isTask: true }), 20, null)
];
const run: SchemaScheduleRun = {
  id: "run-row",
  ownerId: "owner",
  schemaRunId: "R-" + "a".repeat(32),
  planDigest: "digest",
  plan: { format: "schema-atlas.schedule-plan", version: 1, schemaRunId: "R-" + "a".repeat(32), createdAt: appliedAt, actions: [] },
  baseline: { actions: baseline, appliedAt },
  status: "applied",
  createdAt: appliedAt,
  updatedAt: appliedAt
};
const links: ItemLink[] = [link("task-moved", "interval-new")];
const feedback = buildAtlasScheduleFeedback(run, [oldInterval, newInterval, movedTask, editedTask, newTask], links, appliedAt);
const changes = new Map(feedback.changes.map((change) => [change.taskId, change.kind]));

assert.equal(changes.get("task-moved"), "moved");
assert.equal(changes.get("task-edited"), "task-changed");
assert.equal(changes.get("task-removed"), "removed");
assert.equal(changes.get("task-new"), "added-after-run");

const mcpServer = createServer({} as SupabaseClient<Database>);
const mcpClient = new Client({ name: "atlas-tools-test", version: "1.0.0" });
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
await Promise.all([mcpClient.connect(clientTransport), mcpServer.connect(serverTransport)]);
const tools = await mcpClient.listTools();
const names = new Set(tools.tools.map((tool) => tool.name));
for (const name of [
  "atlas_identity",
  "atlas_list_items",
  "atlas_get_item",
  "atlas_get_schedule_context",
  "atlas_preview_schema_schedule",
  "atlas_apply_schedule_preview",
  "atlas_list_schedule_runs",
  "atlas_get_schedule_feedback"
]) {
  assert.equal(names.has(name), true, "missing MCP tool " + name);
}
const applyTool = tools.tools.find((tool) => tool.name === "atlas_apply_schedule_preview");
assert.equal(applyTool?.annotations?.destructiveHint, true);
const deniedApply = await mcpClient.callTool({
  name: "atlas_apply_schedule_preview",
  arguments: { previewId: "00000000-0000-4000-8000-000000000001", humanApproved: false }
});
assert.equal(deniedApply.isError, true);
assert.match(deniedApply.content[0]?.type === "text" ? deniedApply.content[0].text : "", /human has not approved/i);
await mcpClient.close();
await mcpServer.close();
console.log("Atlas Brain MCP and schedule-feedback checks passed.");

function item(id: string, overrides: Partial<Item> = {}): Item {
  return {
    id,
    ownerId: "owner",
    title: "Task",
    body: "",
    isTask: false,
    isDocumentation: false,
    isInterval: false,
    taskStatus: null,
    expectedDurationMinutes: null,
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
    intervalKind: "work",
    intervalStartsAt: "2026-09-26T09:00:00.000Z",
    intervalEndsAt: "2026-09-26T18:00:00.000Z",
    intervalStatus: "scheduled",
    revision: 1,
    createdAt: appliedAt,
    updatedAt: appliedAt,
    ...overrides
  };
}

function snapshot(value: Item): ScheduleIntervalSnapshot {
  return {
    id: value.id,
    title: value.title,
    kind: value.intervalKind,
    status: value.intervalStatus,
    startsAt: value.intervalStartsAt,
    endsAt: value.intervalEndsAt,
    revision: value.revision
  };
}

function baselineAction(actionId: string, task: Item, durationMinutes: number, plannedInterval: ScheduleIntervalSnapshot | null): ScheduleBaselineAction {
  return {
    actionId,
    taskId: task.id,
    title: task.title,
    body: task.body,
    durationMinutes,
    manualRelevance: task.manualRelevance,
    dueAt: task.taskDueAt,
    fixedStartsAt: task.taskFixedStartsAt,
    fixedEndsAt: task.taskFixedEndsAt,
    plannedIntervalId: plannedInterval?.id ?? null,
    unassignedReason: null,
    taskRevision: task.revision,
    taskStatus: task.taskStatus,
    plannedInterval
  };
}

function link(fromId: string, toId: string): ItemLink {
  return {
    id: fromId + "-" + toId,
    ownerId: "owner",
    fromId,
    toId,
    kind: "scheduled_in",
    createdAt: appliedAt,
    updatedAt: appliedAt
  };
}
