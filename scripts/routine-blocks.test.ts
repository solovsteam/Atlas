import { test } from "node:test";
import assert from "node:assert/strict";
import { isRoutineBlock, newestFirst } from "../shared/routineBlocks";

const pulse = (reason: string) => `Brain action pulse AP-03d20c3a\n\nSchema run R-1\n\nSchema action A-r-breakfast-2026-10-27\n\nReason: ${reason}\n\nMore text`;

test("routine occurrences written by Brain action pulses are routine blocks", () => {
  assert.equal(isRoutineBlock({ isTask: true, body: pulse("Occurrence breakfast@2026-10-27; rule breakfast") }), true);
  assert.equal(isRoutineBlock({ isTask: true, body: pulse("Occurrence buffer@2026-11-02; rule buffer") }), true);
});
test("own tasks and one-off pulse tasks stay in the list", () => {
  assert.equal(isRoutineBlock({ isTask: true, body: "" }), false);
  assert.equal(isRoutineBlock({ isTask: true, body: "Reason: Occurrence breakfast@2026-10-27" }), false);
  assert.equal(isRoutineBlock({ isTask: true, body: pulse("Call the dentist during the lunch break") }), false);
  assert.equal(isRoutineBlock({ isTask: false, body: pulse("Occurrence breakfast@2026-10-27") }), false);
});
test("newest tasks come first", () => {
  const rows = [{ id: "a", createdAt: "2026-10-19T05:00:00Z" }, { id: "b", createdAt: "2026-11-17T09:00:00Z" }, { id: "c", createdAt: "2026-11-01T09:00:00Z" }];
  assert.deepEqual(newestFirst(rows).map(row => row.id), ["b", "c", "a"]);
});
