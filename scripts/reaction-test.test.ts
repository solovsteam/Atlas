import assert from "node:assert/strict";
import test from "node:test";
import {
  createReactionTestResult,
  generateReactionSchedule,
  hasReactionTimedOut,
  isPractice,
  KAROLINSKA_SLEEPINESS_SCALE,
  REACTION_PROTOCOL,
  recordReactionMiss,
  recordReactionResponse,
  summarizeReactionEvents,
  type ReactionEvent,
} from "../shared/reactionTest.ts";

function seededRandom(seed: number) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

test("a lapse is strictly slower than 355 ms", () => {
  const events = [354.9, 355, 355.1].map((rt) => recordReactionResponse(1000, 1000 + rt));
  const summary = summarizeReactionEvents(events);
  assert.equal(summary.stimuli, 3);
  assert.equal(summary.lapses, 1);
});

test("a missing response times out at 30 seconds and a late pointer cannot turn it into an RT", () => {
  assert.equal(hasReactionTimedOut(1000, 30_999), false);
  assert.equal(hasReactionTimedOut(1000, 31_000), true);
  assert.equal(recordReactionResponse(1000, 30_999).type, "response");
  const timeout = recordReactionMiss(1000, 31_000);
  assert.deepEqual(timeout, { type: "miss", stimulusAtMs: 1000, endedAtMs: 31_000, reason: "timeout" });
  assert.deepEqual(recordReactionResponse(1000, 31_000), timeout);
  const summary = summarizeReactionEvents([timeout]);
  assert.equal(summary.stimuli, 1);
  assert.equal(summary.lapses, 1);
  assert.equal(summary.medianReactionTimeMs, null);
  assert.equal(summary.meanReciprocalReactionTimePerSecond, null);
});

test("an unanswered final dot counts as a lapse when the one minute ends", () => {
  const miss = recordReactionMiss(59_000, REACTION_PROTOCOL.durationMs);
  assert.equal(miss.type === "miss" && miss.reason, "test-ended");
  assert.equal(summarizeReactionEvents([miss]).lapses, 1);
});

test("false starts add neither stimuli nor reaction times", () => {
  const early = recordReactionResponse(2000, 1999);
  assert.deepEqual(early, { type: "false-start", atMs: 1999 });
  assert.deepEqual(summarizeReactionEvents([early]), {
    stimuli: 0, lapses: 0, falseStarts: 1, medianReactionTimeMs: null,
    meanReciprocalReactionTimePerSecond: null, fastest10PercentMeanMs: null, slowest10PercentMeanMs: null,
  });
});

test("the injectable schedule is reproducible and stays between one and four seconds", () => {
  const a = generateReactionSchedule(seededRandom(42));
  const b = generateReactionSchedule(seededRandom(42));
  const waits = Array.from({ length: 1000 }, () => a.next().value);
  assert.deepEqual(waits, Array.from({ length: 1000 }, () => b.next().value));
  assert.ok(waits.every((wait) => wait >= 1000 && wait < 4000));
  assert.ok(new Set(waits).size > 900);
  assert.equal(generateReactionSchedule(() => 0).next().value, 1000);
  assert.ok(generateReactionSchedule(() => 1 - Number.EPSILON).next().value <= 4000);
  for (const invalid of [-0.1, 1, NaN, Infinity]) {
    assert.throws(() => generateReactionSchedule(() => invalid).next(), RangeError);
  }
});

test("recorded responses produce the median, reciprocal mean and both decile means", () => {
  const times = Array.from({ length: 20 }, (_, index) => 100 + index * 25);
  const events: ReactionEvent[] = [
    ...times.map((rt, index) => recordReactionResponse(index * 4000, index * 4000 + rt)),
    recordReactionMiss(100_000, 130_000),
    { type: "false-start", atMs: 140_000 },
  ];
  const original = structuredClone(events);
  const summary = summarizeReactionEvents(events);
  assert.equal(summary.stimuli, 21);
  assert.equal(summary.lapses, 10);
  assert.equal(summary.falseStarts, 1);
  assert.equal(summary.medianReactionTimeMs, 337.5);
  assert.ok(Math.abs(summary.meanReciprocalReactionTimePerSecond! - times.reduce((sum, rt) => sum + 1000 / rt, 0) / 20) < 1e-12);
  assert.equal(summary.fastest10PercentMeanMs, 112.5);
  assert.equal(summary.slowest10PercentMeanMs, 562.5);
  assert.deepEqual(events, original);
  assert.equal(summarizeReactionEvents([recordReactionResponse(0, 123)]).medianReactionTimeMs, 123);
});

test("empty and zero-resolution recordings remain JSON-safe", () => {
  const empty = summarizeReactionEvents([]);
  assert.equal(empty.stimuli, 0);
  assert.equal(empty.fastest10PercentMeanMs, null);
  const zero = summarizeReactionEvents([recordReactionResponse(1000, 1000)]);
  assert.equal(zero.medianReactionTimeMs, 0);
  assert.equal(zero.meanReciprocalReactionTimePerSecond, null);
});

test("only the first three completed tests are practice", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 100].map(isPractice), [true, true, true, false, false, false]);
  assert.throws(() => isPractice(-1), RangeError);
  assert.throws(() => isPractice(1.5), RangeError);
});

test("the result preserves every RT, missing stimulus and metadata without sharing event objects", () => {
  const events = [recordReactionResponse(1000, 1250), recordReactionMiss(5000, 35_000), { type: "false-start", atMs: 36_000 } as const];
  const result = createReactionTestResult({
    startedAt: "2026-11-16T14:00:00.000Z", deviceBrowser: "iPhone / Safari", previousTestCount: 2, sleepiness: 7, events,
  });
  assert.equal(result.protocolVersion, "atlas-pvt-1m-v2");
  assert.equal(result.durationMs, 60_000);
  assert.equal(result.startedAt, "2026-11-16T14:00:00.000Z");
  assert.equal(result.deviceBrowser, "iPhone / Safari");
  assert.equal(result.practice, true);
  assert.equal(result.sleepiness, 7);
  assert.deepEqual(result.reactionTimesMs, [250, null]);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  assert.notEqual(result.events[0], events[0]);
  assert.deepEqual(result.summary, summarizeReactionEvents(events));
});

test("KSS version B has all nine published levels", () => {
  assert.deepEqual(KAROLINSKA_SLEEPINESS_SCALE.map((level) => level.value), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(KAROLINSKA_SLEEPINESS_SCALE[0].label, "Extremely alert");
  assert.equal(KAROLINSKA_SLEEPINESS_SCALE[4].label, "Neither alert nor sleepy");
  assert.match(KAROLINSKA_SLEEPINESS_SCALE[8].label, /fighting sleep/);
});
