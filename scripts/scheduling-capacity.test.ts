import assert from "node:assert/strict";
import { test } from "node:test";
import type { Item } from "../shared/item";
import type { ItemLink } from "../shared/links";
import { firstFeasibleWorkBlock } from "../shared/decisionSchedule";
import { runScheduler, mergeSchedulerConfig, type IntervalInput, type TaskScheduleInput } from "../shared/scheduling";
import { intervalCapacityMinutes } from "../shared/scheduling/constraints";
import { proposeSchedule } from "../src/services/scheduling";

const date = (hour: string) => `2026-09-24T${hour}:00.000Z`;
const now = new Date(date("08:00"));

function task(id: string, minutes = 30, fixedStart?: string, fixedEnd?: string): TaskScheduleInput {
  return {
    id, title: id, createdAt: now.toISOString(), importance: 5, durationMinutes: minutes,
    dueAt: null, fixedStartsAt: fixedStart ?? null, fixedEndsAt: fixedEnd ?? null,
    parentTaskId: "", tags: []
  };
}

function interval(id: string, start = date("09:00"), end = date("12:00")): IntervalInput {
  return { id, title: id, kind: "fixed", startsAt: start, endsAt: end, archived: false };
}

function item(partial: Partial<Item>): Item {
  return {
    id: "item", ownerId: "owner", title: "Item", body: "", isTask: false, isInterval: false,
    isDocumentation: false, taskStatus: "active", expectedDurationMinutes: null,
    taskDueAt: "", taskFixedStartsAt: "", taskFixedEndsAt: "", parentTaskId: "",
    manualRelevance: 5, tags: [], completionRule: null, documentationSchema: null,
    documentationData: null, recurrenceRule: null, generatedFromId: "", occurrenceKey: "",
    overriddenFields: [], intervalKind: "", intervalStartsAt: "", intervalEndsAt: "",
    intervalStatus: "", revision: 1, createdAt: now.toISOString(), updatedAt: now.toISOString(),
    ...partial
  };
}

const workBlock = (id: string, start = date("09:00"), end = date("09:45")) => item({
  id, isInterval: true, intervalKind: "fixed", intervalStatus: "scheduled",
  intervalStartsAt: start, intervalEndsAt: end
});
const scheduledTask = (id: string, minutes: number) => item({ id, isTask: true, expectedDurationMinutes: minutes });
const link = (id: string, fromId: string, toId: string): ItemLink => ({
  id, ownerId: "owner", fromId, toId, kind: "scheduled_in",
  createdAt: now.toISOString(), updatedAt: now.toISOString()
});

for (const strategy of ["earliest_fit", "delta_cost", "delta_cost_switch"] as const) {
  test(`${strategy}: elapsed block time cannot hold new work`, () => {
    const result = runScheduler([task("work", 60)], [interval("block")],
      mergeSchedulerConfig(new Date(date("11:30")), { strategy }));
    assert.deepEqual(result.assignments, []);
    assert.deepEqual(result.unassigned, [{ taskId: "work", reason: "no_feasible_interval" }]);
  });

  test(`${strategy}: past appointments do not consume the remaining half hour`, () => {
    const result = runScheduler([task("past", 60, date("09:00"), date("10:00")), task("work", 20)],
      [interval("block")], mergeSchedulerConfig(new Date(date("11:30")), { strategy }));
    assert.deepEqual(result.assignments, [{ taskId: "work", intervalId: "block" }]);
  });

  test(`${strategy}: capacity ends at the declared horizon`, () => {
    const result = runScheduler([task("work", 20)],
      [interval("edge", "2026-09-25T07:45:00Z", "2026-09-25T09:00:00Z")],
      mergeSchedulerConfig(now, { strategy, horizonDays: 1 }));
    assert.deepEqual(result.assignments, []);
  });

  test(`${strategy}: overlapping appointments reserve their union once`, () => {
    const result = runScheduler([
      task("appointment-a", 60, date("09:00"), date("10:00")),
      task("appointment-b", 60, date("09:30"), date("10:30")), task("work", 60)
    ], [interval("block")], mergeSchedulerConfig(now, { strategy }));
    // A three-hour block minus 90 occupied minutes leaves room for 75 buffered minutes.
    assert.deepEqual(result.assignments, [{ taskId: "work", intervalId: "block" }]);
  });

  test(`${strategy}: metrics count each unassigned task once`, () => {
    const result = runScheduler([task("a", 60), task("b", 60)],
      [interval("small", date("09:00"), date("11:00"))], mergeSchedulerConfig(now, { strategy }));
    assert.equal(result.assignments.length, 1);
    assert.equal(result.unassigned.length, 1);
    assert.equal(result.metrics.unassignedCount, 1);
    assert.equal(result.metrics.assignedCount + result.metrics.unassignedCount, 2);
  });
}

test("Atlas preview and Brain handoff reserve duplicate scheduled links once", () => {
  const items = [workBlock("block"), scheduledTask("existing", 20), scheduledTask("new", 15)];
  const links = [link("a", "existing", "block"), link("b", "existing", "block")];
  const result = proposeSchedule(items, now, "delta_cost_switch", { links, taskIds: ["new"] });
  assert.deepEqual(result.assignments, [{ taskId: "new", intervalId: "block" }]);
  assert.equal(firstFeasibleWorkBlock(items, links, 15, now), "block");
});

test("Brain handoff does not reserve a linked appointment twice", () => {
  const appointment = item({ ...scheduledTask("appointment", 20),
    taskFixedStartsAt: date("09:00"), taskFixedEndsAt: date("09:20") });
  const items = [workBlock("block"), appointment];
  assert.equal(firstFeasibleWorkBlock(items, [link("a", "appointment", "block")], 15, now), "block");
});

test("completed linked tasks release capacity in previews and the handoff", () => {
  const items = [workBlock("block"), item({ ...scheduledTask("done", 20), taskStatus: "done" }),
    scheduledTask("new", 15)];
  const links = [link("a", "done", "block")];
  assert.deepEqual(proposeSchedule(items, now, "delta_cost_switch", { links, taskIds: ["new"] }).assignments,
    [{ taskId: "new", intervalId: "block" }]);
  assert.equal(firstFeasibleWorkBlock(items, links, 15, now), "block");
});

test("Brain handoff orders work blocks by actual time across UTC offsets", () => {
  const earlier = workBlock("earlier", "2026-09-24T10:00:00+02:00", "2026-09-24T10:45:00+02:00");
  const later = workBlock("later", "2026-09-24T08:30:00Z", "2026-09-24T09:15:00Z");
  assert.equal(firstFeasibleWorkBlock([later, earlier], [], 15, new Date(date("07:00"))), "earlier");
});

test("all-day capacity uses the actual elapsed time across daylight-saving transitions", () => {
  const spring = { ...interval("spring", "2026-03-29T00:00:00+01:00", "2026-03-30T00:00:00+02:00"), kind: "allDay" };
  const autumn = { ...interval("autumn", "2026-10-25T00:00:00+02:00", "2026-10-26T00:00:00+01:00"), kind: "allDay" };
  assert.equal(intervalCapacityMinutes(spring), 23 * 60);
  assert.equal(intervalCapacityMinutes(autumn), 25 * 60);
});

test("all-day capacity after noon excludes the elapsed morning", () => {
  const allDay = { ...interval("day", date("00:00"), "2026-09-25T00:00:00Z"), kind: "allDay" };
  assert.equal(intervalCapacityMinutes(allDay, mergeSchedulerConfig(new Date(date("12:00")))), 12 * 60);
});

test("a block ending now or starting at the horizon has no usable capacity", () => {
  const config = mergeSchedulerConfig(now, { horizonDays: 1 });
  assert.equal(intervalCapacityMinutes(interval("past", date("07:00"), date("08:00")), config), 0);
  assert.equal(intervalCapacityMinutes(interval("future", "2026-09-25T08:00:00Z", "2026-09-25T09:00:00Z"), config), 0);
});
