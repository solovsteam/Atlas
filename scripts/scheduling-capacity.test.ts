import assert from "node:assert/strict";
import { test } from "node:test";
import type { Item } from "../shared/item";
import type { ItemLink } from "../shared/links";
import { firstFeasibleWorkBlock } from "../shared/decisionSchedule";
import { runScheduler, mergeSchedulerConfig, type IntervalInput, type TaskScheduleInput } from "../shared/scheduling";
import { appointmentOverlapMinutes, constraintMode, intervalCapacityMinutes, intervalIsOpen, taskFitsInterval, resolvedDuration } from "../shared/scheduling/constraints";
import { eligibleTasks } from "../shared/scheduling/eligible";
import { nowMotivation, postponementCost, postponementCostDelta, waitHorizon } from "../shared/scheduling/deferral";
import { switchCost } from "../shared/scheduling/switching";
import type { SchedulerConfig } from "../shared/scheduling/types";
import { bufferedMinutes, valueScore } from "../shared/scheduling/math";
import { placementBenefit, taskBenefitConstants } from "../shared/scheduling/scoring";
import { createScheduleInputResolver, itemToScheduleInput, itemsToScheduleInputs } from "../shared/scheduling/resolve";
import { buildReview } from "../shared/review";
import { buildNowFocus } from "../shared/scheduling/now";
import { calendarIntervalFromItem, isArchivedSlot } from "../shared/schedule";
import { proposeSchedule } from "../src/services/scheduling";
import { buildInboxEntries, collectTags, compareItems, isArchivedTask, isLibraryItem, isParkedTask, searchItems, sortItemsByRelevance, type RelevanceContext } from "../shared/relevance";
import { calculateSchedulerMetrics } from "../shared/scheduling/metrics";
import { intervalRange } from "../shared/scheduling/constraints";
import { buildNudges, nextPendingNudge } from "../shared/nudges";
import { serializeVevent } from "../shared/ics";

type OraclePlan = { assignments: { taskId: string; intervalId: string }[]; unassigned: string[]; metrics: { totalPostponement: number; contextSwitches: number; assignedCount: number } };

// Deliberately tiny reference enumerator: each task occurs in at most one block,
// and each block's ordered task list must fit its buffered capacity.
function exhaustivePlans(tasks: TaskScheduleInput[], intervals: IntervalInput[], config: ReturnType<typeof mergeSchedulerConfig>): OraclePlan[] {
  if (tasks.length > 4 || intervals.length > 3) throw new Error("oracle bound exceeded");
  const plans: OraclePlan[] = [];
  const used = new Set<string>();
  const assigned: { taskId: string; intervalId: string }[] = [];
  const sequences: string[][] = intervals.map(() => []);
  const durations = new Map(tasks.map((task) => [task.id, bufferedMinutes(resolvedDuration(task, config), config)]));
  const capacities = intervals.map((entry) => intervalCapacityMinutes(entry, config));

  function measure(): OraclePlan {
    const byId = new Map(tasks.map((task) => [task.id, task]));
    let totalPostponement = 0;
    let contextSwitches = 0;
    for (const assignment of assigned) {
      const t = byId.get(assignment.taskId)!;
      const block = intervals.find(({ id }) => id === assignment.intervalId)!;
      const days = Math.max(0, (new Date(block.startsAt).getTime() - config.now.getTime()) / 86_400_000);
      const value = Math.max(0, Math.min(100, t.importance * 10));
      const due = t.dueAt ? new Date(t.dueAt).getTime() : NaN;
      const cost = Number.isFinite(due)
        ? config.urgencyWeight * (due <= new Date(block.startsAt).getTime() ? 100 : 100 / (1 + config.gamma * (due - new Date(block.startsAt).getTime()) / 86_400_000)) + config.valueWeight * value
        : value * (1 - 1 / (1 + config.gamma * days / 7));
      totalPostponement += cost;
    }
    for (const id of tasks.filter(({ id }) => !used.has(id)).map(({ id }) => id)) {
      const t = byId.get(id)!;
      const horizon = new Date(config.now.getTime() + config.horizonDays * 86_400_000);
      const due = t.dueAt ? new Date(t.dueAt) : null;
      const at = due && due < horizon ? due : horizon;
      const days = Math.max(0, (at.getTime() - config.now.getTime()) / 86_400_000);
      const value = Math.max(0, Math.min(100, t.importance * 10));
      const cost = due
        ? config.urgencyWeight * (at >= due ? 100 : 100 / (1 + config.gamma * (due.getTime() - at.getTime()) / 86_400_000)) + config.valueWeight * value
        : value * (1 - 1 / (1 + config.gamma * days / 7));
      totalPostponement += cost;
    }
    for (const sequence of sequences) for (let i = 1; i < sequence.length; i += 1) {
      const a = byId.get(sequence[i - 1]!)!;
      const b = byId.get(sequence[i]!)!;
      if (!(a.parentTaskId && a.parentTaskId === b.parentTaskId) && !(b.parentTaskId && (b.parentTaskId === a.id || a.parentTaskId === b.id)) && !b.tags.some((tag) => tag && a.tags.includes(tag))) contextSwitches += 1;
    }
    return { assignments: [...assigned], unassigned: tasks.filter(({ id }) => !used.has(id)).map(({ id }) => id), metrics: { totalPostponement, contextSwitches, assignedCount: assigned.length } };
  }
  function addBlock(index: number) {
    if (index === intervals.length) { plans.push(measure()); return; }
    const block = intervals[index]!;
    const seq = sequences[index]!;
    const remaining = capacities[index]!;
    function extend(left: number) {
      addBlock(index + 1);
      for (const task of tasks) {
        if (used.has(task.id) || !taskFitsInterval(task, block, left, config)) continue;
        const size = durations.get(task.id)!;
        used.add(task.id); seq.push(task.id); assigned.push({ taskId: task.id, intervalId: block.id });
        extend(left - size);
        assigned.pop(); seq.pop(); used.delete(task.id);
      }
    }
    extend(remaining);
  }
  addBlock(0);
  return plans;
}

function paretoPlans(plans: OraclePlan[]): OraclePlan[] {
  return plans.filter((candidate) => !plans.some((other) => other !== candidate &&
    other.metrics.totalPostponement <= candidate.metrics.totalPostponement &&
    other.metrics.contextSwitches <= candidate.metrics.contextSwitches &&
    other.metrics.assignedCount >= candidate.metrics.assignedCount &&
    (other.metrics.totalPostponement < candidate.metrics.totalPostponement || other.metrics.contextSwitches < candidate.metrics.contextSwitches || other.metrics.assignedCount > candidate.metrics.assignedCount)));
}

test("bounded exhaustive oracle enumerates tiny plans and compares heuristics to its Pareto frontier", () => {
  const one = exhaustivePlans([task("a", 30), task("b", 30)], [interval("only", date("09:00"), date("10:30"))], mergeSchedulerConfig(now));
  assert.equal(one.length, 5); // empty, either singleton, and both possible orders
  assert.deepEqual(one.map(({ assignments }) => assignments.length).sort(), [0, 1, 1, 2, 2]);
  const fixtures = [
    { tasks: [task("a", 30), { ...task("b", 30), importance: 8, tags: ["x"] }, { ...task("c", 30), importance: 4, tags: ["x"] }], blocks: [interval("am", date("09:00"), date("10:30"))] },
    { tasks: [{ ...task("urgent", 30), dueAt: date("10:00") }, task("flex", 30), task("left", 60)], blocks: [interval("am", date("09:00"), date("10:00")), interval("pm", date("11:00"), date("12:00"))] },
    { tasks: [task("p", 30), { ...task("q", 30), tags: ["same"] }, { ...task("r", 30), tags: ["same"] }, task("s", 30)], blocks: [interval("a", date("09:00"), date("10:00")), interval("b", date("11:00"), date("12:00"))] }
  ];
  for (const fixture of fixtures) {
    const configBase = mergeSchedulerConfig(now);
    const frontier = paretoPlans(exhaustivePlans(fixture.tasks, fixture.blocks, configBase));
    assert.ok(frontier.length > 0);
    for (const strategy of ["earliest_fit", "delta_cost", "delta_cost_switch"] as const) {
      const config = mergeSchedulerConfig(now, { strategy });
      const result = runScheduler(fixture.tasks, fixture.blocks, config);
      const oraclePlan = exhaustivePlans(fixture.tasks, fixture.blocks, config).find((plan) =>
        JSON.stringify(plan.assignments) === JSON.stringify(result.assignments));
      assert.ok(oraclePlan, `${strategy} assignment/order must be in the exhaustive feasible set`);
      const usedIds = result.assignments.map(({ taskId }) => taskId);
      assert.equal(new Set(usedIds).size, usedIds.length);
      assert.ok(result.assignments.every(({ taskId, intervalId }) => {
        const t = fixture.tasks.find(({ id }) => id === taskId)!;
        const block = fixture.blocks.find(({ id }) => id === intervalId)!;
        return !!t && !!block && taskFitsInterval(t, block, intervalCapacityMinutes(block, config), config);
      }));
      assert.equal(result.metrics.assignedCount, usedIds.length);
      assert.ok(Math.abs(result.metrics.totalPostponement - oraclePlan.metrics.totalPostponement) < 1e-8);
      assert.equal(result.metrics.contextSwitches, oraclePlan.metrics.contextSwitches);
      assert.ok(frontier.every((candidate) => !frontier.some((other) => other !== candidate &&
        other.metrics.totalPostponement <= candidate.metrics.totalPostponement &&
        other.metrics.contextSwitches <= candidate.metrics.contextSwitches &&
        other.metrics.assignedCount >= candidate.metrics.assignedCount &&
        (other.metrics.totalPostponement < candidate.metrics.totalPostponement || other.metrics.contextSwitches < candidate.metrics.contextSwitches || other.metrics.assignedCount > candidate.metrics.assignedCount))));
    }
  }
});

const date = (hour: string) => `2026-09-24T${hour}:00.000Z`;
const now = new Date(date("08:00"));

test("tiny oracle records packing and ordering Pareto counterexamples at default weights", () => {
  // A short, fixed search list; no appointments, reservations, or policy overrides.
  // These are local counterexamples, not a demand for heuristic optimality.
  // Observed 2026-10-11: all three strategies choose [large] in packing,
  // (postponement 90.4733727810651, switches 0, assigned 1), dominated by
  // [small-a, small-b] (60.710059171597635, 0, 2) in the 76-minute block.
  // In ordering, earliest_fit and delta_cost choose [high, middle, low]
  // (170/169, 2, 3); [middle, high, low] has (170/169, 1, 3).
  // delta_cost_switch chooses [high, low, middle], also with one switch.
  const fixtures = [
    {
      name: "packing",
      tasks: [
        { ...task("large", 60), importance: 8, tags: ["same"] },
        { ...task("small-a", 30), importance: 6, tags: ["same"] },
        { ...task("small-b", 30), importance: 6, tags: ["same"] }
      ],
      block: interval("only", date("09:00"), date("10:16")),
      baseline: ["large"], witness: ["small-a", "small-b"],
      baselineCost: 80 / 169 + 120 * 3 / 4,
      witnessCost: 120 / 169 + 80 * 3 / 4,
      baselineSwitches: 0, witnessSwitches: 0,
      strategies: ["earliest_fit", "delta_cost", "delta_cost_switch"] as const
    },
    {
      name: "ordering",
      tasks: [
        { ...task("high", 30), importance: 8, tags: ["same"] },
        task("middle", 30),
        { ...task("low", 30), importance: 4, tags: ["same"] }
      ],
      block: interval("only", date("09:00"), date("11:00")),
      baseline: ["high", "middle", "low"], witness: ["middle", "high", "low"],
      baselineCost: 170 / 169, witnessCost: 170 / 169,
      baselineSwitches: 2, witnessSwitches: 1,
      strategies: ["earliest_fit", "delta_cost"] as const
    }
  ];
  for (const fixture of fixtures) {
    const config = mergeSchedulerConfig(now);
    const plans = exhaustivePlans(fixture.tasks, [fixture.block], config);
    const find = (ids: string[]) => plans.find((plan) =>
      JSON.stringify(plan.assignments.map(({ taskId }) => taskId)) === JSON.stringify(ids));
    const baseline = find(fixture.baseline);
    const witness = find(fixture.witness);
    assert.ok(baseline, fixture.name);
    assert.ok(witness, fixture.name);
    // Independent arithmetic: ceil(duration*1.25) gives 75 and 38 minutes.
    // At 09:00, one hour / seven days gives cost value/169;
    // the default 21-day leftover horizon gives cost value*3/4.
    for (const [plan, cost, switches, count] of [
      [baseline, fixture.baselineCost, fixture.baselineSwitches, fixture.baseline.length],
      [witness, fixture.witnessCost, fixture.witnessSwitches, fixture.witness.length]
    ] as const) {
      assert.ok(Math.abs(plan.metrics.totalPostponement - cost) < 1e-10);
      assert.equal(plan.metrics.contextSwitches, switches);
      assert.equal(plan.metrics.assignedCount, count);
    }
    assert.ok(fixture.witnessCost <= fixture.baselineCost);
    assert.ok(fixture.witnessSwitches <= fixture.baselineSwitches);
    assert.ok(fixture.witness.length >= fixture.baseline.length);
    assert.ok(fixture.witnessCost < fixture.baselineCost ||
      fixture.witnessSwitches < fixture.baselineSwitches || fixture.witness.length > fixture.baseline.length);
    assert.ok(paretoPlans(plans).includes(witness), `${fixture.name}: witness is nondominated in the exhaustive set`);
    assert.ok(!paretoPlans(plans).includes(baseline), `${fixture.name}: baseline is dominated`);
    for (const strategy of fixture.strategies) {
      const result = runScheduler(fixture.tasks, [fixture.block], mergeSchedulerConfig(now, { strategy }));
      // Check oracle facts even if a future heuristic improves: do not require
      // it to stay suboptimal, or to become optimal, on these fixtures.
      const actual = find(result.assignments.map(({ taskId }) => taskId));
      assert.ok(actual, `${fixture.name}/${strategy}: feasible oracle plan`);
      assert.ok(Math.abs(result.metrics.totalPostponement - actual.metrics.totalPostponement) < 1e-10);
      assert.equal(result.metrics.contextSwitches, actual.metrics.contextSwitches);
      assert.equal(result.metrics.assignedCount, actual.metrics.assignedCount);
    }
  }
});

// Ordinary relevance regressions: reuse the full Item helper below.
for (const fixture of [
  {
    name: "active tag match precedes status boost and all lower signals",
    context: { activeTags: ["focus"], activeStatusBoosts: ["active"] },
    first: { isTask: true, taskStatus: "done", tags: ["focus"], manualRelevance: -10 },
    second: { isTask: true, taskStatus: "active", manualRelevance: 100, updatedAt: date("12:00") }
  },
  {
    name: "enabled status boost precedes active tasks and all lower signals",
    context: { activeTags: [], activeStatusBoosts: ["done"] },
    first: { isTask: true, taskStatus: "done", manualRelevance: -10 },
    second: { isTask: true, taskStatus: "active", manualRelevance: 100, updatedAt: date("12:00") }
  },
  {
    name: "active tasks precede notes despite lower relevance and older updates",
    context: { activeTags: [], activeStatusBoosts: [] },
    first: { isTask: true, taskStatus: "active", manualRelevance: -10 },
    second: { isTask: false, manualRelevance: 100, updatedAt: date("12:00") }
  },
  {
    name: "notes precede inactive tasks despite lower relevance and older updates",
    context: { activeTags: [], activeStatusBoosts: [] },
    first: { isTask: false, manualRelevance: -10 },
    second: { isTask: true, taskStatus: "later", manualRelevance: 100, updatedAt: date("12:00") }
  },
  {
    name: "higher manual relevance precedes newer updates",
    context: { activeTags: [], activeStatusBoosts: [] },
    first: { manualRelevance: 6 },
    second: { manualRelevance: 5, updatedAt: date("12:00") }
  },
  {
    name: "newer updatedAt breaks otherwise equal ranks",
    context: { activeTags: [], activeStatusBoosts: [] },
    first: { updatedAt: date("12:00") },
    second: { updatedAt: date("09:00") }
  }
] satisfies { name: string; context: Pick<RelevanceContext, "activeTags" | "activeStatusBoosts">; first: Partial<Item>; second: Partial<Item> }[]) {
  test(`relevance precedence: ${fixture.name}`, () => {
    const first = item({ ...fixture.first, id: "first" });
    const second = item({ ...fixture.second, id: "second" });
    const context = { now, ...fixture.context };
    assert.ok(compareItems(first, second, context) < 0);
    assert.deepEqual(sortItemsByRelevance([second, first], context), [first, second]);
  });
}

test("relevance sort and inbox agree with a stable comparator sort on 500 seeded random lists", () => {
  let seed = 0x3e36aa94;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const pick = <T,>(values: readonly T[]): T => values[Math.floor(random() * values.length)]!;
  const taskStatuses = ["active", "later", "done", "cancelled"] as const;
  const statuses = [...taskStatuses, null];
  const tags = ["focus", "home", "work", ""];
  const contextKinds = new Set<string>();
  for (let trial = 0; trial < 500; trial += 1) {
    const context: RelevanceContext = {
      now,
      activeTags: random() < 0.5 ? [] : [pick(tags), pick(tags)],
      activeStatusBoosts: random() < 0.5 ? [] : [pick(taskStatuses), pick(taskStatuses)]
    };
    contextKinds.add(`${context.activeTags.length > 0}/${context.activeStatusBoosts.length > 0}`);
    const items = Array.from({ length: Math.floor(random() * 13) }, (_, index) => item({
      id: `${trial}-${index}`, isTask: random() < 0.5, taskStatus: pick(statuses),
      tags: Array.from({ length: Math.floor(random() * 4) }, () => pick(tags)),
      manualRelevance: pick([-5, 0, 1, 5, 10]),
      updatedAt: pick([date("08:00"), date("12:00"), "2026-09-24T10:00:00+02:00", "2026-09-23T23:00:00-05:00"])
    }));
    const snapshot = structuredClone(items);
    // Native Array.sort is stable; this independently exercises compareItems
    // rather than the decorated sort's cached signal/membership path.
    const expected = [...items].sort((a, b) => compareItems(a, b, context));
    const actual = sortItemsByRelevance(items, context);
    assert.deepEqual(actual, expected, `seed 0x3e36aa94, trial ${trial}`);
    assert.notEqual(actual, items, `trial ${trial}: new array even for empty inputs`);
    assert.deepEqual(buildInboxEntries(items, context), expected, `trial ${trial}: inbox`);
    assert.deepEqual(items, snapshot, `trial ${trial}: no mutation`);
    assert.ok(actual.every((entry, index) => entry === expected[index]), "original item identities");

    const comparisons = items.map((a) => items.map((b) => compareItems(a, b, context)));
    for (let a = 0; a < items.length; a += 1) {
      for (let b = 0; b < items.length; b += 1) {
        assert.equal(Math.sign(comparisons[a][b]) + Math.sign(comparisons[b][a]), 0,
          `trial ${trial}: antisymmetry ${a}/${b}`);
        for (let c = 0; c < items.length; c += 1) {
          if (comparisons[a][b] <= 0 && comparisons[b][c] <= 0) {
            assert.ok(comparisons[a][c] <= 0, `trial ${trial}: transitivity ${a}/${b}/${c}`);
          }
        }
      }
    }
  }
  assert.equal(contextKinds.size, 4, "seed covers empty/non-empty tags and boosts in all combinations");
});

test("relevance full ties retain input order without using IDs as a tiebreaker", () => {
  const items = ["z", "a", "m"].map((id) => item({ id }));
  const context: RelevanceContext = { now, activeTags: [], activeStatusBoosts: [] };
  assert.equal(compareItems(items[0], items[1], context), 0);
  assert.deepEqual(sortItemsByRelevance(items, context), items);
  assert.deepEqual(sortItemsByRelevance([...items].reverse(), context), [...items].reverse());
});

test("collectTags de-duplicates, drops empty tags, and sorts", () => {
  assert.deepEqual(collectTags([
    item({ tags: ["z", "a", "", "a"] }), item({ tags: ["m", "z", ""] }), item({ tags: [] })
  ]), ["a", "m", "z"]);
  assert.deepEqual(collectTags([]), []);
});

test("archive, parked, and library predicates cover every task status and notes", () => {
  for (const taskStatus of ["active", "later", "done", "cancelled", null] as const) {
    for (const isTask of [true, false]) {
      const entry = item({ isTask, taskStatus });
      const label = `${isTask ? "task" : "note"}/${taskStatus}`;
      const archived = isTask && (taskStatus === "done" || taskStatus === "cancelled");
      assert.equal(isArchivedTask(entry), archived, label);
      assert.equal(isParkedTask(entry), isTask && taskStatus === "later", label);
      assert.equal(isLibraryItem(entry), !archived, label);
    }
  }
});

test("search trims and matches title or body case-insensitively, newest update first", () => {
  const title = item({ id: "title", title: "A NEEDLE here", updatedAt: date("09:00") });
  const body = item({ id: "body", title: "Other", body: "A Needle in the body", updatedAt: date("12:00") });
  const nonMatch = item({ id: "non-match", tags: ["needle"] });
  const items = [title, nonMatch, body];
  const snapshot = structuredClone(items);
  assert.deepEqual(searchItems(items, "  nEeDlE \n"), [body, title]);
  assert.deepEqual(searchItems(items, "absent"), []);
  assert.deepEqual(searchItems(items, ""), []);
  assert.deepEqual(searchItems(items, " \t\n "), []);
  assert.deepEqual(items, snapshot);
});

for (const mode of ["relevance", "search"] as const) {
  test(`current behavior: ${mode} compares updatedAt strings rather than UTC-offset instants`, () => {
    const earlier = item({ id: "earlier-instant", title: "match", updatedAt: "2026-09-24T10:00:00+02:00" });
    const later = item({ id: "later-instant", title: "match", updatedAt: "2026-09-24T08:30:00Z" });
    assert.ok(Date.parse(earlier.updatedAt) < Date.parse(later.updatedAt));
    const context: RelevanceContext = { now, activeTags: [], activeStatusBoosts: [] };
    assert.ok(compareItems(earlier, later, context) < 0);
    const result = mode === "relevance"
      ? sortItemsByRelevance([later, earlier], context)
      : searchItems([later, earlier], "match");
    assert.deepEqual(result, [earlier, later]);
  });
}

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

test("relevance comparator laws hold across item and context signals", () => {
  const statuses = ["active", "later", "done", "cancelled", null] as const;
  const items = statuses.flatMap((status, statusIndex) => [false, true].map((isTask) => ({
    id: `${isTask ? "task" : "note"}-${statusIndex}`,
    isTask,
    taskStatus: isTask ? status : null,
    tags: statusIndex % 2 === 0 ? ["focus"] : [],
    manualRelevance: statusIndex % 2,
    updatedAt: `2026-09-24T${String(8 + Math.floor(statusIndex / 2)).padStart(2, "0")}:00:00Z`
  } as unknown as Item)));
  const contexts: RelevanceContext[] = [
    { now, activeTags: [], activeStatusBoosts: [] },
    { now, activeTags: ["focus"], activeStatusBoosts: [] },
    { now, activeTags: [], activeStatusBoosts: ["later"] },
    { now, activeTags: ["focus"], activeStatusBoosts: ["active", "later"] }
  ];

  for (const context of contexts) {
    for (const a of items) {
      for (const b of items) {
        const ab = Math.sign(compareItems(a, b, context));
        const ba = Math.sign(compareItems(b, a, context));
        assert.equal(ab + ba, 0, `antisymmetry failed for ${a.id}, ${b.id}`);
      }
    }
    for (const a of items) {
      for (const b of items) {
        for (const c of items) {
          if (compareItems(a, b, context) <= 0 && compareItems(b, c, context) <= 0) {
            assert.ok(compareItems(a, c, context) <= 0, `transitivity failed for ${a.id}, ${b.id}, ${c.id}`);
          }
        }
      }
    }

    // Equal rank signals and timestamps leave a comparator tie; sorting must
    // preserve those object references and their input order without mutation.
    const tied = ["tie-a", "tie-b", "tie-c"].map((id) => ({
      id, isTask: true, taskStatus: "active", tags: ["focus"],
      manualRelevance: 4, updatedAt: "2026-09-24T12:00:00Z"
    } as unknown as Item));
    const input = [...items, ...tied];
    const snapshot = structuredClone(input);
    const sorted = sortItemsByRelevance(input, context);
    assert.deepEqual(input, snapshot);
    assert.ok(sorted.every((item) => input.includes(item)), "sort must return original item objects");
    assert.deepEqual(sorted.filter((item) => tied.includes(item)).map(({ id }) => id), ["tie-a", "tie-b", "tie-c"]);
  }
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

for (const strategy of ["earliest_fit", "delta_cost", "delta_cost_switch"] as const) {
  test(`${strategy}: empty and filtered scheduler inputs return complete finite deterministic results`, () => {
    const config = mergeSchedulerConfig(now, { strategy });
    const excluded = task("excluded", 2, date("09:00"), date("10:00"));
    const quick = task("quick", 2);
    const missing = task("missing", 2, date("09:00"));
    const filtered = [excluded, quick, missing];
    const rejected = [
      { taskId: "excluded", reason: "excluded" as const },
      { taskId: "quick", reason: "quick" as const },
      { taskId: "missing", reason: "missing_info" as const }
    ];
    const closed = [
      interval("elapsed", date("06:00"), date("08:00")),
      interval("horizon", "2026-10-15T08:00:00Z", "2026-10-15T09:00:00Z"),
      { ...interval("archived"), archived: true }
    ];
    const invalidRanges = [
      interval("invalid-start", "not-a-date", date("10:00")),
      interval("invalid-end", date("09:00"), "not-a-date"),
      interval("blank-start", "", date("10:00")),
      interval("blank-end", date("09:00"), ""),
      interval("equal", date("09:00"), date("09:00")),
      interval("reversed", date("10:00"), date("09:00")),
      { ...interval("all-day-invalid-start", "not-a-date", ""), kind: "allDay" }
    ];
    type Case = {
      name: string; tasks: TaskScheduleInput[]; intervals: IntervalInput[];
      assignments: { taskId: string; intervalId: string }[];
      unassigned: ReturnType<typeof runScheduler>["unassigned"]; cost: number;
    };
    const leftover = [{ taskId: "work", reason: "no_feasible_interval" as const }];
    const cases: Case[] = [
      { name: "both empty", tasks: [], intervals: [], assignments: [], unassigned: [], cost: 0 },
      { name: "empty tasks", tasks: [], intervals: [interval("open")], assignments: [], unassigned: [], cost: 0 },
      // Default flexible value 50 deferred by 21 days: 50 * (1 - 1 / 4).
      { name: "empty intervals", tasks: [task("work")], intervals: [], assignments: [], unassigned: leftover, cost: 37.5 },
      { name: "no open intervals", tasks: [task("work")], intervals: closed, assignments: [], unassigned: leftover, cost: 37.5 },
      ...invalidRanges.map((block) => ({ name: block.id, tasks: [task("work")], intervals: [block], assignments: [], unassigned: leftover, cost: 37.5 })),
      ...filtered.map((entry, index) => ({ name: `only ${entry.id}`, tasks: [entry], intervals: [interval("open")], assignments: [], unassigned: [rejected[index]!], cost: 0 })),
      { name: "all filtered", tasks: filtered, intervals: [interval("open")], assignments: [], unassigned: rejected, cost: 0 },
      { name: "all filtered without intervals", tasks: filtered, intervals: [], assignments: [], unassigned: rejected, cost: 0 },
      { name: "archived before live", tasks: [task("work")], intervals: [
        { ...interval("archived", date("08:00")), archived: true },
        interval("live", date("08:00"))
      ], assignments: [{ taskId: "work", intervalId: "live" }], unassigned: [], cost: 0 },
      // Existing all-day semantics recover missing, invalid, equal and reversed
      // ends to the next local midnight; fixed ranges above do not recover.
      ...["", "not-a-date", date("08:00"), date("07:00")].map((end) => ({
        name: `all-day fallback ${end}`, tasks: [task("work")],
        intervals: [{ ...interval("day", date("08:00"), end), kind: "allDay" }],
        assignments: [{ taskId: "work", intervalId: "day" }], unassigned: [], cost: 0
      }))
    ];
    for (const fixture of cases) {
      const snapshot = structuredClone({ tasks: fixture.tasks, intervals: fixture.intervals, config });
      const expected = {
        assignments: fixture.assignments, unassigned: fixture.unassigned,
        metrics: { totalPostponement: fixture.cost, contextSwitches: 0,
          assignedCount: fixture.assignments.length, unassignedCount: fixture.unassigned.length }
      };
      for (let repeat = 0; repeat < 3; repeat += 1) {
        let result: ReturnType<typeof runScheduler> | undefined;
        assert.doesNotThrow(() => { result = runScheduler(fixture.tasks, fixture.intervals, config); }, fixture.name);
        assert.deepEqual(result, expected, `${fixture.name}: repeat ${repeat}, complete result`);
        assert.ok(Object.values(result!.metrics).every(Number.isFinite), `${fixture.name}: finite metrics`);
        assert.deepEqual({ tasks: fixture.tasks, intervals: fixture.intervals, config }, snapshot, `${fixture.name}: inputs unchanged`);
      }
    }
  });

  test(`${strategy}: equivalent chronological starts retain caller tie order deterministically`, () => {
    const config = mergeSchedulerConfig(now, { strategy });
    const tasks = [task("work")];
    const a = interval("a", "2026-09-24T10:00:00+02:00", "2026-09-24T11:00:00+02:00");
    const b = interval("b", date("08:00"), date("09:00"));
    const later = interval("later", date("09:00"), date("10:00"));
    for (const ties of [[a, b], [b, a]]) {
      const blocks = [later, ...ties];
      const snapshot = structuredClone({ tasks, blocks, config });
      for (let repeat = 0; repeat < 3; repeat += 1) {
        let result: ReturnType<typeof runScheduler> | undefined;
        assert.doesNotThrow(() => { result = runScheduler(tasks, blocks, config); });
        assert.deepEqual(result, {
          assignments: [{ taskId: "work", intervalId: ties[0]!.id }], unassigned: [],
          metrics: { totalPostponement: 0, contextSwitches: 0, assignedCount: 1, unassignedCount: 0 }
        });
        assert.ok(Object.values(result!.metrics).every(Number.isFinite));
        assert.deepEqual({ tasks, blocks, config }, snapshot);
      }
    }
  });
}

test("appointment union matches a bounded minute-grid oracle across clipping and permutations", () => {
  const at = (minute: number) => new Date(now.getTime() + minute * 60_000).toISOString();
  type Span = readonly [number, number];
  const endpoints = [-2, 0, 2, 4, 6, 8];
  const spans: Span[] = endpoints.flatMap((start) =>
    endpoints.filter((end) => end > start).map((end) => [start, end] as const));
  const cases: Span[][] = [
    [], [[-2, 8], [0, 6], [2, 4]], // nested
    [[-2, 2], [0, 4], [2, 6]], // overlap chain
    [[-2, 0], [0, 2], [2, 4]], // touching half-open spans
    [[0, 4], [0, 4], [6, 8]] // duplicates and a gap
  ];
  for (const a of spans) for (const b of spans) cases.push([a, b]);
  const permutations = (entries: TaskScheduleInput[]): TaskScheduleInput[][] =>
    entries.length === 0 ? [[]] : entries.flatMap((entry, index) =>
      permutations(entries.filter((_, other) => other !== index)).map((rest) => [entry, ...rest]));
  const ranges: Span[] = [[-2, 8], [-2, 2], [4, 8], [-2, 0], [6, 8], [2, 4], [4, 4], [4, 2]];
  const clipped = mergeSchedulerConfig(now, { horizonDays: 6 / 1440 });

  for (const config of [undefined, clipped]) for (const [start, end] of ranges) {
    const block = interval("grid", at(start), at(end));
    for (const [caseIndex, entries] of cases.entries()) {
      // Independent oracle: count covered half-open minute cells directly.
      // No production range, overlap, sorting, or union helper computes expectations.
      let capacity = 0;
      let occupied = 0;
      for (let minute = -2; minute < 8; minute += 1) {
        if (minute < start || minute >= end || (config && (minute < 0 || minute >= 6))) continue;
        capacity += 1;
        if (entries.some(([from, to]) => minute >= from && minute < to)) occupied += 1;
      }
      const appointments = entries.map(([from, to], index) => task(`grid-${index}`, 1, at(from), at(to)));
      for (const [order, permutation] of permutations(appointments).entries()) {
        const context = `case ${caseIndex}, range [${start}, ${end}), clipped ${Boolean(config)}, order ${order}`;
        const actual = appointmentOverlapMinutes(block, permutation, config);
        assert.equal(actual, occupied, context);
        assert.ok(actual >= 0 && actual <= capacity, `${context}: occupancy bounded by independent capacity`);
        assert.equal(intervalCapacityMinutes(block, config), capacity, `${context}: capacity`);
      }
    }
  }
});

for (const strategy of ["earliest_fit", "delta_cost", "delta_cost_switch"] as const) {
  test(`${strategy}: seeded minute-grid schedules respect independent capacity and deadline counts`, () => {
    let seed = 0x8be0722a;
    const integer = (limit: number) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return Math.floor(seed / 4294967296 * limit);
    };
    const at = (minute: number) => new Date(now.getTime() + minute * 60_000).toISOString();
    let assignedCount = 0;
    let deadlineCount = 0;
    let exhaustedCount = 0;
    let unionSavingsCount = 0;

    for (let trial = 0; trial < 200; trial += 1) {
      const config = mergeSchedulerConfig(now, {
        strategy, horizonDays: 1 / 24,
        durationBuffer: [1, 1.25, 1.5, 2][integer(4)]!,
        defaultDurationMinutes: 3 + integer(6)
      });
      const blocks = [-10, 15, 45, 60].map((start, index) =>
        interval(`block-${index}`, at(start), at(start + 15 + integer(16))));
      // Always overlapping; further spans cross now, the horizon, and block edges.
      const spans = [[3, 8], [5, 11], [-12, integer(5)], [55, 65 + integer(6)],
        [integer(55), 60 + integer(10)]];
      const appointments = spans.map(([start, end], index) =>
        task(`fixed-${index}`, 5, at(start), at(end)));
      const candidates = Array.from({ length: 12 }, (_, index) => ({
        ...task(`task-${index}`, 3 + integer(10)),
        durationMinutes: index === 0 ? null : index === 1 ? 0 : 3 + integer(10),
        dueAt: index % 2 === 0 ? at(10 + integer(61)) : null,
        importance: 1 + integer(10),
        tags: [index % 2 === 0 ? "work" : "home"]
      }));
      const reservations = new Map(blocks.map(({ id }) => [id, 1 + integer(20)]));
      const result = runScheduler([...appointments, ...candidates], blocks, config, reservations);
      const context = `${strategy}, seed 0x8be0722a, trial ${trial}`;
      const assignedIds = result.assignments.map(({ taskId }) => taskId);
      assert.equal(new Set(assignedIds).size, assignedIds.length, `${context}: unique tasks`);

      for (const block of blocks) {
        // Count half-open minute cells, not scheduler range/union helpers.
        let available = 0;
        let occupied = 0;
        let summedOccupancy = 0;
        for (let minute = 0; minute < 60; minute += 1) {
          const instant = now.getTime() + minute * 60_000;
          if (instant < Date.parse(block.startsAt) || instant >= Date.parse(block.endsAt)) continue;
          available += 1;
          const covering = spans.filter(([start, end]) => minute >= start && minute < end).length;
          occupied += covering > 0 ? 1 : 0;
          summedOccupancy += covering;
        }
        unionSavingsCount += summedOccupancy > occupied ? 1 : 0;
        const overlap = appointmentOverlapMinutes(block, appointments, config);
        assert.equal(overlap, occupied, `${context}, ${block.id}: independently counted union`);
        assert.ok(overlap >= 0 && overlap <= available, `${context}, ${block.id}: occupancy bounds`);
        const usable = Math.max(0, available - occupied - reservations.get(block.id)!);
        exhaustedCount += usable === 0 ? 1 : 0;
        let assignedMinutes = 0;
        for (const assignment of result.assignments.filter(({ intervalId }) => intervalId === block.id)) {
          const candidate = candidates.find(({ id }) => id === assignment.taskId);
          assert.ok(candidate, `${context}: only candidate tasks assigned`);
          // Independently resolve fallback duration and round each task's buffer.
          const duration = candidate.durationMinutes != null && candidate.durationMinutes > 0
            ? candidate.durationMinutes : config.defaultDurationMinutes;
          assignedMinutes += Math.max(1, Math.ceil(duration * config.durationBuffer));
          assignedCount += 1;
          if (candidate.dueAt) {
            deadlineCount += 1;
            // Assignments name whole intervals; their end must be by due.
            assert.ok(Date.parse(block.endsAt) <= Date.parse(candidate.dueAt), `${context}: deadline`);
          }
        }
        assert.ok(assignedMinutes <= usable, `${context}, ${block.id}: ${assignedMinutes} <= ${usable}`);
      }
      assert.ok(result.assignments.every(({ intervalId }) => blocks.some(({ id }) => id === intervalId)),
        `${context}: known intervals`);
    }
    assert.ok(assignedCount > 0, "generated cases exercise actual assignments");
    assert.ok(deadlineCount > 0, "generated cases exercise assigned deadlines");
    assert.ok(exhaustedCount > 0, "generated cases exercise zero usable capacity");
    assert.ok(unionSavingsCount > 0, "generated cases exercise overlapping occupancy");
  });
}

for (const strategy of ["earliest_fit", "delta_cost", "delta_cost_switch"] as const) {
  test(`${strategy}: deadline boundaries remain hard filters with exact capacity and reservations`, () => {
    const config = {
      now: new Date(date("09:15")), horizonDays: 21, gamma: 1, durationBuffer: 1.25,
      defaultDurationMinutes: 30, switchPenalty: 12, wsptWeight: 8,
      urgencyWeight: 0.6, valueWeight: 0.4, strategy
    };
    const cases = [
      { name: "end equals due", start: date("10:00"), end: date("10:30"), due: date("10:30"), fits: true },
      // Shift both ends by 1ms to keep capacity exactly 30 minutes. Spare
      // capacity cannot permit a block whose end exceeds the deadline.
      { name: "end one millisecond late", start: "2026-09-24T10:00:00.001Z", end: "2026-09-24T10:30:00.001Z", due: date("10:30"), fits: false },
      { name: "offset block equals UTC due", start: "2026-09-24T12:00:00+02:00", end: "2026-09-24T12:30:00+02:00", due: date("10:30"), fits: true },
      { name: "UTC block equals offset due", start: date("10:00"), end: date("10:30"), due: "2026-09-24T05:30:00-05:00", fits: true },
      { name: "malformed deadline", start: date("10:00"), end: date("10:30"), due: "not-a-date", fits: false },
      { name: "elapsed block clipped at now", start: date("08:00"), end: date("09:45"), due: date("09:45"), fits: true },
      // Even if this task could finish before due, allocation is to the whole
      // interval; clipping its elapsed start does not relax the end-by-due rule.
      { name: "clipped block ends after due", start: date("08:00"), end: date("09:45"), due: date("09:30"), fits: false }
    ];
    for (const entry of cases) {
      const block = interval("boundary", entry.start, entry.end);
      const candidate = { ...task("deadline", 12), dueAt: entry.due };
      assert.equal(intervalCapacityMinutes(block, config), 30, entry.name);
      // 12 × 1.25 = 15 buffered minutes. Reserving 15 leaves an exact fit;
      // reserving 16 leaves 14, which must fail even at a valid deadline.
      for (const reserved of [15, 16]) {
        const fits = entry.fits && reserved === 15;
        const context = `${entry.name}, reserved ${reserved}`;
        assert.equal(taskFitsInterval(candidate, block, 30 - reserved, config), fits, context);
        const result = runScheduler([candidate], [block], config, new Map([[block.id, reserved]]));
        assert.deepEqual(result.assignments, fits ? [{ taskId: "deadline", intervalId: "boundary" }] : [], context);
        assert.deepEqual(result.unassigned, fits ? [] : [{ taskId: "deadline", reason: "no_feasible_interval" }], context);
        assert.equal(result.metrics.assignedCount, fits ? 1 : 0, context);
        assert.equal(result.metrics.unassignedCount, fits ? 0 : 1, context);
      }
    }
  });
}

for (const strategy of ["earliest_fit", "delta_cost", "delta_cost_switch"] as const) {
  // Pin every knob explicitly; expected sizes below use independent arithmetic,
  // never the production resolvedDuration/bufferedMinutes/fit helpers.
  const config = {
    now, horizonDays: 21, gamma: 1, durationBuffer: 1.25,
    defaultDurationMinutes: 30, switchPenalty: 12, wsptWeight: 8,
    urgencyWeight: 0.6, valueWeight: 0.4, strategy
  };
  const capacityBlock = (minutes: number) => interval("capacity", date("09:00"),
    new Date(new Date(date("09:00")).getTime() + minutes * 60_000).toISOString());

  test(`${strategy}: zero, null and negative durations use the buffered fallback`, () => {
    // Default: 30 × 1.25 = 37.5, rounded up to 38.
    // Override: 7 × 1.25 = 8.75, rounded up to 9.
    for (const [defaultDurationMinutes, required] of [[30, 38], [7, 9]] as const) {
      for (const durationMinutes of [0, null, -5]) {
        const candidate = { ...task("fallback"), durationMinutes };
        const explicitConfig = { ...config, defaultDurationMinutes };
        for (const capacity of [required - 1, required]) {
          const result = runScheduler([candidate], [capacityBlock(capacity)], explicitConfig);
          const fits = capacity === required;
          const context = `${durationMinutes}, fallback ${defaultDurationMinutes}, capacity ${capacity}`;
          assert.deepEqual(result.assignments, fits ? [{ taskId: "fallback", intervalId: "capacity" }] : [], context);
          assert.deepEqual(result.unassigned, fits ? [] : [{ taskId: "fallback", reason: "no_feasible_interval" }], context);
        }
      }
    }
  });

  test(`${strategy}: exactly two minutes is quick; just above two needs calendar capacity`, () => {
    for (const capacity of [2, 3, 38]) {
      const result = runScheduler([task("quick", 2), task("calendar", 2.01)], [capacityBlock(capacity)], config);
      // 2.01 × 1.25 = 2.5125, rounded up to 3. Quick work consumes no room.
      assert.deepEqual(result.assignments, capacity >= 3 ? [{ taskId: "calendar", intervalId: "capacity" }] : []);
      assert.deepEqual(result.unassigned, capacity >= 3
        ? [{ taskId: "quick", reason: "quick" }]
        : [{ taskId: "quick", reason: "quick" }, { taskId: "calendar", reason: "no_feasible_interval" }]);
    }
  });

  test(`${strategy}: fractional buffering rounds up and accepts exact buffered fits`, () => {
    // 10.5 × 1.25 = 13.125 -> 14; 12 × 1.25 = 15 exactly.
    for (const [duration, required] of [[10.5, 14], [12, 15]] as const) {
      for (const capacity of [required - 1, required]) {
        const result = runScheduler([task("rounded", duration)], [capacityBlock(capacity)], config);
        assert.deepEqual(result.assignments, capacity === required ? [{ taskId: "rounded", intervalId: "capacity" }] : []);
        assert.deepEqual(result.unassigned, capacity === required ? [] : [{ taskId: "rounded", reason: "no_feasible_interval" }]);
      }
    }
    // Round each task before packing: 14 + 14 = 28, rather than rounding 26.25.
    for (const capacity of [27, 28]) {
      const result = runScheduler([task("a", 10.5), task("b", 10.5)], [capacityBlock(capacity)], config);
      assert.deepEqual(result.assignments, capacity === 28
        ? [{ taskId: "a", intervalId: "capacity" }, { taskId: "b", intervalId: "capacity" }]
        : [{ taskId: "a", intervalId: "capacity" }]);
      assert.deepEqual(result.unassigned, capacity === 28 ? [] : [{ taskId: "b", reason: "no_feasible_interval" }]);
    }
  });
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

test("slider importance 2–10 matches equivalent raw values across full scheduler and Now results", () => {
  const strategies = ["earliest_fit", "delta_cost", "delta_cost_switch"] as const;
  const deadlineAt = date("10:00");
  const baseTasks = [
    { ...task("deadline", 45), importance: 2, dueAt: deadlineAt },
    { ...task("flexible", 45), importance: 9 },
    { ...task("leftover", 90), importance: 4 }
  ];
  const blocks = [interval("morning", date("09:00"), date("10:00"))];

  for (let slider = 2; slider <= 10; slider += 1) {
    assert.equal(valueScore(slider), slider * 10, `slider ${slider} maps to ${slider * 10}`);
    assert.equal(valueScore(slider * 10), slider * 10, `raw ${slider * 10} remains unchanged`);

    const sliderTasks = baseTasks.map((entry) => entry.id === "deadline" ? { ...entry, importance: slider } : entry);
    const rawTasks = sliderTasks.map((entry) => ({ ...entry, importance: entry.importance * 10 }));
    for (const strategy of strategies) {
      const config = mergeSchedulerConfig(now, { strategy });
      assert.notEqual(
        nowMotivation(sliderTasks[0]!, config),
        nowMotivation(sliderTasks[1]!, config),
        `${strategy}, slider ${slider}: deadline and flexible scores are distinct`
      );
      assert.deepEqual(
        sliderTasks.map((entry) => nowMotivation(entry, config)),
        rawTasks.map((entry) => nowMotivation(entry, config)),
        `${strategy}, slider ${slider}: Now motivation`
      );
      const sliderResult = runScheduler(sliderTasks, blocks, config);
      assert.equal(sliderResult.assignments.length, 1, `${strategy}, slider ${slider}: assignment fixture`);
      assert.equal(sliderResult.unassigned.length, 2, `${strategy}, slider ${slider}: leftover fixture`);
      assert.deepEqual(sliderResult, runScheduler(rawTasks, blocks, config), `${strategy}, slider ${slider}: full result`);
    }
  }
});

test("task titles and creation age do not change Now motivation or scheduler results", () => {
  const tasks: TaskScheduleInput[] = [
    { ...task("deadline-high", 45), importance: 9, dueAt: date("10:00"), parentTaskId: "project-a", tags: ["writing"] },
    { ...task("flex-mid", 45), importance: 6, parentTaskId: "project-a", tags: ["writing"] },
    { ...task("flex-low", 90), importance: 2, tags: ["admin"] },
    { ...task("fixed-outside", 30, date("15:00"), date("15:30")), importance: 4 }
  ];
  const alteredTasks = tasks.map((entry, index) => ({
    ...entry,
    title: `Renamed ${entry.id}`,
    createdAt: ["0001-01-01T00:00:00.000Z", "9999-12-31T23:59:59.999Z", "1900-01-01T00:00:00.000Z", "2500-12-31T23:59:59.999Z"][index]!
  }));
  const intervals = [interval("morning", date("09:00"), date("11:00"))];

  for (const strategy of ["earliest_fit", "delta_cost", "delta_cost_switch"] as const) {
    const config = mergeSchedulerConfig(now, { strategy });
    const motivations = tasks.map((entry) => nowMotivation(entry, config));
    assert.equal(new Set(motivations).size, motivations.length, `${strategy}: fixture has no motivation ties`);
    assert.deepEqual(
      alteredTasks.map((entry) => nowMotivation(entry, config)),
      motivations,
      `${strategy}: title and creation age leave Now motivation unchanged`
    );

    const baseline = runScheduler(tasks, intervals, config);
    assert.ok(baseline.assignments.length > 0, `${strategy}: fixture assigns work`);
    assert.ok(baseline.unassigned.length > 0, `${strategy}: fixture has unassigned work`);
    assert.deepEqual(
      runScheduler(alteredTasks, intervals, config),
      baseline,
      `${strategy}: assignments, unassigned reasons, and metrics are invariant`
    );
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

test("ordinary postponement accounting separates assigned, leftover, and ineligible tasks", () => {
  const config = mergeSchedulerConfig(new Date("2026-09-22T10:00:00Z"), {
    gamma: 1,
    horizonDays: 7,
    durationBuffer: 1,
    strategy: "earliest_fit"
  });
  const tasks: TaskScheduleInput[] = [
    {
      id: "assigned-30", title: "Assigned 30 minutes", createdAt: "2026-09-20T10:00:00Z",
      importance: 6, durationMinutes: 30, dueAt: null, fixedStartsAt: null, fixedEndsAt: null,
      parentTaskId: "", tags: []
    },
    {
      id: "leftover-90", title: "Leftover 90 minutes", createdAt: "2026-09-20T10:00:00Z",
      importance: 6, durationMinutes: 90, dueAt: null, fixedStartsAt: null, fixedEndsAt: null,
      parentTaskId: "", tags: []
    },
    {
      id: "quick-2", title: "Two-minute task", createdAt: "2026-09-20T10:00:00Z",
      importance: 6, durationMinutes: 2, dueAt: null, fixedStartsAt: null, fixedEndsAt: null,
      parentTaskId: "", tags: []
    },
    {
      id: "missing-end", title: "Task missing an end", createdAt: "2026-09-20T10:00:00Z",
      importance: 6, durationMinutes: 30, dueAt: null, fixedStartsAt: "2026-09-24T10:00:00Z", fixedEndsAt: null,
      parentTaskId: "", tags: []
    },
    {
      id: "fixed-excluded", title: "Fixed task outside the block", createdAt: "2026-09-20T10:00:00Z",
      importance: 6, durationMinutes: 30, dueAt: null, fixedStartsAt: "2026-09-25T10:00:00Z", fixedEndsAt: "2026-09-25T11:00:00Z",
      parentTaskId: "", tags: []
    }
  ];
  const block: IntervalInput = {
    id: "work-block", title: "Work block", kind: "fixed",
    startsAt: "2026-09-24T10:00:00Z", endsAt: "2026-09-24T11:00:00Z", archived: false
  };

  assert.deepEqual(runScheduler(tasks, [block], config), {
    assignments: [{ taskId: "assigned-30", intervalId: "work-block" }],
    unassigned: [
      { taskId: "quick-2", reason: "quick" },
      { taskId: "missing-end", reason: "missing_info" },
      { taskId: "fixed-excluded", reason: "excluded" },
      { taskId: "leftover-90", reason: "no_feasible_interval" }
    ],
    metrics: {
      totalPostponement: 60 * (1 - 1 / (1 + 2 / 7)) + 60 * (1 - 1 / (1 + 7 / 7)),
      contextSwitches: 0,
      assignedCount: 1,
      unassignedCount: 4
    }
  });
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

for (const strategy of ["delta_cost", "delta_cost_switch"] as const) {
  for (const scenario of [
    { name: "later block has room", due: "11:40", later: true, reserved: 0, deadlineBonus: 0, flexibleBonus: 0 },
    { name: "later room consumed by reservations", due: "11:40", later: true, reserved: 5, deadlineBonus: 500, flexibleBonus: 80 },
    { name: "later block ends after due", due: "11:39", later: true, reserved: 0, deadlineBonus: 500, flexibleBonus: 0 },
    { name: "no later block", due: "11:40", later: false, reserved: 0, deadlineBonus: 500, flexibleBonus: 80 }
  ]) {
    test(`${strategy}: last-chance bonuses when ${scenario.name}`, () => {
      const config = mergeSchedulerConfig(now, { strategy });
      const early = interval("early", date("09:00"), date("09:40"));
      const late = interval("late", date("11:00"), date("11:40"));
      const later = scenario.later ? [late] : [];
      const deadline = { ...task("deadline", 30), importance: 2, dueAt: date(scenario.due) };
      const flexible = { ...task("flexible", 30), importance: 10 };

      // Independent arithmetic for the documented defaults: 30 * 1.25 rounds
      // up to 38 minutes, so only one task fits early. The deadline's value
      // term cancels; flexible waiting costs 75% of value over 21 days.
      // A later block ending exactly at due fits; one minute after does not.
      const hoursUntilDue = scenario.due === "11:40" ? 8 / 3 : 159 / 60;
      const deadlineBase = 60 - 60 / (1 + hoursUntilDue / 24) + 8 * 20 / 38;
      const flexibleBase = 75 - 100 * (1 - 1 / (1 + 1 / (24 * 7))) + 8 * 100 / 38;
      const expectedDeadline = deadlineBase + scenario.deadlineBonus;
      const expectedFlexible = flexibleBase + scenario.flexibleBonus;
      const remaining = new Map([[late.id, 40 - scenario.reserved]]);
      for (const [candidate, expected, base, bonus] of [
        [deadline, expectedDeadline, deadlineBase, scenario.deadlineBonus],
        [flexible, expectedFlexible, flexibleBase, scenario.flexibleBonus]
      ] as const) {
        const actual = placementBenefit(candidate, taskBenefitConstants(candidate, config), early, null, later, remaining, config);
        assert.ok(Math.abs(actual - expected) < 1e-10, `${candidate.id}: ${actual} vs independent ${expected}`);
        assert.ok(Math.abs((actual - base) - bonus) < 1e-10, `${candidate.id}: exact last-chance bonus`);
      }

      const deadlineFirst = scenario.deadlineBonus === 500;
      assert.equal(expectedDeadline > expectedFlexible, deadlineFirst);
      const result = runScheduler([deadline, flexible], [early, ...later], config, new Map([[late.id, scenario.reserved]]));
      const first = deadlineFirst ? deadline.id : flexible.id;
      const second = deadlineFirst ? flexible.id : deadline.id;
      const secondFits = scenario.later && scenario.reserved === 0;
      assert.deepEqual(result.assignments, [
        { taskId: first, intervalId: early.id },
        ...(secondFits ? [{ taskId: second, intervalId: late.id }] : [])
      ]);
      assert.deepEqual(result.unassigned, secondFits ? [] : [{ taskId: second, reason: "no_feasible_interval" }]);
    });
  }

  test(`${strategy}: flexible +80 reverses competition when reservations leave room only for the smaller task`, () => {
    const config = mergeSchedulerConfig(now, { strategy });
    const early = interval("early", date("09:00"), date("09:40"));
    const late = interval("late", date("11:00"), date("11:40"));
    const larger = { ...task("larger", 30), importance: 2 };
    const smaller = { ...task("smaller", 15), importance: 7 };
    // Independently computed flexible benefits, using default 21-day wait,
    // one-hour slot delay, and rounded buffered durations of 38 and 19.
    const largerBase = 15 - 20 * (1 - 1 / (1 + 1 / 168)) + 8 * 20 / 38;
    const smallerBase = 52.5 - 70 * (1 - 1 / (1 + 1 / 168)) + 8 * 70 / 19;
    assert.ok(largerBase < smallerBase && largerBase + 80 > smallerBase);
    for (const reserved of [0, 20]) {
      const remaining = new Map([[late.id, 40 - reserved]]);
      for (const [candidate, expected] of [
        [larger, largerBase + (reserved ? 80 : 0)], [smaller, smallerBase]
      ] as const) {
        const actual = placementBenefit(candidate, taskBenefitConstants(candidate, config), early, null, [late], remaining, config);
        assert.ok(Math.abs(actual - expected) < 1e-10, `${candidate.id}: independent flexible benefit`);
      }
      const result = runScheduler([larger, smaller], [early, late], config, new Map([[late.id, reserved]]));
      assert.deepEqual(result.assignments, [
        { taskId: reserved ? larger.id : smaller.id, intervalId: early.id },
        { taskId: reserved ? smaller.id : larger.id, intervalId: late.id }
      ]);
      assert.deepEqual(result.unassigned, []);
    }
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

test("schedule inputs inherit only raw immediate-parent values across three levels and shared parents", () => {
  const grandparent = item({ id: "grandparent", isTask: true, manualRelevance: 9,
    expectedDurationMinutes: 90, taskDueAt: "2026-09-25T18:00:00Z",
    taskFixedStartsAt: "2026-09-25T09:00:00Z", taskFixedEndsAt: "2026-09-25T10:00:00Z",
    tags: ["grandparent"] });
  const parent = item({ id: "parent", isTask: true, parentTaskId: "grandparent", manualRelevance: 0,
    taskFixedStartsAt: "2026-09-25T11:00:00Z", tags: ["parent"] });
  const child = item({ id: "child", isTask: true, parentTaskId: "parent", manualRelevance: 0, tags: ["child"] });
  const sibling = item({ id: "sibling", isTask: true, parentTaskId: "grandparent", manualRelevance: 3,
    expectedDurationMinutes: 0, taskDueAt: "2026-09-25T16:00:00Z",
    taskFixedStartsAt: "2026-09-25T12:00:00Z", taskFixedEndsAt: "2026-09-25T13:00:00Z" });
  // Children precede their shared parent so batch resolution cannot rely on traversal order.
  const items = [child, sibling, parent, grandparent];
  const before = structuredClone(items);
  for (const entry of items) {
    Object.freeze(entry.tags);
    Object.freeze(entry);
  }
  Object.freeze(items);
  const expected: TaskScheduleInput[] = [
    { id: "child", title: "Item", createdAt: now.toISOString(), importance: 0, durationMinutes: null,
      dueAt: null, fixedStartsAt: "2026-09-25T11:00:00Z", fixedEndsAt: null,
      parentTaskId: "parent", tags: ["child"] },
    { id: "sibling", title: "Item", createdAt: now.toISOString(), importance: 3, durationMinutes: 0,
      dueAt: "2026-09-25T16:00:00Z", fixedStartsAt: "2026-09-25T12:00:00Z", fixedEndsAt: "2026-09-25T13:00:00Z",
      parentTaskId: "grandparent", tags: [] },
    { id: "parent", title: "Item", createdAt: now.toISOString(), importance: 9, durationMinutes: 90,
      dueAt: "2026-09-25T18:00:00Z", fixedStartsAt: "2026-09-25T11:00:00Z", fixedEndsAt: "2026-09-25T10:00:00Z",
      parentTaskId: "grandparent", tags: ["parent"] },
    { id: "grandparent", title: "Item", createdAt: now.toISOString(), importance: 9, durationMinutes: 90,
      dueAt: "2026-09-25T18:00:00Z", fixedStartsAt: "2026-09-25T09:00:00Z", fixedEndsAt: "2026-09-25T10:00:00Z",
      parentTaskId: "", tags: ["grandparent"] }
  ];

  assert.deepEqual(items.map((entry) => itemToScheduleInput(entry, items)), expected);
  assert.deepEqual(items, before, "single-item resolution must not materialize inheritance into items");
  assert.deepEqual(itemsToScheduleInputs(items), expected);
  assert.deepEqual(items, before, "batch resolution must not mutate shared parents or children");
});

test("schedule inputs resolve self references, cycles and absent parents without traversal or mutation", () => {
  const self = item({ id: "self", isTask: true, parentTaskId: "self", manualRelevance: 0 });
  const first = item({ id: "first", isTask: true, parentTaskId: "second", manualRelevance: 0,
    taskDueAt: "2026-09-25T15:00:00Z", taskFixedEndsAt: "2026-09-25T14:00:00Z" });
  const second = item({ id: "second", isTask: true, parentTaskId: "first", manualRelevance: 7,
    expectedDurationMinutes: 25, taskFixedStartsAt: "2026-09-25T13:00:00Z" });
  const orphan = item({ id: "orphan", isTask: true, parentTaskId: "absent", manualRelevance: 0 });
  const ownOrphan = item({ id: "own-orphan", isTask: true, parentTaskId: "absent", manualRelevance: 2,
    expectedDurationMinutes: 10, taskDueAt: "2026-09-25T17:00:00Z", tags: ["own"] });
  const items = [self, first, second, orphan, ownOrphan];
  const before = structuredClone(items);
  for (const entry of items) {
    Object.freeze(entry.tags);
    Object.freeze(entry);
  }
  Object.freeze(items);
  const expected: TaskScheduleInput[] = [
    { id: "self", title: "Item", createdAt: now.toISOString(), importance: 0, durationMinutes: null,
      dueAt: null, fixedStartsAt: null, fixedEndsAt: null, parentTaskId: "self", tags: [] },
    { id: "first", title: "Item", createdAt: now.toISOString(), importance: 7, durationMinutes: 25,
      dueAt: "2026-09-25T15:00:00Z", fixedStartsAt: "2026-09-25T13:00:00Z", fixedEndsAt: "2026-09-25T14:00:00Z",
      parentTaskId: "second", tags: [] },
    { id: "second", title: "Item", createdAt: now.toISOString(), importance: 7, durationMinutes: 25,
      dueAt: "2026-09-25T15:00:00Z", fixedStartsAt: "2026-09-25T13:00:00Z", fixedEndsAt: "2026-09-25T14:00:00Z",
      parentTaskId: "first", tags: [] },
    { id: "orphan", title: "Item", createdAt: now.toISOString(), importance: 0, durationMinutes: null,
      dueAt: null, fixedStartsAt: null, fixedEndsAt: null, parentTaskId: "absent", tags: [] },
    { id: "own-orphan", title: "Item", createdAt: now.toISOString(), importance: 2, durationMinutes: 10,
      dueAt: "2026-09-25T17:00:00Z", fixedStartsAt: null, fixedEndsAt: null, parentTaskId: "absent", tags: ["own"] }
  ];

  assert.deepEqual(items.map((entry) => itemToScheduleInput(entry, items)), expected);
  assert.deepEqual(items, before);
  assert.deepEqual(itemsToScheduleInputs(items), expected);
  assert.deepEqual(items, before);
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

function ordinaryReviewFixture() {
  const past = "2026-09-24T07:00:00Z";
  const fixed = { taskFixedStartsAt: "2026-09-24T09:00:00Z", taskFixedEndsAt: "2026-09-24T10:00:00Z" };
  const task = (id: string, fields: Partial<Item> = {}) => item({
    id, title: id, isTask: true, expectedDurationMinutes: 30, ...fields
  });
  const items = [
    task("scheduled"), task("unscheduled"),
    task("later-overdue", { taskStatus: "later", taskDueAt: past, ...fixed, expectedDurationMinutes: 2 }),
    task("later-missing", { taskStatus: "later", taskFixedEndsAt: fixed.taskFixedEndsAt }),
    task("later-ordinary", { taskStatus: "later" }),
    task("done-overdue", { taskStatus: "done", taskDueAt: past }),
    task("cancelled-overdue", { taskStatus: "cancelled", taskDueAt: past }),
    task("note-overdue", { isTask: false, taskStatus: "later", taskDueAt: past }),
    task("overdue-scheduled", { taskDueAt: past }),
    task("overdue-fixed", { taskDueAt: past, ...fixed }),
    task("overdue-missing", { taskDueAt: past, taskFixedStartsAt: fixed.taskFixedStartsAt }),
    task("overdue-quick", { taskDueAt: past, expectedDurationMinutes: 1 }),
    task("fixed", fixed),
    task("missing-start", { taskFixedEndsAt: fixed.taskFixedEndsAt }),
    task("missing-end", { taskFixedStartsAt: fixed.taskFixedStartsAt }),
    task("quick-one", { expectedDurationMinutes: 1 }),
    task("quick-two", { expectedDurationMinutes: 2 }),
    task("ordinary-three", { expectedDurationMinutes: 3 }),
    task("unknown-duration", { expectedDurationMinutes: null }),
    task("due-now", { taskDueAt: now.toISOString() }),
    task("future-due", { taskDueAt: "2026-09-25T12:00:00Z" })
  ];
  const links: ItemLink[] = ["scheduled", "later-overdue", "overdue-scheduled"].map((fromId) => ({
    id: `link-${fromId}`, ownerId: "owner", fromId, toId: "work", kind: "scheduled_in",
    createdAt: now.toISOString(), updatedAt: now.toISOString()
  }));
  links.push({ ...links[0], id: "context", fromId: "unscheduled", kind: "context" });
  return { items, links };
}

test("ordinary review buckets preserve status, overdue, exclusion and scheduling precedence", () => {
  const { items, links } = ordinaryReviewFixture();
  const review = buildReview(items, links, now);
  // Later wins even over overdue/fixed/quick/scheduled; inactive and non-tasks
  // are excluded. Active overdue wins over all calendar eligibility exclusions.
  // Only ordinary non-overdue work reaches the scheduled-link filter.
  assert.deepEqual(review.later.map(({ id }) => id).sort(), ["later-missing", "later-ordinary", "later-overdue"]);
  assert.deepEqual(review.overdue.map(({ id }) => id).sort(), [
    "overdue-fixed", "overdue-missing", "overdue-quick", "overdue-scheduled"
  ]);
  assert.deepEqual(review.unscheduled.map(({ id }) => id).sort(), [
    "due-now", "future-due", "ordinary-three", "unknown-duration", "unscheduled"
  ]);
  const memberships = Object.values(review).flat().map(({ id }) => id);
  assert.equal(memberships.length, 12);
  assert.equal(new Set(memberships).size, memberships.length, "each task appears in at most one bucket");
});

test("ordinary review orders overdue by instant/title, unscheduled by relevance/title and later by update", () => {
  const task = (id: string, fields: Partial<Item>) => item({ id, isTask: true, expectedDurationMinutes: 30, ...fields });
  const items = [
    task("overdue-z", { title: "Zulu", taskDueAt: "2026-09-24T07:00:00Z" }),
    task("later-old", { taskStatus: "later", updatedAt: "2026-09-22T12:00:00Z" }),
    task("work-z", { title: "Zulu", manualRelevance: 5 }),
    task("overdue-early", { title: "Zulu", taskDueAt: "2026-09-24T06:00:00Z" }),
    task("work-a", { title: "Alpha", manualRelevance: 5 }),
    task("later-new", { taskStatus: "later", updatedAt: "2026-09-24T12:00:00Z" }),
    task("work-high", { title: "Zulu", manualRelevance: 9 }),
    task("overdue-a", { title: "Alpha", taskDueAt: "2026-09-24T09:00:00+02:00" })
  ];
  // Literal expected IDs are independent of the production comparator; the
  // equivalent offset deadlines exercise the existing title fallback.
  for (const ordered of [items, [...items].reverse()]) {
    const review = buildReview(ordered, [], now);
    assert.deepEqual(review.overdue.map(({ id }) => id), ["overdue-early", "overdue-a", "overdue-z"]);
    assert.deepEqual(review.unscheduled.map(({ id }) => id), ["work-high", "work-a", "work-z"]);
    assert.deepEqual(review.later.map(({ id }) => id), ["later-new", "later-old"]);
  }
});

test("ordinary review preserves input item values/order, links and reference date", () => {
  const { items, links } = ordinaryReviewFixture();
  const reference = new Date(now);
  const inputs = { items, links, reference };
  const before = structuredClone(inputs);
  const identities = items.slice();
  const first = buildReview(items, links, reference);
  assert.deepEqual(inputs, before);
  items.forEach((entry, index) => assert.strictEqual(entry, identities[index]));
  for (const entry of Object.values(first).flat()) {
    assert.strictEqual(entry, identities.find(({ id }) => id === entry.id));
  }
  assert.deepEqual(buildReview(items, links, reference), first);
  assert.deepEqual(inputs, before, "repeated review preserves nested values and Date internals");
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

for (const strategy of ["earliest_fit", "delta_cost", "delta_cost_switch"] as const) {
  for (const secondFits of [false, true]) {
    test(`${strategy}: buffered task ${secondFits ? "fits only the second block" : "fits combined capacity but neither block"} without splitting`, () => {
      const config = mergeSchedulerConfig(now, { strategy });
      const large = task("large", 60);
      const small = { ...task("small", 40), importance: 4 };
      const blocks = [
        interval("current", date("07:00"), date("09:00")),
        interval("second", date("10:00"), date(secondFits ? "11:25" : "11:00"))
      ];
      const reservations = new Map([["current", 10], ["second", 10]]);
      // Independent capacity arithmetic: elapsed time removes 60 minutes
      // from the current block, then reservations leave 50 and 50/75.
      const capacities = [50, secondFits ? 75 : 50];
      assert.equal(bufferedMinutes(60, config), 75);
      assert.equal(bufferedMinutes(40, config), 50);
      blocks.forEach((block, index) => {
        assert.equal(intervalCapacityMinutes(block, config) - reservations.get(block.id)!, capacities[index]);
      });
      assert.ok(75 <= capacities[0] + capacities[1], "combined room is sufficient");
      assert.ok(75 > capacities[0], "the whole task cannot fit the current block");
      assert.equal(75 <= capacities[1], secondFits);

      const result = runScheduler([large, small], blocks, config, reservations);
      const expectedAssignments = [
        { taskId: "small", intervalId: "current" },
        ...(secondFits ? [{ taskId: "large", intervalId: "second" }] : [])
      ];
      // Earliest-fit emits in task priority order; delta strategies emit
      // in block order. Both must assign the same whole tasks to blocks.
      if (secondFits && strategy === "earliest_fit") expectedAssignments.reverse();
      assert.deepEqual(result.assignments, expectedAssignments);
      assert.deepEqual(result.unassigned, secondFits ? [] : [
        { taskId: "large", reason: "no_feasible_interval" }
      ]);
      assert.equal(new Set(result.assignments.map(({ taskId }) => taskId)).size, result.assignments.length,
        "each task occurs in at most one block");
      // Small fills the current block exactly: a failed/partial large-task
      // placement must not consume any of its capacity. Large uses all 75
      // minutes in the second block or none at all.
      for (const [index, block] of blocks.entries()) {
        const used = result.assignments.filter(({ intervalId }) => intervalId === block.id)
          .reduce((sum, { taskId }) => sum + (taskId === "large" ? 75 : 50), 0);
        assert.equal(used, index === 0 ? 50 : secondFits ? 75 : 0);
        assert.ok(used <= capacities[index]);
      }
      // Default flexible cost: value * delayHours / (168 + delayHours).
      // Small starts at clipped now (zero cost); large is delayed two hours
      // if assigned, or the full 21-day horizon if left unassigned.
      assert.ok(Math.abs(result.metrics.totalPostponement - (secondFits ? 50 * 2 / 170 : 50 * 21 / 28)) < 1e-10);
      assert.deepEqual({ ...result.metrics, totalPostponement: 0 }, {
        totalPostponement: 0, contextSwitches: 0,
        assignedCount: secondFits ? 2 : 1, unassignedCount: secondFits ? 0 : 1
      });
      assert.equal(result.metrics.assignedCount + result.metrics.unassignedCount, 2);
      assert.deepEqual([...reservations], [["current", 10], ["second", 10]]);
    });
  }
}

test("elapsed-time translations preserve fixed-interval scheduler decisions across Berlin DST", () => {
  const baseNow = new Date("2026-03-28T00:30:00.000Z");
  const elapsedOffsets = [0, 24 * 60 * 60_000, 7 * 24 * 60 * 60_000];
  const baseTasks: TaskScheduleInput[] = [
    { ...task("deadline", 30), dueAt: "2026-03-29T08:00:00.000Z", importance: 8 },
    task("appointment", 45, "2026-03-29T09:00:00.000Z", "2026-03-29T09:45:00.000Z"),
    { ...task("flex-a", 45), importance: 6, tags: ["shared"] },
    { ...task("flex-b", 45), importance: 5, tags: ["shared"] },
    { ...task("too-long", 150), importance: 2 }
  ];
  const baseIntervals = [
    interval("morning", "2026-03-29T07:00:00.000Z", "2026-03-29T10:00:00.000Z"),
    interval("afternoon", "2026-03-29T11:00:00.000Z", "2026-03-29T13:00:00.000Z")
  ];
  const shiftTimestamp = (timestamp: string | null, elapsedMs: number) =>
    timestamp === null ? null : new Date(Date.parse(timestamp) + elapsedMs).toISOString();

  for (const strategy of ["earliest_fit", "delta_cost", "delta_cost_switch"] as const) {
    const baseline = runScheduler(baseTasks, baseIntervals, mergeSchedulerConfig(baseNow, { strategy }));
    for (const elapsedMs of elapsedOffsets.slice(1)) {
      const translatedTasks = baseTasks.map((entry) => ({
        ...entry,
        createdAt: shiftTimestamp(entry.createdAt, elapsedMs)!,
        dueAt: shiftTimestamp(entry.dueAt, elapsedMs),
        fixedStartsAt: shiftTimestamp(entry.fixedStartsAt, elapsedMs),
        fixedEndsAt: shiftTimestamp(entry.fixedEndsAt, elapsedMs)
      }));
      const translatedIntervals = baseIntervals.map((entry) => ({
        ...entry,
        startsAt: shiftTimestamp(entry.startsAt, elapsedMs)!,
        endsAt: shiftTimestamp(entry.endsAt, elapsedMs)!
      }));
      const translatedNow = new Date(baseNow.getTime() + elapsedMs);
      const translated = runScheduler(translatedTasks, translatedIntervals,
        mergeSchedulerConfig(translatedNow, { strategy }));
      assert.deepEqual(translated, baseline, `${strategy} after ${elapsedMs}ms elapsed translation`);
    }
  }
});

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

for (const strategy of ["earliest_fit", "delta_cost", "delta_cost_switch"] as const) {
  for (const selection of [
    { name: "omitted taskIds", taskIds: undefined, expected: ["a", "b"], overflow: true },
    { name: "empty selection", taskIds: [], expected: [], overflow: false },
    { name: "subset including ineligible IDs", taskIds: ["a", "overflow", "reserved", "appointment-a", "done", "note"], expected: ["a"], overflow: true },
    { name: "repeated IDs", taskIds: ["b", "b", "overflow", "overflow"], expected: ["b"], overflow: true },
    { name: "absent IDs mixed with present IDs", taskIds: ["missing", "a", "overflow", "also-missing"], expected: ["a"], overflow: true },
    { name: "only absent IDs", taskIds: ["missing", "also-missing"], expected: [], overflow: false }
  ]) {
    test(`Atlas preview ${strategy}: ${selection.name} retains appointments and reservations without mutation`, () => {
      const items = [
        workBlock("block", date("09:00"), date("11:00")),
        scheduledTask("a", 20), scheduledTask("b", 20),
        item({ ...scheduledTask("overflow", 60), manualRelevance: 10 }),
        scheduledTask("reserved", 20),
        item({ ...scheduledTask("appointment-a", 15), taskFixedStartsAt: date("09:00"), taskFixedEndsAt: date("09:15") }),
        item({ ...scheduledTask("appointment-b", 15), taskFixedStartsAt: date("10:00"), taskFixedEndsAt: date("10:15") }),
        item({ ...scheduledTask("done", 20), taskStatus: "done" }),
        item({ id: "note" })
      ];
      const links = [link("reservation", "reserved", "block"), link("appointment", "appointment-a", "block")];
      const options = {
        links, horizonDays: 1,
        ...(selection.taskIds === undefined ? {} : { taskIds: [...selection.taskIds] })
      };
      const callNow = new Date(now);
      const snapshot = structuredClone({ items, options, callNow });

      const result = proposeSchedule(items, callNow, strategy, options);

      // 120 minutes - 30 appointment minutes - 25 buffered reserved minutes = 65.
      // Each small task uses 25; overflow uses 75 and would fit if either an
      // appointment or the unselected reservation were lost. Linked appointments
      // must also avoid being reserved twice, or the second small task won't fit.
      assert.deepEqual(result.assignments.map(({ taskId }) => taskId).sort(), selection.expected);
      assert.ok(result.assignments.every(({ intervalId }) => intervalId === "block"));
      assert.deepEqual(result.unassigned, [
        { taskId: "appointment-a", reason: "excluded" },
        { taskId: "appointment-b", reason: "excluded" },
        ...(selection.overflow ? [{ taskId: "overflow", reason: "no_feasible_interval" }] : [])
      ]);
      assert.equal(result.metrics.assignedCount, selection.expected.length);
      assert.equal(result.metrics.unassignedCount, 2 + Number(selection.overflow));
      assert.deepEqual({ items, options, callNow }, snapshot);
    });
  }
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

test("scheduler full output is invariant to equivalent offsets and distinct fixed-interval permutations", () => {
  const configNow = new Date("2026-03-29T00:15:00Z");
  const tasks: TaskScheduleInput[] = [
    { ...task("appointment", 45, "2026-03-29T00:05:00Z", "2026-03-29T00:50:00Z"), importance: 8 },
    { ...task("due", 30), dueAt: "2026-03-29T00:40:00Z", importance: 7 },
    { ...task("flex-a", 30), importance: 6, parentTaskId: "project", tags: ["shared"] },
    { ...task("flex-b", 30), importance: 5, tags: ["shared"] },
    { ...task("too-long", 180), importance: 2 }
  ];
  const intervals = [
    interval("clipped", "2026-03-28T23:45:00Z", "2026-03-29T02:00:00Z"),
    interval("later", "2026-03-29T03:00:00Z", "2026-03-29T04:00:00Z"),
    { ...interval("civil-day", "2026-03-29T00:00:00Z", "2026-03-30T00:00:00Z"), kind: "allDay" }
  ];

  // Render an instant with another legal ISO offset. The selected offsets cross
  // the civil-date boundary for this near-midnight fixture while preserving time.
  const withOffset = (value: string, offsetMinutes: number): string => {
    const local = new Date(Date.parse(value) + offsetMinutes * 60_000);
    const sign = offsetMinutes >= 0 ? "+" : "-";
    const abs = Math.abs(offsetMinutes);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}.${String(local.getUTCMilliseconds()).padStart(3, "0")}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
  };
  const changedTasks = tasks.map((entry) => ({
    ...entry,
    dueAt: entry.dueAt === null ? null : withOffset(entry.dueAt, 120),
    fixedStartsAt: entry.fixedStartsAt === null ? null : withOffset(entry.fixedStartsAt, -300),
    fixedEndsAt: entry.fixedEndsAt === null ? null : withOffset(entry.fixedEndsAt, 330)
  }));
  const changedIntervals = intervals.map((entry) => entry.kind === "allDay" ? entry : ({
    ...entry,
    startsAt: withOffset(entry.startsAt, 330),
    endsAt: withOffset(entry.endsAt, -300)
  }));

  assert.notEqual(changedIntervals[0]!.startsAt.slice(0, 10), intervals[0]!.startsAt.slice(0, 10), "fixture crosses a civil-date boundary");
  assert.ok(Date.parse(changedIntervals[0]!.startsAt) === Date.parse(intervals[0]!.startsAt));
  assert.ok(Date.parse(changedTasks[0]!.fixedStartsAt!) === Date.parse(tasks[0]!.fixedStartsAt!));
  assert.ok(Date.parse(changedTasks[1]!.dueAt!) === Date.parse(tasks[1]!.dueAt!));

  // Reuse the offset fixture, restricting the permutation premise to unique
  // fixed intervals with distinct start instants (including the partial-past
  // block). Keep tasks, config, and reservations identical for each permutation.
  const fixedIntervals = [
    ...intervals.filter((entry) => entry.kind === "fixed"),
    interval("last", "2026-03-29T04:00:00Z", "2026-03-29T05:00:00Z")
  ];
  const offsetFixedIntervals = [
    ...changedIntervals.filter((entry) => entry.kind === "fixed"),
    interval("last", "2026-03-29T09:30:00+05:30", "2026-03-29T00:00:00-05:00")
  ];
  const reservations = new Map([["clipped", 20], ["later", 10], ["last", 5]]);
  const permutations = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  assert.equal(fixedIntervals.length, 3);
  assert.equal(new Set(fixedIntervals.map(({ id }) => id)).size, 3);
  assert.equal(new Set(fixedIntervals.map(({ startsAt }) => Date.parse(startsAt))).size, 3);
  assert.ok(Date.parse(fixedIntervals[0]!.startsAt) < configNow.getTime());
  assert.ok(Date.parse(fixedIntervals[0]!.endsAt) > configNow.getTime());
  for (const [index, entry] of offsetFixedIntervals.entries()) {
    assert.equal(Date.parse(entry.startsAt), Date.parse(fixedIntervals[index]!.startsAt));
    assert.equal(Date.parse(entry.endsAt), Date.parse(fixedIntervals[index]!.endsAt));
  }

  for (const strategy of ["earliest_fit", "delta_cost", "delta_cost_switch"] as const) {
    const config = mergeSchedulerConfig(configNow, { strategy, horizonDays: 0.2 });
    const baseline = runScheduler(tasks, intervals, config);
    assert.ok(baseline.assignments.length > 0, `${strategy}: fixture assigns work`);
    assert.ok(baseline.unassigned.length > 0, `${strategy}: fixture has unassigned work`);
    assert.deepEqual(
      runScheduler(changedTasks, changedIntervals, config),
      baseline,
      `${strategy}: assignments, unassigned reasons, and metrics are invariant`
    );

    const fixedBaseline = runScheduler(tasks, fixedIntervals, config, reservations);
    assert.ok(new Set(fixedBaseline.assignments.map(({ intervalId }) => intervalId)).size > 1,
      `${strategy}: permutation fixture assigns across multiple blocks`);
    assert.ok(fixedBaseline.unassigned.some(({ reason }) => reason === "excluded"));
    assert.ok(fixedBaseline.unassigned.some(({ reason }) => reason === "no_feasible_interval"));
    for (const representation of [fixedIntervals, offsetFixedIntervals]) {
      for (const order of permutations) {
        assert.deepEqual(
          runScheduler(tasks, order.map((index) => representation[index]!), config, reservations),
          fixedBaseline,
          `${strategy}: full result for ${representation === fixedIntervals ? "UTC" : "offset"} order ${order}`
        );
      }
    }
  }

  // Only fixed intervals and valid offset-bearing timestamps share this
  // premise. Local civil/all-day recurrence and export selection are out of scope.
  const originalTimezone = process.env.TZ;
  try {
    process.env.TZ = "UTC";
    const strategies = ["earliest_fit", "delta_cost", "delta_cost_switch"] as const;
    const explicitNow = "2026-03-28T19:15:00-05:00";
    const baselines = strategies.map((strategy) => runScheduler(changedTasks, offsetFixedIntervals,
      mergeSchedulerConfig(new Date(explicitNow), { strategy, horizonDays: 0.2 }), reservations));
    const expectedBytes = new TextEncoder().encode([
      "BEGIN:VEVENT", "UID:fixed-zone@atlas", "DTSTAMP:20260329T001500Z",
      "DTSTART:20260328T234500Z", "DTEND:20260329T020000Z",
      "SUMMARY:clipped", "DESCRIPTION:Fixed interval",
      "BEGIN:VALARM", "TRIGGER:-PT10M", "ACTION:DISPLAY", "DESCRIPTION:clipped",
      "END:VALARM", "END:VEVENT"
    ].join("\r\n"));
    for (const timezone of ["UTC", "Europe/Berlin", "America/New_York"]) {
      process.env.TZ = timezone;
      for (const [index, strategy] of strategies.entries()) {
        const result = runScheduler(changedTasks, offsetFixedIntervals,
          mergeSchedulerConfig(new Date(explicitNow), { strategy, horizonDays: 0.2 }), reservations);
        assert.ok(result.assignments.length > 0, `${timezone}/${strategy}: assigns work`);
        assert.ok(result.unassigned.length > 0, `${timezone}/${strategy}: has leftovers`);
        assert.deepEqual(result, baselines[index], `${timezone}/${strategy}: full result matches UTC`);
      }
      const entry = offsetFixedIntervals[0]!;
      const serialized = serializeVevent({
        uid: "fixed-zone@atlas", start: new Date(entry.startsAt), end: new Date(entry.endsAt),
        summary: entry.title, description: "Fixed interval"
      }, new Date(explicitNow));
      assert.deepEqual(new TextEncoder().encode(serialized), expectedBytes, `${timezone}: UTC VEVENT bytes`);
    }
  } finally {
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  }
});

for (const strategy of ["earliest_fit", "delta_cost", "delta_cost_switch"] as const) {
  test(`${strategy}: consistent ID renaming preserves ordered results and metrics`, () => {
    const config = mergeSchedulerConfig(now, { strategy, durationBuffer: 1 });
    const relatedTasks = [
      { ...task("high", 30), importance: 9, parentTaskId: "external-parent" },
      { ...task("middle", 30), importance: 6, tags: ["other"] },
      { ...task("low", 30), importance: 5, parentTaskId: "external-parent" },
      { ...task("overflow", 200), dueAt: date("11:30") },
      task("quick", 1),
      task("appointment", 15, date("09:00"), date("09:15"))
    ];
    const fixtures = [
      {
        name: "siblings with an external parent",
        tasks: relatedTasks,
        intervals: [interval("first", date("09:00"), date("10:45")), interval("later", date("11:00"), date("12:00"))],
        reservations: new Map([["first", 15], ["later", 30]])
      },
      {
        name: "parent/child",
        tasks: relatedTasks.map((entry) => ({ ...entry, parentTaskId: entry.id === "low" ? "high" : "" })),
        intervals: [interval("first", date("09:00"), date("10:45")), interval("later", date("11:00"), date("12:00"))],
        reservations: new Map([["first", 15], ["later", 30]])
      },
      {
        name: "equal-score tasks and equal-start intervals",
        tasks: [task("tie-z", 30), task("tie-a", 30), task("tie-m", 30), task("tie-b", 30)],
        intervals: [interval("block-z", date("09:00"), date("09:45")), interval("block-a", date("09:00"), date("09:45"))],
        reservations: new Map([["block-z", 15], ["block-a", 15]])
      }
    ];
    for (const fixture of fixtures) {
      const { tasks, intervals, reservations } = fixture;
      const baseline = runScheduler(tasks, intervals, config, reservations);
      assert.ok(baseline.assignments.length >= 2, `${fixture.name}: assigns across blocks`);
      assert.equal(new Set(baseline.assignments.map(({ intervalId }) => intervalId)).size, 2);
      assert.ok(baseline.unassigned.some(({ reason }) => reason === "no_feasible_interval"));
      if (fixture.name === "equal-score tasks and equal-start intervals") {
        assert.deepEqual(baseline.assignments, [
          { taskId: "tie-z", intervalId: "block-z" }, { taskId: "tie-a", intervalId: "block-a" }
        ], "ties retain encounter order");
      } else {
        assert.ok(baseline.unassigned.some(({ taskId, reason }) => taskId === "appointment" && reason === "excluded"));
        assert.deepEqual(baseline.assignments.map(({ taskId }) => taskId),
          strategy === "delta_cost_switch" ? ["high", "low", "middle"] : ["high", "middle", "low"]);
        assert.equal(baseline.metrics.contextSwitches, strategy === "delta_cost_switch" ? 0 : 1);
        assert.notDeepEqual(runScheduler(tasks, intervals, config).assignments, baseline.assignments,
          "reservations affect placement");
        assert.notDeepEqual(runScheduler(tasks.filter(({ id }) => id !== "appointment"), intervals, config, reservations).assignments,
          baseline.assignments, "fixed appointment occupancy affects placement");
      }
      // Rename every referenced identity, including parents absent from tasks.
      // Array and Map encounter order stay intact; only opaque IDs change.
      const ids = [...new Set([...tasks.map(({ id }) => id), ...tasks.map(({ parentTaskId }) => parentTaskId).filter(Boolean),
        ...intervals.map(({ id }) => id), ...reservations.keys()])];
      for (const reverse of [false, true]) {
        const renamed = new Map(ids.map((id, index) => [id, `opaque-${String(reverse ? ids.length - index : index).padStart(3, "0")}`]));
        const restored = new Map([...renamed].map(([before, after]) => [after, before]));
        const rename = (id: string) => id === "" ? "" : renamed.get(id)!;
        const renamedTasks = tasks.map((entry) => ({ ...entry, id: rename(entry.id), parentTaskId: rename(entry.parentTaskId) }));
        const renamedIntervals = intervals.map((entry) => ({ ...entry, id: rename(entry.id) }));
        const renamedReservations = new Map([...reservations].map(([id, minutes]) => [rename(id), minutes]));
        const result = runScheduler(renamedTasks, renamedIntervals, config, renamedReservations);
        assert.deepEqual({
          ...result,
          assignments: result.assignments.map((entry) => ({ taskId: restored.get(entry.taskId), intervalId: restored.get(entry.intervalId) })),
          unassigned: result.unassigned.map((entry) => ({ ...entry, taskId: restored.get(entry.taskId) }))
        }, baseline, `${fixture.name}, ${reverse ? "reverse" : "forward"} lexical IDs: full ordered result`);
      }
    }
  });
}

test("scheduler A/B/A calls isolate config and reservations on reused immutable inputs", () => {
  const strategies = ["earliest_fit", "delta_cost", "delta_cost_switch"] as const;
  for (const [index, strategy] of strategies.entries()) {
    // Also vary scoring within a strategy: a strategy-keyed cache must not
    // accidentally make the cross-strategy sequences pass.
    for (const bStrategy of [strategy, strategies[(index + 1) % strategies.length]!]) {
      const tasks = [
        { ...task("due", 25), dueAt: date("11:30"), importance: 8 },
        { ...task("parent", 20), importance: 6, tags: ["focus"] },
        { ...task("child", 15), parentTaskId: "parent", tags: ["focus"] },
        task("long", 50),
        task("appointment", 15, date("09:15"), date("09:30"))
      ];
      const intervals = [
        interval("morning", date("08:00"), date("10:00")),
        interval("later", date("11:00"), date("12:30"))
      ];
      const configA = {
        now: new Date(date("08:30")), strategy, horizonDays: 1,
        gamma: 1, durationBuffer: 1.25, defaultDurationMinutes: 30,
        switchPenalty: 12, wsptWeight: 8, urgencyWeight: 0.6, valueWeight: 0.4
      };
      const configB = {
        now: new Date(date("09:00")), strategy: bStrategy, horizonDays: 0.125,
        gamma: 2, durationBuffer: 1.5, defaultDurationMinutes: 40,
        switchPenalty: 5, wsptWeight: 3, urgencyWeight: 0.3, valueWeight: 0.7
      };
      const reservationsA = new Map([["morning", 10], ["later", 5]]);
      const reservationsB = new Map([["morning", 20], ["later", 25]]);
      const inputs = { tasks, intervals, configA, configB, reservationsA, reservationsB };
      const before = structuredClone(inputs);
      for (const entry of tasks) { Object.freeze(entry.tags); Object.freeze(entry); }
      intervals.forEach(Object.freeze);
      Object.freeze(tasks);
      Object.freeze(intervals);
      Object.freeze(configA);
      Object.freeze(configB);

      const firstA = runScheduler(tasks, intervals, configA, reservationsA);
      const b = runScheduler(tasks, intervals, configB, reservationsB);
      const repeatedA = runScheduler(tasks, intervals, configA, reservationsA);
      // Clone the pristine snapshot, including tags, dates and reservation maps,
      // so B's reference call shares no task/interval object identities.
      const fresh = structuredClone(before);
      const freshB = runScheduler(fresh.tasks, fresh.intervals, fresh.configB, fresh.reservationsB);
      const context = `${strategy} → ${bStrategy} → ${strategy}`;
      assert.deepEqual(repeatedA, firstA, `${context}: repeated A full output`);
      assert.deepEqual(b, freshB, `${context}: B matches fresh-object full output`);
      assert.notDeepEqual(b.assignments, firstA.assignments, `${context}: configs exercise different placements`);
      assert.ok(firstA.assignments.length > 0 && b.assignments.length > 0, context);
      assert.ok(Number.isFinite(firstA.metrics.totalPostponement) && Number.isFinite(b.metrics.totalPostponement), context);
      // Freezing does not protect Date internals or Map entries; check those too.
      assert.deepEqual(inputs, before, `${context}: all inputs remain unchanged`);
    }
  }
});

test("equal-start fixed intervals retain encounter order outside the permutation premise", () => {
  const first = interval("first", "2026-09-24T10:00:00+02:00", "2026-09-24T11:00:00+02:00");
  const second = interval("second", date("08:00"), date("09:00"));
  const tasks = [task("work", 45)];
  assert.equal(Date.parse(first.startsAt), Date.parse(second.startsAt));
  for (const strategy of ["earliest_fit", "delta_cost", "delta_cost_switch"] as const) {
    const config = mergeSchedulerConfig(now, { strategy });
    const baseline = runScheduler(tasks, [first, second], config);
    assert.deepEqual(baseline.assignments, [{ taskId: "work", intervalId: "first" }]);
    assert.deepEqual(runScheduler(tasks, [second, first], config), {
      ...baseline,
      assignments: [{ taskId: "work", intervalId: "second" }]
    }, `${strategy}: ties follow encounter order with identical reasons and metrics`);
  }
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

// Each block has two unrelated transitions and three related transitions.
// Distinct block prefixes make the boundary unrelated too: counting it would
// incorrectly give five switches instead of four. Do not use switchCost as an oracle.
const transitionBlocks = [
  interval("switch-one", date("09:00"), date("10:18")),
  interval("switch-two", date("11:00"), date("12:18"))
];
const transitionSequences = transitionBlocks.map((block, index) => {
  const parent = { ...task(`${block.id}-parent`, 10) };
  const child = { ...task(`${block.id}-child`, 10), parentTaskId: parent.id };
  const sibling = { ...task(`${block.id}-sibling`, 10), parentTaskId: parent.id, tags: [block.id] };
  return [
    task(`${block.id}-unrelated-start`, 10),
    ...(index === 0 ? [parent, child] : [child, parent]),
    sibling,
    { ...task(`${block.id}-tagged`, 10), tags: [block.id] },
    task(`${block.id}-unrelated-end`, 10)
  ];
});

for (const strategy of ["earliest_fit", "delta_cost", "delta_cost_switch"] as const) {
  test(`${strategy}: known transition metrics restart in each interval`, () => {
    const config = mergeSchedulerConfig(now, { strategy });
    const tasks = transitionSequences.flat();
    const byId = new Map(tasks.map((entry) => [entry.id, entry]));
    const intervalById = new Map(transitionBlocks.map((entry) => [entry.id, entry]));
    const sequences = transitionSequences.map((entries, index) => entries.map((entry) => ({
      taskId: entry.id, intervalId: transitionBlocks[index]!.id
    })));
    const switches = (assignments: typeof sequences[number]) =>
      calculateSchedulerMetrics(assignments, [], byId, intervalById, config, new Set()).contextSwitches;

    // First block: unrelated → parent (1), parent → child (0),
    // child → sibling (0), sibling → shared tag (0), tag → unrelated (1).
    // Second block reverses child/parent: both directions remain related.
    assert.equal(switches(sequences[0]!), 2);
    assert.equal(switches(sequences[1]!), 2);
    assert.equal(switches(sequences.flat()), 2 + 2);
    // Assignment interleaving must preserve each interval's own predecessor.
    const interleaved = sequences[0]!.flatMap((entry, index) => [entry, sequences[1]![index]!]);
    assert.equal(switches(interleaved), 2 + 2);
  });
}

for (const strategy of ["earliest_fit", "delta_cost"] as const) {
  test(`${strategy}: scheduler counts transitions without applying a switch penalty to scores`, () => {
    const config = mergeSchedulerConfig(now, { strategy });
    // Equal task values retain input order for these strategies. Each block
    // holds exactly six tasks: ceil(10 × 1.25) × 6 = 78 minutes.
    const result = runScheduler(transitionSequences.flat(), transitionBlocks, config);
    assert.deepEqual(result.assignments, transitionSequences.flatMap((entries, index) => entries.map((entry) => ({
      taskId: entry.id, intervalId: transitionBlocks[index]!.id
    }))));
    assert.deepEqual(result.unassigned, []);
    assert.equal(result.metrics.contextSwitches, 2 + 2);
    assert.equal(result.metrics.assignedCount, 12);
    assert.equal(result.metrics.unassignedCount, 0);
    // Independent flexible-task postponement arithmetic: importance 5 gives
    // value 50; six tasks are charged at each block's start, with gamma = 1.
    const expectedPostponement = transitionBlocks.reduce((sum, block) => {
      const days = (Date.parse(block.startsAt) - now.getTime()) / 86_400_000;
      return sum + 6 * 50 * (1 - 1 / (1 + days / 7));
    }, 0);
    assert.ok(Math.abs(result.metrics.totalPostponement - expectedPostponement) < 1e-10);
  });
}

// Explicit, non-default scoring isolates the documented formulas from defaults.
function deferralConfig(strategy: SchedulerConfig["strategy"] = "delta_cost_switch"): SchedulerConfig {
  return {
    now: new Date("2026-10-24T12:00:00Z"), horizonDays: 7, gamma: 2,
    durationBuffer: 1, defaultDurationMinutes: 30, switchPenalty: 12,
    wsptWeight: 3, urgencyWeight: 0.7, valueWeight: 0.3, strategy
  };
}

function closeScore(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);
}

test("deadline urgency mixes value after the curve and saturates at the exact due instant", () => {
  const config = deferralConfig();
  const due = config.now.getTime() + 2 * 86_400_000;
  for (const importance of [2, 8]) {
    const candidate = { ...task("deadline"), importance, dueAt: new Date(due).toISOString() };
    // Two days, one day, and one millisecond before due; then due and overdue.
    for (const offset of [-2 * 86_400_000, -86_400_000, -1, 0, 1, 86_400_000]) {
      const at = new Date(due + offset);
      const urgency = offset >= 0 ? 100 : 100 / (1 + 2 * (-offset / 86_400_000));
      closeScore(postponementCost(candidate, at, config), 0.7 * urgency + 0.3 * importance * 10);
      closeScore(postponementCostDelta(candidate, at, config),
        0.7 * (urgency - 20)); // Value cancels; urgency at now is 100 / 5.
      const atConfig = { ...config, now: at };
      closeScore(nowMotivation(candidate, atConfig),
        importance * 10 / (1 + 2 * Math.max(0, -offset / 86_400_000)) + (offset >= 0 ? 20 : 0));
    }
    assert.ok(postponementCost(candidate, new Date(due - 1), config) < postponementCost(candidate, new Date(due), config));
    assert.equal(postponementCost(candidate, new Date(due), config), postponementCost(candidate, new Date(due + 1), config));
  }
});

test("flexible deferral uses elapsed slot delay, ignores age, and falls back for invalid due times", () => {
  const config = deferralConfig();
  for (const dueAt of [null, "", "invalid-date"]) {
    for (const createdAt of ["2000-01-01T00:00:00Z", "2026-10-24T12:00:00Z"]) {
      const candidate = { ...task("flexible"), importance: 8, dueAt, createdAt };
      for (const elapsed of [-1, 0, 1, 86_400_000, 7 * 86_400_000]) {
        const at = new Date(config.now.getTime() + elapsed);
        const expected = 80 * (1 - 1 / (1 + 2 * Math.max(0, elapsed / 86_400_000) / 7));
        closeScore(postponementCost(candidate, at, config), expected);
        closeScore(postponementCostDelta(candidate, at, config), expected);
        assert.equal(nowMotivation(candidate, { ...config, now: at }), 80);
      }
    }
  }
  // Fixed appointments retain flexible deferral even when they also have a due date.
  const fixed = { ...task("fixed", 30, "2026-10-24T13:00:00Z", "2026-10-24T14:00:00Z"), dueAt: config.now.toISOString() };
  assert.equal(postponementCost(fixed, config.now, config), 0);
  assert.equal(nowMotivation(fixed, config), 50);
});

test("waitHorizon selects the earlier valid due or elapsed horizon, including millisecond boundaries", () => {
  const config = deferralConfig();
  const originalNow = config.now.getTime();
  const horizon = originalNow + 7 * 86_400_000; // Spans Berlin's fall DST change: seven elapsed days.
  for (const due of [originalNow - 1, originalNow, originalNow + 1, horizon - 1, horizon, horizon + 1]) {
    assert.equal(waitHorizon({ ...task("waiting"), dueAt: new Date(due).toISOString() }, config).getTime(), Math.min(due, horizon));
  }
  for (const dueAt of [null, "", "invalid-date"]) {
    assert.equal(waitHorizon({ ...task("waiting"), dueAt }, config).getTime(), horizon);
  }
  assert.equal(waitHorizon(task("zero-horizon"), { ...config, horizonDays: 0 }).getTime(), originalNow);
  assert.equal(waitHorizon(task("fractional-horizon"), { ...config, horizonDays: 0.5 }).getTime(), originalNow + 43_200_000);
  assert.equal(config.now.getTime(), originalNow, "horizon calculation leaves now intact");
});

test("switch exemptions are symmetric for identity, siblings, parent/child and exact shared tags", () => {
  const previous = { ...task("previous"), parentTaskId: "parent", tags: ["project", ""] };
  const cases: [TaskScheduleInput, number][] = [
    [{ ...task("previous"), tags: [] }, 0],
    [{ ...task("sibling"), parentTaskId: "parent" }, 0],
    [task("parent"), 0],
    [{ ...task("child"), parentTaskId: "previous" }, 0],
    [{ ...task("tagged"), tags: ["other", "project"] }, 0],
    [{ ...task("unrelated"), parentTaskId: "different" }, 12],
    [{ ...task("empty-tag"), tags: [""] }, 12],
    [{ ...task("case-sensitive"), tags: ["Project"] }, 12]
  ];
  for (const [next, expected] of cases) {
    assert.equal(switchCost(previous, next, 12), expected, next.id);
    assert.equal(switchCost(next, previous, 12), expected, `reverse ${next.id}`);
    for (const penalty of [0, -1]) assert.equal(switchCost(previous, next, penalty), 0);
  }
  assert.equal(switchCost(null, previous, 12), 0);
  assert.equal(switchCost(task("a"), task("b"), 12), 12, "empty parents are not siblings");
  assert.equal(switchCost(task("a"), task("b"), 0.001), 0.001);
});

for (const relationship of ["unrelated", "shared tags", "siblings", "parent/child"] as const) {
  for (const deadlines of [false, true]) {
    for (const capacity of ["roomy", "tight", "separate reserved intervals"] as const) {
      test(`zero switch penalty matches delta_cost fully: ${relationship}, ${deadlines ? "deadlines" : "flexible"}, ${capacity}`, () => {
        const high = { ...task("high"), importance: 9 };
        const middle = { ...task("middle"), importance: 6, tags: ["other"] };
        const low = { ...task("low"), importance: 5 };
        if (relationship === "shared tags") {
          high.tags = ["project", "high-only"];
          low.tags = ["low-only", "project"];
        } else if (relationship === "siblings") {
          high.parentTaskId = low.parentTaskId = "external-parent";
        } else if (relationship === "parent/child") {
          low.parentTaskId = high.id;
        }
        const tasks = [middle, low, high, task("overflow", 200)].map((entry) => ({
          ...entry,
          // Low must fit the first block; high can also fit the later block.
          dueAt: deadlines ? (entry.id === "low" ? date("10:54") : date("12:00")) : null
        }));
        const blocks = capacity === "separate reserved intervals"
          ? [interval("first", date("09:00"), date("10:30")), interval("later", date("11:00"), date("11:45"))]
          : [interval("only", date("09:00"), date(capacity === "roomy" ? "10:54" : "10:16"))];
        const reservations = capacity === "separate reserved intervals"
          ? new Map([["first", 14], ["later", 7]]) : new Map<string, number>();
        // Leave every other default intact. The only difference between calls
        // is strategy; compare ordered assignments, reasons, and all metrics.
        const config = mergeSchedulerConfig(now, { strategy: "delta_cost", switchPenalty: 0 });
        const baseline = runScheduler(tasks, blocks, config, reservations);
        const switched = runScheduler(tasks, blocks, { ...config, strategy: "delta_cost_switch" }, reservations);
        assert.deepEqual(switched, baseline);
        // Guard against vacuous equality: ceil(30 * 1.25) = 38 minutes,
        // leaving oversized work (and one ordinary task in the tight block).
        const assignedCount = capacity === "tight" ? 2 : 3;
        assert.equal(baseline.assignments.length, assignedCount);
        assert.equal(baseline.metrics.assignedCount, assignedCount);
        assert.equal(baseline.unassigned.length, tasks.length - assignedCount);
        assert.equal(baseline.metrics.unassignedCount, tasks.length - assignedCount);
        assert.ok(baseline.unassigned.some(({ taskId, reason }) => taskId === "overflow" && reason === "no_feasible_interval"));
        assert.ok(Number.isFinite(baseline.metrics.totalPostponement) && baseline.metrics.totalPostponement > 0);
        assert.equal(baseline.metrics.contextSwitches, 0, "zero penalty also suppresses the transition metric");
        if (capacity === "separate reserved intervals") {
          assert.deepEqual(baseline.assignments.map(({ intervalId }) => intervalId), ["first", "first", "later"]);
          if (deadlines) assert.ok(baseline.assignments.some(({ taskId, intervalId }) => taskId === "low" && intervalId === "first"));
        }
      });
    }
  }
}

for (const strategy of ["earliest_fit", "delta_cost", "delta_cost_switch"] as const) {
  test(`${strategy}: preserves value ranking and only switch-aware placement promotes related work`, () => {
    const config = deferralConfig(strategy);
    const high = { ...task("high"), importance: 9, tags: ["project"] };
    const middle = { ...task("middle"), importance: 6 };
    const low = { ...task("low"), importance: 5 };
    const block = interval("ranking", config.now.toISOString(), new Date(config.now.getTime() + 90 * 60_000).toISOString());
    const order = (tasks: TaskScheduleInput[]) => runScheduler(tasks, [block], config).assignments.map(({ taskId }) => taskId);
    assert.deepEqual(order([low, middle, high]), ["high", "middle", "low"]);
    assert.deepEqual(order([middle, high, low]), ["high", "middle", "low"]);
    for (const related of [
      { ...low, tags: ["project"] },
      { ...low, parentTaskId: high.id },
      { ...low, parentTaskId: "common-parent" }
    ]) {
      const first = related.parentTaskId === "common-parent" ? { ...high, parentTaskId: "common-parent" } : high;
      assert.deepEqual(order([middle, related, first]),
        strategy === "delta_cost_switch" ? ["high", "low", "middle"] : ["high", "middle", "low"]);
      // Motivation and deferral rankings themselves never depend on placement strategy or relationships.
      assert.ok(nowMotivation(first, config) > nowMotivation(middle, config));
      assert.ok(nowMotivation(middle, config) > nowMotivation(related, config));
      const at = new Date(config.now.getTime() + 86_400_000);
      assert.ok(postponementCost(middle, at, config) > postponementCost(related, at, config));
    }
    const deadlines = [4, 1, 2].map((days) => ({ ...task(`due-${days}`), dueAt: new Date(config.now.getTime() + days * 86_400_000).toISOString() }));
    assert.deepEqual([...deadlines].sort((a, b) => nowMotivation(b, config) - nowMotivation(a, config)).map(({ id }) => id), ["due-1", "due-2", "due-4"]);
    assert.deepEqual([...deadlines].sort((a, b) => postponementCost(b, config.now, config) - postponementCost(a, config.now, config)).map(({ id }) => id), ["due-1", "due-2", "due-4"]);
  });
}

// Clock regressions use literal instants/local wall times and hand-computed
// expectations, independently of the production lead/horizon constants.
const nudgeAppointment = (id: string, start = date("14:00"), end = date("15:00")) => item({
  id, title: "Meet Tonio", isTask: true, taskStatus: "active",
  taskFixedStartsAt: start, taskFixedEndsAt: end
});

test("appointment nudges require an active task and two parseable fixed endpoints", () => {
  const active = nudgeAppointment("active");
  const rejected: Item[] = [
    ...(["done", "later", "cancelled"] as const).map((taskStatus) => ({ ...active, id: taskStatus, taskStatus })),
    { ...active, id: "note", isTask: false },
    { ...active, id: "no-start", taskFixedStartsAt: "" },
    { ...active, id: "no-end", taskFixedEndsAt: "" },
    { ...active, id: "bad-start", taskFixedStartsAt: "not a time" },
    { ...active, id: "bad-end", taskFixedEndsAt: "not a time" }
  ];
  assert.deepEqual(buildNudges([active, ...rejected], [], new Date(date("13:00"))), [
    { id: "appt:active:2026-09-24T14:00:00.000Z:soon", kind: "appointment_soon",
      fireAt: Date.parse(date("13:50")), expiresAt: Date.parse(date("14:00")),
      title: "Appointment in 10 minutes", body: "Meet Tonio" },
    { id: "appt:active:2026-09-24T14:00:00.000Z:start", kind: "appointment_start",
      fireAt: Date.parse(date("14:00")), expiresAt: Date.parse(date("14:05")),
      title: "Appointment now", body: "Meet Tonio" }
  ]);
  const untitled = { ...active, title: "" };
  assert.deepEqual(buildNudges([untitled], [], new Date(date("13:00"))).map(({ body }) => body), ["Untitled", "Untitled"]);
});

test("appointment lead and start expiry boundaries are strict and rescheduling changes both IDs", () => {
  const appointment = nudgeAppointment("clock");
  for (const [at, expected] of [
    ["13:49:59.999", ["appointment_soon", "appointment_start"]],
    ["13:50:00.000", ["appointment_soon", "appointment_start"]],
    ["13:59:59.999", ["appointment_soon", "appointment_start"]],
    ["14:00:00.000", ["appointment_start"]],
    ["14:04:59.999", ["appointment_start"]],
    ["14:05:00.000", []]
  ] as const) {
    assert.deepEqual(buildNudges([appointment], [], new Date(`2026-09-24T${at}Z`)).map(({ kind }) => kind), expected, at);
  }
  const rescheduled = nudgeAppointment("clock", "2026-09-24T16:00:00+02:00", date("15:30"));
  assert.deepEqual(buildNudges([rescheduled], [], new Date(date("13:00"))).map(({ id }) => id), [
    "appt:clock:2026-09-24T14:00:00.000Z:soon", "appt:clock:2026-09-24T14:00:00.000Z:start"
  ], "equivalent offset spelling keeps identity");
  rescheduled.taskFixedStartsAt = date("14:30");
  assert.deepEqual(buildNudges([rescheduled], [], new Date(date("13:00"))).map(({ id }) => id), [
    "appt:clock:2026-09-24T14:30:00.000Z:soon", "appt:clock:2026-09-24T14:30:00.000Z:start"
  ]);
});

test("work-block nudges use the first committed active task in link order or fallback", () => {
  const block = { ...workBlock("work", date("14:00"), date("15:00")), title: "Deep work" };
  const fallback = { ...workBlock("fallback", date("16:00"), date("17:00")), title: "" };
  const first = { ...scheduledTask("first", 30), title: "First commitment" };
  const second = { ...scheduledTask("second", 30), title: "Second commitment" };
  const inactive = (["done", "later", "cancelled"] as const).map((taskStatus) => ({
    ...scheduledTask(taskStatus, 30), taskStatus
  }));
  const note = item({ id: "note", title: "Not a task" });
  const items = [block, fallback, second, ...inactive, note, first,
    { ...block, id: "archived", intervalStatus: "archived" },
    { ...block, id: "no-endpoints", intervalStartsAt: "", intervalEndsAt: "" },
    { ...block, id: "not-interval", isInterval: false }];
  const links = [link("missing", "missing", "work"), ...inactive.map(({ id }) => link(id, id, "work")),
    link("note", "note", "work"), { ...link("context", "second", "work"), kind: "context" as const },
    link("first", "first", "work"), link("second", "second", "work"),
    ...inactive.map(({ id }) => link(`fallback-${id}`, id, "fallback"))];
  assert.deepEqual(buildNudges(items, links, new Date(date("13:00"))), [
    { id: "block:work:2026-09-24T14:00:00.000Z:soon", kind: "block_soon",
      fireAt: Date.parse(date("13:50")), expiresAt: Date.parse(date("14:00")),
      title: "Deep work in 10 minutes", body: "First commitment" },
    { id: "block:work:2026-09-24T14:00:00.000Z:start", kind: "block_start",
      fireAt: Date.parse(date("14:00")), expiresAt: Date.parse(date("14:05")),
      title: "Deep work now", body: "First commitment" },
    { id: "block:fallback:2026-09-24T16:00:00.000Z:soon", kind: "block_soon",
      fireAt: Date.parse(date("15:50")), expiresAt: Date.parse(date("16:00")),
      title: "Work block in 10 minutes", body: "Nothing committed yet — open Now" },
    { id: "block:fallback:2026-09-24T16:00:00.000Z:start", kind: "block_start",
      fireAt: Date.parse(date("16:00")), expiresAt: Date.parse(date("16:05")),
      title: "Work block now", body: "Nothing committed yet — open Now" }
  ]);
});

test("current behavior: one-endpoint intervals generate block nudges at that endpoint", () => {
  for (const patch of [{ intervalStartsAt: "" }, { intervalEndsAt: "" }]) {
    const block = { ...workBlock("single", date("14:00"), date("14:00")), ...patch };
    assert.deepEqual(buildNudges([block], [], new Date(date("13:00"))).map(({ id, fireAt, expiresAt }) => ({ id, fireAt, expiresAt })), [
      { id: "block:single:2026-09-24T14:00:00.000Z:soon", fireAt: Date.parse(date("13:50")), expiresAt: Date.parse(date("14:00")) },
      { id: "block:single:2026-09-24T14:00:00.000Z:start", fireAt: Date.parse(date("14:00")), expiresAt: Date.parse(date("14:05")) }
    ]);
  }
});

test("current behavior: a blank first active commitment uses fallback rather than the next title", () => {
  const block = workBlock("work", date("14:00"), date("15:00"));
  const items = [block, { ...scheduledTask("blank", 30), title: "" }, { ...scheduledTask("named", 30), title: "Named" }];
  assert.deepEqual(buildNudges(items, [link("blank", "blank", "work"), link("named", "named", "work")], new Date(date("13:00")))
    .map(({ body }) => body), ["Nothing committed yet — open Now", "Nothing committed yet — open Now"]);
});

for (const day of ["2026-03-28", "2026-03-29", "2026-03-30", "2026-10-24", "2026-10-25", "2026-10-26"]) {
  test(`empty morning uses the local date and 08:50–09:10 window around DST: ${day}`, () => {
    const at = new Date(`${day}T08:50:00`);
    const snapshot = at.getTime();
    const expected = { id: `empty-morning:${day}`, kind: "empty_morning",
      fireAt: new Date(`${day}T08:50:00`).getTime(), expiresAt: new Date(`${day}T09:10:00`).getTime(),
      title: "No morning block", body: "Block morning so work has a place to land." };
    assert.deepEqual(buildNudges([], [], at), [expected]);
    assert.deepEqual(buildNudges([], [], new Date(`${day}T00:05:00`)), [expected],
      "local date key near midnight, when Berlin and UTC dates differ");
    assert.equal(at.getTime(), snapshot);
    assert.deepEqual(buildNudges([], [], new Date(`${day}T09:09:59.999`)), [expected]);
    assert.deepEqual(buildNudges([], [], new Date(`${day}T09:10:00`)), []);
    // Independent offset table pins Berlin's transition rather than assuming a
    // day is 24 elapsed hours. The same suite also runs in UTC.
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const offset = zone === "Europe/Berlin"
      ? (["2026-03-28", "2026-10-25", "2026-10-26"].includes(day) ? "+01:00" : "+02:00") : "Z";
    if (zone === "Europe/Berlin" || zone === "UTC") {
      assert.equal(expected.fireAt, Date.parse(`${day}T08:50:00${offset}`));
      assert.equal(expected.expiresAt, Date.parse(`${day}T09:10:00${offset}`));
    }
  });
}

test("empty morning is suppressed by non-archived overlap but ignores archived and endpoint-less intervals", () => {
  const at = new Date("2026-09-24T08:50:00");
  const morning = (items: Item[]) => buildNudges(items, [], at).filter(({ kind }) => kind === "empty_morning");
  const block = workBlock("morning", "2026-09-24T10:00:00", "2026-09-24T11:00:00");
  assert.deepEqual(morning([block]), []);
  assert.equal(morning([{ ...block, intervalStatus: "archived" }]).length, 1);
  assert.equal(morning([{ ...block, intervalStartsAt: "", intervalEndsAt: "" }]).length, 1);
  assert.equal(morning([{ ...block, isInterval: false }]).length, 1);
  assert.equal(morning([workBlock("after", "2026-09-24T12:00:00", "2026-09-24T13:00:00")]).length, 1,
    "starting at 12:00 only touches the boundary");
  assert.deepEqual(morning([workBlock("before-noon", "2026-09-24T11:59:59.999", "2026-09-24T13:00:00")]), []);
  assert.equal(morning([workBlock("early", "2026-09-24T08:00:00", "2026-09-24T08:59:59.999")]).length, 1);
});

test("current behavior: an interval ending exactly at 09:00 suppresses empty morning", () => {
  assert.deepEqual(buildNudges([workBlock("touch", "2026-09-24T08:00:00", "2026-09-24T09:00:00")], [],
    new Date("2026-09-24T08:50:00")).filter(({ kind }) => kind === "empty_morning"), []);
});

test("nudge horizon excludes fireAt exactly 24 elapsed hours away and includes one millisecond before", () => {
  const at = new Date(date("13:00"));
  for (const [start, expectedKinds] of [
    ["2026-09-25T12:59:59.999Z", ["appointment_soon", "appointment_start"]],
    ["2026-09-25T13:00:00.000Z", ["appointment_soon"]],
    ["2026-09-25T13:09:59.999Z", ["appointment_soon"]],
    ["2026-09-25T13:10:00.000Z", []]
  ] as const) {
    assert.deepEqual(buildNudges([nudgeAppointment("horizon", start, "2026-09-25T14:00:00Z")], [], at)
      .map(({ kind }) => kind), expectedKinds, start);
  }
});

for (const fixture of [
  { name: "spring forward", at: "2026-03-28T13:00:00+01:00", start: "2026-03-29T14:00:00+02:00", end: "2026-03-29T15:00:00+02:00" },
  { name: "fall back", at: "2026-10-24T13:00:00+02:00", start: "2026-10-25T12:00:00+01:00", end: "2026-10-25T13:00:00+01:00" }
]) {
  test(`nudge horizon is 24 elapsed hours across Berlin ${fixture.name}`, () => {
    const appointment = nudgeAppointment("dst", fixture.start, fixture.end);
    const at = new Date(fixture.at);
    assert.deepEqual(buildNudges([appointment], [], at).map(({ kind }) => kind), ["appointment_soon"]);
    assert.deepEqual(buildNudges([appointment], [], new Date(at.getTime() + 1)).map(({ kind }) => kind), ["appointment_soon", "appointment_start"]);
  });
}

test("nudges sort by fireAt then ID and leave items, links and now unchanged", () => {
  const items = [nudgeAppointment("z"), workBlock("b", date("14:00"), date("15:00")), nudgeAppointment("a"), nudgeAppointment("early", date("13:30"))];
  const links = [link("z", "z", "b"), link("a", "a", "b")];
  const at = new Date(date("13:00"));
  const snapshot = structuredClone({ items, links, at });
  const result = buildNudges(items, links, at);
  assert.deepEqual(result.map(({ id }) => id), [
    "appt:early:2026-09-24T13:30:00.000Z:soon", "appt:early:2026-09-24T13:30:00.000Z:start",
    "appt:a:2026-09-24T14:00:00.000Z:soon", "appt:z:2026-09-24T14:00:00.000Z:soon", "block:b:2026-09-24T14:00:00.000Z:soon",
    "appt:a:2026-09-24T14:00:00.000Z:start", "appt:z:2026-09-24T14:00:00.000Z:start", "block:b:2026-09-24T14:00:00.000Z:start"
  ]);
  assert.deepEqual({ items, links, at }, snapshot);
});

test("nextPendingNudge skips fired IDs and exact-expiry nudges, returns null, and preserves inputs", () => {
  const nudges = buildNudges([nudgeAppointment("a"), nudgeAppointment("b")], [], new Date(date("13:00")));
  const at = new Date(date("14:00"));
  const fired = new Set(["appt:a:2026-09-24T14:00:00.000Z:start"]);
  const snapshot = structuredClone({ nudges, at, fired });
  assert.strictEqual(nextPendingNudge(nudges, at, fired), nudges[3]);
  assert.deepEqual({ nudges, at, fired }, snapshot);
  fired.add(nudges[3].id);
  assert.equal(nextPendingNudge(nudges, at, fired), null);
  assert.equal(nextPendingNudge(nudges, new Date(date("14:05")), new Set()), null);
  assert.equal(nextPendingNudge([], at, new Set()), null);
});

test("current behavior: nextPendingNudge returns future nudges and follows input order", () => {
  const nudges = buildNudges([nudgeAppointment("a")], [], new Date(date("13:00")));
  const at = new Date(date("13:00"));
  assert.strictEqual(nextPendingNudge(nudges, at, new Set()), nudges[0]);
  assert.strictEqual(nextPendingNudge([nudges[1], nudges[0]], at, new Set()), nudges[1]);
});

for (const fixture of [
  { name: "spring jump", start: "2026-03-29T03:00:00+02:00", end: "2026-03-29T04:00:00+02:00",
    at: "2026-03-29T00:45:00Z", soon: "2026-03-29T00:50:00Z", startUtc: "2026-03-29T01:00:00.000Z", expiry: "2026-03-29T01:05:00Z" },
  { name: "repeated autumn hour", start: "2026-10-25T02:00:00+01:00", end: "2026-10-25T03:00:00+01:00",
    at: "2026-10-25T00:45:00Z", soon: "2026-10-25T00:50:00Z", startUtc: "2026-10-25T01:00:00.000Z", expiry: "2026-10-25T01:05:00Z" }
]) {
  test(`appointment and block leads span the Berlin ${fixture.name} in elapsed minutes`, () => {
    const items = [nudgeAppointment("transition", fixture.start, fixture.end), workBlock("transition", fixture.start, fixture.end)];
    const clocks = (at: string) => buildNudges(items, [], new Date(at)).filter(({ kind }) => kind !== "empty_morning");
    assert.deepEqual(clocks(fixture.at).map(({ id, fireAt, expiresAt }) => ({ id, fireAt, expiresAt })), [
      { id: `appt:transition:${fixture.startUtc}:soon`, fireAt: Date.parse(fixture.soon), expiresAt: Date.parse(fixture.startUtc) },
      { id: `block:transition:${fixture.startUtc}:soon`, fireAt: Date.parse(fixture.soon), expiresAt: Date.parse(fixture.startUtc) },
      { id: `appt:transition:${fixture.startUtc}:start`, fireAt: Date.parse(fixture.startUtc), expiresAt: Date.parse(fixture.expiry) },
      { id: `block:transition:${fixture.startUtc}:start`, fireAt: Date.parse(fixture.startUtc), expiresAt: Date.parse(fixture.expiry) }
    ]);
    assert.deepEqual(clocks(fixture.startUtc).map(({ kind }) => kind), ["appointment_start", "block_start"]);
    assert.deepEqual(clocks(fixture.expiry), []);
  });
}
