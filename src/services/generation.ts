import type { SupabaseClient } from "@supabase/supabase-js";
import {
  childDocumentationData,
  formatOccurrenceKey,
  isPastOccurrenceKey,
  needsCalendarSchedule,
  OVERRIDE_FIELDS,
  parseGenerationSpec,
  plannedOccurrenceKeys,
  resolveChildTitle,
  slotTimesForOccurrence,
  type GenerationSpec
} from "@shared/generation";
import { toJson, type Item } from "@shared/item";
import { fetchOwnedItems } from "./items";
import type { Database } from "../types/database";

type Client = SupabaseClient<Database>;

function listOccurrences(items: Item[], templateId: string): Item[] {
  return items.filter((item) => item.generatedFromId === templateId);
}

async function deleteOccurrence(client: Client, userId: string, itemId: string): Promise<void> {
  const { error } = await client.from("items").delete().eq("id", itemId).eq("owner_id", userId);
  if (error) {
    throw new Error(error.message);
  }
}

function occurrenceInsert(userId: string, template: Item, spec: GenerationSpec, occurrenceKey: string) {
  const child = spec.child;
  const title = resolveChildTitle(child.title, occurrenceKey, template);
  const times = needsCalendarSchedule(child) ? slotTimesForOccurrence(occurrenceKey, child.schedule) : null;

  return {
    owner_id: userId,
    title,
    body: child.body,
    is_task: child.isTask,
    is_documentation: child.isDocumentation,
    is_interval: Boolean(child.isInterval && times),
    is_generator: false,
    task_status: child.isTask ? "active" : "",
    manual_relevance: template.manualRelevance,
    tags: template.tags,
    completion_rule: child.completionRule,
    documentation_schema: child.inputSchema.length > 0 ? child.inputSchema : null,
    documentation_data: child.inputSchema.length > 0 ? childDocumentationData(child) : null,
    recurrence_rule: null,
    generated_from_id: template.id,
    occurrence_key: occurrenceKey,
    overridden_fields: [] as string[],
    interval_kind: child.isInterval && times ? "fixed" : "",
    interval_starts_at: child.isInterval && times ? times.startsAt : "",
    interval_ends_at: child.isInterval && times ? times.endsAt : "",
    interval_status: child.isInterval && times ? "scheduled" : "",
    revision: 0
  };
}

async function createOccurrence(
  client: Client,
  userId: string,
  template: Item,
  spec: GenerationSpec,
  occurrenceKey: string
): Promise<void> {
  const row = occurrenceInsert(userId, template, spec, occurrenceKey);
  const { error } = await client.from("items").insert(row);
  if (error) {
    throw new Error(error.message);
  }
}

async function applySpecToFutureOccurrence(
  client: Client,
  userId: string,
  template: Item,
  item: Item,
  spec: GenerationSpec
): Promise<void> {
  const overrides = new Set(item.overriddenFields);
  const child = spec.child;
  const updates: Record<string, unknown> = {};
  const desiredTitle = resolveChildTitle(child.title, item.occurrenceKey, template);

  if (!overrides.has(OVERRIDE_FIELDS.title) && item.title !== desiredTitle) {
    updates.title = desiredTitle;
  }
  if (!overrides.has(OVERRIDE_FIELDS.body) && item.body !== child.body) {
    updates.body = child.body;
  }
  if (!overrides.has(OVERRIDE_FIELDS.isTask) && item.isTask !== child.isTask) {
    updates.is_task = child.isTask;
    if (!child.isTask) {
      updates.task_status = "";
    } else if (!item.isTask) {
      updates.task_status = "active";
    }
  }
  if (!overrides.has(OVERRIDE_FIELDS.isDocumentation) && item.isDocumentation !== child.isDocumentation) {
    updates.is_documentation = child.isDocumentation;
  }
  if (!overrides.has(OVERRIDE_FIELDS.isInterval) && item.isInterval !== child.isInterval) {
    updates.is_interval = child.isInterval;
  }
  if (!overrides.has(OVERRIDE_FIELDS.completionRule)) {
    const nextRule = child.completionRule ? toJson(child.completionRule) : "";
    const currentRule = item.completionRule ? toJson(item.completionRule) : "";
    if (nextRule !== currentRule) {
      updates.completion_rule = child.completionRule;
    }
  }
  if (!overrides.has(OVERRIDE_FIELDS.inputSchema)) {
    const nextSchema = child.inputSchema.length > 0 ? child.inputSchema : null;
    const currentSchema = item.documentationSchema;
    if (JSON.stringify(nextSchema) !== JSON.stringify(currentSchema)) {
      updates.documentation_schema = nextSchema;
      if (child.inputSchema.length > 0 && !item.documentationData) {
        updates.documentation_data = childDocumentationData(child);
      }
    }
  }

  if (needsCalendarSchedule(child) && item.isInterval) {
    if (!overrides.has(OVERRIDE_FIELDS.scheduleStartsAt) || !overrides.has(OVERRIDE_FIELDS.scheduleEndsAt)) {
      const times = slotTimesForOccurrence(item.occurrenceKey, child.schedule);
      if (!overrides.has(OVERRIDE_FIELDS.scheduleStartsAt) && item.intervalStartsAt !== times.startsAt) {
        updates.interval_starts_at = times.startsAt;
      }
      if (!overrides.has(OVERRIDE_FIELDS.scheduleEndsAt) && item.intervalEndsAt !== times.endsAt) {
        updates.interval_ends_at = times.endsAt;
      }
    }
  }

  if (Object.keys(updates).length > 0) {
    const nextRevision = item.revision + 1;
    const { error } = await client
      .from("items")
      .update({ ...updates, revision: nextRevision })
      .eq("id", item.id)
      .eq("owner_id", userId)
      .eq("revision", item.revision);
    if (error) {
      throw new Error(error.message);
    }
  }
}

export async function syncOccurrences(
  client: Client,
  userId: string,
  templateId: string,
  itemsCache: Item[],
  now = new Date()
): Promise<void> {
  const template = itemsCache.find((entry) => entry.id === templateId);
  if (!template?.isGenerator || template.generatedFromId) {
    return;
  }

  const spec = parseGenerationSpec(template.recurrenceRule, template);
  if (!spec) {
    return;
  }

  const keys = plannedOccurrenceKeys(spec, template, now);
  const keySet = new Set(keys);
  const todayKey = formatOccurrenceKey(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  const existing = listOccurrences(itemsCache, templateId);
  const existingByKey = new Map(existing.map((item) => [item.occurrenceKey, item]));

  for (const item of existing) {
    const isFuture = item.occurrenceKey >= todayKey;
    if (isFuture && !keySet.has(item.occurrenceKey)) {
      await deleteOccurrence(client, userId, item.id);
    }
  }

  for (const key of keys) {
    const current = existingByKey.get(key);
    if (!current) {
      await createOccurrence(client, userId, template, spec, key);
      continue;
    }
    if (isPastOccurrenceKey(key, now)) {
      continue;
    }
    await applySpecToFutureOccurrence(client, userId, template, current, spec);
  }
}

export async function deleteOccurrencesForTemplate(client: Client, userId: string, templateId: string): Promise<void> {
  const { data, error } = await client
    .from("items")
    .select("id")
    .eq("owner_id", userId)
    .eq("generated_from_id", templateId);

  if (error) {
    throw new Error(error.message);
  }

  for (const row of data ?? []) {
    await deleteOccurrence(client, userId, row.id);
  }
}

export async function syncAllGenerations(client: Client, userId: string, itemsCache: Item[], now = new Date()): Promise<void> {
  const templates = itemsCache.filter((item) => item.isGenerator && !item.generatedFromId);
  for (const template of templates) {
    await syncOccurrences(client, userId, template.id, itemsCache, now);
  }
}

export async function refreshItemsAfterGenerationSync(client: Client, userId: string): Promise<Item[]> {
  return fetchOwnedItems(client, userId);
}
