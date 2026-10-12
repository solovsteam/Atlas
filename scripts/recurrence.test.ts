import assert from "node:assert/strict";
import { test } from "node:test";
import {
  emptyItem,
  defaultGeneratorRule,
  generatorSnapshot,
  newOccurrence,
  resolveOccurrence,
  changeOccurrence,
  reviewOccurrence,
  occurrenceRule,
  occurrenceId,
  atLocalClock,
  addDays,
  type GeneratorRule,
} from "../shared/recurringReferences";
import { evaluateRecurrence } from "../src/lib/recurrenceRuntime";
import { includedDates, projectItems } from "../src/services/recurrence";
import { itemsToScheduleInputs } from "../shared/scheduling/resolve";
import { intervalsFromItems } from "../src/services/scheduling";
import { proposeSchedule } from "../src/services/scheduling";
import { buildNowFocus } from "../shared/scheduling/now";
import { isLibraryItem } from "../shared/relevance";

const day = "2026-10-12";
export const owner = "11111111-1111-4111-8111-111111111111";
export function generator() {
  return {
    ...emptyItem("22222222-2222-4222-8222-222222222222", owner),
    title: "Practice",
    isTask: true,
    taskStatus: "active" as const,
    expectedDurationMinutes: 30,
    recurrenceState: {
      ...defaultGeneratorRule("Europe/Berlin", day),
      status: "active",
      text: "Every day",
      compiledText: "Every day",
      source: "date => true",
    } satisfies GeneratorRule,
    revision: 1,
  };
}
test("untouched occurrences are live references and have stable UUIDs", async () => {
  const g = generator(),
    raw = newOccurrence(g, day);
  assert.equal(raw.title, "");
  assert.equal(raw.isTask, false);
  assert.equal(occurrenceId(g.id, day), raw.id);
  assert.notEqual(raw.id, occurrenceId(g.id, addDays(day, 1)));
  assert.equal(resolveOccurrence(raw, g).item.title, "Practice");
  assert.equal(
    resolveOccurrence(raw, { ...g, title: "Updated" }).item.title,
    "Updated",
  );
  const projected = await projectItems(
    [g],
    new Date("2026-10-12T09:00:00Z"),
    2,
  );
  assert.equal(projected.length, 4);
  assert.equal(projected.filter((i) => i.generatedFromId).length, 3);
  assert.equal(g.revision, 1);
});
test("default overrides stay local while other fields follow the generator", () => {
  const g = generator();
  const raw = changeOccurrence(newOccurrence(g, day), g, {
    body: "Personal note",
  });
  const next = { ...g, title: "Next", body: "New default" };
  const view = resolveOccurrence(raw, next);
  assert.equal(view.item.title, "Next");
  assert.equal(view.item.body, "Personal note");
  assert.equal(view.view.needsReview, false);
});

test("starting after an inherited update uses the version the human actually sees", () => {
  const first = generator(),
    touched = { ...newOccurrence(first, day), revision: 1 };
  const current = { ...first, title: "Already updated", revision: 2 };
  const started = changeOccurrence(touched, current, {
    occurrenceStarted: true,
  });
  assert.equal(occurrenceRule(started)?.baseline.generatorRevision, 2);
  assert.equal(resolveOccurrence(started, current).view.needsReview, false);
  assert.equal(
    resolveOccurrence(started, {
      ...current,
      title: "Later update",
      revision: 3,
    }).view.needsReview,
    true,
  );
});
test("strict takeover holds the old version visibly; each resolution preserves progress", () => {
  const g = generator();
  const raw = changeOccurrence(newOccurrence(g, day), g, {
    title: "Individual",
  });
  const next = {
    ...g,
    title: "Required",
    recurrenceState: {
      ...g.recurrenceState,
      policies: { ...g.recurrenceState.policies, title: "strict" },
    },
  } as typeof g;
  const held = resolveOccurrence(raw, next);
  assert.equal(held.view.needsReview, true);
  assert.equal(held.item.title, "Individual");
  assert.equal(
    resolveOccurrence(reviewOccurrence(raw, next, "new"), next).item.title,
    "Required",
  );
  assert.equal(
    resolveOccurrence(reviewOccurrence(raw, next, "old"), {
      ...next,
      title: "Later",
    }).item.title,
    "Individual",
  );
  const detached = reviewOccurrence(raw, next, "detach");
  assert.equal(detached.generatedFromId, "");
  assert.equal(detached.title, "Individual");
  assert.throws(() => changeOccurrence(raw, next, { body: "edit" }), /Review/);
});
test("half-finished and ticked occurrences flag changes, completed ones are immutable to generator edits", () => {
  const g = generator();
  const raw = newOccurrence(g, day);
  raw.recurrenceState = { ...occurrenceRule(raw)!, started: true };
  assert.equal(
    resolveOccurrence(raw, { ...g, title: "Different" }).view.needsReview,
    true,
  );
  const ticked = changeOccurrence(newOccurrence(g, day), g, {
    documentationData: { a: true },
  });
  assert.equal(
    resolveOccurrence(ticked, { ...g, title: "Different" }).view.needsReview,
    true,
  );
  const done = changeOccurrence(raw, g, { taskStatus: "done" });
  assert.equal(
    resolveOccurrence(done, { ...g, title: "Different" }).item.title,
    "Practice",
  );
  assert.equal(
    resolveOccurrence(done, { ...g, title: "Different" }).view.needsReview,
    false,
  );
  const undo = changeOccurrence(done, g, {
    recurrenceState: raw.recurrenceState,
  });
  assert.equal(occurrenceRule(undo)?.frozen, undefined);
});
test("every field supports each ownership mode and owned values do not inherit progress", () => {
  const g = generator();
  g.taskStatus = "done";
  const raw = newOccurrence(g, day);
  assert.equal(resolveOccurrence(raw, g).item.taskStatus, "active");
  const strict = {
    ...g,
    recurrenceState: {
      ...g.recurrenceState,
      policies: { title: "strict" as const },
    },
  };
  assert.throws(
    () =>
      changeOccurrence(newOccurrence(strict, day), strict, {
        title: "Override",
      }),
    /defined by the generator/,
  );
  const owned = {
    ...g,
    recurrenceState: {
      ...g.recurrenceState,
      policies: { title: "owned" as const },
    },
  };
  assert.equal(
    resolveOccurrence(newOccurrence(owned, day), owned).item.title,
    "",
  );
  assert.equal(
    resolveOccurrence(
      changeOccurrence(newOccurrence(owned, day), owned, { title: "Mine" }),
      owned,
    ).item.title,
    "Mine",
  );
});
test("pause/delete suppress virtual occurrences while completed, edited and scheduled references remain", async () => {
  const g = generator();
  const changed = {
    ...changeOccurrence(newOccurrence(g, day), g, { body: "Local" }),
    revision: 1,
  };
  const scheduled = { ...newOccurrence(g, addDays(day, 1)), revision: 1 };
  const done = {
    ...changeOccurrence(newOccurrence(g, addDays(day, 2)), g, {
      taskStatus: "done",
    }),
    revision: 1,
  };
  for (const status of ["paused", "deleted"] as const) {
    const next = { ...g, recurrenceState: { ...g.recurrenceState, status } };
    const items = await projectItems(
      [next, changed, scheduled, done],
      new Date("2026-10-12T09:00:00Z"),
      3,
    );
    assert.equal(items.filter((i) => i.generatedFromId).length, 3);
    assert.equal(
      items.some((i) => i.id === g.id),
      true,
      "the archived source remains addressable",
    );
    assert.equal(
      isLibraryItem(items.find((i) => i.id === g.id)!),
      status === "paused",
    );
  }
  const suppressed = {
    ...changed,
    recurrenceState: { ...occurrenceRule(changed)!, deleted: true },
  };
  assert.equal(
    (await projectItems([g, suppressed], new Date("2026-10-12T09:00:00Z"), 0))
      .length,
    1,
  );
});
test("overdue open occurrences stay live and rule removal of changed work is reviewed", async () => {
  const g = generator();
  const raw = {
    ...changeOccurrence(newOccurrence(g, day), g, { body: "Local" }),
    revision: 1,
  };
  const next = { ...g, title: "Next" };
  const projected = await projectItems(
    [next, raw],
    new Date("2026-10-14T09:00:00Z"),
    0,
  );
  assert.equal(projected.find((i) => i.id === raw.id)?.title, "Next");
  const excluding = {
    ...g,
    recurrenceState: {
      ...g.recurrenceState,
      text: "Never",
      compiledText: "Never",
      source: "d => false",
    },
  };
  assert.equal(
    (
      await projectItems([excluding, raw], new Date("2026-10-14T09:00:00Z"), 0)
    )[1].recurrenceView?.needsReview,
    true,
  );
});
test("arbitrary first-Monday exception compiles to offline dates, independent of batching", async () => {
  const source =
    "date => date.weekday === 1 && date.day <= 7 && date.day !== 3";
  const dates = [
    "2026-10-05",
    "2026-10-12",
    "2026-11-02",
    "2027-05-03",
    "2027-05-10",
  ];
  assert.deepEqual(await evaluateRecurrence(source, dates), [
    true,
    false,
    true,
    false,
    false,
  ]);
  assert.deepEqual(
    await evaluateRecurrence(
      'd => typeof fetch === "undefined" && typeof window === "undefined" && typeof localStorage === "undefined" && typeof process === "undefined" && typeof Date === "undefined"',
      dates,
    ),
    dates.map(() => true),
  );
  const stateful =
    "d => { globalThis.n = (globalThis.n ?? 0) + 1; return n === 1; }";
  assert.deepEqual(
    await evaluateRecurrence(stateful, dates),
    dates.map(() => true),
  );
});
test("sandbox stops loops, memory abuse, async and nonboolean predicates", async () => {
  await assert.rejects(
    evaluateRecurrence("d => { while (true) {} }", [day]),
    /interrupted/,
  );
  await assert.rejects(
    evaluateRecurrence(
      'd => { const a=[]; while(true) a.push(new Array(1000).fill("xxxxxxxx")); }',
      [day],
    ),
  );
  await assert.rejects(evaluateRecurrence("async d => true", [day]), /boolean/);
  await assert.rejects(evaluateRecurrence("d => 1", [day]), /boolean/);
});
test("large preview evaluates offline and text edits do not run obsolete code", async () => {
  const g = generator();
  const dates = Array.from({ length: 1826 }, (_, i) => addDays(day, i));
  assert.equal((await includedDates(g, dates)).size, 1826);
  const changed = {
    ...g,
    recurrenceState: { ...g.recurrenceState, text: "Different" },
  };
  assert.equal((await includedDates(changed, dates)).size, 0);
});
test("civil clock conversion spans DST, retains overnight offsets and chooses first repeated time", () => {
  assert.equal(
    atLocalClock("2026-10-24", "09:00:00", "Europe/Berlin"),
    "2026-10-24T07:00:00.000Z",
  );
  assert.equal(
    atLocalClock("2026-10-25", "09:00:00", "Europe/Berlin"),
    "2026-10-25T08:00:00.000Z",
  );
  assert.equal(
    atLocalClock("2026-10-25", "02:30:00", "Europe/Berlin"),
    "2026-10-25T00:30:00.000Z",
  );
  assert.throws(
    () => atLocalClock("2026-03-29", "02:30:00", "Europe/Berlin"),
    /does not exist/,
  );
  const g = {
    ...generator(),
    taskFixedStartsAt: "2026-10-12T23:00:00+02:00",
    taskFixedEndsAt: "2026-10-13T01:00:00+02:00",
  };
  const values = generatorSnapshot(g, "2026-10-25").values;
  assert.equal(values.taskFixedStartsAt, "2026-10-25T22:00:00.000Z");
  assert.equal(values.taskFixedEndsAt, "2026-10-26T00:00:00.000Z");
});
test("fixed recurring windows are appointments; flexible tasks remain candidates; templates never schedule", () => {
  const g = generator(),
    window = {
      ...g,
      isTask: false,
      isInterval: true,
      intervalStartsAt: "2026-10-12T09:00:00+02:00",
      intervalEndsAt: "2026-10-12T10:00:00+02:00",
    };
  const fixed = resolveOccurrence(newOccurrence(window, day), window).item;
  const flexible = resolveOccurrence(newOccurrence(g, day), g).item;
  const inputs = itemsToScheduleInputs([g, fixed, flexible]);
  assert.equal(inputs.length, 2);
  assert.equal(
    inputs.find((i) => i.id === fixed.id)?.fixedStartsAt,
    fixed.intervalStartsAt,
  );
  assert.equal(intervalsFromItems([window, fixed]).length, 0);
});

test("future flexible occurrences cannot be placed or offered before their civil date", () => {
  const g = generator(),
    raw = newOccurrence(g, "2026-10-13");
  const resolved = resolveOccurrence(raw, g),
    future = { ...resolved.item, recurrenceView: resolved.view };
  const block = {
    ...emptyItem("block", owner),
    isInterval: true,
    intervalStartsAt: "2026-10-12T09:00:00+02:00",
    intervalEndsAt: "2026-10-12T11:00:00+02:00",
    intervalKind: "fixed",
    intervalStatus: "scheduled",
  };
  const now = new Date("2026-10-12T06:00:00Z");
  assert.equal(proposeSchedule([g, future, block], now).assignments.length, 0);
  assert.equal(buildNowFocus([g, future, block], [], now).suggestion, null);
  const tomorrow = {
    ...block,
    id: "tomorrow",
    intervalStartsAt: "2026-10-13T09:00:00+02:00",
    intervalEndsAt: "2026-10-13T11:00:00+02:00",
  };
  assert.equal(
    proposeSchedule([g, future, tomorrow], now).assignments[0]?.intervalId,
    "tomorrow",
  );
});

test("failed rule evaluation preserves completed records and leaves the generator editable", async () => {
  const g = generator(),
    completed = {
      ...changeOccurrence(newOccurrence(g, day), g, { taskStatus: "done" }),
      revision: 1,
    };
  const bad = {
    ...g,
    recurrenceState: { ...g.recurrenceState, source: "d=>{while(true){}}" },
  };
  const items = await projectItems(
    [bad, completed],
    new Date("2026-10-12T09:00:00Z"),
    0,
  );
  assert.match(
    items.find((i) => i.id === g.id)?.recurrenceError ?? "",
    /interrupted/,
  );
  assert.equal(items.find((i) => i.id === completed.id)?.taskStatus, "done");
});
