// Brain's action-pulse adapter (Brain/scripts/atlas-action-pulse.mjs) imports these
// modules by path and calls them with these shapes. It is untyped JavaScript in
// another repository, so without this file an Atlas rename or signature change
// would break Brain's "Schedule in Atlas" button without failing any Atlas check.
// Change Brain's adapter in the same step as anything this file pins.
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import * as items from "../src/services/items";
import * as links from "../src/services/links";
import * as runs from "../src/services/schemaScheduleRuns";
import * as handoff from "../src/services/webHandoff";
import * as plans from "../shared/schemaSchedule";
import type { SchemaSchedulePlan, ScheduleRunBaseline } from "../shared/schemaSchedule";
import type { Database } from "../src/types/database";

const surface = {
  "src/services/items.ts": [items, ["fetchOwnedItems", "createItem", "deleteItem"]],
  "src/services/links.ts": [links, ["fetchOwnedLinks", "createLink", "deleteLink"]],
  "src/services/schemaScheduleRuns.ts": [runs, ["findSchemaScheduleRun", "createSchemaScheduleRun", "updateSchemaScheduleRun", "deleteSchemaScheduleRun"]],
  "src/services/webHandoff.ts": [handoff, ["atlasTaskIdForAction"]],
  "shared/schemaSchedule.ts": [plans, ["parseSchemaSchedulePlan"]]
} as const;

for (const [path, [module, names]] of Object.entries(surface)) {
  for (const name of names) {
    assert.equal(typeof (module as Record<string, unknown>)[name], "function", `${path} must export ${name} for Brain`);
  }
}

// Type-checked by `npm run typecheck:brain-mcp`, never executed: the calls Brain makes.
export async function brainAdapterCalls(client: SupabaseClient<Database>, userId: string, plan: SchemaSchedulePlan, baseline: ScheduleRunBaseline) {
  const parsed = plans.parseSchemaSchedulePlan(plan as unknown);
  const taskId: string = await handoff.atlasTaskIdForAction(parsed.actions[0]);
  await items.fetchOwnedItems(client, userId);
  await links.fetchOwnedLinks(client, userId);
  const run = await runs.findSchemaScheduleRun(client, userId, parsed.schemaRunId)
    ?? await runs.createSchemaScheduleRun(client, userId, { schemaRunId: parsed.schemaRunId, planDigest: "digest", plan: parsed });
  await items.createItem(client, userId, "Block", { id: "block", body: "", isInterval: true, intervalKind: "fixed", intervalStartsAt: "2026-10-03T11:00:00+02:00", intervalEndsAt: "2026-10-03T12:00:00+02:00", intervalStatus: "scheduled" });
  await items.createItem(client, userId, "Task", { id: taskId, body: "", isTask: true, expectedDurationMinutes: 30 });
  await links.createLink(client, userId, taskId, "block", "scheduled_in");
  await runs.updateSchemaScheduleRun(client, userId, run.id, { status: "applied", baseline });
  await links.deleteLink(client, userId, "link");
  await items.deleteItem(client, userId, taskId);
  await runs.deleteSchemaScheduleRun(client, userId, run.id);
}

console.log("Atlas surface used by Brain is intact.");
