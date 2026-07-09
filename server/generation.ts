import type { ServerContext } from "lakebed/server";
import { toJson, itemFromRow, newItemRow, type Item, type ItemRow } from "../shared/item";
import {
  childDocumentationData,
  formatOccurrenceKey,
  isPastOccurrenceKey,
  mergeOverriddenFields,
  OVERRIDE_FIELDS,
  parseGenerationSpec,
  plannedOccurrenceKeys,
  resolveChildTitle,
  slotTimesForOccurrence,
  type GenerationSpec
} from "../shared/generation";
import { linkItems, unlinkItems } from "./links";
import { deleteSlotsForItem, itemsAssignedToSlot, listOwnedSlotAssignments } from "./schedule";
import { newScheduleSlotRow, type ScheduleSlotPatch } from "../shared/schedule";
import { itemFromRow as itemFromRowAgain } from "../shared/item";

type Db = ServerContext["db"];

function listOccurrences(db: Db, userId: string, templateId: string): Item[] {
  return db.items
    .where("ownerId", userId)
    .all()
    .map((row) => itemFromRow(row as ItemRow))
    .filter((item) => item.generatedFromId === templateId);
}

function primarySlotIdForItem(db: Db, userId: string, itemId: string): string | null {
  const assignments = listOwnedSlotAssignments(db, userId).filter((entry) => entry.itemId === itemId);
  if (assignments.length === 0) {
    return null;
  }
  return assignments[0]!.slotId;
}

function listSlotRowsForItem(db: Db, userId: string, itemId: string) {
  const slotId = primarySlotIdForItem(db, userId, itemId);
  if (!slotId) {
    return [];
  }
  const row = db.scheduleSlots.get(slotId) as { id: string; slotStatus: string; startsAt: string; endsAt: string } | null;
  return row ? [row] : [];
}

function ensureGeneratesLink(db: Db, userId: string, templateId: string, childId: string): void {
  linkItems(db, userId, templateId, childId, "generates");
}

function removeGeneratesLink(db: Db, userId: string, templateId: string, childId: string): void {
  unlinkItems(db, userId, templateId, childId, "generates");
}

function deleteOccurrence(db: Db, userId: string, templateId: string, item: Item): void {
  removeGeneratesLink(db, userId, templateId, item.id);
  deleteSlotsForItem(db, userId, item.id);
  db.items.delete(item.id);
}

function createOccurrence(
  db: Db,
  userId: string,
  template: Item,
  templateRow: ItemRow,
  spec: GenerationSpec,
  occurrenceKey: string
): Item {
  const child = spec.child;
  const title = resolveChildTitle(child.title, occurrenceKey, template);
  const base = newItemRow(userId, title);

  const inserted = db.items.insert({
    ...base,
    body: child.body,
    isTask: child.isTask,
    isDocumentation: child.isDocumentation,
    taskStatus: child.isTask ? "active" : "",
    tags: templateRow.tags,
    location: template.location,
    completionRule: child.completionRule ? toJson(child.completionRule) : "",
    documentationSchema: child.inputSchema.length > 0 ? toJson(child.inputSchema) : "",
    documentationData:
      child.inputSchema.length > 0 ? toJson(childDocumentationData(child)) : "",
    generatedFromId: template.id,
    occurrenceKey,
    recurrenceRule: "",
    overriddenFields: "[]"
  }) as ItemRow;

  const item = itemFromRow(inserted);
  const times = slotTimesForOccurrence(occurrenceKey, child.schedule);
  const boxRow = db.scheduleSlots.insert(
    newScheduleSlotRow(userId, {
      kind: "fixed",
      startsAt: times.startsAt,
      endsAt: times.endsAt
    })
  ) as { id: string };
  db.slotAssignments.insert({ ownerId: userId, slotId: boxRow.id, itemId: item.id });
  ensureGeneratesLink(db, userId, template.id, item.id);
  return item;
}

function syncOccurrenceSchedule(
  db: Db,
  userId: string,
  item: Item,
  spec: GenerationSpec,
  overrides: Set<string>
): void {
  if (overrides.has(OVERRIDE_FIELDS.scheduleStartsAt) || overrides.has(OVERRIDE_FIELDS.scheduleEndsAt)) {
    return;
  }

  const times = slotTimesForOccurrence(item.occurrenceKey, spec.child.schedule);
  const slots = listSlotRowsForItem(db, userId, item.id).filter((slot) => slot.slotStatus !== "archived");
  const primary = slots[0];

  if (primary) {
    if (primary.startsAt !== times.startsAt || primary.endsAt !== times.endsAt) {
      db.scheduleSlots.update(primary.id, { startsAt: times.startsAt, endsAt: times.endsAt });
    }
    return;
  }

  const boxRow = db.scheduleSlots.insert(
    newScheduleSlotRow(userId, {
      kind: "fixed",
      startsAt: times.startsAt,
      endsAt: times.endsAt
    })
  ) as { id: string };
  db.slotAssignments.insert({ ownerId: userId, slotId: boxRow.id, itemId: item.id });
}

function applySpecToFutureOccurrence(
  db: Db,
  userId: string,
  template: Item,
  item: Item,
  spec: GenerationSpec
): void {
  const overrides = new Set(item.overriddenFields);
  const child = spec.child;
  const updates: Partial<ItemRow> = {};
  const desiredTitle = resolveChildTitle(child.title, item.occurrenceKey, template);

  if (!overrides.has(OVERRIDE_FIELDS.title) && item.title !== desiredTitle) {
    updates.title = desiredTitle;
  }
  if (!overrides.has(OVERRIDE_FIELDS.body) && item.body !== child.body) {
    updates.body = child.body;
  }
  if (!overrides.has(OVERRIDE_FIELDS.isTask) && item.isTask !== child.isTask) {
    updates.isTask = child.isTask;
    if (!child.isTask) {
      updates.taskStatus = "";
    } else if (!item.isTask) {
      updates.taskStatus = "active";
    }
  }
  if (!overrides.has(OVERRIDE_FIELDS.isDocumentation) && item.isDocumentation !== child.isDocumentation) {
    updates.isDocumentation = child.isDocumentation;
  }
  if (!overrides.has(OVERRIDE_FIELDS.completionRule)) {
    const nextRule = child.completionRule ? toJson(child.completionRule) : "";
    const currentRule = item.completionRule ? toJson(item.completionRule) : "";
    if (nextRule !== currentRule) {
      updates.completionRule = nextRule;
    }
  }
  if (!overrides.has(OVERRIDE_FIELDS.inputSchema)) {
    const nextSchema = child.inputSchema.length > 0 ? toJson(child.inputSchema) : "";
    const currentSchema = item.documentationSchema ? toJson(item.documentationSchema) : "";
    if (nextSchema !== currentSchema) {
      updates.documentationSchema = nextSchema;
      if (child.inputSchema.length > 0 && !item.documentationData) {
        updates.documentationData = toJson(childDocumentationData(child));
      }
    }
  }

  if (Object.keys(updates).length > 0) {
    db.items.update(item.id, updates);
  }

  syncOccurrenceSchedule(db, userId, item, spec, overrides);
  ensureGeneratesLink(db, userId, template.id, item.id);
}

export function syncOccurrences(db: Db, userId: string, templateId: string, now = new Date()): void {
  const row = db.items.get(templateId) as ItemRow | null;
  if (!row || row.ownerId !== userId) {
    return;
  }

  const template = itemFromRow(row);
  const spec = parseGenerationSpec(template.recurrenceRule, template);
  if (!spec) {
    return;
  }

  const keys = plannedOccurrenceKeys(spec, template, now);
  const keySet = new Set(keys);
  const todayKey = formatOccurrenceKey(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  const existing = listOccurrences(db, userId, templateId);
  const existingByKey = new Map(existing.map((item) => [item.occurrenceKey, item]));

  for (const item of existing) {
    const isFuture = item.occurrenceKey >= todayKey;
    if (isFuture && !keySet.has(item.occurrenceKey)) {
      deleteOccurrence(db, userId, templateId, item);
    }
  }

  for (const key of keys) {
    const current = existingByKey.get(key);
    if (!current) {
      createOccurrence(db, userId, template, row, spec, key);
      continue;
    }
    if (isPastOccurrenceKey(key, now)) {
      ensureGeneratesLink(db, userId, template.id, current.id);
      continue;
    }
    applySpecToFutureOccurrence(db, userId, template, current, spec);
  }
}

export function deleteOccurrencesForTemplate(db: Db, userId: string, templateId: string): void {
  for (const item of listOccurrences(db, userId, templateId)) {
    deleteOccurrence(db, userId, templateId, item);
  }
}

export function syncAllGenerations(db: Db, userId: string, now = new Date()): void {
  const templates = db.items
    .where("ownerId", userId)
    .all()
    .map((row) => itemFromRow(row as ItemRow))
    .filter((item) => item.recurrenceRule && !item.generatedFromId);

  for (const template of templates) {
    syncOccurrences(db, userId, template.id, now);
  }
}

export function trackGeneratedItemOverrides(
  item: Item,
  patchKeys: string[]
): string[] | null {
  if (!item.generatedFromId) {
    return null;
  }

  const fieldMap: Record<string, string> = {
    title: OVERRIDE_FIELDS.title,
    body: OVERRIDE_FIELDS.body,
    isTask: OVERRIDE_FIELDS.isTask,
    isDocumentation: OVERRIDE_FIELDS.isDocumentation,
    completionRule: OVERRIDE_FIELDS.completionRule,
    documentationSchema: OVERRIDE_FIELDS.inputSchema,
    taskStatus: OVERRIDE_FIELDS.taskStatus
  };

  const additions = patchKeys.map((key) => fieldMap[key]).filter((entry): entry is string => Boolean(entry));
  if (additions.length === 0) {
    return null;
  }
  return mergeOverriddenFields(item.overriddenFields, additions);
}

function trackGeneratedScheduleOverrides(item: Item, patch: ScheduleSlotPatch): string[] | null {
  if (!item.generatedFromId) {
    return null;
  }

  const additions: string[] = [];
  if (patch.startsAt !== undefined) {
    additions.push(OVERRIDE_FIELDS.scheduleStartsAt);
  }
  if (patch.endsAt !== undefined) {
    additions.push(OVERRIDE_FIELDS.scheduleEndsAt);
  }
  if (additions.length === 0) {
    return null;
  }
  return mergeOverriddenFields(item.overriddenFields, additions);
}

export function trackGeneratedScheduleOverridesForSlot(
  db: ServerContext["db"],
  userId: string,
  slotId: string,
  patch: ScheduleSlotPatch
): void {
  if (patch.startsAt === undefined && patch.endsAt === undefined) {
    return;
  }
  const itemIds = itemsAssignedToSlot(db, userId, slotId);
  for (const itemId of itemIds) {
    const row = db.items.get(itemId);
    if (!row) {
      continue;
    }
    const item = itemFromRowAgain(row as ItemRow);
    if (!item.generatedFromId) {
      continue;
    }
    const overrideFields = trackGeneratedScheduleOverrides(item, patch);
    if (overrideFields) {
      db.items.update(itemId, { overriddenFields: toJson(overrideFields) });
    }
  }
}
