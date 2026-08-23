import type { Item } from "../item";
import type { ItemLink } from "../links";
import { inferDeferralCostCurve, postponementCost, postponementCostDelta } from "./deferralCost";
import { taskConstraint } from "./constraints";
import { runScheduler, buildSchedulingContext, algorithmRelevanceEnricher } from "./engine";
import { DEFAULT_SCHEDULER_CONFIG } from "./types";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function makeTask(overrides: Partial<Item> & Pick<Item, "id" | "title">): Item {
  return {
    ownerId: "owner",
    body: "",
    isTask: true,
    isDocumentation: false,
    isInterval: false,
    taskStatus: "active",
    expectedDurationMinutes: 30,
    dueAt: null,
    fixedStartsAt: null,
    fixedEndsAt: null,
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
    intervalKind: "",
    intervalStartsAt: "",
    intervalEndsAt: "",
    intervalStatus: "",
    revision: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

function makeInterval(overrides: Partial<Item> & Pick<Item, "id" | "title">): Item {
  return {
    ownerId: "owner",
    body: "",
    isTask: false,
    isDocumentation: false,
    isInterval: true,
    taskStatus: null,
    expectedDurationMinutes: null,
    dueAt: null,
    fixedStartsAt: null,
    fixedEndsAt: null,
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
    intervalKind: "fixed",
    intervalStartsAt: "2026-07-27T09:00:00.000Z",
    intervalEndsAt: "2026-07-27T11:00:00.000Z",
    intervalStatus: "scheduled",
    revision: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

/** Lightweight self-checks for scheduling logic (no test runner required). */
export function assertSchedulingFixtures(): void {
  const now = new Date("2026-07-26T12:00:00.000Z");
  const urgent = makeTask({
    id: "urgent",
    title: "Due tomorrow",
    dueAt: "2026-07-27T18:00:00.000Z"
  });
  const flex = makeTask({
    id: "flex",
    title: "Flexible",
    createdAt: "2026-07-26T12:00:00.000Z"
  });
  const fixed = makeTask({
    id: "fixed",
    title: "Appointment",
    fixedStartsAt: "2026-07-27T14:00:00.000Z",
    fixedEndsAt: "2026-07-27T15:00:00.000Z"
  });
  const interval = makeInterval({ id: "interval-1", title: "Morning block" });
  const items = [urgent, flex, fixed, interval];
  const links: ItemLink[] = [];

  const ctx = buildSchedulingContext(items, links, now, {
    ...DEFAULT_SCHEDULER_CONFIG,
    includePlanningTasks: true
  });
  const proposal = runScheduler(ctx, [algorithmRelevanceEnricher]);

  assert(!proposal.assignments.some((entry) => entry.taskId === "fixed"), "fixed tasks must be excluded");
  assert(proposal.assignments.length >= 1, "at least one task should be assigned");
  assert(
    proposal.assignments[0]?.taskId === "urgent",
    "deadline task should outrank flexible task"
  );

  const fullInterval = makeInterval({
    id: "full",
    title: "Full",
    intervalStartsAt: "2026-07-27T13:00:00.000Z",
    intervalEndsAt: "2026-07-27T13:30:00.000Z"
  });
  const longTask = makeTask({
    id: "long",
    title: "Long task",
    expectedDurationMinutes: 60
  });
  const overflowCtx = buildSchedulingContext([longTask, fullInterval], [], now, DEFAULT_SCHEDULER_CONFIG);
  const overflow = runScheduler(overflowCtx, [algorithmRelevanceEnricher]);
  assert(
    overflow.unassigned.some((entry) => entry.taskId === "long"),
    "task exceeding interval capacity should remain unassigned"
  );

  const deadlineTask = makeTask({
    id: "deadline-curve",
    title: "Deadline curve",
    dueAt: "2026-07-28T12:00:00.000Z"
  });
  const deadlineConstraint = taskConstraint(deadlineTask)!;
  const deadlineCurve = inferDeferralCostCurve(deadlineTask, deadlineConstraint).curve;
  assert(deadlineCurve.kind === "deadline_step", "deadline tasks use deadline_step curve");
  const beforeDue = postponementCost(deadlineCurve, new Date("2026-07-27T12:00:00.000Z"));
  const afterDue = postponementCost(deadlineCurve, new Date("2026-07-29T12:00:00.000Z"));
  assert(afterDue > beforeDue + 50, "deadline curve should step up at dueAt");

  const linearTask = makeTask({
    id: "linear-curve",
    title: "Linear curve",
    createdAt: "2026-07-20T12:00:00.000Z"
  });
  const linearConstraint = taskConstraint(linearTask)!;
  const linearCurve = inferDeferralCostCurve(linearTask, linearConstraint).curve;
  assert(linearCurve.kind === "linear_continuous", "flexible tasks use linear_continuous curve");
  const linearEarly = postponementCost(linearCurve, new Date("2026-07-22T12:00:00.000Z"));
  const linearLate = postponementCost(linearCurve, new Date("2026-07-26T12:00:00.000Z"));
  assert(linearLate > linearEarly, "linear curve should grow with postponement");
  assert(
    postponementCostDelta(linearCurve, new Date("2026-07-26T12:00:00.000Z"), new Date("2026-07-28T12:00:00.000Z")) > 0,
    "deferring further should add linear cost"
  );
}

export { makeTask, makeInterval };
