/**
 * Atlas's browser adaptation of the PVT-B. Times are milliseconds unless named
 * otherwise. The 355 ms boundary follows SLEEP.md (strictly greater than).
 * Protocol: https://pmc.ncbi.nlm.nih.gov/articles/PMC3197786/
 * 30 s response timeout: https://pmc.ncbi.nlm.nih.gov/articles/PMC6289239/
 * A dot still unanswered at the test deadline is a missed stimulus too.
 * False starts restart the random wait, after one second of feedback.
 * Browser touch latency means these results are for within-device comparisons.
 */
export const REACTION_PROTOCOL = {
  version: "atlas-pvt-1m-v2",
  durationMs: 60_000,
  minWaitMs: 1_000,
  maxWaitMs: 4_000,
  lapseThresholdMs: 355,
  noReactionTimeoutMs: 30_000,
  feedbackMs: 1_000,
} as const;

export type RandomSource = () => number;

/** Each yield is the wait after feedback, not an absolute stimulus timestamp. */
export function* generateReactionSchedule(random: RandomSource = Math.random): Generator<number, never> {
  while (true) {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw new RangeError("The random source must return a number from 0 up to, but not including, 1.");
    }
    yield REACTION_PROTOCOL.minWaitMs + value * (REACTION_PROTOCOL.maxWaitMs - REACTION_PROTOCOL.minWaitMs);
  }
}

export type ReactionEvent =
  | { type: "response"; stimulusAtMs: number; reactionTimeMs: number }
  | { type: "miss"; stimulusAtMs: number; endedAtMs: number; reason: "timeout" | "test-ended" }
  | { type: "false-start"; atMs: number };

/** A response at the timeout boundary is already a miss. */
export function hasReactionTimedOut(stimulusAtMs: number, nowMs: number): boolean {
  return nowMs - stimulusAtMs >= REACTION_PROTOCOL.noReactionTimeoutMs;
}

export function recordReactionResponse(stimulusAtMs: number, responseAtMs: number): ReactionEvent {
  if (responseAtMs < stimulusAtMs) {
    return { type: "false-start", atMs: responseAtMs };
  }
  if (hasReactionTimedOut(stimulusAtMs, responseAtMs)) {
    return recordReactionMiss(stimulusAtMs, responseAtMs);
  }
  return { type: "response", stimulusAtMs, reactionTimeMs: responseAtMs - stimulusAtMs };
}

export function recordReactionMiss(stimulusAtMs: number, endedAtMs: number): ReactionEvent {
  return {
    type: "miss",
    stimulusAtMs,
    endedAtMs,
    reason: hasReactionTimedOut(stimulusAtMs, endedAtMs) ? "timeout" : "test-ended",
  };
}

export interface ReactionSummary {
  stimuli: number;
  lapses: number;
  falseStarts: number;
  medianReactionTimeMs: number | null;
  /** Mean of 1000 / RT_ms, in reciprocal seconds. Misses are excluded. */
  meanReciprocalReactionTimePerSecond: number | null;
  /** Mean RT of the fastest/slowest ceil(10% of responses), at least one. */
  fastest10PercentMeanMs: number | null;
  slowest10PercentMeanMs: number | null;
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export function summarizeReactionEvents(events: readonly ReactionEvent[]): ReactionSummary {
  const times = events.flatMap((event) => event.type === "response" ? [event.reactionTimeMs] : []).sort((a, b) => a - b);
  const middle = Math.floor(times.length / 2);
  const tailCount = Math.max(1, Math.ceil(times.length * 0.1));
  return {
    stimuli: events.filter((event) => event.type !== "false-start").length,
    lapses: events.filter((event) => event.type === "miss" || (event.type === "response" && event.reactionTimeMs > REACTION_PROTOCOL.lapseThresholdMs)).length,
    falseStarts: events.filter((event) => event.type === "false-start").length,
    medianReactionTimeMs: times.length ? (times.length % 2 ? times[middle] : (times[middle - 1] + times[middle]) / 2) : null,
    // Zero may occur with a coarse browser clock. Keep the raw value but leave
    // the reciprocal undefined rather than storing Infinity or inventing an RT.
    meanReciprocalReactionTimePerSecond: times.some((time) => time <= 0) ? null : mean(times.map((time) => 1000 / time)),
    fastest10PercentMeanMs: mean(times.slice(0, tailCount)),
    slowest10PercentMeanMs: mean(times.slice(-tailCount)),
  };
}

export function isPractice(previousTestCount: number): boolean {
  if (!Number.isInteger(previousTestCount) || previousTestCount < 0) {
    throw new RangeError("The previous test count must be a nonnegative integer.");
  }
  return previousTestCount < 3;
}

/**
 * KSS version B, with published labels on every step. The original version A
 * labels only odd numbers. Source: https://pmc.ncbi.nlm.nih.gov/articles/PMC5511283/
 */
export const KAROLINSKA_SLEEPINESS_SCALE = [
  { value: 1, label: "Extremely alert" },
  { value: 2, label: "Very alert" },
  { value: 3, label: "Alert" },
  { value: 4, label: "Rather alert" },
  { value: 5, label: "Neither alert nor sleepy" },
  { value: 6, label: "Some signs of sleepiness" },
  { value: 7, label: "Sleepy, but no effort to keep awake" },
  { value: 8, label: "Sleepy, some effort to keep awake" },
  { value: 9, label: "Very sleepy, great effort keeping awake, fighting sleep" },
] as const;

export type KarolinskaSleepiness = typeof KAROLINSKA_SLEEPINESS_SCALE[number]["value"];

/** JSON-safe payload for a documentation entry's data. No storage dependency. */
export type ReactionTestResult = {
  kind: "reaction-test";
  protocolVersion: typeof REACTION_PROTOCOL.version | "atlas-pvt-b-v1";
  startedAt: string;
  durationMs: number;
  deviceBrowser: string;
  practice: boolean;
  sleepiness: KarolinskaSleepiness;
  /** One value per stimulus, in order. null means no reaction, never 30,000 ms. */
  reactionTimesMs: (number | null)[];
  events: ReactionEvent[];
  summary: ReactionSummary;
};

export function createReactionTestResult(input: {
  startedAt: string;
  deviceBrowser: string;
  previousTestCount: number;
  sleepiness: KarolinskaSleepiness;
  events: readonly ReactionEvent[];
}): ReactionTestResult {
  return {
    kind: "reaction-test",
    protocolVersion: REACTION_PROTOCOL.version,
    startedAt: input.startedAt,
    durationMs: REACTION_PROTOCOL.durationMs,
    deviceBrowser: input.deviceBrowser,
    practice: isPractice(input.previousTestCount),
    sleepiness: input.sleepiness,
    reactionTimesMs: input.events.flatMap((event) => event.type === "false-start" ? [] : [event.type === "response" ? event.reactionTimeMs : null]),
    events: input.events.map((event) => ({ ...event })),
    summary: summarizeReactionEvents(input.events),
  };
}
