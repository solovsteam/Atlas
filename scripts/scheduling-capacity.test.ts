import assert from "node:assert/strict";
import { test } from "node:test";
import type { Item } from "../shared/item";
import type { ItemLink } from "../shared/links";
import { firstFeasibleWorkBlock } from "../shared/decisionSchedule";
import { runScheduler, mergeSchedulerConfig, type IntervalInput, type TaskScheduleInput } from "../shared/scheduling";
import { appointmentOverlapMinutes, constraintMode, intervalCapacityMinutes, intervalIsOpen, taskFitsInterval, resolvedDuration } from "../shared/scheduling/constraints";
import { eligibleTasks } from "../shared/scheduling/eligible";
import { nowMotivation, postponementCost, waitHorizon } from "../shared/scheduling/deferral";
import { bufferedMinutes } from "../shared/scheduling/math";
import { placementBenefit, taskBenefitConstants } from "../shared/scheduling/scoring";
import { createScheduleInputResolver, itemToScheduleInput, itemsToScheduleInputs } from "../shared/scheduling/resolve";
import { buildReview } from "../shared/review";
import { buildNowFocus } from "../shared/scheduling/now";
import { calendarIntervalFromItem, isArchivedSlot } from "../shared/schedule";
import { proposeSchedule } from "../src/services/scheduling";
import { compareItems, sortItemsByRelevance, type RelevanceContext } from "../shared/relevance";
import { calculateSchedulerMetrics } from "../shared/scheduling/metrics";
import { intervalRange } from "../shared/scheduling/constraints";

const date = (hour: string) => `2026-09-24T${hour}:00.000Z`;
const now = new Date(date("08:00"));

test("relevance sort matches direct comparator ordering without changing items or input", () => {
  const items = [
    { id: "inactive", isTask: true, taskStatus: "later", tags: ["work"], manualRelevance: 9, updatedAt: "2026-09-24T10:00:00Z" },
    { id: "note", isTask: false, taskStatus: null, tags: ["home"], manualRelevance: 3, updatedAt: "2026-09-24T11:00:00Z" },
    { id: "active-tagged", isTask: true, taskStatus: "active", tags: ["work"], manualRelevance: 1, updatedAt: "2026-09-24T09:00:00Z" },
    { id: "active-plain", isTask: true, taskStatus: "active", tags: [], manualRelevance: 5, updatedAt: "2026-09-24T08:00:00Z" },
    { id: "active-plain-tie", isTask: true, taskStatus: "active", tags: [], manualRelevance: 5, updatedAt: "2026-09-24T08:00:00Z" }
  ].map((item) => ({ ...item, updatedAt: item.updatedAt }) as unknown as Item);
  const original = [...items];
  const context: RelevanceContext = {
    now, activeTags: ["work"], activeStatusBoosts: ["active"]
  };
  const direct = [...items].sort((a, b) => compareItems(a, b, context));
  const sorted = sortItemsByRelevance(items, context);

  assert.deepEqual(sorted, direct);
  assert.deepEqual(items, original);
  assert.ok(sorted.every((item, index) => item === direct[index]));
  assert.ok(sorted.indexOf(items[3]) < sorted.indexOf(items[4]));
});

test("relevance sort membership handles duplicate tags, statuses, null status, and separate contexts", () => {
  const items = [
    { id: "tagged", isTask: false, taskStatus: null, tags: ["focus", "focus"], manualRelevance: 0, updatedAt: "2026-09-24T09:00:00Z" },
    { id: "boosted", isTask: true, taskStatus: "later", tags: [], manualRelevance: 0, updatedAt: "2026-09-24T08:00:00Z" },
    { id: "null-status", isTask: true, taskStatus: null, tags: [], manualRelevance: 0, updatedAt: "2026-09-24T07:00:00Z" }
  ].map((item) => item as unknown as Item);
  const originalItems = structuredClone(items);
  const context: RelevanceContext = { now, activeTags: ["focus", "focus"], activeStatusBoosts: ["later", "later"] };
  const originalContext = structuredClone(context);
  const first = sortItemsByRelevance(items, context);

  assert.deepEqual(first, [...items].sort((a, b) => compareItems(a, b, context)));
  assert.deepEqual(first.map(({ id }) => id), ["tagged", "boosted", "null-status"]);
  assert.deepEqual(sortItemsByRelevance(items, { ...context, activeTags: [], activeStatusBoosts: [] }).map(({ id }) => id), ["null-status", "tagged", "boosted"]);
  assert.deepEqual(sortItemsByRelevance(items, context), first);
  assert.deepEqual(items, originalItems);
  assert.deepEqual(context, originalContext);
});

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

function directComparatorReference(
  tasks: TaskScheduleInput[], intervals: IntervalInput[], config: ReturnType<typeof mergeSchedulerConfig>
) {
  const classified = eligibleTasks(tasks);
  const ordered = [...classified.candidates].sort((a, b) => nowMotivation(b, config) - nowMotivation(a, config));
  const remaining = new Map(intervals.filter((entry) => intervalIsOpen(entry, config))
    .map((entry) => [entry.id, intervalCapacityMinutes(entry, config)]));
  const assignments: { taskId: string; intervalId: string }[] = [];
  const leftover: TaskScheduleInput[] = [];
  for (const candidate of ordered) {
    let placed = false;
    for (const entry of intervals) {
      const left = remaining.get(entry.id) ?? 0;
      if (!taskFitsInterval(candidate, entry, left, config)) continue;
      remaining.set(entry.id, left - bufferedMinutes(resolvedDuration(candidate, config), config));
      assignments.push({ taskId: candidate.id, intervalId: entry.id });
      placed = true;
      break;
    }
    if (!placed) leftover.push(candidate);
  }
  const unassigned = [...classified.unassigned, ...leftover.map(({ id }) => ({ taskId: id, reason: "no_feasible_interval" as const }))];
  const byId = new Map(tasks.map((entry) => [entry.id, entry]));
  const metrics = {
    totalPostponement: assignments.reduce((total, assignment) => {
      const candidate = byId.get(assignment.taskId)!;
      const entry = intervals.find(({ id }) => id === assignment.intervalId)!;
      return total + postponementCost(candidate, new Date(entry.startsAt), config);
    }, leftover.reduce((total, candidate) => total + postponementCost(candidate, waitHorizon(candidate, config), config), 0)),
    contextSwitches: 0,
    assignedCount: assignments.length,
    unassignedCount: unassigned.length
  };
  return { assignments, unassigned, metrics };
}

test("earliest fit matches the direct motivation comparator across varied task inputs", () => {
  const scenarios = [
    [
      { ...task("tie-a", 30), importance: 7, tags: ["writing"] },
      { ...task("tie-b", 30), importance: 7, tags: ["admin"] },
      { ...task("due-today", 45), importance: 3, dueAt: date("10:00") },
      { ...task("overdue", 20), importance: 2, dueAt: date("07:00") }
    ],
    [
      { ...task("large", 70), importance: 10, tags: ["project", "deep"] },
      { ...task("short", 15), importance: 5, tags: ["quick"] },
      { ...task("tomorrow", 25), importance: 8, dueAt: date("2026-09-25T09:00:00.000Z") },
      { ...task("week", 35), importance: 8, dueAt: "2026-10-01T09:00:00.000Z" }
    ]
  ];
  for (const tasks of scenarios) {
    const intervals = [interval("short-block", date("09:00"), date("10:00")), interval("long-block", date("11:00"), date("13:00"))];
    const config = mergeSchedulerConfig(now, { strategy: "earliest_fit" });
    assert.deepEqual(runScheduler(tasks, intervals, config), directComparatorReference(tasks, intervals, config));
  }
});

test("scheduler result fixtures preserve metrics across strategies, intervals, and leftovers", () => {
  const tasks = [
    { ...task("a1"), parentTaskId: "project", tags: ["a"] },
    { ...task("b1"), importance: 5.1, tags: ["b"] },
    { ...task("a2"), parentTaskId: "project", tags: ["a"] },
    task("left"),
    task("last")
  ];
  const intervals = [
    interval("one", date("09:00"), date("11:00")),
    interval("two", "2026-09-25T09:00:00.000Z", "2026-09-25T10:00:00.000Z")
  ];
  const expected = {
    assignments: [
      { taskId: "b1", intervalId: "one" },
      { taskId: "a1", intervalId: "one" },
      { taskId: "a2", intervalId: "one" },
      { taskId: "left", intervalId: "two" }
    ],
    unassigned: [{ taskId: "last", reason: "no_feasible_interval" }],
    metrics: {
      totalPostponement: 44.870175062084186,
      contextSwitches: 1,
      assignedCount: 4,
      unassignedCount: 1
    }
  };

  for (const strategy of ["earliest_fit", "delta_cost", "delta_cost_switch"] as const) {
    assert.deepEqual(runScheduler(tasks, intervals, mergeSchedulerConfig(now, { strategy })), expected);
  }
});

test("eligible task classification preserves fixed and missing-info precedence", () => {
  const fixedDue = { ...task("fixed-due", 30, date("09:00"), date("10:00")), dueAt: date("11:00") };
  const halfFixed = task("half-fixed", 30, date("09:00"));
  const quickMissing = task("quick-missing", 2, date("09:00"));
  const ordinary = task("ordinary", 30);

  assert.deepEqual(eligibleTasks([fixedDue, halfFixed, quickMissing, ordinary]), {
    candidates: [ordinary],
    unassigned: [
      { taskId: "fixed-due", reason: "excluded" },
      { taskId: "half-fixed", reason: "missing_info" },
      { taskId: "quick-missing", reason: "missing_info" }
    ],
    appointments: [fixedDue]
  });
});

for (const strategy of ["delta_cost", "delta_cost_switch"] as const) {
  test(`${strategy}: per-call benefit caching preserves deadline last chances and reserved capacity`, () => {
    const deadline = { ...task("deadline", 30), importance: 2, dueAt: date("10:00") };
    const valuable = { ...task("valuable", 30), importance: 10 };
    const project = { ...task("project", 30), importance: 7, parentTaskId: "p" };
    const result = runScheduler(
      [deadline, valuable, project],
      [interval("early", date("09:00"), date("10:00")), interval("late", date("11:00"), date("12:00"))],
      mergeSchedulerConfig(now, { strategy }),
      new Map([["early", 20]])
    );

    assert.deepEqual(result, {
      assignments: [
        { taskId: "deadline", intervalId: "early" },
        { taskId: "valuable", intervalId: "late" }
      ],
      unassigned: [{ taskId: "project", reason: "no_feasible_interval" }],
      metrics: {
        totalPostponement: 119.85438596491227,
        contextSwitches: 0,
        assignedCount: 2,
        unassignedCount: 1
      }
    });
  });
}

test("delta scoring reevaluates last chance when later capacity changes", () => {
  const candidate = task("candidate", 30);
  const early = interval("early", date("09:00"), date("10:00"));
  const later = interval("later", date("11:00"), date("12:00"));
  const config = mergeSchedulerConfig(now, { strategy: "delta_cost" });
  const constants = taskBenefitConstants(candidate, config);
  const remaining = new Map([["later", 40]]);

  const withLaterFit = placementBenefit(candidate, constants, early, null, [later], remaining, config);
  remaining.set("later", 0);
  const withoutLaterFit = placementBenefit(candidate, constants, early, null, [later], remaining, config);

  assert.equal(withoutLaterFit - withLaterFit, 80);
});

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

test("schedule input indexing preserves immediate parent semantics and item order", () => {
  const firstParent = item({ id: "parent", taskDueAt: "first due", taskFixedStartsAt: "", taskFixedEndsAt: null as unknown as string,
    expectedDurationMinutes: 45, manualRelevance: 0 });
  const duplicateParent = item({ id: "parent", taskDueAt: "duplicate due", taskFixedStartsAt: "duplicate start",
    taskFixedEndsAt: "duplicate end", expectedDurationMinutes: 90, manualRelevance: 8 });
  const child = item({ id: "child", isTask: true, parentTaskId: "parent", taskDueAt: "", taskFixedStartsAt: null as unknown as string,
    taskFixedEndsAt: "own end", expectedDurationMinutes: null, manualRelevance: 0 });
  const absentParentChild = item({ id: "orphan", isTask: true, parentTaskId: "missing", taskDueAt: "",
    taskFixedStartsAt: null as unknown as string, expectedDurationMinutes: null, manualRelevance: 0 });
  const unrelated = item({ id: "note" });
  const items = [child, unrelated, firstParent, duplicateParent, absentParentChild];

  const actual = itemsToScheduleInputs(items);
  assert.deepEqual(actual, items
    .filter((entry) => entry.isTask && entry.taskStatus === "active")
    .map((entry) => itemToScheduleInput(entry, items)));
  assert.deepEqual(actual.map((entry) => entry.id), ["child", "orphan"]);
  assert.deepEqual(actual[0], {
    id: "child", title: "Item", createdAt: now.toISOString(), importance: 0, durationMinutes: 45,
    dueAt: "first due", fixedStartsAt: null, fixedEndsAt: "own end", parentTaskId: "parent", tags: []
  });
  assert.deepEqual(actual[1], {
    id: "orphan", title: "Item", createdAt: now.toISOString(), importance: 0, durationMinutes: null,
    dueAt: null, fixedStartsAt: null, fixedEndsAt: null, parentTaskId: "missing", tags: []
  });
});

test("per-call schedule resolver matches linear resolution for duplicate, missing, and self parents", () => {
  const firstParent = item({ id: "parent", expectedDurationMinutes: 35, taskDueAt: "2026-09-25T10:00:00Z" });
  const duplicateParent = item({ id: "parent", expectedDurationMinutes: 80, taskDueAt: "" });
  const selfParent = item({ id: "self", isTask: true, parentTaskId: "self", expectedDurationMinutes: null });
  const child = item({ id: "child", isTask: true, parentTaskId: "parent", expectedDurationMinutes: null });
  const orphan = item({ id: "orphan", isTask: true, parentTaskId: "missing", expectedDurationMinutes: null });
  const items = [firstParent, duplicateParent, selfParent, child, orphan];
  const firstCall = createScheduleInputResolver(items);
  const secondCall = createScheduleInputResolver([duplicateParent, firstParent, selfParent, child, orphan]);

  for (const entry of items) {
    assert.deepEqual(firstCall(entry), itemToScheduleInput(entry, items));
  }
  assert.equal(firstCall(child).durationMinutes, 35);
  assert.equal(secondCall(child).durationMinutes, 80);
  assert.equal(firstCall(selfParent).durationMinutes, null);
  assert.equal(firstCall(orphan).durationMinutes, null);
});

test("review and now resolve parent inputs independently per invocation", () => {
  const parent = item({ id: "parent", expectedDurationMinutes: 35, taskDueAt: "" });
  const child = item({ id: "child", title: "Child", isTask: true, parentTaskId: "parent", expectedDurationMinutes: null });
  const missing = item({ id: "missing-child", isTask: true, parentTaskId: "absent", expectedDurationMinutes: null });
  const items = [child, parent, missing];
  const review = buildReview(items, [], now);
  assert.deepEqual(review.unscheduled.map(({ id }) => id), ["child", "missing-child"]);
  assert.deepEqual(buildReview([parent, child, missing], [], now), review);

  const firstNow = buildNowFocus(items, [], now);
  assert.deepEqual(buildNowFocus([parent, child, missing], [], now), firstNow);
});

const workBlock = (id: string, start = date("09:00"), end = date("09:45")) => item({
  id, isInterval: true, intervalKind: "fixed", intervalStatus: "scheduled",
  intervalStartsAt: start, intervalEndsAt: end
});
const scheduledTask = (id: string, minutes: number) => item({ id, isTask: true, expectedDurationMinutes: minutes });
const link = (id: string, fromId: string, toId: string): ItemLink => ({
  id, ownerId: "owner", fromId, toId, kind: "scheduled_in",
  createdAt: now.toISOString(), updatedAt: now.toISOString()
});

function directFirstFeasibleReference(items: Item[], links: ItemLink[], duration: number, at: Date): string | null {
  if (!Number.isFinite(duration) || duration <= 2) return null;
  const config = mergeSchedulerConfig(at);
  const tasks = itemsToScheduleInputs(items);
  const appointments = tasks.filter((entry) => entry.fixedStartsAt && entry.fixedEndsAt);
  const blocks = items.flatMap((entry) => {
    const slot = calendarIntervalFromItem(entry);
    return !slot || slot.kind !== "fixed" || isArchivedSlot(slot) || !slot.startsAt || !slot.endsAt
      ? [] : [{ id: entry.id, title: entry.title, kind: slot.kind, startsAt: slot.startsAt, endsAt: slot.endsAt, archived: false }];
  }).filter((entry) => intervalIsOpen(entry, config) && Date.parse(entry.startsAt) > at.getTime())
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const needed = bufferedMinutes(duration, config);
  return blocks.find((block) => {
    const seen = new Set<string>();
    let reserved = 0;
    for (const scheduled of links) {
      if (scheduled.kind !== "scheduled_in" || scheduled.toId !== block.id || seen.has(scheduled.fromId)) continue;
      const taskInput = tasks.find((entry) => entry.id === scheduled.fromId);
      if (!taskInput || constraintMode(taskInput) === "fixed") continue;
      seen.add(scheduled.fromId);
      reserved += bufferedMinutes(resolvedDuration(taskInput, config), config);
    }
    const free = intervalCapacityMinutes(block, config) - appointmentOverlapMinutes(block, appointments, config) - reserved;
    return free >= needed;
  })?.id ?? null;
}

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

for (const strategy of ["earliest_fit", "delta_cost"] as const) {
  test(`${strategy}: full scheduler result preserves clipped, occupied, and reserved capacity`, () => {
    const tasks = [
      task("appointment-a", 60, date("09:30"), date("10:30")),
      task("appointment-b", 60, date("10:00"), date("11:00")),
      { ...task("deadline", 60), dueAt: date("11:00"), importance: 2 },
      { ...task("other", 20), importance: 10 }
    ];
    const intervals = [interval("clipped", date("09:00"), date("12:00"))];
    const reservations = new Map([["clipped", 5]]);
    const originalTasks = structuredClone(tasks);
    const originalIntervals = structuredClone(intervals);
    const originalReservations = new Map(reservations);

    const result = runScheduler(tasks, intervals,
      mergeSchedulerConfig(now, { strategy, horizonDays: 0.1 }), reservations);

    assert.deepEqual(result, {
      assignments: [{ taskId: "other", intervalId: "clipped" }],
      unassigned: [
        { taskId: "appointment-a", reason: "excluded" },
        { taskId: "appointment-b", reason: "excluded" },
        { taskId: "deadline", reason: "no_feasible_interval" }
      ],
      metrics: {
        totalPostponement: 67.12830134218501,
        contextSwitches: 0,
        assignedCount: 1,
        unassignedCount: 3
      }
    });
    assert.deepEqual(tasks, originalTasks);
    assert.deepEqual(intervals, originalIntervals);
    assert.deepEqual(reservations, originalReservations);
  });
}

test("Atlas preview and Brain handoff reserve duplicate scheduled links once", () => {
  const items = [workBlock("block"), scheduledTask("existing", 20), scheduledTask("new", 15)];
  const links = [link("a", "existing", "block"), link("b", "existing", "block")];
  const result = proposeSchedule(items, now, "delta_cost_switch", { links, taskIds: ["new"] });
  assert.deepEqual(result.assignments, [{ taskId: "new", intervalId: "block" }]);
  assert.equal(firstFeasibleWorkBlock(items, links, 15, now), "block");
});

test("Brain handoff matches a per-block link scan across several occupied blocks", () => {
  const items = [
    workBlock("too-full", date("09:00"), date("09:30")),
    workBlock("exact-fit", date("10:00"), "2026-09-24T10:32:00.000Z"),
    workBlock("later", date("11:00"), date("12:00")),
    scheduledTask("active-a", 20), scheduledTask("active-b", 10),
    item({ ...scheduledTask("released", 25), taskStatus: "done" }),
    item({ ...scheduledTask("appointment", 20), taskFixedStartsAt: date("11:00"), taskFixedEndsAt: date("11:20") })
  ];
  const links = [
    link("a", "active-a", "too-full"), link("a-duplicate", "active-a", "too-full"),
    link("b", "active-b", "exact-fit"), link("released-link", "released", "exact-fit"),
    link("appointment-link", "appointment", "later"), link("unknown", "missing-task", "later")
  ];
  for (const input of [items, [...items].reverse()]) {
    const indexedResult = firstFeasibleWorkBlock(input, links, 15, now);
    assert.equal(indexedResult, directFirstFeasibleReference(input, links, 15, now));
    assert.equal(indexedResult, "exact-fit");
  }
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

test("scheduler sorts equivalent offset starts chronologically and preserves ties in its full result", () => {
  const later = interval("later", "2026-09-24T09:00:00Z", "2026-09-24T10:00:00Z");
  const offsetFirst = interval("offset-first", "2026-09-24T10:00:00+02:00", "2026-09-24T11:00:00+02:00");
  const sameInstant = interval("same-instant", "2026-09-24T08:00:00Z", "2026-09-24T08:30:00Z");
  const allDayTie = { ...interval("all-day-tie", "2026-09-24T08:00:00Z", "2026-09-24T09:00:00Z"), kind: "allDay" as const };
  const result = runScheduler([task("work", 45)], [later, offsetFirst, sameInstant, allDayTie],
    mergeSchedulerConfig(now, { strategy: "earliest_fit" }));

  assert.deepEqual(result, {
    assignments: [{ taskId: "work", intervalId: "offset-first" }],
    unassigned: [],
    metrics: {
      totalPostponement: postponementCost(task("work", 45), new Date("2026-09-24T10:00:00+02:00"), mergeSchedulerConfig(now, { strategy: "earliest_fit" })),
      contextSwitches: 0,
      assignedCount: 1,
      unassignedCount: 0
    }
  });
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

test("scheduler metrics preserve repeated assignment and per-call clipped interval ranges", () => {
  const tasks = [task("a"), { ...task("b"), tags: ["different"] }, task("leftover")];
  const byId = new Map(tasks.map((entry) => [entry.id, entry]));
  const intervals = [
    interval("offset", "2026-09-24T08:30:00+02:00", "2026-09-24T12:00:00+02:00"),
    interval("later", "2026-09-25T09:00:00Z", "2026-09-25T10:00:00Z"),
    interval("invalid", "bad", "also bad")
  ];
  const intervalById = new Map(intervals.map((entry) => [entry.id, entry]));
  const assignments = [
    { taskId: "a", intervalId: "offset" },
    { taskId: "b", intervalId: "offset" },
    { taskId: "a", intervalId: "offset" },
    { taskId: "b", intervalId: "later" },
    { taskId: "a", intervalId: "invalid" },
    { taskId: "b", intervalId: "missing" }
  ];
  const unassigned = [{ taskId: "leftover", reason: "no_feasible_interval" as const }];
  const remaining = new Set(["leftover"]);

  for (const config of [
    mergeSchedulerConfig(new Date("2026-09-24T09:00:00Z"), { horizonDays: 3 }),
    mergeSchedulerConfig(new Date("2026-09-24T10:00:00Z"), { horizonDays: 0.5 })
  ]) {
    const expectedTotal = assignments.reduce((total, assignment) => {
      const range = intervalById.get(assignment.intervalId);
      const start = range ? intervalRange(range, config)?.start ?? config.now : config.now;
      return total + postponementCost(byId.get(assignment.taskId)!, start, config);
    }, postponementCost(tasks[2]!, waitHorizon(tasks[2]!, config), config));
    const expectedSwitches = 2;
    assert.deepEqual(calculateSchedulerMetrics(assignments, unassigned, byId, intervalById, config, remaining), {
      totalPostponement: expectedTotal,
      contextSwitches: expectedSwitches,
      assignedCount: assignments.length,
      unassignedCount: unassigned.length
    });
  }
});
