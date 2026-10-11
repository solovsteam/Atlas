import assert from "node:assert/strict";
import { test } from "node:test";
import { firstFeasibleWorkBlock } from "../shared/decisionSchedule";
import { buildNowFocus } from "../shared/scheduling/now";
import { calendarIcs, selectCalendarEvents, serializeVevent } from "../shared/ics";
import { occurrenceKeysInHorizon } from "../shared/recurrence";
import type { Item } from "../shared/item";
import { taskCountInInterval, type ItemLink } from "../shared/links";
import { indexTaskCountsByInterval } from "../shared/intervalTaskCounts";
import { byDueThenTitle } from "../shared/review";
import { dueAtForPreset, isDueSameLocalDay, isDueThisWeek, isOverdue } from "../shared/due";
import { nominalWorkWindow, workBlockForNow, workBlockOverlapsExisting } from "../shared/workBlocks";
import { boxDisplayLabel, layoutBoxesOnDay, type ScheduleSlot } from "../shared/schedule";
import {
  DATE_PLACEHOLDER, DATE_TIME_PLACEHOLDER, formatEuropeanDate, formatEuropeanDateTime,
  isoFromEuropeanDate, isoFromEuropeanDateTime, normalizeEuropeanDate, normalizeEuropeanDateTime,
  parseEuropeanDate, parseEuropeanDateTime, parseFlexibleDate, parseFlexibleDateTime,
  validateEuropeanDate, validateEuropeanDateTime
} from "../shared/locale";

// Frozen private oracle copied from shared/locale.ts before the deduplication.
const oracleStrictRe = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[,\s]+(\d{1,2}):(\d{2}))?$/;
const oracleMonths: Record<string, number> = { jan:1, januar:1, january:1, feb:2, februar:2, february:2, mar:3, marz:3, märz:3, march:3, apr:4, april:4, mai:5, may:5, jun:6, juni:6, june:6, jul:7, juli:7, july:7, aug:8, august:8, sep:9, sept:9, september:9, okt:10, oktober:10, oct:10, october:10, nov:11, november:11, dez:12, dezember:12, dec:12, december:12 };
const oracleOffsets: Record<string, number> = { heute:0, today:0, morgen:1, tomorrow:1 };
type OracleParts = { day: number; month: number; year: number; hour: number; minute: number };
function oracleBuild({day, month, year, hour, minute}: OracleParts): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  const date = new Date(year, month - 1, day, hour, minute);
  return date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day ? null : date;
}
function oracleStrict(text: string): Date | null {
  const trimmed = text.trim(); if (!trimmed) return null;
  const match = trimmed.match(oracleStrictRe); if (!match) return null;
  return oracleBuild({day:+match[1], month:+match[2], year:+match[3], hour:match[4] !== undefined ? +match[4] : 0, minute:match[5] !== undefined ? +match[5] : 0});
}
function oracleYear(value: number | undefined, ref: Date): number { return value === undefined ? ref.getFullYear() : value < 100 ? 2000 + value : value; }
function oracleFlexible(text: string, ref: Date): Date | null {
  const strict = oracleStrict(text); if (strict) return strict;
  const normalized = text.trim().toLowerCase().replace(/\s+/g, " "); if (!normalized) return null;
  const offset = oracleOffsets[normalized];
  if (offset !== undefined) { const date = new Date(ref); date.setHours(0,0,0,0); date.setDate(date.getDate()+offset); return date; }
  const numeric = normalized.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?(?:\s+(\d{1,2})(?::(\d{2}))?)?$/);
  if (numeric) return oracleBuild({day:+numeric[1], month:+numeric[2], year:oracleYear(numeric[3] !== undefined ? +numeric[3] : undefined, ref), hour:numeric[4] !== undefined ? +numeric[4] : 0, minute:numeric[4] !== undefined && numeric[5] !== undefined ? +numeric[5] : 0});
  const dayFirst = normalized.match(/^(\d{1,2})\.?\s+([a-zä]+)\.?(?:\s+(\d{1,2})(?::(\d{2}))?)?$/);
  const monthFirst = normalized.match(/^([a-zä]+)\.?\s+(\d{1,2})\.?(?:\s+(\d{1,2})(?::(\d{2}))?)?$/);
  const named = dayFirst ? {d:dayFirst[1], m:dayFirst[2], h:dayFirst[3], min:dayFirst[4]} : monthFirst ? {d:monthFirst[2], m:monthFirst[1], h:monthFirst[3], min:monthFirst[4]} : null;
  if (!named) return null;
  const month = oracleMonths[named.m.replace(/\./g, "").trim()]; if (!month) return null;
  return oracleBuild({day:+named.d, month, year:ref.getFullYear(), hour:named.h !== undefined ? +named.h : 0, minute:named.h !== undefined && named.min !== undefined ? +named.min : 0});
}
function oracleNormalize(date: Date | null, time: boolean): string | null { return date ? (time ? formatEuropeanDateTime(date) : formatEuropeanDate(date)) : null; }

test("locale parsing refactor preserves the frozen parser across a seeded corpus", () => {
  let seed = 0x6d2b79f5;
  const random = () => { seed = (Math.imul(seed ^ (seed >>> 15), 1 | seed) + 0x6d2b79f5) | 0; seed ^= seed + Math.imul(seed ^ (seed >>> 7), 61 | seed); return ((seed ^ (seed >>> 14)) >>> 0) / 4294967296; };
  const pick = <T,>(xs: T[]): T => xs[Math.floor(random() * xs.length)];
  const names = ["Januar", "Jan.", "February", "Feb.", "März", "March", "April", "Mai", "May", "Juni", "June", "Juli", "July", "August", "September", "Sept.", "Oktober", "Oct.", "November", "Dezember", "December"];
  const corpus = ["", "   ", "garbage", "31.02.2026", "29.02.2025", "today", "TODAY", "morgen", "Tomorrow"];
  for (let i=0; i<4000; i++) {
    const d = 1 + Math.floor(random()*35), m = 1 + Math.floor(random()*14), y = pick(["", ".26", ".2026", ".99"]);
    const time = pick(["", ` ${Math.floor(random()*27)}:${String(Math.floor(random()*70)).padStart(2,"0")}`, ` ${Math.floor(random()*27)}`]);
    const name = pick(names);
    corpus.push(`${String(d).padStart(2,"0")}.${String(m).padStart(2,"0")}.${2020+Math.floor(random()*12)}` + pick(["", ` ${Math.floor(random()*27)}:${String(Math.floor(random()*70)).padStart(2,"0")}`, `, ${Math.floor(random()*27)}:${String(Math.floor(random()*70)).padStart(2,"0")}`]));
    corpus.push(`${d}.${m}${y}${time}`, `${d}${pick([" ", ". "])}${name}${pick(["", "."])}${pick([" ", "  "])}${Math.floor(random()*32)}${time}`, `${name}${pick(["", "."])} ${d}${pick(["", "."])}${time}`);
    corpus.push(` ${d}.${m}${y}, ${Math.floor(random()*27)}:${String(Math.floor(random()*70)).padStart(2,"0")} `);
  }
  assert.ok(corpus.length >= 3000);
  const references = [new Date(2026,2,28,12), new Date(2026,2,29,12), new Date(2026,9,24,12), new Date(2026,9,25,12), new Date(2026,5,15,12)];
  for (const text of corpus) for (const ref of references) {
    const oracle = oracleFlexible(text, ref);
    const equalDate = (actual: Date | null, expected: Date | null) => assert.equal(actual?.getTime() ?? null, expected?.getTime() ?? null, `${JSON.stringify(text)} @ ${ref.toString()}`);
    equalDate(parseFlexibleDate(text, ref), oracle); equalDate(parseFlexibleDateTime(text, ref), oracle);
    equalDate(parseEuropeanDate(text), oracleStrict(text)); equalDate(parseEuropeanDateTime(text), oracleStrict(text));
    assert.equal(normalizeEuropeanDate(text, ref), oracleNormalize(oracle, false));
    assert.equal(normalizeEuropeanDateTime(text, ref), oracleNormalize(oracle, true));
    for (const endOfDay of [false, true]) {
      const expected = oracle ? new Date(oracle).toISOString() : "";
      if (oracle && endOfDay) { const end = new Date(oracle); end.setHours(23,59,0,0); assert.equal(isoFromEuropeanDate(text, true, ref), end.toISOString()); }
      else assert.equal(isoFromEuropeanDate(text, endOfDay, ref), expected);
    }
    assert.equal(isoFromEuropeanDateTime(text, ref), oracle?.toISOString() ?? "");
    assert.equal(validateEuropeanDate(text, ref), !text.trim() ? "Enter a date." : oracle ? null : `Use ${DATE_PLACEHOLDER}`);
    assert.equal(validateEuropeanDateTime(text, ref), !text.trim() ? "Enter a date and time." : oracle ? null : `Use ${DATE_TIME_PLACEHOLDER}`);
  }
});

const now = new Date("2026-09-24T08:00:00Z");

test("UTC fixed-slot layout clips grid and midnight boundaries with stable ties and minute rounding", () => {
  const originalTimezone = process.env.TZ;
  try {
    process.env.TZ = "UTC";
    // Independently specified visible offsets/durations in minutes from 06:00.
    // The 16-hour grid is 960 minutes; fractional timestamps round to nearest minute.
    const fixtures: [string, string, string, number, number][] = [
      ["cross-end", "2026-09-24T21:00:00Z", "2026-09-24T23:00:00Z", 900, 60],
      ["z-equal-start", "2026-09-24T09:00:00Z", "2026-09-24T10:00:00Z", 180, 60],
      ["cross-start", "2026-09-24T05:00:00Z", "2026-09-24T07:00:00Z", 0, 60],
      ["a-equal-start", "2026-09-24T09:00:00Z", "2026-09-24T09:15:00Z", 180, 15],
      ["from-midnight", "2026-09-23T23:00:00Z", "2026-09-24T08:00:00Z", 0, 120],
      ["through-midnight", "2026-09-24T20:00:00Z", "2026-09-25T01:00:00Z", 840, 120],
      ["whole-grid", "2026-09-23T23:00:00Z", "2026-09-25T01:00:00Z", 0, 960],
      ["starts-at-six", "2026-09-24T06:00:00Z", "2026-09-24T06:30:00Z", 0, 30],
      ["ends-at-twenty-two", "2026-09-24T21:30:00Z", "2026-09-24T22:00:00Z", 930, 30],
      ["below-half", "2026-09-24T10:00:29.999Z", "2026-09-24T10:01:29.999Z", 240, 1],
      ["at-half", "2026-09-24T10:00:30.000Z", "2026-09-24T10:01:30.000Z", 241, 1],
      ["above-half", "2026-09-24T10:00:30.001Z", "2026-09-24T10:02:30.001Z", 241, 2],
      ["ends-at-six", "2026-09-24T05:00:00Z", "2026-09-24T06:00:00Z", 0, 0],
      ["starts-at-twenty-two", "2026-09-24T22:00:00Z", "2026-09-24T23:00:00Z", 0, 0],
      ["ends-at-midnight", "2026-09-23T23:00:00Z", "2026-09-24T00:00:00Z", 0, 0],
      ["next-midnight", "2026-09-25T00:00:00Z", "2026-09-25T07:00:00Z", 0, 0],
      ["rounded-empty", "2026-09-24T21:59:30.000Z", "2026-09-24T22:00:00Z", 0, 0]
    ];
    const slots: ScheduleSlot[] = fixtures.map(([id, startsAt, endsAt]) => ({
      id, startsAt, endsAt, ownerId: "owner", kind: "fixed", slotStatus: "scheduled",
      label: id, createdAt: now.toISOString(), updatedAt: now.toISOString()
    }));
    const before = structuredClone(slots);
    const entries = layoutBoxesOnDay(slots, new Date("2026-09-24T12:00:00Z"));
    assert.deepEqual(entries.map(({ slot }) => slot.id), [
      "cross-start", "from-midnight", "whole-grid", "starts-at-six",
      "z-equal-start", "a-equal-start", "below-half", "at-half", "above-half",
      "through-midnight", "cross-end", "ends-at-twenty-two"
    ]);
    for (const [index, [id, , , offsetMinutes, visibleMinutes]] of fixtures.entries()) {
      const entry = entries.find(({ slot }) => slot.id === id);
      if (visibleMinutes === 0) {
        assert.equal(entry, undefined, id);
        continue;
      }
      assert.ok(entry, id);
      assert.strictEqual(entry.slot, slots[index], `${id}: original slot identity`);
      assert.ok(Math.abs(entry.topPct - offsetMinutes * 100 / 960) < 1e-12, `${id}: top`);
      assert.ok(Math.abs(entry.heightPct - visibleMinutes * 100 / 960) < 1e-12, `${id}: height`);
      assert.ok(Number.isFinite(entry.topPct) && entry.topPct >= 0, `${id}: finite nonnegative top`);
      assert.ok(Number.isFinite(entry.heightPct) && entry.heightPct > 0, `${id}: finite positive height`);
      assert.ok(entry.topPct + entry.heightPct <= 100 + 1e-12, `${id}: clipped to grid`);
      assert.equal(entry.lane, 0, `${id}: existing lane policy`);
    }
    assert.deepEqual(slots, before, "layout must preserve input values and order");
  } finally {
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  }
});

test("due presets and membership use local midnight and Monday weeks, including DST and leap day", () => {
  const originalTimezone = process.env.TZ;
  try {
    // Explicit civil boundaries with Berlin offsets; UTC repeats the same calendar dates as a control.
    const cases = [
      ["Monday", "2026-09-21", "2026-09-22", "2026-09-21", "2026-09-27", "2026-09-28", "+02:00", "+02:00", "+02:00", "+02:00"],
      ["Sunday", "2026-09-27", "2026-09-28", "2026-09-21", "2026-09-27", "2026-09-28", "+02:00", "+02:00", "+02:00", "+02:00"],
      ["leap day", "2024-02-29", "2024-03-01", "2024-02-26", "2024-03-03", "2024-03-04", "+01:00", "+01:00", "+01:00", "+01:00"],
      ["spring DST", "2026-03-29", "2026-03-30", "2026-03-23", "2026-03-29", "2026-03-30", "+01:00", "+02:00", "+01:00", "+02:00"],
      ["fall DST", "2026-10-25", "2026-10-26", "2026-10-19", "2026-10-25", "2026-10-26", "+02:00", "+01:00", "+02:00", "+01:00"]
    ] as const;
    for (const timezone of ["UTC", "Europe/Berlin"]) {
      process.env.TZ = timezone;
      for (const [label, day, nextDay, monday, sunday, nextMonday, dayOffset, endOffset, mondayOffset, nextMondayOffset] of cases) {
        const offset = (berlin: string) => timezone === "UTC" ? "Z" : berlin;
        const dayStart = new Date(`${day}T00:00:00${offset(dayOffset)}`).getTime();
        const dayEnd = new Date(`${nextDay}T00:00:00${offset(endOffset)}`).getTime();
        const weekStart = new Date(`${monday}T00:00:00${offset(mondayOffset)}`).getTime();
        const weekEnd = new Date(`${nextMonday}T00:00:00${offset(nextMondayOffset)}`).getTime();
        const todayDue = new Date(`${day}T23:59:59.000${offset(endOffset)}`).toISOString();
        const weekDue = new Date(`${sunday}T23:59:59.000${offset(nextMondayOffset)}`).toISOString();
        const context = `${timezone}: ${label}`;
        const expectedDayHours = timezone === "UTC" ? 24 : label === "spring DST" ? 23 : label === "fall DST" ? 25 : 24;
        assert.equal((dayEnd - dayStart) / 3_600_000, expectedDayHours, context);
        assert.equal((weekEnd - weekStart) / 3_600_000, 144 + expectedDayHours, context);
        for (const timestamp of [dayStart, dayStart + 1, dayEnd - 1]) {
          const reference = new Date(timestamp);
          assert.equal(dueAtForPreset(reference, "today"), todayDue, context);
          assert.equal(reference.getTime(), timestamp, "today preset must not mutate now");
          assert.equal(dueAtForPreset(reference, "week"), weekDue, context);
          assert.equal(reference.getTime(), timestamp, "week preset must not mutate now");
          for (const [boundary, predicate] of [
            [[dayStart, dayEnd], isDueSameLocalDay],
            [[weekStart, weekEnd], isDueThisWeek]
          ] as const) {
            const [start, end] = boundary;
            for (const [due, expected] of [
              [start - 1, false], [start, true], [start + 1, true],
              [end - 1, true], [end, false], [end + 1, false]
            ] as const) {
              assert.equal(predicate(new Date(due).toISOString(), reference), expected, `${context}: ${predicate.name} @ ${due}`);
              assert.equal(reference.getTime(), timestamp, "membership must not mutate now");
            }
          }
        }
        // Crossing midnight leaves today's due date; Sunday also leaves the current week.
        const nextReference = new Date(dayEnd);
        assert.equal(isDueSameLocalDay(todayDue, nextReference), false, context);
        assert.equal(isDueThisWeek(weekDue, nextReference), day !== sunday, context);
        assert.equal(nextReference.getTime(), dayEnd);
      }
    }
  } finally {
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  }
});

test("overdue compares exact instants and Berlin repeated hours remain in the same local day", () => {
  const originalTimezone = process.env.TZ;
  try {
    for (const timezone of ["UTC", "Europe/Berlin"]) {
      process.env.TZ = timezone;
      for (const due of [
        "2024-02-29T23:59:59.000Z", "2026-09-21T00:00:00Z", "2026-09-27T23:59:59.000Z",
        "2026-03-29T01:00:00Z", "2026-10-25T02:30:00+02:00", "2026-10-25T02:30:00+01:00"
      ]) {
        const deadline = new Date(due).getTime();
        for (const delta of [-1, 0, 1]) {
          const reference = new Date(deadline + delta);
          assert.equal(isOverdue(due, reference), delta > 0, `${timezone}: ${due} ${delta}ms`);
          assert.equal(isOverdue(new Date(deadline).toISOString(), reference), delta > 0);
          assert.equal(reference.getTime(), deadline + delta);
        }
      }
      const reference = new Date("2026-10-25T02:30:00+01:00");
      for (const absent of [null, undefined, "", "not-a-date"]) {
        for (const predicate of [isOverdue, isDueSameLocalDay, isDueThisWeek]) {
          assert.equal(predicate(absent, reference), false);
          assert.equal(reference.toISOString(), "2026-10-25T01:30:00.000Z");
        }
      }
    }
    process.env.TZ = "Europe/Berlin";
    const secondHour = new Date("2026-10-25T02:30:00+01:00");
    const firstHour = "2026-10-25T02:30:00+02:00";
    assert.equal(isDueSameLocalDay(firstHour, secondHour), true);
    assert.equal(isDueThisWeek(firstHour, secondHour), true);
    assert.equal(isOverdue(firstHour, secondHour), true);
    assert.equal(secondHour.toISOString(), "2026-10-25T01:30:00.000Z");
  } finally {
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  }
});

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

test("box labels preserve exact strings, link encounter order and inputs", () => {
  const cases: [string, string, string, string[], string][] = [
    ["appointment", "appt:visit", " Visit ", [], " Visit "],
    ["appointment ignores links", "appt:visit", " Visit ", ["z", "a"], " Visit "],
    ["empty appointment", "appt:visit", "", ["z"], ""],
    ["blank appointment", "appt:visit", " \t ", [], " \t "],
    ["explicit zero", "block", " Work ", [], " Work "],
    ["explicit one", "block", " Work ", ["z"], " Work  · Zulu"],
    ["explicit multiple", "block", "Work", ["z", "a"], "Work · 2 tasks"],
    ["explicit duplicates", "block", "Work", ["z", "z", "a"], "Work · 3 tasks"],
    ["explicit missing title", "block", "Work", ["missing"], "Work · task"],
    ["explicit empty title", "block", "Work", ["empty"], "Work · "],
    ["empty zero", "block", "", [], "Free"],
    ["blank zero", "block", " \t ", [], "Free"],
    ["blank one", "block", " \t ", ["z"], "Zulu"],
    ["empty multiple", "block", "", ["z", "a", "empty"], "Zulu +2"],
    ["reversed encounter order", "block", "", ["a", "z", "empty"], "Alpha +2"],
    ["blank duplicates", "block", " \t ", ["z", "z"], "Zulu +1"],
    ["blank missing title", "block", "", ["missing"], "Untitled"],
    ["missing first title", "block", "", ["missing", "a"], "Untitled +1"],
    ["blank empty title", "block", "", ["empty"], ""],
    ["empty first title", "block", "", ["empty", "a"], " +1"]
  ];
  for (const [name, id, label, taskIds, expected] of cases) {
    const slot: ScheduleSlot = {
      id, label, ownerId: "owner", kind: "fixed", slotStatus: "scheduled",
      startsAt: now.toISOString(), endsAt: "2026-09-24T09:00:00Z",
      createdAt: now.toISOString(), updatedAt: now.toISOString()
    };
    const makeLink = (linkId: string, fromId: string, toId: string, kind: ItemLink["kind"]): ItemLink => ({
      id: linkId, ownerId: "owner", fromId, toId, kind,
      createdAt: now.toISOString(), updatedAt: now.toISOString()
    });
    const links = [
      makeLink("context", "a", id, "context"),
      makeLink("elsewhere", "a", "other-block", "scheduled_in"),
      makeLink("outgoing", id, "a", "scheduled_in"),
      ...taskIds.map((taskId, index) => makeLink(`link-${index}`, taskId, id, "scheduled_in"))
    ];
    const titles = new Map([["a", "Alpha"], ["z", "Zulu"], ["empty", ""]]);
    const before = structuredClone({ slot, links, titles });
    assert.equal(boxDisplayLabel(slot, links, titles), expected, name);
    assert.deepEqual({ slot, links, titles }, before, `${name}: inputs must not mutate`);
  }
});

test("review orders valid deadlines by instant and undated tasks deterministically", () => {
  const reviewTask = (id: string, title: string, taskDueAt: string): Item => ({
    id, title, isTask: true, taskStatus: "active", expectedDurationMinutes: 30,
    taskDueAt, taskFixedStartsAt: "", taskFixedEndsAt: "", parentTaskId: "",
    manualRelevance: 5, tags: [], createdAt: now.toISOString()
  } as Item);
  const tasks = [
    reviewTask("later-offset", "Later", "2026-09-24T09:00:00Z"),
    reviewTask("undated-z", "Zulu", ""),
    reviewTask("earlier-offset", "Earlier", "2026-09-24T06:30:00Z"),
    reviewTask("invalid", "Invalid", "not-a-date"),
    reviewTask("equivalent", "Equivalent", "2026-09-24T08:30:00+02:00"),
    reviewTask("undated-a", "Alpha", "")
  ];

  assert.deepEqual(tasks.sort(byDueThenTitle).map(({ id }) => id), [
    "earlier-offset", "equivalent", "later-offset", "undated-a", "invalid", "undated-z"
  ]);
});

test("recurrence horizon rejects invalid dates", () => {
  const daily = { frequency: "daily", interval: 1, horizonDays: 2 } as const;
  assert.deepEqual(occurrenceKeysInHorizon(daily, new Date("invalid"), now), []);
  assert.deepEqual(occurrenceKeysInHorizon(daily, now, new Date("invalid")), []);

  for (const interval of [0, Number.POSITIVE_INFINITY, Number.NaN]) {
    assert.deepEqual(occurrenceKeysInHorizon(
      { frequency: "daily", interval, horizonDays: 2 }, now, now
    ), []);
  }
  for (const horizonDays of [0, Number.POSITIVE_INFINITY, Number.NaN]) {
    assert.deepEqual(occurrenceKeysInHorizon(
      { frequency: "daily", interval: 1, horizonDays }, now, now
    ), []);
  }
});

test("ordinary recurrence fixtures follow local civil dates and include the horizon endpoint", () => {
  const originalTimezone = process.env.TZ;
  try {
    for (const timezone of ["Europe/Berlin", "UTC"]) {
      process.env.TZ = timezone;
      assert.deepEqual(occurrenceKeysInHorizon(
        { frequency: "daily", interval: 2, horizonDays: 6 },
        new Date(2026, 2, 27), new Date(2026, 2, 27)
      ), ["2026-03-27", "2026-03-29", "2026-03-31", "2026-04-02"]);

      assert.deepEqual(occurrenceKeysInHorizon(
        { frequency: "monthly", interval: 1, horizonDays: 365 },
        new Date(2024, 1, 29), new Date(2024, 1, 29)
      ), ["2024-02-29", "2024-03-29", "2024-04-29", "2024-05-29", "2024-06-29", "2024-07-29", "2024-08-29", "2024-09-29", "2024-10-29", "2024-11-29", "2024-12-29", "2025-01-29"]);

      assert.deepEqual(occurrenceKeysInHorizon(
        { frequency: "monthly", interval: 1, horizonDays: 120 },
        new Date(2026, 0, 31), new Date(2026, 0, 31)
      ), ["2026-01-31", "2026-03-31", "2026-05-31"]);
    }

    process.env.TZ = "Europe/Berlin";
    assert.deepEqual(occurrenceKeysInHorizon(
      { frequency: "daily", interval: 1, horizonDays: 3 },
      new Date(2026, 2, 28), new Date(2026, 2, 28)
    ), ["2026-03-28", "2026-03-29", "2026-03-30", "2026-03-31"]);
    assert.deepEqual(occurrenceKeysInHorizon(
      { frequency: "daily", interval: 1, horizonDays: 3 },
      new Date(2026, 9, 24), new Date(2026, 9, 24)
    ), ["2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27"]);

    process.env.TZ = "UTC";
    assert.deepEqual(occurrenceKeysInHorizon(
      { frequency: "weekly", interval: 2, horizonDays: 28 },
      new Date(2026, 0, 1), new Date(2026, 0, 1)
    ), ["2026-01-01", "2026-01-15", "2026-01-29"]);
  } finally {
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  }
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

test("work windows preserve nominal hours and input dates at remaining-time boundaries", () => {
  for (const [kind, label, startHour, endHour] of [
    ["morning", "Morning", 9, 12], ["afternoon", "Afternoon", 13, 17]
  ] as const) {
    const start = new Date(2026, 8, 24, startHour);
    const end = new Date(2026, 8, 24, endHour);
    const threshold = end.getTime() - 20 * 60_000;
    for (const [timestamp, expectedStart] of [
      [start.getTime() - 1, start.getTime()],
      [start.getTime(), start.getTime()],
      [start.getTime() + 1, start.getTime() + 1],
      [threshold, threshold],
      [threshold + 1, null],
      [end.getTime(), null],
      [end.getTime() + 1, null]
    ] as const) {
      const input = new Date(timestamp);
      const context = `${kind} at ${input.toISOString()}`;
      assert.deepEqual(nominalWorkWindow(input, kind), { startsAt: start, endsAt: end }, context);
      assert.equal(input.getTime(), timestamp, context);
      const spec = workBlockForNow(input, kind);
      assert.deepEqual(spec, expectedStart === null ? null : {
        kind, label, startsAt: new Date(expectedStart), endsAt: end
      }, context);
      assert.equal(input.getTime(), timestamp, context);
      if (spec) assert.notStrictEqual(spec.startsAt, input);
    }
  }
});

test("work block overlap preserves asymmetric touching boundaries and ignores archived slots", () => {
  const spec = {
    kind: "morning" as const, label: "Morning",
    startsAt: new Date("2026-09-24T09:00:00Z"), endsAt: new Date("2026-09-24T12:00:00Z")
  };
  const snapshot = structuredClone(spec);
  const cases = [
    // Existing overlap contract includes a slot ending at start, but excludes one starting at end.
    ["ends at start", "08:00:00.000", "09:00:00.000", true],
    ["ends 1ms before start", "08:00:00.000", "08:59:59.999", false],
    ["starts at end", "12:00:00.000", "13:00:00.000", false],
    ["overlaps start by 1ms", "08:00:00.000", "09:00:00.001", true],
    ["overlaps end by 1ms", "11:59:59.999", "13:00:00.000", true],
    ["identical", "09:00:00.000", "12:00:00.000", true],
    ["contained", "10:00:00.000", "11:00:00.000", true],
    ["enclosing", "08:00:00.000", "13:00:00.000", true]
  ] as const;
  assert.equal(workBlockOverlapsExisting(spec, []), false);
  const activeSlots: ScheduleSlot[] = [];
  for (const [label, start, end, overlaps] of cases) {
    const slot: ScheduleSlot = {
      id: label, ownerId: "owner", kind: "fixed", label,
      startsAt: `2026-09-24T${start}Z`, endsAt: `2026-09-24T${end}Z`,
      slotStatus: "scheduled", createdAt: "", updatedAt: ""
    };
    activeSlots.push(slot);
    for (const slotStatus of ["scheduled", "archived"] as const) {
      const slots = [{ ...slot, slotStatus }];
      const before = structuredClone(slots);
      assert.equal(workBlockOverlapsExisting(spec, slots), overlaps && slotStatus === "scheduled", `${label}: ${slotStatus}`);
      assert.deepEqual(slots, before);
      assert.deepEqual(spec, snapshot);
    }
  }
  assert.equal(workBlockOverlapsExisting(spec, activeSlots.map(slot => ({ ...slot, slotStatus: "archived" }))), false);
  assert.equal(workBlockOverlapsExisting(spec, [
    ...activeSlots.map(slot => ({ ...slot, slotStatus: "archived" as const })),
    activeSlots[1], activeSlots[2], activeSlots[6]
  ]), true);
});

test("work windows follow Berlin civil hours across spring and fall DST transitions", () => {
  const originalTimezone = process.env.TZ;
  try {
    process.env.TZ = "Europe/Berlin";
    // Midnight is still on the old offset on transition days; work hours use the new offset.
    for (const [date, midnightOffset, workOffset, morningStart, morningEnd, afternoonStart, afternoonEnd] of [
      ["2026-03-28", "+01:00", -60, "08:00", "11:00", "12:00", "16:00"],
      ["2026-03-29", "+01:00", -120, "07:00", "10:00", "11:00", "15:00"],
      ["2026-03-30", "+02:00", -120, "07:00", "10:00", "11:00", "15:00"],
      ["2026-10-24", "+02:00", -120, "07:00", "10:00", "11:00", "15:00"],
      ["2026-10-25", "+02:00", -60, "08:00", "11:00", "12:00", "16:00"],
      ["2026-10-26", "+01:00", -60, "08:00", "11:00", "12:00", "16:00"]
    ] as const) {
      const input = new Date(`${date}T00:00:00${midnightOffset}`);
      const timestamp = input.getTime();
      for (const [kind, label, start, end, localStart, localEnd] of [
        ["morning", "Morning", morningStart, morningEnd, 9, 12],
        ["afternoon", "Afternoon", afternoonStart, afternoonEnd, 13, 17]
      ] as const) {
        const expected = {
          startsAt: new Date(`${date}T${start}:00Z`), endsAt: new Date(`${date}T${end}:00Z`)
        };
        const window = nominalWorkWindow(input, kind);
        assert.deepEqual(window, expected, `${date}: ${kind}`);
        assert.equal(input.getTime(), timestamp);
        assert.deepEqual(workBlockForNow(input, kind), { kind, label, ...expected });
        assert.equal(input.getTime(), timestamp);
        assert.equal(window.startsAt.getHours(), localStart);
        assert.equal(window.endsAt.getHours(), localEnd);
        assert.equal(window.startsAt.getTimezoneOffset(), workOffset);
        assert.equal(window.endsAt.getTimezoneOffset(), workOffset);
      }
    }
  } finally {
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  }
});

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

test("Now deduplicates current tasks across overlapping intervals and duplicate links", () => {
  const currentA = block("overlap-a", "2026-09-24T07:30:00Z", "2026-09-24T09:00:00Z");
  const currentB = block("overlap-b", "2026-09-24T07:00:00Z", "2026-09-24T09:00:00Z");
  const active = task("linked", 30);
  const distinct = task("distinct", 30);
  const inactive = { ...task("inactive", 30), taskStatus: "done" as const };
  const links = [
    { kind: "scheduled_in", fromId: active.id, toId: currentB.id },
    { kind: "scheduled_in", fromId: distinct.id, toId: currentB.id },
    { kind: "scheduled_in", fromId: "orphan", toId: currentA.id },
    { kind: "context", fromId: "wrong-kind", toId: currentA.id },
    { kind: "scheduled_in", fromId: active.id, toId: currentA.id },
    { kind: "scheduled_in", fromId: inactive.id, toId: currentA.id },
    { kind: "scheduled_in", fromId: active.id, toId: currentB.id }
  ] as ItemLink[];
  const items = [currentA, currentB, active, distinct, inactive];
  assert.deepEqual(buildNowFocus(items, links, now), {
    primary: { item: active, reason: `In ${currentA.title}` },
    committed: [{ item: distinct, reason: "Also in this interval" }],
    suggestion: null
  });
});

test("Now observes stale and future links excluding suggestions without creating commitments", () => {
  const reference = new Date(2026, 8, 24, 12);
  const archived = {
    ...block("archived", new Date(2026, 8, 24, 11).toISOString(), new Date(2026, 8, 24, 13).toISOString()),
    intervalStatus: "archived"
  };
  const tomorrow = block("future", new Date(2026, 8, 25, 11).toISOString(), new Date(2026, 8, 25, 13).toISOString());
  const linkedQuick = task("linked-quick", 2);
  const available = task("available", 30);

  // Characterization only: the docs do not decide whether stale links should be
  // repaired or their tasks released. Preserve the existing suggestion exclusion.
  for (const [targetId, intervals] of [
    ["absent", []], [archived.id, [archived]], [tomorrow.id, [tomorrow]]
  ] as const) {
    const links = [{ kind: "scheduled_in", fromId: linkedQuick.id, toId: targetId }] as ItemLink[];
    assert.deepEqual(buildNowFocus([...intervals, linkedQuick, available], links, reference), {
      primary: { item: available, reason: "Highest start-now motivation among unscheduled work" },
      committed: [],
      suggestion: null
    }, targetId);
    assert.deepEqual(buildNowFocus([...intervals, linkedQuick], links, reference), {
      primary: null, committed: [], suggestion: null
    }, targetId);
    assert.deepEqual(buildNowFocus([...intervals, linkedQuick, available], [], reference), {
      primary: { item: linkedQuick, reason: "Two minutes or less — do it now, don’t calendar it" },
      committed: [],
      suggestion: null
    }, `${targetId}: unlinked control`);
  }
});

test("Now filters orphan and inactive links and keeps block then link order for current and today commitments", () => {
  const reference = new Date(2026, 8, 24, 12);
  const currentA = block("input-first", new Date(2026, 8, 24, 11).toISOString(), new Date(2026, 8, 24, 13).toISOString());
  const currentB = block("starts-earlier", new Date(2026, 8, 24, 10).toISOString(), new Date(2026, 8, 24, 13).toISOString());
  const firstLinked = task("first-linked", 30);
  const shared = task("shared", 30);
  const other = task("other", 30);
  const inactive = (["done", "cancelled", "later"] as const).map((taskStatus) => ({
    ...task(taskStatus, 2), taskStatus
  }));
  const nonTask = { ...task("non-task", 2), isTask: false };
  const available = task("unscheduled", 30);
  const link = (fromId: string, toId: string): ItemLink => ({ kind: "scheduled_in", fromId, toId } as ItemLink);
  // Global link order and task order both differ from interval traversal order.
  const links = [
    link(other.id, currentB.id), link(shared.id, currentB.id),
    ...["orphan", ...inactive.map((item) => item.id), nonTask.id].flatMap((id) => [
      link(id, currentA.id), link(id, currentB.id)
    ]),
    link(firstLinked.id, currentA.id), link(shared.id, currentA.id),
    link(firstLinked.id, currentA.id), link(other.id, currentB.id)
  ];
  const tasks = [other, shared, ...inactive, nonTask, available, firstLinked];
  for (const intervals of [[currentA, currentB], [currentB, currentA]]) {
    const [primary, ...committed] = intervals[0] === currentA
      ? [firstLinked, shared, other]
      : [other, shared, firstLinked];
    assert.deepEqual(buildNowFocus([...intervals, ...tasks], links, reference), {
      primary: { item: primary, reason: `In ${intervals[0].title}` },
      committed: committed.map((item) => ({ item, reason: "Also in this interval" })),
      suggestion: null
    });
    // Once both blocks end, the same filtered, duplicate-free order is retained
    // as today's commitments, with unscheduled work available as a suggestion.
    assert.deepEqual(buildNowFocus([...intervals, ...tasks], links, new Date(2026, 8, 24, 14)), {
      primary: { item: primary, reason: "Committed today" },
      committed: committed.map((item) => ({ item, reason: "Also today" })),
      suggestion: { item: available, reason: "Highest start-now motivation among unscheduled work" }
    });
  }
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

test("Now parses active appointments once and preserves overlap priority and half-open boundaries", () => {
  const appointment = (id: string, start: string, end: string, taskStatus: Item["taskStatus"] = "active"): Item => ({
    ...task(id, 30), taskStatus, taskFixedStartsAt: start, taskFixedEndsAt: end
  });
  const endsFirst = appointment("ends-first", "2026-09-24T07:00:00Z", "2026-09-24T08:20:00Z");
  const tieFirst = appointment("tie-first-appt", "2026-09-24T08:00:00Z", "2026-09-24T08:30:00Z");
  const tieSecond = appointment("tie-second-appt", "2026-09-24T07:30:00Z", "2026-09-24T08:30:00Z");
  const invalidStart = appointment("invalid-start", "invalid", "2026-09-24T08:10:00Z");
  const invalidEnd = appointment("invalid-end", "2026-09-24T07:00:00Z", "invalid");
  const endedAtNow = appointment("ended-at-now", "2026-09-24T07:00:00Z", "2026-09-24T08:00:00Z");
  const inactive = appointment("inactive-live", "2026-09-24T07:00:00Z", "2026-09-24T08:10:00Z", "done");

  assert.deepEqual(buildNowFocus(
    [tieFirst, invalidStart, inactive, endsFirst, endedAtNow, tieSecond, invalidEnd], [], now
  ), {
    primary: { item: endsFirst, reason: "Fixed appointment now" },
    committed: [
      { item: tieFirst, reason: "Also in range" },
      { item: tieSecond, reason: "Also in range" }
    ],
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

test("Now gives idle quick work precedence over long work with complete output", () => {
  const quick = task("idle-quick", 2);
  const long = task("idle-long", 90);

  assert.deepEqual(buildNowFocus([long, quick], [], now), {
    primary: { item: quick, reason: "Two minutes or less — do it now, don’t calendar it" },
    committed: [],
    suggestion: null
  });
});

test("Now excludes already scheduled and half-fixed quick tasks from idle suggestions", () => {
  const tomorrow = block("tomorrow", "2026-09-25T09:00:00Z", "2026-09-25T10:00:00Z");
  const scheduledQuick = task("scheduled-quick", 2);
  const halfFixedQuick = { ...task("half-fixed-quick", 2), taskFixedStartsAt: "2026-09-24T10:00:00Z" };
  const long = task("available-long", 60);
  const links = [
    { kind: "scheduled_in", fromId: scheduledQuick.id, toId: tomorrow.id }
  ] as ItemLink[];

  assert.deepEqual(buildNowFocus([scheduledQuick, halfFixedQuick, long, tomorrow], links, now), {
    primary: { item: long, reason: "Highest start-now motivation among unscheduled work" },
    committed: [],
    suggestion: null
  });
  assert.deepEqual(buildNowFocus([halfFixedQuick], [], now), {
    primary: null,
    committed: [],
    suggestion: null
  });
});

test("Now does not apply idle quick precedence in an empty current interval", () => {
  const emptyCurrent = block("empty-current", "2026-09-24T07:30:00Z", "2026-09-24T08:30:00Z");
  const quick = { ...task("quick", 2), manualRelevance: 1 };
  const long = { ...task("long", 60), manualRelevance: 10 };

  assert.deepEqual(buildNowFocus([emptyCurrent, quick, long], [], now), {
    primary: { item: long, reason: "Highest start-now motivation among unscheduled work" },
    committed: [],
    suggestion: null
  });
});

test("Now keeps today commitments primary and provides a ranked non-idle suggestion", () => {
  const todayBlock = block("later-today", "2026-09-24T10:00:00Z", "2026-09-24T11:00:00Z");
  const committed = task("committed-today", 30);
  const quick = { ...task("quick", 2), manualRelevance: 1 };
  const long = { ...task("long", 60), manualRelevance: 10 };
  const links = [{ kind: "scheduled_in", fromId: committed.id, toId: todayBlock.id }] as ItemLink[];

  assert.deepEqual(buildNowFocus([todayBlock, committed, quick, long], links, now), {
    primary: { item: committed, reason: "Committed today" },
    committed: [],
    suggestion: { item: long, reason: "Highest start-now motivation among unscheduled work" }
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

test("calendar export rejects malformed, reversed, and zero-length appointments", () => {
  const appointment = (id: string, start: string, end: string) => ({
    ...task(id, 30), taskFixedStartsAt: start, taskFixedEndsAt: end
  });
  const valid = appointment("valid-range", "2026-09-24T11:00:00Z", "2026-09-24T11:30:00Z");
  const events = selectCalendarEvents([
    valid,
    appointment("reversed-range", "2026-09-24T12:00:00Z", "2026-09-24T11:30:00Z"),
    appointment("zero-range", "2026-09-24T12:00:00Z", "2026-09-24T12:00:00Z"),
    appointment("malformed-start", "not-a-date", "2026-09-24T12:30:00Z"),
    appointment("malformed-end", "2026-09-24T12:00:00Z", "not-a-date")
  ], [], now);

  assert.deepEqual(events.map(({ uid }) => uid), ["atlas-appt-valid-range@atlas"]);
  assert.match(calendarIcs([valid], [], now), /DTSTART:20260924T110000Z\r\nDTEND:20260924T113000Z/);
});

test("calendar exports are empty for invalid enumeration inputs", () => {
  const appointment = {
    ...task("invalid-range-appointment", 30), title: "Call",
    taskFixedStartsAt: "2026-09-24T11:00:00Z", taskFixedEndsAt: "2026-09-24T11:30:00Z"
  };
  const items = [appointment];
  const emptyCalendar = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Atlas//EN", "CALSCALE:GREGORIAN", "END:VCALENDAR"
  ].join("\r\n");

  assert.deepEqual(selectCalendarEvents(items, [], new Date(Number.NaN)), []);
  for (const dayCount of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.deepEqual(selectCalendarEvents(items, [], now, dayCount), []);
    assert.equal(calendarIcs(items, [], now, dayCount), emptyCalendar);
  }
  assert.deepEqual(selectCalendarEvents(items, [], now, Number.MAX_VALUE).map(({ uid }) => uid), [
    "atlas-appt-invalid-range-appointment@atlas"
  ]);
  assert.equal(calendarIcs(items, [], new Date(Number.NaN)), emptyCalendar);
});

test("calendar exports use the supplied timestamp consistently and deterministically", () => {
  const items = [
    block("first-export-block", "2026-09-24T09:00:00Z", "2026-09-24T10:00:00Z"),
    block("second-export-block", "2026-09-24T10:00:00Z", "2026-09-24T11:00:00Z")
  ];
  const firstExport = calendarIcs(items, [], now);
  const secondExport = calendarIcs(items, [], now);

  assert.equal(firstExport, secondExport);
  assert.equal((firstExport.match(/DTSTAMP:20260924T080000Z/g) ?? []).length, 2);
  assert.match(firstExport, /UID:atlas-interval-first-export-block@atlas/);
  assert.match(firstExport, /UID:atlas-interval-second-export-block@atlas/);
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

test("VEVENT serialization escapes every newline form to exact calendar bytes", () => {
  const serialized = serializeVevent({
    uid: "event@atlas", start: new Date("2026-09-24T09:00:00Z"), end: new Date("2026-09-24T10:00:00Z"),
    summary: "Title\r\nnext\rline\n😀,;\\end",
    description: "Detail\r\nnext\rline\n雪,;\\end"
  }, new Date("2026-09-24T08:00:00Z"));
  const expected = [
    "BEGIN:VEVENT",
    "UID:event@atlas",
    "DTSTAMP:20260924T080000Z",
    "DTSTART:20260924T090000Z",
    "DTEND:20260924T100000Z",
    "SUMMARY:Title\\nnext\\nline\\n😀\\,\\;\\\\end",
    "DESCRIPTION:Detail\\nnext\\nline\\n雪\\,\\;\\\\end",
    "BEGIN:VALARM",
    "TRIGGER:-PT10M",
    "ACTION:DISPLAY",
    "DESCRIPTION:Title\\nnext\\nline\\n😀\\,\\;\\\\end",
    "END:VALARM",
    "END:VEVENT"
  ].join("\r\n");

  assert.deepEqual(new TextEncoder().encode(serialized), new TextEncoder().encode(expected));
});

test("VEVENT serialization folds long UTF-8 lines and unfolds to the original content", () => {
  const event = {
    uid: "folding-event@atlas", start: now, end: new Date(now.getTime() + 60_000),
    summary: `${"A".repeat(68)}😀${"e\u0301".repeat(24)}`,
    description: `${"description ".repeat(12)}🙂${"x".repeat(90)}`
  };
  const serialized = serializeVevent(event, now);
  const physicalLines = serialized.split("\r\n");
  const unfoldedLines = serialized.replace(/\r\n /g, "").split("\r\n");

  assert.ok(physicalLines.every((line) => new TextEncoder().encode(line).length <= 75));
  assert.ok(physicalLines.some((line) => line.startsWith(" ")));
  assert.deepEqual(unfoldedLines, [
    "BEGIN:VEVENT", "UID:folding-event@atlas", "DTSTAMP:20260924T080000Z",
    "DTSTART:20260924T080000Z", "DTEND:20260924T080100Z",
    `SUMMARY:${event.summary}`, `DESCRIPTION:${event.description}`,
    "BEGIN:VALARM", "TRIGGER:-PT10M", "ACTION:DISPLAY",
    `DESCRIPTION:${event.summary}`, "END:VALARM", "END:VEVENT"
  ]);
});
