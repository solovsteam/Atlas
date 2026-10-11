import assert from "node:assert/strict";
import { test } from "node:test";
import { firstFeasibleWorkBlock } from "../shared/decisionSchedule";
import { buildNowFocus } from "../shared/scheduling/now";
import { selectCalendarEvents, serializeVevent } from "../shared/ics";
import { occurrenceKeysInHorizon } from "../shared/recurrence";
import type { Item } from "../shared/item";
import { taskCountInInterval, type ItemLink } from "../shared/links";
import { indexTaskCountsByInterval } from "../shared/intervalTaskCounts";

const now = new Date("2026-09-24T08:00:00Z");

test("interval task count index matches direct counts, including duplicate scheduled links", () => {
  const links = [
    { kind: "scheduled_in", fromId: "task-a", toId: "interval-a" },
    { kind: "scheduled_in", fromId: "task-a", toId: "interval-a" },
    { kind: "scheduled_in", fromId: "task-b", toId: "interval-b" },
    { kind: "context", fromId: "task-c", toId: "interval-a" }
  ] as ItemLink[];
  const counts = indexTaskCountsByInterval(links);

  for (const intervalId of ["interval-a", "interval-b", "interval-empty"]) {
    assert.equal(counts.get(intervalId) ?? 0, taskCountInInterval(intervalId, links));
  }
});

test("recurrence horizon rejects invalid dates and includes leap days", () => {
  const daily = { frequency: "daily", interval: 1, horizonDays: 2 } as const;
  assert.deepEqual(occurrenceKeysInHorizon(daily, new Date("invalid"), now), []);
  assert.deepEqual(occurrenceKeysInHorizon(daily, now, new Date("invalid")), []);

  assert.deepEqual(occurrenceKeysInHorizon(
    { frequency: "monthly", interval: 12, horizonDays: 1462 },
    new Date(2024, 1, 29),
    new Date(2024, 1, 28)
  ), ["2024-02-29", "2028-02-29"]);
});

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

test("Now prepares intervals once while preserving current half-open boundaries and encounter order", () => {
  const currentA = block("current-a", "2026-09-24T08:00:00Z", "2026-09-24T09:00:00Z");
  const currentB = block("current-b", "2026-09-24T08:00:00Z", "2026-09-24T09:00:00Z");
  const firstTask = task("first-task", 30);
  const secondTask = task("second-task", 30);
  const links = [
    { kind: "scheduled_in", fromId: firstTask.id, toId: currentA.id },
    { kind: "scheduled_in", fromId: secondTask.id, toId: currentB.id }
  ] as ItemLink[];

  const atStart = buildNowFocus([currentA, currentB, firstTask, secondTask], links, now);
  assert.equal(atStart.primary?.item.id, firstTask.id);
  assert.equal(atStart.primary?.reason, "In current-a");
  assert.deepEqual(atStart.committed.map(({ item }) => item.id), [secondTask.id]);

  const atEnd = buildNowFocus([currentA, currentB, firstTask, secondTask], links, new Date("2026-09-24T09:00:00Z"));
  assert.equal(atEnd.primary?.item.id, firstTask.id);
  assert.equal(atEnd.primary?.reason, "Committed today");
});

test("Now matches the link-scan result for overlapping intervals, orphan and duplicate links", () => {
  const currentA = block("overlap-a", "2026-09-24T07:30:00Z", "2026-09-24T09:00:00Z");
  const currentB = block("overlap-b", "2026-09-24T07:00:00Z", "2026-09-24T09:00:00Z");
  const active = task("linked", 30);
  const inactive = { ...task("inactive", 30), taskStatus: "done" as const };
  const links = [
    { kind: "scheduled_in", fromId: active.id, toId: currentB.id },
    { kind: "scheduled_in", fromId: "orphan", toId: currentA.id },
    { kind: "context", fromId: "wrong-kind", toId: currentA.id },
    { kind: "scheduled_in", fromId: active.id, toId: currentA.id },
    { kind: "scheduled_in", fromId: inactive.id, toId: currentA.id },
    { kind: "scheduled_in", fromId: active.id, toId: currentB.id }
  ] as ItemLink[];
  const items = [currentA, currentB, active, inactive];
  const reference = items.flatMap((interval) => {
    if (!interval.isInterval || interval.intervalStatus === "archived") return [];
    const start = Date.parse(interval.intervalStartsAt!);
    const end = Date.parse(interval.intervalEndsAt!);
    return now.getTime() >= start && now.getTime() < end ? [interval] : [];
  }).flatMap((interval) => links
    .filter((link) => link.kind === "scheduled_in" && link.toId === interval.id)
    .map((link) => items.find((item) => item.id === link.fromId))
    .filter((item): item is Item => Boolean(item?.isTask && item.taskStatus === "active")));

  const [first, ...rest] = reference;
  assert.deepEqual(buildNowFocus(items, links, now), {
    primary: { item: first!, reason: `In ${currentA.title}` },
    committed: rest.map((item) => ({ item, reason: "Also in this interval" })),
    suggestion: null
  });
});

test("Now keeps appointment priority and today link deduplication", () => {
  const futureBlock = block("later-today", "2026-09-24T10:00:00Z", "2026-09-24T11:00:00Z");
  const committedTask = task("today-committed", 30);
  const appointment = {
    ...task("live-appointment", 30),
    taskFixedStartsAt: "2026-09-24T07:45:00Z",
    taskFixedEndsAt: "2026-09-24T08:30:00Z"
  };
  const links = [
    { kind: "scheduled_in", fromId: committedTask.id, toId: futureBlock.id },
    { kind: "scheduled_in", fromId: committedTask.id, toId: futureBlock.id }
  ] as ItemLink[];

  assert.deepEqual(buildNowFocus([futureBlock, committedTask, appointment], links, now), {
    primary: { item: appointment, reason: "Fixed appointment now" },
    committed: [],
    suggestion: null
  });
  assert.deepEqual(buildNowFocus([futureBlock, committedTask], links, now), {
    primary: { item: committedTask, reason: "Committed today" },
    committed: [],
    suggestion: null
  });
});

test("Now preserves encounter order for equal motivation and exact suggestion metadata", () => {
  const firstTask = task("tie-first", 30);
  const secondTask = task("tie-second", 30);

  assert.deepEqual(buildNowFocus([firstTask, secondTask], [], now), {
    primary: { item: firstTask, reason: "Highest start-now motivation among unscheduled work" },
    committed: [],
    suggestion: null
  });
});

test("calendar event selection includes scheduled intervals and active appointments, excluding archived and out-of-range items", () => {
  const workBlock = { ...block("work", "2026-09-24T09:00:00Z", "2026-09-24T10:00:00Z"), title: "Focus" };
  const archived = { ...workBlock, id: "archived", intervalStatus: "archived" };
  const committed = { ...task("committed", 30), title: "Write, review" };
  const appointment = {
    ...task("appointment", 30), title: "Call", taskFixedStartsAt: "2026-09-24T11:00:00Z", taskFixedEndsAt: "2026-09-24T11:30:00Z"
  };
  const doneAppointment = {
    ...appointment, id: "done", taskStatus: "done" as const, taskFixedStartsAt: "2026-09-24T12:00:00Z"
  };
  const outside = { ...workBlock, id: "outside", intervalStartsAt: "2026-10-03T09:00:00Z", intervalEndsAt: "2026-10-03T10:00:00Z" };
  const events = selectCalendarEvents(
    [workBlock, archived, committed, appointment, doneAppointment, outside],
    [{ id: "link", ownerId: "owner", fromId: "committed", toId: "work", kind: "scheduled_in", createdAt: "", updatedAt: "" }],
    now
  );

  assert.deepEqual(events.map(({ uid }) => uid), ["atlas-interval-work@atlas", "atlas-appt-appointment@atlas"]);
  assert.equal(events[0].description, "Write, review");
  assert.equal(events[1].description, "Atlas appointment");
});

test("calendar interval descriptions preserve scheduled link order, duplicates, and orphan filtering", () => {
  const firstBlock = block("first-calendar-block", "2026-09-24T09:00:00Z", "2026-09-24T10:00:00Z");
  const secondBlock = block("second-calendar-block", "2026-09-24T10:00:00Z", "2026-09-24T11:00:00Z");
  const firstTask = { ...task("shared-task", 30), title: "Old duplicate" };
  const lastTask = { ...task("shared-task", 30), title: "Current task" };
  const emptyTitleTask = { ...task("empty-title", 30), title: "" };
  const anotherTask = { ...task("another-task", 30), title: "Second task" };
  const links = [
    { kind: "scheduled_in", fromId: "shared-task", toId: firstBlock.id },
    { kind: "context", fromId: "another-task", toId: firstBlock.id },
    { kind: "scheduled_in", fromId: "missing-task", toId: firstBlock.id },
    { kind: "scheduled_in", fromId: "another-task", toId: firstBlock.id },
    { kind: "scheduled_in", fromId: "shared-task", toId: firstBlock.id },
    { kind: "scheduled_in", fromId: "empty-title", toId: firstBlock.id },
    { kind: "scheduled_in", fromId: "another-task", toId: secondBlock.id },
    { kind: "scheduled_in", fromId: "missing-task", toId: secondBlock.id }
  ] as ItemLink[];

  const events = selectCalendarEvents(
    [firstBlock, secondBlock, firstTask, lastTask, emptyTitleTask, anotherTask],
    links,
    now
  );

  assert.deepEqual(events.map(({ uid, description }) => [uid, description]), [
    ["atlas-interval-first-calendar-block@atlas", "Current task, Second task, Current task"],
    ["atlas-interval-second-calendar-block@atlas", "Second task"]
  ]);
});

test("VEVENT serialization escapes text and uses its supplied timestamp", () => {
  const serialized = serializeVevent({
    uid: "event@atlas", start: new Date("2026-09-24T09:00:00Z"), end: new Date("2026-09-24T10:00:00Z"),
    summary: "A, B; C\\D", description: "First\nSecond"
  }, new Date("2026-09-24T08:00:00Z"));

  assert.match(serialized, /DTSTAMP:20260924T080000Z/);
  assert.match(serialized, /SUMMARY:A\\, B\\; C\\\\D/);
  assert.match(serialized, /DESCRIPTION:First\\nSecond/);
});
