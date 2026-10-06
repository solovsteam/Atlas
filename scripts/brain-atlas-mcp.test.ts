import assert from "node:assert/strict";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildAtlasScheduleFeedback } from "../src/services/brainTools";
import { createServer } from "./brain-atlas-mcp";
import { itemToDbInsert } from "../shared/item";
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
assert.match(applyTool?.description ?? "", /request.*current conversation/i);
assert.match(applyTool?.description ?? "", /without asking again/i);
assert.equal(tools.tools.filter((tool) => !tool.annotations?.readOnlyHint).length, 1);
assert.match(mcpClient.getInstructions() ?? "", /effect layer/);
const deniedApply = await mcpClient.callTool({
  name: "atlas_apply_schedule_preview",
  arguments: { previewId: "00000000-0000-4000-8000-000000000001", humanApproved: false }
});
assert.equal(deniedApply.isError, true);
assert.match(deniedApply.content[0]?.type === "text" ? deniedApply.content[0].text : "", /human has not requested/i);
await mcpClient.close();
await mcpServer.close();
await effectLayerChecks();
console.log("Atlas Brain MCP, effect-layer and schedule-feedback checks passed.");

// Exercise the actual MCP handlers and services; this inert database rejects
// edits/deletes of items or links and enforces the signed-in account on every query.
async function effectLayerChecks() {
  const now = new Date();
  const block = item("block", { isInterval: true, intervalKind: "work", intervalStartsAt: new Date(now.getTime() + 3600000).toISOString(), intervalEndsAt: new Date(now.getTime() + 5 * 3600000).toISOString() });
  const existing = item("personal", { isTask: true, taskStatus: "active", expectedDurationMinutes: 10 });
  const existingLink = link(existing.id, block.id);
  const rows: Record<string, unknown>[] = [block, existing].map((value) => ({ ...itemToDbInsert(value, "owner"), revision: 1, created_at: appliedAt, updated_at: appliedAt }));
  const linkRows: Record<string, unknown>[] = [{ id: existingLink.id, owner_id: "owner", from_id: existing.id, to_id: block.id, kind: "scheduled_in", created_at: appliedAt, updated_at: appliedAt }];
  const tables: Record<string, Record<string, unknown>[]> = { items: rows, item_links: linkRows, schema_schedule_runs: [] };
  const writes: string[] = [];
  let owner = "owner";
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: owner } }, error: null }) },
    from(table: string) {
      let operation = "read";
      let value: Record<string, unknown> = {};
      const filters: Record<string, unknown> = {};
      const query = {
        select() { return query; },
        eq(key: string, v: unknown) { filters[key] = v; return query; },
        order() { return query; },
        insert(v: Record<string, unknown>) { operation = "insert"; value = v; return query; },
        update(v: Record<string, unknown>) { assert.equal(table, "schema_schedule_runs", "existing Atlas items and links must never be edited"); operation = "update"; value = v; return query; },
        delete() { assert.fail("Atlas effect tools must never delete"); },
        execute(single: boolean) {
          let selected: Record<string, unknown>[];
          if (operation === "insert") {
            assert.equal(value.owner_id, owner);
            if (table === "items") { assert.equal(value.is_task, true); assert.notEqual(value.is_interval, true); }
            if (table === "item_links") assert.equal(value.kind, "scheduled_in");
            const row = { id: "created-" + writes.length, revision: 1, created_at: appliedAt, updated_at: appliedAt, ...value };
            tables[table]!.push(row); selected = [row]; writes.push(table + ":insert");
          } else {
            assert.equal(filters.owner_id, owner, "every read/update must be scoped to the signed-in account");
            selected = tables[table]!.filter((row) => Object.entries(filters).every(([key, v]) => row[key] === v));
            if (operation === "update") { selected.forEach((row) => Object.assign(row, value)); writes.push(table + ":update"); }
          }
          return { data: single ? selected[0] ?? null : selected, error: null };
        },
        single() { return Promise.resolve(query.execute(true)); },
        maybeSingle() { return Promise.resolve(query.execute(true)); },
        then(resolve: (value: unknown) => unknown) { return Promise.resolve(query.execute(false)).then(resolve); }
      };
      return query;
    }
  } as unknown as SupabaseClient<Database>;
  const server = createServer(client);
  const mcp = new Client({ name: "atlas-effect-test", version: "1" });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await Promise.all([mcp.connect(ct), server.connect(st)]);
  const plan = { format: "schema-atlas.schedule-plan", version: 1, schemaRunId: "R-" + "b".repeat(32), createdAt: now.toISOString(), actions: [{ actionId: "A-requested", intention: { id: "I-12345678", createdAt: now.toISOString(), text: "Practice", provenance: "test human request" }, title: "Practice", durationMinutes: 30, reason: "Requested change", schemaIds: ["J-12345678"] }] };
  const preview = async () => {
    const response = await mcp.callTool({ name: "atlas_preview_schema_schedule", arguments: { plan } });
    assert.notEqual(response.isError, true, JSON.stringify(response.content));
    return JSON.parse(response.content[0]?.type === "text" ? response.content[0].text : "{}");
  };
  const apply = (previewId: string) => mcp.callTool({ name: "atlas_apply_schedule_preview", arguments: { previewId, humanApproved: true } });
  const refuses = async (id: string, pattern: RegExp) => {
    const before = writes.length;
    const response = await apply(id);
    assert.equal(response.isError, true);
    assert.match(response.content[0]?.type === "text" ? response.content[0].text : "", pattern);
    assert.equal(writes.length, before, "refusal must precede every write");
  };
  try {
    const first = await preview();
    owner = "foreign";
    await refuses(first.previewId, /different Atlas account/);
    owner = "owner";
    const dateNow = Date.now;
    try {
      Date.now = () => dateNow() + 10 * 60000 + 1;
      await refuses(first.previewId, /expired/);
    } finally { Date.now = dateNow; }
    await refuses("00000000-0000-4000-8000-000000000001", /expired|lost/);
    const stale = await preview();
    rows[0]!.revision = 2;
    await refuses(stale.previewId, /changed after preview/);
    const fresh = await preview();
    // The saved preview owns the exact plan; apply accepts only its ID.
    plan.actions[0]!.title = "Changed outside preview";
    const originals = JSON.stringify({ items: rows.slice(), links: linkRows.slice() });
    const response = await apply(fresh.previewId);
    assert.notEqual(response.isError, true, JSON.stringify(response.content));
    assert.equal(JSON.stringify({ items: rows.slice(0, 2), links: linkRows.slice(0, 1) }), originals);
    assert.equal(rows.length, 3);
    assert.equal(rows[2]!.title, "Practice");
    assert.equal(linkRows.length, 2);
    assert.equal(linkRows[1]!.to_id, block.id);
    assert.equal(linkRows[1]!.from_id, rows[2]!.id);
    assert.equal(linkRows[1]!.kind, "scheduled_in");
    const beforeRetry = writes.length;
    const retried = await apply(fresh.previewId);
    assert.notEqual(retried.isError, true);
    assert.equal(writes.length, beforeRetry, "retry of an applied preview must not duplicate effects");
    // A fresh run reusing an existing deterministic task preserves human edits.
    plan.schemaRunId = "R-" + "c".repeat(32);
    const reuse = await preview();
    const edited = JSON.stringify({ items: rows, links: linkRows });
    const reused = await apply(reuse.previewId);
    assert.notEqual(reused.isError, true, JSON.stringify(reused.content));
    assert.equal(JSON.stringify({ items: rows, links: linkRows }), edited);
  } finally { await mcp.close(); await server.close(); }
}

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
