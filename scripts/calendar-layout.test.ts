import assert from "node:assert/strict";
import { test } from "node:test";
import { anchorForView, calendarTitle, navigateAnchor } from "../shared/calendar";
import { dayGridRange, layoutBoxesOnDay, startOfMonth, type ScheduleSlot } from "../shared/schedule";

const day = new Date(2026, 9, 15);

function slot(id: string, from: [number, number], to: [number, number], kind: ScheduleSlot["kind"] = "fixed"): ScheduleSlot {
  return {
    id,
    ownerId: "owner",
    kind,
    startsAt: new Date(2026, 9, 15, from[0], from[1]).toISOString(),
    endsAt: new Date(2026, 9, 15, to[0], to[1]).toISOString(),
    slotStatus: "scheduled",
    label: id,
    createdAt: "",
    updatedAt: ""
  };
}

function byId(entries: ReturnType<typeof layoutBoxesOnDay>) {
  return Object.fromEntries(entries.map((entry) => [entry.slot.id, entry]));
}

test("entries keep the height of their duration on the default 06–22 grid", () => {
  const [work] = layoutBoxesOnDay([slot("work", [9, 0], [18, 0])], day);
  assert.equal(work!.topPct, (3 / 16) * 100);
  assert.equal(work!.heightPct, (9 / 16) * 100);
  assert.deepEqual([work!.lane, work!.lanes, work!.span], [0, 1, 1]);
});

test("overlapping entries sit side by side and widen into lanes free beside them", () => {
  const layout = byId(
    layoutBoxesOnDay(
      [
        slot("work", [9, 0], [18, 0]),
        slot("lunch", [12, 15], [12, 45]),
        slot("dentist", [13, 0], [14, 0]),
        slot("call", [13, 30], [14, 15]),
        slot("evening", [19, 0], [21, 0])
      ],
      day
    )
  );
  assert.deepEqual([layout.work!.lane, layout.work!.lanes, layout.work!.span], [0, 3, 1]);
  assert.deepEqual([layout.lunch!.lane, layout.lunch!.span], [1, 2]);
  assert.deepEqual([layout.dentist!.lane, layout.dentist!.span], [1, 1]);
  assert.deepEqual([layout.call!.lane, layout.call!.span], [2, 1]);
  // A later entry that touches none of them starts a new, full-width cluster.
  assert.deepEqual([layout.evening!.lane, layout.evening!.lanes, layout.evening!.span], [0, 1, 1]);
});

test("back-to-back entries do not count as overlapping", () => {
  const layout = byId(layoutBoxesOnDay([slot("a", [9, 0], [10, 0]), slot("b", [10, 0], [11, 0])], day));
  assert.equal(layout.a!.lanes, 1);
  assert.equal(layout.b!.lanes, 1);
});

test("the grid widens so early and late entries are never hidden", () => {
  assert.deepEqual(dayGridRange([slot("x", [9, 0], [10, 0])], [day]), { startHour: 6, endHour: 22 });
  const range = dayGridRange([slot("early", [5, 30], [6, 30]), slot("late", [21, 0], [23, 30])], [day]);
  assert.deepEqual(range, { startHour: 5, endHour: 24 });
  const [early] = layoutBoxesOnDay([slot("early", [5, 30], [6, 30])], day, range);
  assert.equal(early!.topPct, (30 / (19 * 60)) * 100);
});

test("all-day entries stay off the hour grid", () => {
  const allDay = slot("holiday", [0, 0], [0, 0], "allDay");
  assert.equal(layoutBoxesOnDay([allDay], day).length, 0);
  assert.deepEqual(dayGridRange([allDay], [day]), { startHour: 6, endHour: 22 });
});

test("toolbar titles and month stepping", () => {
  assert.equal(calendarTitle("month", startOfMonth(day)), "October 2026");
  assert.equal(calendarTitle("day", day), "Thu 15 Oct");
  assert.equal(calendarTitle("week", anchorForView("week", day)), "12 – 18 Oct 2026");
  assert.equal(calendarTitle("week", anchorForView("week", new Date(2026, 9, 29))), "26 Oct – 1 Nov 2026");
  const next = navigateAnchor("month", startOfMonth(new Date(2026, 0, 31)), 1);
  assert.equal(calendarTitle("month", anchorForView("month", next)), "February 2026");
});
