import type { SupabaseClient } from "@supabase/supabase-js";
import {
  materializeGeneratorItem,
  OVERRIDE_FIELDS,
  parseGeneratorSpec,
  resolveGeneratorEntries,
  type GeneratorSpec
} from "@shared/generation";
import type { Item } from "@shared/item";
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

function occurrenceInsert(userId: string, template: Item, spec: GeneratorSpec, occurrenceKey: string, items: Item[]) {
  const entry = resolveGeneratorEntries(spec, template.id, items).find((candidate) => candidate.key === occurrenceKey);
  if (!entry) {
    throw new Error("Generator entry not found");
  }

  const materialized = materializeGeneratorItem(spec, entry);

  return {
    owner_id: userId,
    title: materialized.title,
    body: materialized.body,
    is_task: materialized.isTask,
    is_documentation: materialized.isDocumentation,
    is_interval: materialized.isInterval,
    is_generator: false,
    task_status: materialized.taskStatus ?? "",
    manual_relevance: template.manualRelevance,
    tags: materialized.tags,
    completion_rule: null,
    documentation_schema: null,
    documentation_data: null,
    recurrence_rule: null,
    generated_from_id: template.id,
    occurrence_key: occurrenceKey,
    overridden_fields: [] as string[],
    interval_kind: "",
    interval_starts_at: "",
    interval_ends_at: "",
    interval_status: "",
    revision: 0
  };
}

async function createOccurrence(
  client: Client,
  userId: string,
  template: Item,
  spec: GeneratorSpec,
  occurrenceKey: string,
  items: Item[]
): Promise<void> {
  const row = occurrenceInsert(userId, template, spec, occurrenceKey, items);
  const { error } = await client.from("items").insert(row);
  if (error) {
    throw new Error(error.message);
  }
}

async function applySpecToOccurrence(
  client: Client,
  userId: string,
  template: Item,
  item: Item,
  spec: GeneratorSpec,
  items: Item[]
): Promise<void> {
  const entry = resolveGeneratorEntries(spec, template.id, items).find((candidate) => candidate.key === item.occurrenceKey);
  if (!entry) {
    return;
  }

  const overrides = new Set(item.overriddenFields);
  const materialized = materializeGeneratorItem(spec, entry);
  const updates: Record<string, unknown> = {};

  if (!overrides.has(OVERRIDE_FIELDS.title) && item.title !== materialized.title) {
    updates.title = materialized.title;
  }
  if (!overrides.has(OVERRIDE_FIELDS.body) && item.body !== materialized.body) {
    updates.body = materialized.body;
  }
  if (!overrides.has(OVERRIDE_FIELDS.isTask) && item.isTask !== materialized.isTask) {
    updates.is_task = materialized.isTask;
    if (!materialized.isTask) {
      updates.task_status = "";
    } else if (!item.isTask) {
      updates.task_status = "active";
    }
  }
  if (!overrides.has(OVERRIDE_FIELDS.isDocumentation) && item.isDocumentation !== materialized.isDocumentation) {
    updates.is_documentation = materialized.isDocumentation;
  }
  if (!overrides.has(OVERRIDE_FIELDS.isInterval) && item.isInterval !== materialized.isInterval) {
    updates.is_interval = materialized.isInterval;
  }
  if (!overrides.has(OVERRIDE_FIELDS.tags) && JSON.stringify(item.tags) !== JSON.stringify(materialized.tags)) {
    updates.tags = materialized.tags;
  }

  if (Object.keys(updates).length === 0) {
    return;
  }

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

export async function syncOccurrences(
  client: Client,
  userId: string,
  templateId: string,
  itemsCache: Item[]
): Promise<void> {
  const template = itemsCache.find((entry) => entry.id === templateId);
  if (!template?.isGenerator || template.generatedFromId) {
    return;
  }

  const spec = parseGeneratorSpec(template.recurrenceRule, template);
  if (!spec) {
    return;
  }

  const entries = resolveGeneratorEntries(spec, templateId, itemsCache);
  const keySet = new Set(entries.map((entry) => entry.key));
  const existing = listOccurrences(itemsCache, templateId);
  const existingByKey = new Map(existing.map((item) => [item.occurrenceKey, item]));

  for (const item of existing) {
    if (!keySet.has(item.occurrenceKey)) {
      await deleteOccurrence(client, userId, item.id);
    }
  }

  for (const entry of entries) {
    const current = existingByKey.get(entry.key);
    if (!current) {
      await createOccurrence(client, userId, template, spec, entry.key, itemsCache);
      continue;
    }
    await applySpecToOccurrence(client, userId, template, current, spec, itemsCache);
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

export async function syncAllGenerations(client: Client, userId: string, itemsCache: Item[]): Promise<void> {
  const templates = itemsCache.filter((item) => item.isGenerator && !item.generatedFromId);
  for (const template of templates) {
    await syncOccurrences(client, userId, template.id, itemsCache);
  }
}

export async function refreshItemsAfterGenerationSync(client: Client, userId: string): Promise<Item[]> {
  return fetchOwnedItems(client, userId);
}
