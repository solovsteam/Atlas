import { runScheduler } from "./engine";
import { nowMotivation, postponementCost } from "./deferral";
import { mergeSchedulerConfig, type IntervalInput, type PlacementStrategy, type TaskScheduleInput } from "./types";
import { buildNowFocus } from "./now";
import { isOverdue } from "../due";
import { buildNudges } from "../nudges";
import { calendarIcs } from "../ics";
import type { Item } from "../item";
import type { ItemLink } from "../links";

const NOW = new Date("2026-08-23T10:00:00.000Z");

function task(partial: Partial<TaskScheduleInput> & Pick<TaskScheduleInput, "id" | "title">): TaskScheduleInput {
  return {
    createdAt: "2026-01-01T00:00:00.000Z",
    importance: 5,
    durationMinutes: 30,
    dueAt: null,
    fixedStartsAt: null,
    fixedEndsAt: null,
    parentTaskId: "",
    tags: [],
    ...partial
  };
}

function interval(id: string, startHour: number, endHour: number, dayOffset = 0): IntervalInput {
  const start = new Date(NOW);
  start.setUTCDate(start.getUTCDate() + dayOffset);
  start.setUTCHours(startHour, 0, 0, 0);
  const end = new Date(start);
  end.setUTCHours(endHour, 0, 0, 0);
  return {
    id,
    title: id,
    kind: "fixed",
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    archived: false
  };
}

export type FixtureResult = {
  name: string;
  pass: boolean;
  detail: string;
};

function assert(name: string, pass: boolean, detail: string): FixtureResult {
  return { name, pass, detail };
}

function compareStrategies(tasks: TaskScheduleInput[], intervals: IntervalInput[]) {
  const strategies: PlacementStrategy[] = ["earliest_fit", "delta_cost", "delta_cost_switch"];
  return Object.fromEntries(
    strategies.map((strategy) => [
      strategy,
      runScheduler(tasks, intervals, mergeSchedulerConfig(NOW, { strategy }))
    ])
  ) as Record<PlacementStrategy, ReturnType<typeof runScheduler>>;
}

export function runSchedulingFixtures(): FixtureResult[] {
  const results: FixtureResult[] = [];

  {
    const dueTomorrow = task({
      id: "due",
      title: "Due tomorrow",
      dueAt: "2026-08-24T18:00:00.000Z",
      importance: 3,
      durationMinutes: 30
    });
    const ancient = task({
      id: "old",
      title: "Two-year-old junk",
      createdAt: "2024-08-23T10:00:00.000Z",
      importance: 1,
      durationMinutes: 30
    });
    const config = mergeSchedulerConfig(NOW);
    const dueScore = nowMotivation(dueTomorrow, config);
    const oldScore = nowMotivation(ancient, config);
    results.push(
      assert(
        "tmt-deadline-beats-old-junk",
        dueScore > oldScore,
        `due ${dueScore.toFixed(1)} vs old ${oldScore.toFixed(1)} (age must not saturate urgency)`
      )
    );
  }

  {
    const morning = interval("am", 9, 11);
    const tasks = [
      task({ id: "due", title: "Due tonight", dueAt: "2026-08-23T20:00:00.000Z", importance: 4 }),
      task({ id: "flex", title: "Flexible", importance: 9 })
    ];
    const result = runScheduler(tasks, [morning], mergeSchedulerConfig(NOW, { strategy: "delta_cost" }));
    const order = result.assignments.map((entry) => entry.taskId);
    results.push(
      assert(
        "deadline-takes-scarce-morning",
        order[0] === "due",
        `assignments ${JSON.stringify(result.assignments)}`
      )
    );
  }

  {
    const tight = interval("hole", 10, 11);
    const tasks = [
      task({ id: "short", title: "Short high value", importance: 10, durationMinutes: 15 }),
      task({ id: "long", title: "Long medium", importance: 6, durationMinutes: 180 })
    ];
    const result = runScheduler(tasks, [tight], mergeSchedulerConfig(NOW, { strategy: "delta_cost" }));
    results.push(
      assert(
        "wspt-short-fits-small-hole",
        result.assignments.length === 1 && result.assignments[0]?.taskId === "short",
        JSON.stringify(result.assignments)
      )
    );
  }

  {
    const block = interval("block", 9, 13);
    const tasks = [
      task({ id: "a1", title: "Project A 1", parentTaskId: "parent", tags: ["a"], importance: 5 }),
      task({ id: "b1", title: "Project B", tags: ["b"], importance: 5.1 }),
      task({ id: "a2", title: "Project A 2", parentTaskId: "parent", tags: ["a"], importance: 5 })
    ];
    const switched = runScheduler(tasks, [block], mergeSchedulerConfig(NOW, { strategy: "delta_cost_switch" }));
    const naive = runScheduler(tasks, [block], mergeSchedulerConfig(NOW, { strategy: "delta_cost" }));
    results.push(
      assert(
        "switch-batches-same-parent",
        switched.metrics.contextSwitches <= naive.metrics.contextSwitches,
        `switch ${switched.metrics.contextSwitches} vs naive ${naive.metrics.contextSwitches}; order ${switched.assignments.map((entry) => entry.taskId).join(",")}`
      )
    );
  }

  {
    const morning = interval("am", 9, 10);
    const appointment = task({
      id: "appt",
      title: "Appointment",
      fixedStartsAt: "2026-08-23T09:00:00.000Z",
      fixedEndsAt: "2026-08-23T11:00:00.000Z"
    });
    const work = task({ id: "work", title: "Needs 30m", durationMinutes: 30, importance: 8 });
    const result = runScheduler([appointment, work], [morning], mergeSchedulerConfig(NOW));
    const workAssigned = result.assignments.some((entry) => entry.taskId === "work");
    results.push(
      assert(
        "appointments-consume-capacity",
        !workAssigned && result.unassigned.some((entry) => entry.taskId === "work" && entry.reason === "no_feasible_interval"),
        JSON.stringify({ assignments: result.assignments, unassigned: result.unassigned })
      )
    );
  }

  {
    const later = new Date("2026-08-30T10:00:00.000Z");
    const flex = task({ id: "flex", title: "Flex", importance: 8 });
    const config = mergeSchedulerConfig(NOW);
    const nowCost = postponementCost(flex, NOW, config);
    const laterCost = postponementCost(flex, later, config);
    results.push(assert("flexible-later-costs-more", laterCost > nowCost, `now ${nowCost.toFixed(2)} later ${laterCost.toFixed(2)}`));
  }

  {
    const intervals = [interval("d0", 14, 16, 0), interval("d5", 14, 16, 5)];
    const dueSoon = task({
      id: "soon",
      title: "Due in two days",
      dueAt: "2026-08-25T18:00:00.000Z",
      importance: 5,
      durationMinutes: 60
    });
    const compared = compareStrategies([dueSoon], intervals);
    const deltaSlot = compared.delta_cost.assignments[0]?.intervalId;
    results.push(
      assert(
        "delta-places-deadline-before-due",
        deltaSlot === "d0",
        `delta_cost assigned to ${deltaSlot ?? "none"}; earliest ${compared.earliest_fit.assignments[0]?.intervalId ?? "none"}`
      )
    );
  }

  {
    const overflow = [
      task({ id: "t1", title: "A", durationMinutes: 60, importance: 8 }),
      task({ id: "t2", title: "B", durationMinutes: 60, importance: 8 }),
      task({ id: "t3", title: "C", durationMinutes: 60, importance: 8 })
    ];
    const tiny = [interval("tiny", 9, 11)];
    const result = runScheduler(overflow, tiny, mergeSchedulerConfig(NOW));
    results.push(
      assert(
        "overflow-stays-unassigned",
        result.assignments.length === 1 && result.unassigned.filter((entry) => entry.reason === "no_feasible_interval").length === 2,
        `assigned ${result.assignments.length}, unassigned ${JSON.stringify(result.unassigned)}`
      )
    );
  }

  {
    const partial = task({
      id: "partial",
      title: "Partial appointment",
      fixedStartsAt: "2026-08-23T15:00:00.000Z",
      importance: 9
    });
    const result = runScheduler([partial], [interval("am", 9, 12)], mergeSchedulerConfig(NOW));
    results.push(
      assert(
        "partial-appointment-missing-info",
        result.unassigned.some((entry) => entry.taskId === "partial" && entry.reason === "missing_info"),
        JSON.stringify(result.unassigned)
      )
    );
  }

  {
    const quick = task({ id: "email", title: "Two-minute email", durationMinutes: 2, importance: 9 });
    const real = task({ id: "real", title: "Real work", durationMinutes: 30, importance: 4 });
    const result = runScheduler([quick, real], [interval("am", 9, 12)], mergeSchedulerConfig(NOW));
    results.push(
      assert(
        "quick-tasks-skip-calendar",
        !result.assignments.some((entry) => entry.taskId === "email") &&
          result.assignments.some((entry) => entry.taskId === "real") &&
          result.unassigned.some((entry) => entry.taskId === "email" && entry.reason === "quick"),
        JSON.stringify(result.assignments)
      )
    );
  }

  {
    results.push(assert("past-due-is-overdue", isOverdue("2020-01-01T00:00:00.000Z", NOW), "expected overdue"));
    results.push(assert("future-due-is-not-overdue", !isOverdue("2099-01-01T00:00:00.000Z", NOW), "expected not overdue"));
  }

  {
    const quick = sampleItem({ id: "email", title: "Two-minute email", expectedDurationMinutes: 2, manualRelevance: 9 });
    const real = sampleItem({ id: "real", title: "Real work", expectedDurationMinutes: 30, manualRelevance: 4 });
    const idle = buildNowFocus([quick, real], [], NOW);
    results.push(
      assert(
        "now-idle-prefers-two-minute",
        idle.primary?.item.id === "email",
        idle.primary?.item.id ?? "none"
      )
    );

    const block = sampleItem({
      id: "am",
      title: "Morning",
      isTask: false,
      isInterval: true,
      intervalKind: "fixed",
      intervalStartsAt: "2026-08-23T09:00:00.000Z",
      intervalEndsAt: "2026-08-23T12:00:00.000Z",
      intervalStatus: "scheduled"
    });
    const link: ItemLink = {
      id: "l1",
      ownerId: "u",
      fromId: "real",
      toId: "am",
      kind: "scheduled_in",
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString()
    };
    const busy = buildNowFocus([quick, real, block], [link], NOW);
    results.push(
      assert(
        "now-in-block-ignores-two-minute",
        busy.primary?.item.id === "real",
        busy.primary?.item.id ?? "none"
      )
    );
  }

  {
    const now = new Date(2026, 7, 23, 8, 55, 0);
    const empty = buildNudges([], [], now);
    results.push(
      assert(
        "empty-morning-when-unblocked",
        empty.some((nudge) => nudge.kind === "empty_morning"),
        empty.map((nudge) => nudge.kind).join(",") || "none"
      )
    );

    const start = new Date(2026, 7, 23, 9, 0, 0);
    const end = new Date(2026, 7, 23, 12, 0, 0);
    const block = sampleItem({
      id: "am-nudge",
      title: "Morning",
      isTask: false,
      isInterval: true,
      intervalKind: "fixed",
      intervalStartsAt: start.toISOString(),
      intervalEndsAt: end.toISOString(),
      intervalStatus: "scheduled"
    });
    const blocked = buildNudges([block], [], now);
    results.push(
      assert(
        "blocked-morning-skips-empty-nudge",
        !blocked.some((nudge) => nudge.kind === "empty_morning") && blocked.some((nudge) => nudge.kind === "block_soon"),
        blocked.map((nudge) => nudge.kind).join(",")
      )
    );

    const ics = calendarIcs([block], [], now);
    results.push(
      assert("ics-contains-interval", ics.includes("BEGIN:VEVENT") && ics.includes("Morning"), ics.slice(0, 120))
    );
  }

  return results;
}

function sampleItem(partial: Partial<Item> & Pick<Item, "id" | "title">): Item {
  return {
    ownerId: "u",
    body: "",
    isTask: true,
    isDocumentation: false,
    isInterval: false,
    taskStatus: "active",
    expectedDurationMinutes: 30,
    taskDueAt: "",
    taskFixedStartsAt: "",
    taskFixedEndsAt: "",
    parentTaskId: "",
    manualRelevance: 5,
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
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...partial
  };
}

export function schedulingFixtureSummary(results = runSchedulingFixtures()): {
  passed: number;
  failed: number;
  results: FixtureResult[];
} {
  return {
    passed: results.filter((entry) => entry.pass).length,
    failed: results.filter((entry) => !entry.pass).length,
    results
  };
}
