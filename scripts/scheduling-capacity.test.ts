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
import { itemsToScheduleInputs } from "../shared/scheduling/resolve";
import { calendarIntervalFromItem, isArchivedSlot } from "../shared/schedule";
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
