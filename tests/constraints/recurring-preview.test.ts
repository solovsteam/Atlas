import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { generateRecurringPreview, RECURRING_PREVIEW_VERSION, type RoutineSpec, type RoutineInput, type PreviewOccurrence } from "../../shared/recurringPreview.ts";

function fixture(): { spec: RoutineSpec; horizon: { startDate: string; days: 7 }; timezone: RoutineInput } {
  return JSON.parse(readFileSync(new URL("../../scripts/fixtures/weekly-routine.json", import.meta.url), "utf8"));
}
function preview(request = fixture()) { return generateRecurringPreview(request.spec, request.horizon, request.timezone); }
function explicit() {
  const request = fixture();
  for (const i of Object.values(request.spec.inputs)) if (i.value === null) { i.value = i.placeholder!; delete i.placeholder; }
  request.timezone = { label: "Explicit test timezone (not human testimony)", value: "Europe/Berlin" };
  return request;
}
function local(stamp: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(stamp));
}
function overlaps(a: PreviewOccurrence, b: PreviewOccurrence) {
  return Date.parse(a.startsAt!) < Date.parse(b.endsAt!) && Date.parse(b.startsAt!) < Date.parse(a.endsAt!);
}

test("WEEKLY_CASE produces seven dated days, base and optional sessions, meals and named buffers", () => {
  const result = preview();
  assert.equal(result.status, "provisional");
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.sleep.map((s) => s.date), ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"]);
  for (const [rule, count] of Object.entries({ "weekday-work": 5, gym: 3, run: 1, groceries: 1, breakfast: 7, dinner: 7, "pre-sleep": 7, "surprise-buffer": 7, "waking-capacity": 7 })) {
    const occurrences = result.occurrences.filter((o) => o.sourceRuleId === rule);
    assert.equal(occurrences.length, count, rule);
    assert.ok(occurrences.every((o) => o.status === "placed"), rule);
  }
  assert.equal(result.occurrences.filter((o) => o.sourceRuleId === "gym" && o.optional).length, 1);
  assert.ok(!result.occurrences.some((o) => o.sourceRuleId === "lunch"));
  for (const o of result.occurrences.filter((o) => o.kind === "buffer")) {
    assert.equal(o.title, "Daily surprise buffer");
    assert.equal(o.durationMinutes, 20);
    assert.equal(Date.parse(o.endsAt!) - Date.parse(o.startsAt!), 20 * 60_000);
  }
});

test("work blocks every activity and reserved buffer, availability adds capacity without blocking", () => {
  const result = preview();
  const occupied = result.occurrences.filter((o) => o.kind !== "availability" && o.status === "placed");
  for (let i = 0; i < occupied.length; i++) for (let j = i + 1; j < occupied.length; j++) {
    assert.ok(!overlaps(occupied[i], occupied[j]), `${occupied[i].id} overlaps ${occupied[j].id}`);
  }
  for (const o of result.occurrences.filter((o) => o.kind === "commitment")) {
    assert.equal(local(o.startsAt!), "09:00");
    assert.equal(local(o.endsAt!), "18:00");
  }
  const gym = result.occurrences.find((o) => o.sourceRuleId === "gym")!;
  assert.ok(result.occurrences.some((o) => o.kind === "availability" && overlaps(o, gym)));
  assert.equal(gym.durationMinutes, 105);
  assert.deepEqual(gym.components, [{ name: "getting ready", minutes: 15 }, { name: "visit including travel", minutes: 90 }]);
});

test("sleep target anchors exercise and meal cutoffs independently of eye closing and variable latency", () => {
  const request = fixture();
  // Broaden windows to ensure the cutoffs come from the sleep rule, not fixture windows.
  for (const rule of request.spec.activities.filter((r) => r.category === "exercise" || r.category === "meal")) {
    rule.window.end = "22:45";
    if (rule.category === "exercise") rule.placement = "latest";
  }
  const result = preview(request);
  assert.equal(result.status, "provisional");
  for (const o of result.occurrences.filter((o) => o.category === "exercise" || o.category === "meal")) {
    assert.equal(o.status, "placed");
    assert.ok(local(o.endsAt!) <= (o.category === "exercise" ? "20:00" : "21:30"), o.id);
  }
  for (const s of result.sleep) {
    assert.equal(local(s.wakeAt!), "07:30");
    assert.equal(local(s.targetOnset!), "23:00");
    assert.equal(local(s.eyeClosingAt!), "22:45");
    assert.equal(local(s.onsetRange!.earliest), "22:46");
    assert.equal(local(s.onsetRange!.latest), "23:15");
    assert.deepEqual(s.latencyMinutes, { min: 1, max: 30 });
  }
});

test("missing pre-sleep duration is never zero and affects every daily protocol occurrence", () => {
  const request = fixture();
  delete request.spec.inputs.preSleepDuration.placeholder;
  const result = preview(request);
  assert.equal(result.status, "incomplete");
  const protocols = result.occurrences.filter((o) => o.sourceRuleId === "pre-sleep");
  assert.equal(protocols.length, 7);
  for (const o of protocols) {
    assert.equal(o.status, "unplaceable");
    assert.equal(o.durationMinutes, null);
    assert.equal(o.components[0].minutes, null);
    assert.equal(o.startsAt, null);
    assert.equal(o.chosenInputs.preSleepDuration.status, "missing");
    assert.ok(result.issues.some((i) => i.code === "missing_input" && i.occurrenceIds.includes(o.id)));
  }
  for (const o of preview().occurrences.filter((o) => o.sourceRuleId === "pre-sleep")) {
    assert.equal(o.chosenInputs.preSleepDuration.status, "placeholder");
    assert.equal(o.durationMinutes, 30);
    assert.equal(o.hasPlaceholders, true);
  }
});

test("every occurrence and daily sleep record carries source, version and chosen labelled inputs", () => {
  const result = preview();
  for (const o of [...result.occurrences, ...result.sleep]) {
    assert.ok(o.sourceRuleId);
    assert.ok(o.source);
    assert.equal(o.specRevision, result.specRevision);
    assert.match(o.specRevision, /^fnv1a64-utf16:[0-9a-f]{16}$/);
    assert.equal(o.generatorVersion, RECURRING_PREVIEW_VERSION);
    assert.equal(o.chosenInputs.timezone.status, "placeholder");
    assert.equal(o.hasPlaceholders, true);
    for (const i of Object.values(o.chosenInputs)) assert.ok(i.label);
  }
  const full = preview(explicit());
  assert.equal(full.status, "feasible");
  assert.ok(full.occurrences.every((o) => !o.hasPlaceholders));
});

test("infeasible durations and overlapping commitments are visible; nothing is dropped or relaxed", () => {
  const request = explicit();
  request.spec.activities.find((r) => r.id === "gym")!.components = [{ name: "long gym visit", minutes: 900 }];
  const result = preview(request);
  assert.equal(result.status, "infeasible");
  const gym = result.occurrences.filter((o) => o.sourceRuleId === "gym");
  assert.equal(gym.length, 3);
  assert.ok(gym.every((o) => o.status === "unplaceable" && o.durationMinutes === 900));
  assert.ok(gym.every((o) => result.issues.some((i) => i.code === "no_slot" && i.occurrenceIds.includes(o.id))));
  const conflict = explicit();
  conflict.spec.commitments.push({ id: "appointment", title: "Conflicting appointment", source: "Test", weekdays: [1], start: "10:00", end: "11:00" });
  const conflicting = preview(conflict);
  assert.equal(conflicting.status, "infeasible");
  assert.ok(conflicting.issues.some((i) => i.code === "conflict" && i.occurrenceIds.includes("weekday-work@2026-10-12") && i.occurrenceIds.includes("appointment@2026-10-12")));
  assert.equal(conflicting.occurrences.filter((o) => o.kind === "commitment").length, 6);
});

test("optional gym is reported when unavailable and cannot displace required activities", () => {
  const request = explicit();
  // Permit gym only on Tuesday and Friday; every other evening is occupied.
  request.spec.activities.find((r) => r.id === "gym")!.window.start = "18:00";
  request.spec.commitments.push({ id: "busy", title: "Busy", source: "Test", weekdays: [1, 3, 4, 0, 6], start: "18:00", end: "20:00" });
  request.spec.activities = request.spec.activities.filter((r) => r.id !== "run");
  const result = preview(request);
  const gym = result.occurrences.filter((o) => o.sourceRuleId === "gym");
  assert.equal(gym.filter((o) => !o.optional && o.status === "placed").length, 2);
  assert.equal(gym.find((o) => o.optional)!.status, "unplaceable");
  assert.ok(result.issues.some((i) => i.code === "no_slot" && i.optional));
  assert.equal(result.status, "feasible");
});

test("placeholder capacity/blocker inputs propagate to affected placed and unplaceable activities", () => {
  const request = explicit();
  request.spec.inputs.workEnd = { label: "Uncertain commitment end", value: null, placeholder: "18:00" };
  request.spec.commitments[0].end = { input: "workEnd" };
  request.spec.inputs.capacityStart = { label: "Uncertain capacity start", value: null, placeholder: "07:30" };
  request.spec.availability[0].start = { input: "capacityStart" };
  const result = preview(request);
  assert.equal(result.status, "provisional");
  const dinner = result.occurrences.find((o) => o.id === "dinner@2026-10-12")!;
  assert.equal(dinner.chosenInputs.workEnd.status, "placeholder");
  assert.equal(dinner.chosenInputs.capacityStart.status, "placeholder");
  request.spec.activities.find((r) => r.id === "gym")!.components = [{ name: "Impossible session", minutes: 900 }];
  for (const o of preview(request).occurrences.filter((o) => o.sourceRuleId === "gym")) {
    assert.equal(o.status, "unplaceable");
    assert.equal(o.chosenInputs.workEnd.status, "placeholder");
    assert.equal(o.chosenInputs.capacityStart.status, "placeholder");
  }
});

test("unknown timezone and duration inputs remain missing; zero placeholder and invalid zone are rejected", () => {
  const request = explicit();
  const noZone = generateRecurringPreview(request.spec, request.horizon);
  assert.equal(noZone.status, "incomplete");
  assert.ok(noZone.occurrences.every((o) => o.status === "unplaceable" && o.chosenInputs.timezone.status === "missing"));
  request.timezone.value = "Definitely/Not_A_Zone";
  assert.equal(preview(request).status, "invalid");
  request.timezone.value = "Europe/Berlin";
  request.spec.inputs.preSleepDuration = { label: "Missing duration", value: null, placeholder: 0 };
  const zero = preview(request);
  assert.equal(zero.status, "invalid");
  assert.ok(zero.occurrences.filter((o) => o.sourceRuleId === "pre-sleep").every((o) => o.status === "unplaceable" && o.durationMinutes === null));
});

test("changing input changes the revision; key order and host timezone do not affect deterministic output", () => {
  const request = fixture();
  const before = JSON.stringify(request);
  assert.deepEqual(preview(request), preview(request));
  assert.equal(JSON.stringify(request), before, "input is not mutated");
  const reordered = fixture();
  reordered.spec.inputs = Object.fromEntries(Object.entries(reordered.spec.inputs).reverse());
  assert.deepEqual(preview(reordered), preview(request));
  reordered.spec.inputs.gettingReady.placeholder = 16;
  assert.notEqual(preview(reordered).specRevision, preview(request).specRevision);
  const cli = new URL("../../scripts/preview-recurring.ts", import.meta.url);
  const json = new URL("../../scripts/fixtures/weekly-routine.json", import.meta.url);
  const run = (tz: string) => execFileSync(process.execPath, ["--import", "tsx", cli.pathname, json.pathname], { env: { ...process.env, TZ: tz }, encoding: "utf8" });
  assert.equal(run("UTC"), run("Pacific/Honolulu"));
});

test("local dates stay seven across DST and skipped/repeated explicit endpoints are reported", () => {
  const request = explicit();
  request.horizon.startDate = "2026-10-23";
  const result = preview(request);
  assert.equal(result.sleep.length, 7);
  assert.equal(result.status, "feasible");
  assert.equal(result.sleep[0].wakeAt, "2026-10-23T05:30:00.000Z");
  assert.equal(result.sleep[2].wakeAt, "2026-10-25T06:30:00.000Z");
  request.spec.commitments.push({ id: "ambiguous", title: "Repeated clock endpoint", source: "Test", weekdays: [0], start: "02:30", end: "03:30" });
  const ambiguous = preview(request);
  assert.ok(ambiguous.issues.some((i) => i.code === "civil_time" && i.occurrenceIds.includes("ambiguous@2026-10-25")));
  assert.equal(ambiguous.occurrences.find((o) => o.id === "ambiguous@2026-10-25")!.status, "unplaceable");
  request.horizon.startDate = "2026-03-27";
  const skipped = preview(request);
  assert.ok(skipped.issues.some((i) => i.code === "civil_time" && i.occurrenceIds.includes("ambiguous@2026-03-29")));
});

test("unsupported horizons, impossible dates and duplicate rule IDs fail explicitly", () => {
  const request = fixture();
  request.horizon.days = 8 as 7;
  assert.equal(preview(request).status, "invalid");
  request.horizon.days = 7;
  request.horizon.startDate = "2026-02-30";
  assert.equal(preview(request).status, "invalid");
  request.horizon.startDate = "2026-10-12";
  request.spec.activities[0].id = request.spec.commitments[0].id;
  assert.equal(preview(request).status, "invalid");
});
