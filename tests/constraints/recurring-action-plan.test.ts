import test from "node:test";
import assert from "node:assert/strict";
import { generateRecurringPreview, type RoutineSpec } from "../../shared/recurringPreview";
import { prepareRecurringActions, recurringBatchPlan } from "../../shared/recurringActionPlan";

// Invented routine, deliberately independent of personal WEEKLY_CASE fixtures.
function request(): RoutineSpec {
  return {
    version: 1, inputs: {},
    availability: [{ id: "available", title: "Available", source: "Invented", weekdays: [0,1,2,3,4,5,6], start: "06:00", end: "21:40" }],
    commitments: [{ id: "occupied", title: "Occupied", source: "Invented", weekdays: [1,2,3,4,5], start: "10:00", end: "16:00", exclusions: { dates: ["2030-04-22"], source: "Explicit test exception" } }],
    activities: ["practice", "reserve"].map((id) => ({ id, title: id, source: "Invented", kind: id === "reserve" ? "buffer" : "activity", category: "other", recurrence: { weekdays: [0,1,2,3,4,5,6] }, window: { start: "16:00", end: "19:00" }, components: [{ name: "duration", minutes: 25 }], placement: "earliest" })),
    sleep: { id: "sleep", title: "Sleep", source: "Invented", wakeAt: "06:00", targetOnset: "22:00", eyeClosing: "21:40", latencyMinutes: { min: 1, max: 30 }, exerciseGapMinutes: 120, mealGapMinutes: 60 }
  };
}
const horizon = { startDate: "2030-04-22", days: 7 as const };
const zone = { label: "Invented explicit zone", value: "Europe/Berlin" };
const binding = { intention: { id: "I-11111111", createdAt: "2030-01-01T00:00:00Z", text: "Test intention", provenance: "Invented" }, schemaIds: ["J-22222222"] };
const bindings = { practice: binding, reserve: binding };
const preview = (spec = request()) => generateRecurringPreview(spec, horizon, zone);

test("explicit holiday date excludes only the named blocker and changes revision", () => {
  const spec = request(), result = preview(spec);
  assert.equal(result.status, "feasible");
  assert.equal(result.occurrences.filter((o) => o.sourceRuleId === "occupied").length, 4);
  delete spec.commitments[0].exclusions;
  assert.equal(preview(spec).occurrences.filter((o) => o.sourceRuleId === "occupied").length, 5);
  assert.notEqual(preview(spec).specRevision, result.specRevision);
  spec.commitments[0].exclusions = { dates: ["2030-02-30"], source: "Invalid" };
  assert.equal(preview(spec).status, "invalid");
});

test("fourteen invented occurrences split into existing eight-action contract with exact slots and provenance", () => {
  const result = preview(), delta = prepareRecurringActions(result, bindings);
  assert.deepEqual(delta.batches.map((b) => b.actions.length), [8,6]);
  for (const batch of delta.batches) {
    const plan = recurringBatchPlan(batch, `R-${"a".repeat(32)}`, "2030-04-01T00:00:00Z");
    for (const [i, action] of plan.actions.entries()) {
      const o = batch.records[i].occurrence;
      assert.equal(action.durationMinutes, 25);
      assert.equal(batch.slots[i].startsAt, o.startsAt);
      for (const text of [o.id, o.sourceRuleId, result.specRevision, result.generatorVersion]) assert.ok(action.reason.includes(text));
    }
  }
});

test("same revision yields no new action; changed outputs are reported and never replaced", () => {
  const original = preview(), first = prepareRecurringActions(original, bindings);
  const ledger = first.batches.flatMap((b) => b.records), before = JSON.stringify(ledger);
  assert.equal(prepareRecurringActions(original, bindings, ledger).batches.length, 0);
  const spec = request(); spec.activities[0].components[0].minutes = 35;
  spec.activities.push({ ...spec.activities[0], id: "new", title: "New" });
  const next = prepareRecurringActions(preview(spec), { ...bindings, new: binding }, ledger);
  assert.equal(next.changed.length, 14); // later reserves also moved, preserved as reports
  assert.equal(next.batches.flatMap((b) => b.actions).length, 7);
  assert.ok(next.batches.flatMap((b) => b.records).every((r) => r.occurrence.sourceRuleId === "new"));
  assert.equal(JSON.stringify(ledger), before);
  assert.equal(prepareRecurringActions(original, { practice: binding }, ledger).retired.length, 7);
});

test("unresolved previews, malformed bindings, excessive duration and colliding keys fail before staging", () => {
  assert.throws(() => prepareRecurringActions({ ...preview(), status: "incomplete" }, bindings));
  assert.throws(() => prepareRecurringActions(preview(), { practice: { ...binding, schemaIds: [] } }));
  const spec = request(); spec.activities[0].components[0].minutes = 250;
  spec.activities[0].window.end = "21:00";
  assert.throws(() => prepareRecurringActions(preview(spec), bindings));
  const bad = preview(); bad.occurrences.push({ ...bad.occurrences.find((o) => o.sourceRuleId === "practice")!, id: "practice-2030-04-22" });
  assert.throws(() => prepareRecurringActions(bad, bindings), /collision/);
});
