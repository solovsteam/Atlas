/** Pure preview → bounded action batches. This module has no effect or storage capability. */
import type { RecurringPreview, PreviewOccurrence } from "./recurringPreview";
import { parseSchemaSchedulePlan, type SchemaScheduleAction, type SchemaSchedulePlan } from "./schemaSchedule";

export type RoutineBinding = { intention: SchemaScheduleAction["intention"]; schemaIds: string[] };
export type OccurrenceRecord = {
  key: string;
  signature: string;
  actionId: string;
  occurrence: PreviewOccurrence;
};
export type RoutineBatch = {
  actions: SchemaScheduleAction[];
  slots: { actionId: string; startsAt: string; endsAt: string }[];
  records: OccurrenceRecord[];
};
export type RoutineDelta = {
  batches: RoutineBatch[];
  unchanged: OccurrenceRecord[];
  changed: { previous: OccurrenceRecord; proposed: OccurrenceRecord }[];
  retired: OccurrenceRecord[];
};

// Occurrence identity survives spec edits; content signatures describe the proposed
// dated output. An edit to an already staged occurrence is a report, never a new
// block. Human edits and previously completed occurrences therefore stay untouched.
function occurrenceKey(o: PreviewOccurrence): string {
  return o.id;
}
function signature(o: PreviewOccurrence): string {
  return JSON.stringify([o.title, o.kind, o.startsAt, o.endsAt, o.durationMinutes, o.components]);
}
function actionId(key: string): string {
  const encoded = key.replace(/[^A-Za-z0-9-]/g, "-");
  if (encoded.length > 68) throw new Error("Use occurrence keys of at most 68 characters.");
  return `A-r-${encoded}`;
}

export function prepareRecurringActions(
  preview: RecurringPreview,
  bindings: Record<string, RoutineBinding>,
  previous: OccurrenceRecord[] = []
): RoutineDelta {
  if (!["feasible", "provisional"].includes(preview.status) || typeof preview.timezone.value !== "string") {
    throw new Error("A feasible or explicitly provisional preview is required.");
  }
  const selected = preview.occurrences.filter((o) => o.kind !== "availability" && Object.hasOwn(bindings, o.sourceRuleId));
  const old = new Map(previous.map((r) => [r.key, r]));
  if (old.size !== previous.length) throw new Error("Duplicate previous occurrence keys.");
  const records = selected.map((o): OccurrenceRecord => {
    if (o.status !== "placed" || !o.startsAt || !o.endsAt || !o.date || !o.durationMinutes || o.durationMinutes < 3 || o.durationMinutes > 240) {
      throw new Error(`Occurrence ${o.id} cannot be expressed by the existing action-pulse contract.`);
    }
    return { key: occurrenceKey(o), signature: signature(o), actionId: actionId(occurrenceKey(o)), occurrence: o };
  });
  if (new Set(records.map((r) => r.key)).size !== records.length || new Set(records.map((r) => r.actionId)).size !== records.length) {
    throw new Error("Occurrence or action identity collision; use shorter unique rule IDs.");
  }
  const delta: RoutineDelta = { batches: [], unchanged: [], changed: [], retired: [] };
  const fresh: OccurrenceRecord[] = [];
  for (const r of records) {
    const prior = old.get(r.key);
    if (!prior) fresh.push(r);
    else if (prior.signature === r.signature) delta.unchanged.push(prior);
    else delta.changed.push({ previous: prior, proposed: r });
    old.delete(r.key);
  }
  delta.retired = [...old.values()];
  fresh.sort((a, b) => Date.parse(a.occurrence.startsAt!) - Date.parse(b.occurrence.startsAt!) || a.key.localeCompare(b.key));
  for (let i = 0; i < fresh.length; i += 8) {
    const chunk = fresh.slice(i, i + 8);
    const actions = chunk.map((r): SchemaScheduleAction => {
      const o = r.occurrence;
      const inputs = Object.entries(o.chosenInputs).map(([key, v]) => `${key}=${v.value} (${v.status}: ${v.label})`).join("; ");
      const reason = `Occurrence ${r.key}; rule ${o.sourceRuleId}; revision ${o.specRevision}; generator ${o.generatorVersion}. Source: ${o.source}. Components: ${o.components.map((c) => `${c.name} ${c.minutes} min`).join(", ")}. ${inputs}`;
      if (reason.length > 1000) throw new Error(`Occurrence ${r.key} provenance exceeds the existing reason limit; shorten input labels.`);
      return { actionId: r.actionId, ...bindings[o.sourceRuleId], title: o.title, durationMinutes: o.durationMinutes!, reason };
    });
    // Validate all existing contract fields before creating a run or staged pulse.
    parseSchemaSchedulePlan({ format: "schema-atlas.schedule-plan", version: 1, schemaRunId: `R-${"0".repeat(32)}`, createdAt: "2000-01-01T00:00:00Z", actions });
    delta.batches.push({ actions, records: chunk, slots: chunk.map((r) => ({ actionId: r.actionId, startsAt: r.occurrence.startsAt!, endsAt: r.occurrence.endsAt! })) });
  }
  return delta;
}

export function recurringBatchPlan(batch: RoutineBatch, schemaRunId: string, createdAt: string): SchemaSchedulePlan {
  return parseSchemaSchedulePlan({ format: "schema-atlas.schedule-plan", version: 1, schemaRunId, createdAt, horizonDays: 7, actions: batch.actions });
}
