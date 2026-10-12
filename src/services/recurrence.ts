import type { SupabaseClient } from "@supabase/supabase-js";
import {
  itemFromDbRow,
  itemToDbInsert,
  type Item,
  type ItemPatch,
  type UpdateItemResult,
} from "@shared/item";
import {
  addDays,
  civilDate,
  datesBetween,
  emptyItem,
  generatorRule,
  newOccurrence,
  occurrenceRule,
  resolveOccurrence,
  changeOccurrence,
  reviewOccurrence,
  validateGenerator,
  type RecurrenceView,
} from "@shared/recurringReferences";
import { validateParentTaskAssignment } from "@shared/subtasks";
import { evaluateRecurrence } from "../lib/recurrenceRuntime";
import type { Database, DbItemRow } from "../types/database";

type Client = SupabaseClient<Database>;
export async function fetchRawItems(
  client: Client,
  userId: string,
): Promise<Item[]> {
  const { data, error } = await client
    .from("items")
    .select("*")
    .eq("owner_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => itemFromDbRow(row as DbItemRow));
}
export async function includedDates(
  generator: Item,
  dates: string[],
): Promise<Set<string>> {
  const rule = generatorRule(generator);
  if (!rule || !rule.source || rule.compiledText !== rule.text)
    return new Set();
  const eligible = dates.filter(
    (d) => d >= rule.from && (!rule.until || d <= rule.until),
  );
  const flags = await evaluateRecurrence(rule.source, eligible);
  return new Set(eligible.filter((_, i) => flags[i]));
}
export async function projectItems(
  raw: Item[],
  now = new Date(),
  horizonDays = 90,
): Promise<Item[]> {
  const generators = raw.filter((item) => generatorRule(item));
  // Keep archived sources addressable from completed/changed references. The
  // library hides them; opening a reference can still inspect or restore its source.
  const results = raw.filter((item) => !occurrenceRule(item));
  const sources = new Set(generators.map((g) => g.id));
  for (const generator of generators) {
    const rule = generatorRule(generator)!;
    const touched = raw.filter(
      (item) => item.generatedFromId === generator.id && occurrenceRule(item),
    );
    const resultStart = results.length;
    try {
      const today = civilDate(now, rule.timeZone);
      // Open overdue occurrences stay live; no hidden rolling horizon discards them.
      const dates =
        rule.status === "active"
          ? datesBetween(rule.from, addDays(today, horizonDays))
          : [];
      const included = await includedDates(generator, [
        ...new Set([...dates, ...touched.map((i) => i.occurrenceKey)]),
      ]);
      const touchedKeys = new Set(touched.map((i) => i.occurrenceKey));
      for (const date of dates)
        if (included.has(date) && !touchedKeys.has(date)) {
          const occurrence = newOccurrence(generator, date);
          const resolved = resolveOccurrence(occurrence, generator);
          results.push({ ...resolved.item, recurrenceView: resolved.view });
        }
      for (const item of touched) {
        if (occurrenceRule(item)!.deleted) continue;
        const resolved = resolveOccurrence(
          item,
          generator,
          included.has(item.occurrenceKey),
        );
        results.push({ ...resolved.item, recurrenceView: resolved.view });
      }
    } catch (error) {
      results.splice(resultStart);
      const message =
        error instanceof Error ? error.message : "Repetition evaluation failed";
      const source = results.find((i) => i.id === generator.id);
      if (source) source.recurrenceError = message;
      for (const item of touched)
        if (!occurrenceRule(item)!.deleted) {
          const resolved = resolveOccurrence(item, undefined);
          results.push({
            ...resolved.item,
            recurrenceView: {
              ...resolved.view,
              needsReview:
                !occurrenceRule(item)!.frozen && !occurrenceRule(item)!.held,
              reasons: [`The generator could not be evaluated: ${message}`],
            },
          });
        }
    }
  }
  for (const item of raw)
    if (
      occurrenceRule(item) &&
      !sources.has(item.generatedFromId) &&
      !occurrenceRule(item)!.deleted
    ) {
      const resolved = resolveOccurrence(item, undefined);
      results.push({ ...resolved.item, recurrenceView: resolved.view });
    }
  return results;
}
export async function writeReference(
  client: Client,
  userId: string,
  item: Item,
  expectedRevision: number,
  generator?: Item,
): Promise<UpdateItemResult> {
  const rule = generatorRule(item);
  if (rule) validateGenerator(rule);
  // Resolved display values are not independent copies in the database.
  const stored = occurrenceRule(item)
    ? {
        ...emptyItem(item.id, userId),
        generatedFromId: item.generatedFromId,
        occurrenceKey: item.occurrenceKey,
        recurrenceState: item.recurrenceState,
        overriddenFields: item.overriddenFields,
      }
    : item;
  const { data, error } = await client.rpc("atlas_write_reference", {
    p_row: itemToDbInsert(stored, userId),
    p_expected_revision: expectedRevision,
    p_generator_revision: generator?.revision ?? null,
  });
  if (error) throw new Error(error.message);
  const result = data as {
    row?: DbItemRow;
    conflict?: DbItemRow;
    generatorConflict?: boolean;
  };
  if (result.generatorConflict)
    throw new Error("The generator changed while saving; reload and try again");
  if (result.conflict)
    return { conflict: true, serverItem: itemFromDbRow(result.conflict) };
  if (!result.row) throw new Error("Recurring reference was not saved");
  return { ok: true, revision: result.row.revision };
}
export async function updateReference(
  client: Client,
  userId: string,
  id: string,
  patch: ItemPatch,
  expectedRevision: number,
): Promise<UpdateItemResult> {
  const raw = await fetchRawItems(client, userId);
  const projected = await projectItems(raw);
  const current = projected.find((i) => i.id === id);
  if (!current) throw new Error("Occurrence not found");
  const generator = raw.find((i) => i.id === current.generatedFromId);
  const stored =
    raw.find((i) => i.id === id) ??
    newOccurrence(generator!, current.occurrenceKey);
  if (stored.revision !== expectedRevision)
    return { conflict: true, serverItem: current };
  if (patch.parentTaskId !== undefined) {
    const issue = validateParentTaskAssignment(
      id,
      patch.parentTaskId,
      projected,
    );
    if (issue) throw new Error(issue);
    if (patch.parentTaskId && !current.isTask && patch.isTask !== true)
      throw new Error("Only tasks can be subtasks");
  }
  const included = generator
    ? (await includedDates(generator, [current.occurrenceKey])).has(
        current.occurrenceKey,
      )
    : true;
  return writeReference(
    client,
    userId,
    changeOccurrence(stored, generator, patch, included),
    expectedRevision,
    generator,
  );
}
export async function ensureOccurrenceStored(
  client: Client,
  userId: string,
  id: string,
): Promise<void> {
  const raw = await fetchRawItems(client, userId);
  if (raw.some((i) => i.id === id)) return;
  const item = (await projectItems(raw)).find((i) => i.id === id);
  if (!item || !occurrenceRule(item)) throw new Error("Item not found");
  const generator = raw.find((i) => i.id === item.generatedFromId)!;
  const stored = newOccurrence(generator, item.occurrenceKey);
  // Scheduling is an individual change even with no field overrides.
  const state = occurrenceRule(stored)!;
  const next = { ...stored, recurrenceState: { ...state, overrides: {} } };
  const result = await writeReference(client, userId, next, 0, generator);
  if ("conflict" in result) return; // Concurrent first touch already persisted this identity.
}
export async function resolveReview(
  client: Client,
  userId: string,
  id: string,
  choice: "new" | "old" | "detach",
): Promise<void> {
  const raw = await fetchRawItems(client, userId);
  const item = raw.find((i) => i.id === id),
    generator = raw.find((g) => g.id === item?.generatedFromId);
  if (!item || !generator) throw new Error("Generator or occurrence not found");
  let next = reviewOccurrence(item, generator, choice);
  if (
    choice === "new" &&
    !(await includedDates(generator, [item.occurrenceKey])).has(
      item.occurrenceKey,
    )
  )
    next = {
      ...next,
      recurrenceState: { ...occurrenceRule(next)!, deleted: true },
    };
  const result = await writeReference(
    client,
    userId,
    next,
    item.revision,
    generator,
  );
  if ("conflict" in result)
    throw new Error("Occurrence changed while reviewing; reload it");
}
export function recurrenceView(item: Item): RecurrenceView | undefined {
  return item.recurrenceView;
}
