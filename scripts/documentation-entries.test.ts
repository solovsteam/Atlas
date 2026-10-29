import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bucketGoal,
  buildHistory,
  cleanTags,
  countInLastDays,
  dataWithTags,
  dateFromWheel,
  entriesInDays,
  entryData,
  entryStage,
  entryTags,
  describeAgo,
  entryTimeLabel,
  groupEntriesByDay,
  isTracker,
  isWheelInFuture,
  recordedStage,
  schemaWithTrackerConfig,
  stageFromWheel,
  tagPrompt,
  trackerConfig,
  tagVocabulary,
  toggleTag,
  urgeShare,
  trackingStart,
  wheelDayLabel,
  wheelSelectionForNow,
  type DocumentationEntry,
  type EntryStage
} from "../shared/documentationEntries";
import type { Item } from "../shared/item";
import { niceScale } from "../shared/chartScale";

// Local-time constructors keep these tests independent of the machine's zone.
const at = (day: number, hour = 12, minute = 0, month = 9) => new Date(2026, month, day, hour, minute);
let nextId = 0;
const entry = (date: Date, data: Record<string, unknown> = {}): DocumentationEntry => ({
  id: `e${String(nextId++).padStart(4, "0")}`,
  ownerId: "owner",
  itemId: "tracker",
  occurredAt: date.toISOString(),
  data,
  createdAt: date.toISOString()
});
const noticed = (date: Date, stage: EntryStage, tags: string[] = []) => entry(date, entryData(stage, tags));

test("the wheel opens at now, rounded down to five minutes, and never in the future", () => {
  const now = at(29, 14, 37);
  const selection = wheelSelectionForNow(now);
  assert.deepEqual(selection, { dayOffset: 0, hour: 14, minute: 35 });
  assert.equal(isWheelInFuture(selection, now), false);
  assert.equal(isWheelInFuture({ dayOffset: 0, hour: 14, minute: 40 }, now), true);
  assert.equal(isWheelInFuture({ dayOffset: 1, hour: 23, minute: 55 }, now), false);
});

test("scrolling the day column back crosses months correctly", () => {
  const now = at(2, 9, 0, 10); // 2 November
  assert.equal(dateFromWheel({ dayOffset: 3, hour: 22, minute: 30 }, now).getTime(), at(30, 22, 30, 9).getTime());
  assert.equal(wheelDayLabel(0, now), "Today");
  assert.equal(wheelDayLabel(1, now), "Yesterday");
  assert.equal(wheelDayLabel(3, now), "Fri 30.10.");
});

test("labels describe how long ago and which day", () => {
  const now = at(29, 14, 0);
  assert.equal(describeAgo(at(29, 13, 59, 9), now), "1 min ago");
  assert.equal(describeAgo(at(29, 11, 45), now), "2 h 15 min ago");
  assert.equal(describeAgo(at(28, 14, 0), now), "1 day ago");
  assert.equal(entryTimeLabel(at(29, 9, 5), now), "today 09:05");
  assert.equal(entryTimeLabel(at(28, 23, 50), now), "yesterday 23:50");
  assert.equal(entryTimeLabel(at(26, 8, 0), now), "Mon 26.10.2026 08:00");
});

test("only plain documentation items are trackers", () => {
  const base = { isDocumentation: true, isTask: false, isInterval: false, recurrenceRule: null, generatedFromId: "" } as unknown as Item;
  assert.equal(isTracker(base), true);
  assert.equal(isTracker({ ...base, isDocumentation: false }), false);
  assert.equal(isTracker({ ...base, isTask: true }), false, "a documentation task, such as a weighing, is not a tracker");
  assert.equal(isTracker({ ...base, recurrenceRule: { kind: "daily" } }), false);
});

test("tracking starts at the earlier of creation and the first entry", () => {
  const created = at(20).toISOString();
  assert.equal(trackingStart([], created)?.getTime(), at(20).getTime());
  assert.equal(trackingStart([entry(at(18, 22))], created)?.getTime(), at(18, 22).getTime(), "entries recorded after the fact count");
  assert.equal(trackingStart([], null), null);
});

test("30 days: one column per day, empty before tracking began, 7-day trailing average", () => {
  const now = at(29, 20);
  const entries = [at(27, 9), at(27, 22), at(28, 23), at(29, 8), at(29, 12), at(29, 19)].map(entry);
  const history = buildHistory(entries, { range: "30d", now, trackerCreatedAt: at(27, 8).toISOString() });
  assert.equal(history.granularity, "day");
  assert.equal(history.buckets.length, 30);
  assert.equal(history.buckets[0].start.getTime(), at(30, 0, 0, 8).getTime(), "starts 29 days before today");
  const last = history.buckets.slice(-3);
  assert.deepEqual(last.map((b) => b.count), [2, 1, 3]);
  assert.equal(history.buckets[history.buckets.length - 4].count, null, "the day before tracking is unknown, not zero");
  assert.deepEqual(last.map((b) => b.average), [2, 1.5, 2], "the average covers tracked days only");
  assert.equal(history.total, 6);
  assert.equal(history.perDay, 2, "6 entries over 3 tracked days");
  assert.equal(history.byHour[22] + history.byHour[23] + history.byHour[8], 3);
  assert.equal(history.byHour.reduce((a, b) => a + b, 0), 6);
});

test("the trailing average slides over exactly seven days", () => {
  const now = at(29, 23);
  const entries: DocumentationEntry[] = [];
  for (let day = 1; day <= 29; day += 1) {
    for (let k = 0; k < day % 3; k += 1) {
      entries.push(entry(at(day, 10 + k)));
    }
  }
  const history = buildHistory(entries, { range: "30d", now, trackerCreatedAt: at(1, 0).toISOString() });
  const last = history.buckets[history.buckets.length - 1];
  const expected = [23, 24, 25, 26, 27, 28, 29].reduce((sum, day) => sum + (day % 3), 0) / 7;
  assert.equal(last.average, expected);
});

test("longer ranges use weeks starting on Monday; entries outside the range or in the future are ignored", () => {
  const now = at(29, 12); // Thursday
  const entries = [at(26, 9), at(29, 11), at(29, 13), at(1, 9, 0, 6)].map(entry);
  const history = buildHistory(entries, { range: "90d", now, trackerCreatedAt: at(1, 0, 0, 0).toISOString() });
  assert.equal(history.granularity, "week");
  const last = history.buckets[history.buckets.length - 1];
  assert.equal(last.start.getTime(), at(26, 0).getTime());
  assert.equal(last.count, 2, "Monday and Thursday morning; 13:00 is still in the future");
  assert.equal(history.total, 2, "1 July lies before the 90-day window");
});

test("All picks days, weeks or months from the length of the record", () => {
  const now = at(29, 12);
  const short = buildHistory([entry(at(10))], { range: "all", now, trackerCreatedAt: null });
  assert.equal(short.granularity, "day");
  assert.equal(short.buckets[0].start.getTime(), at(10, 0).getTime());
  const year = buildHistory([entry(at(1, 9, 0, 0))], { range: "all", now, trackerCreatedAt: null });
  assert.equal(year.granularity, "week");
  const long = buildHistory([entry(new Date(2023, 0, 5))], { range: "all", now, trackerCreatedAt: null });
  assert.equal(long.granularity, "month");
  assert.equal(long.buckets[0].start.getTime(), new Date(2023, 0, 1).getTime());
  assert.equal(long.buckets.at(-1)?.count, 0);
});

test("counts and day groups for the tiles and the entry list", () => {
  const now = at(29, 20);
  const entries = [at(29, 8), at(29, 19), at(28, 23), at(22, 10), at(21, 10)].map(entry);
  assert.equal(countInLastDays(entries, 1, now), 2);
  assert.equal(countInLastDays(entries, 7, now), 3, "23 to 29 October");
  assert.equal(countInLastDays(entries, 14, now), 5);
  const days = groupEntriesByDay(entries, now);
  assert.deepEqual(days.map((d) => d.label), ["Today", "Yesterday", "Thu 22.10.2026", "Wed 21.10.2026"]);
  assert.deepEqual(days[0].entries.map((e) => new Date(e.occurredAt).getHours()), [19, 8], "newest first");
});

test("the chart scale uses the smallest of 1, 2, 5, 10, 20, … steps with at most four steps", () => {
  assert.deepEqual(niceScale(0), { top: 1, step: 1 });
  assert.deepEqual(niceScale(4), { top: 4, step: 1 });
  assert.deepEqual(niceScale(5), { top: 6, step: 2 }, "not 10: the top stays close to the data");
  assert.deepEqual(niceScale(1.6), { top: 2, step: 1 });
  assert.deepEqual(niceScale(19), { top: 20, step: 5 });
  assert.deepEqual(niceScale(41), { top: 60, step: 20 });
});

test("stage and situations live in the entry data; older entries have neither", () => {
  assert.deepEqual(entryData("urge"), { stage: "urge" });
  assert.deepEqual(entryData("during", [" in  bed ", "In bed", "", "waiting"]), { stage: "during", tags: ["in bed", "waiting"] });
  assert.equal(recordedStage(entry(at(1))), null);
  assert.equal(recordedStage(entry(at(1), { stage: "sometime" })), null, "unknown values are not stages");
  assert.equal(entryStage(entry(at(1))), "during", "saved at its own time: noticed while doing it");
  assert.deepEqual(entryTags(entry(at(1), { tags: ["bored", 3, "Bored"] })), ["bored"]);
  const tagged = noticed(at(1), "after", ["bored"]);
  assert.deepEqual(dataWithTags(tagged, ["waiting"]), { stage: "after", tags: ["waiting"] }, "the stage survives a situation change");
  assert.deepEqual(dataWithTags(tagged, []), { stage: "after" });
  assert.deepEqual(cleanTags(["a", "A ", "b"]), ["a", "b"]);
  assert.deepEqual(toggleTag(["in bed"], "In Bed"), [], "toggling ignores case");
  assert.deepEqual(toggleTag(["in bed"], "waiting"), ["in bed", "waiting"]);
});

test("the situations offered are the most frequent, then the most recently used", () => {
  const entries = [
    noticed(at(1), "urge", ["in bed"]),
    noticed(at(2), "urge", ["waiting", "In bed"]),
    noticed(at(3), "during", ["bored"]),
    noticed(at(4), "during", ["waiting"]),
    noticed(at(5), "after", ["commute"])
  ];
  assert.deepEqual(tagVocabulary(entries), ["waiting", "In bed", "commute", "bored"]);
  assert.deepEqual(tagVocabulary(entries, 2), ["waiting", "In bed"]);
});

test("the share caught at the urge counts every entry, older ones by their inferred stage", () => {
  assert.equal(urgeShare([]), null);
  assert.equal(urgeShare([entry(at(1))]), 0);
  assert.equal(urgeShare([noticed(at(1), "urge"), noticed(at(1), "during"), noticed(at(1), "after"), noticed(at(1), "urge"), entry(at(1))]), 0.4);
});

test("older entries without a stage: recorded more than 5 minutes later means in hindsight", () => {
  // Tonio's first entries: recorded 188 and 103 minutes after their time, and one 3 minutes after.
  const late = (minutes: number) => ({ ...entry(at(29, 8, 5)), createdAt: new Date(at(29, 8, 5).getTime() + minutes * 60_000).toISOString() });
  assert.equal(entryStage(late(188)), "after");
  assert.equal(entryStage(late(103)), "after");
  assert.equal(entryStage(late(3)), "during");
  assert.equal(entryStage(late(5)), "during", "the wheel's 5-minute step still counts as the present");
  assert.equal(entryStage(late(6)), "after");
  assert.equal(entryStage({ ...noticed(at(29, 8), "urge"), createdAt: at(29, 12).toISOString() }), "urge", "a recorded stage wins");
});

test("the time wheel decides the stage: the present moment or an earlier time", () => {
  const start = at(29, 14, 35);
  assert.equal(stageFromWheel(false, start, start), "during", "untouched: now");
  assert.equal(stageFromWheel(true, start, start), "during", "moved and back to the present");
  assert.equal(stageFromWheel(true, at(29, 14, 30), start), "after", "one step back is the past");
  assert.equal(stageFromWheel(true, at(28, 22, 0), start), "after");
});

test("tracker kinds: habit to break by default, habit to build with an optional daily aim", () => {
  const item = (documentationSchema: unknown) => ({ documentationSchema }) as unknown as Item;
  assert.deepEqual(trackerConfig(item(null)), { kind: "break", dailyGoal: null });
  assert.deepEqual(trackerConfig(item([{ key: "weight", type: "number" }])), { kind: "break", dailyGoal: null }, "old field lists are not tracker settings");
  assert.deepEqual(trackerConfig(item({ tracker: { kind: "build", dailyGoal: 3 } })), { kind: "build", dailyGoal: 3 });
  assert.deepEqual(trackerConfig(item({ tracker: { kind: "build", dailyGoal: 2.5 } })), { kind: "build", dailyGoal: null });
  assert.deepEqual(trackerConfig(item({ tracker: { kind: "break", dailyGoal: 3 } })), { kind: "break", dailyGoal: null }, "only habits to build have an aim");
  assert.deepEqual(schemaWithTrackerConfig(item({ other: 1 }), { kind: "build", dailyGoal: 3 }), { other: 1, tracker: { kind: "build", dailyGoal: 3 } });
  assert.equal(tagPrompt({ kind: "build", dailyGoal: 3 }), "What triggered it? (optional)");
  assert.equal(tagPrompt({ kind: "break", dailyGoal: null }), "Situation (optional)");
  assert.deepEqual(entryData(null, ["door"]), { tags: ["door"] }, "habits to build store no stage");
});

test("the daily aim per period: per day, per week, none before tracking", () => {
  const now = at(29, 12);
  const days = buildHistory([entry(at(28, 9))], { range: "30d", now, trackerCreatedAt: at(27, 8).toISOString() });
  assert.equal(bucketGoal(days.buckets.at(-1)!, 3), 3);
  assert.equal(bucketGoal(days.buckets.at(-1)!, null), null);
  assert.equal(bucketGoal(days.buckets[0], 3), null, "not tracked yet");
  const weeks = buildHistory([entry(at(28, 9))], { range: "90d", now, trackerCreatedAt: at(1, 8).toISOString() });
  assert.equal(bucketGoal(weeks.buckets.at(-1)!, 3), 21);
});

test("week windows for the tiles: the last 7 days and the 7 days before", () => {
  const now = at(29, 12);
  const entries = [at(29, 9), at(29, 13), at(23, 0, 1), at(22, 23, 59), at(16, 0, 0), at(15, 23, 59)].map((date) => entry(date));
  assert.equal(entriesInDays(entries, 7, now).length, 2, "23 to 29 October up to now; 13:00 is in the future");
  assert.equal(entriesInDays(entries, 7, now, 7).length, 2, "16 to 22 October, whole days");
});

test("history splits each period by stage and tracks the urge share over the trailing window", () => {
  const now = at(29, 22);
  const entries = [
    entry(at(26, 9)),
    noticed(at(27, 9), "after"),
    noticed(at(28, 9), "during", ["in bed"]),
    noticed(at(28, 10), "urge", ["in bed", "bored"]),
    noticed(at(29, 9), "urge", ["bored"]),
    noticed(at(29, 10), "urge")
  ];
  const history = buildHistory(entries, { range: "30d", now, trackerCreatedAt: at(26, 8).toISOString() });
  const [d26, d27, d28, d29] = history.buckets.slice(-4);
  assert.deepEqual(d26.stages, { urge: 0, during: 1, after: 0 }, "saved at its own time: inferred as while doing it");
  assert.equal(d26.urgeShare, 0);
  assert.equal(d27.urgeShare, 0);
  assert.equal(d28.urgeShare, 1 / 4);
  assert.deepEqual(d29.stages, { urge: 2, during: 0, after: 0 });
  assert.equal(d29.urgeShare, 3 / 6, "3 urges among 6 entries in the 7-day window");
  assert.equal(d29.count, 2);
  assert.deepEqual(history.byTag, [
    { tag: "bored", count: 2 },
    { tag: "in bed", count: 2 }
  ]);
});
