import assert from "node:assert/strict";
import { test } from "node:test";
import { firstFeasibleWorkBlock } from "../shared/decisionSchedule";
import type { Item } from "../shared/item";
import type { ItemLink } from "../shared/links";

const now = new Date("2026-09-24T08:00:00Z");

function block(id: string, start: string, end: string): Item {
  return {
    id, title: id, isInterval: true, intervalKind: "fixed", intervalStatus: "scheduled",
    intervalStartsAt: start, intervalEndsAt: end
  } as Item;
}

function task(id: string, minutes: number): Item {
  return {
    id, title: id, isTask: true, taskStatus: "active", expectedDurationMinutes: minutes,
    taskDueAt: "", taskFixedStartsAt: "", taskFixedEndsAt: "", parentTaskId: "",
    manualRelevance: 5, tags: [], createdAt: now.toISOString()
  } as Item;
}

const first = block("first", "2026-09-24T09:00:00Z", "2026-09-24T09:45:00Z");
const second = block("second", "2026-09-24T11:00:00Z", "2026-09-24T12:00:00Z");

test("proposes the first future block with buffered room", () => {
  assert.equal(firstFeasibleWorkBlock([first, second], [], 30, now), "first");
});

test("respects existing scheduled work and leaves no slot when full", () => {
  const link = { kind: "scheduled_in", fromId: "already", toId: "first" } as ItemLink;
  assert.equal(firstFeasibleWorkBlock([first, second, task("already", 20)], [link], 30, now), "second");
  assert.equal(firstFeasibleWorkBlock([first, task("already", 20)], [link], 30, now), null);
});

test("does not treat all-day capacity or elapsed blocks as a specific work block", () => {
  const allDay = { ...first, id: "day", intervalKind: "allDay" };
  const elapsed = block("elapsed", "2026-09-24T07:00:00Z", "2026-09-24T10:00:00Z");
  assert.equal(firstFeasibleWorkBlock([allDay, elapsed], [], 30, now), null);
});

test("an overlapping appointment consumes block capacity", () => {
  const appointment = { ...task("appointment", 20), taskFixedStartsAt: "2026-09-24T09:00:00Z", taskFixedEndsAt: "2026-09-24T09:20:00Z" };
  assert.equal(firstFeasibleWorkBlock([first, second, appointment], [], 30, now), "second");
});
