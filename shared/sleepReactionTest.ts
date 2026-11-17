import type { DocumentationEntry } from './documentationEntries';
import { createReactionTestResult, REACTION_PROTOCOL, type ReactionEvent, type ReactionTestResult } from './reactionTest';

export type SleepReactionTest = ReactionTestResult & { timeZone: string };

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function time(value: unknown, durationMs: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= durationMs;
}
function event(value: unknown, durationMs: number): value is ReactionEvent {
  const raw = object(value);
  if (!raw) return false;
  if (raw.type === 'false-start') return time(raw.atMs, durationMs);
  if (!time(raw.stimulusAtMs, durationMs)) return false;
  if (raw.type === 'response') return time(raw.reactionTimeMs, durationMs) && raw.reactionTimeMs < REACTION_PROTOCOL.noReactionTimeoutMs
    && raw.stimulusAtMs + raw.reactionTimeMs <= durationMs;
  return raw.type === 'miss' && time(raw.endedAtMs, durationMs) && raw.endedAtMs >= raw.stimulusAtMs
    && (raw.reason === 'timeout' || raw.reason === 'test-ended');
}

/** Reject unrelated or damaged entries. Recompute summaries from the raw events. */
export function sleepReactionTest(entry: Pick<DocumentationEntry, 'data'>): SleepReactionTest | null {
  if (entry.data.kind !== 'reactionTest') return null;
  const raw = object(entry.data.reactionTest);
  const durationMs = raw?.protocolVersion === 'atlas-pvt-b-v1' ? 180_000 : REACTION_PROTOCOL.durationMs;
  if (!raw || raw.kind !== 'reaction-test' || (raw.protocolVersion !== REACTION_PROTOCOL.version && raw.protocolVersion !== 'atlas-pvt-b-v1')
    || raw.durationMs !== durationMs || typeof raw.startedAt !== 'string'
    || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(raw.startedAt) || !Number.isFinite(Date.parse(raw.startedAt))
    || typeof raw.deviceBrowser !== 'string' || !raw.deviceBrowser.trim() || typeof raw.practice !== 'boolean'
    || typeof raw.sleepiness !== 'number' || !Number.isInteger(raw.sleepiness) || raw.sleepiness < 1 || raw.sleepiness > 9
    || typeof raw.timeZone !== 'string' || !raw.timeZone || !Array.isArray(raw.events) || !raw.events.every(value => event(value, durationMs))) return null;
  try { new Intl.DateTimeFormat('en', { timeZone: raw.timeZone }); } catch { return null; }
  const result = createReactionTestResult({
    startedAt: raw.startedAt, deviceBrowser: raw.deviceBrowser, previousTestCount: raw.practice ? 0 : 3,
    sleepiness: raw.sleepiness as SleepReactionTest['sleepiness'], events: raw.events,
  });
  if (!Array.isArray(raw.reactionTimesMs) || raw.reactionTimesMs.length !== result.reactionTimesMs.length
    || !raw.reactionTimesMs.every((value, i) => value === result.reactionTimesMs[i])) return null;
  const summary = object(raw.summary);
  if (!summary || !Object.entries(result.summary).every(([key, value]) => summary[key] === value)) return null;
  return { ...result, protocolVersion: raw.protocolVersion, durationMs, timeZone: raw.timeZone };
}
