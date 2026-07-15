import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyPatch,
  cleanTitle,
  EXTENDED_SCHEMA_MESSAGE,
  itemFromDbRow,
  itemToDbInsert,
  newItemInsert,
  parseJson,
  patchUsesExtendedFields,
  type CreateItemResult,
  type Item,
  type ItemPatch,
  type UpdateItemResult
} from "@shared/item";
import { validateParentTaskAssignment } from "@shared/subtasks";
import type { Database, DbItemRow } from "../types/database";

type Client = SupabaseClient<Database>;

export type UpdateItemOptions = {
  knownItem?: Item;
  extendedSchema?: boolean;
};

export async function fetchOwnedItems(client: Client, userId: string): Promise<Item[]> {
  const { data, error } = await client
    .from("items")
    .select("*")
    .eq("owner_id", userId)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => itemFromDbRow(row as DbItemRow));
}

export async function listOwnedItems(client: Client, userId: string): Promise<Item[]> {
  return fetchOwnedItems(client, userId);
}

export type CreateItemOptions = {
  isTask?: boolean;
  parentTaskId?: string | null;
};

export async function createItem(
  client: Client,
  userId: string,
  title: string,
  options: CreateItemOptions = {}
): Promise<CreateItemResult> {
  const clean = cleanTitle(title);
  if (!clean) {
    throw new Error("Title required");
  }

  if (options.parentTaskId) {
    const items = await fetchOwnedItems(client, userId);
    const error = validateParentTaskAssignment("new", options.parentTaskId, items);
    if (error) {
      throw new Error(error);
    }
    const parent = items.find((entry) => entry.id === options.parentTaskId);
    if (!parent?.isTask) {
      throw new Error("Parent must be a task");
    }
  }

  const insert = {
    ...newItemInsert(userId, clean),
    ...(options.isTask ? { is_task: true, task_status: "active" } : {}),
    ...(options.parentTaskId ? { parent_task_id: options.parentTaskId } : {})
  };

  const { data, error } = await client
    .from("items")
    .insert(insert)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create item");
  }

  return { id: data.id, revision: data.revision };
}

export async function updateItem(
  client: Client,
  userId: string,
  id: string,
  patchJson: string,
  expectedRevision: number,
  options: UpdateItemOptions = {}
): Promise<UpdateItemResult> {
  const extendedSchema = options.extendedSchema ?? true;
  const patch = parseJson<ItemPatch>(patchJson, {});

  if (patchUsesExtendedFields(patch) && !extendedSchema) {
    throw new Error(EXTENDED_SCHEMA_MESSAGE);
  }

  let current: Item | null = options.knownItem ?? null;
  if (current && (current.id !== id || current.ownerId !== userId)) {
    current = null;
  }

  if (!current) {
    const { data: row, error: fetchError } = await client.from("items").select("*").eq("id", id).single();
    if (fetchError || !row) {
      throw new Error("Item not found");
    }
    const dbRow = row as DbItemRow;
    if (dbRow.owner_id !== userId) {
      throw new Error("Item not found");
    }
    current = itemFromDbRow(dbRow);
  }

  if (current.revision !== expectedRevision) {
    return { conflict: true, serverItem: current };
  }

  if (patch.parentTaskId !== undefined) {
    const items = await fetchOwnedItems(client, userId);
    const error = validateParentTaskAssignment(id, patch.parentTaskId, items);
    if (error) {
      throw new Error(error);
    }
    if (patch.parentTaskId && !current.isTask && patch.isTask !== true) {
      throw new Error("Only tasks can be subtasks");
    }
  }

  const updates = applyPatch(current, patch, { includeExtended: extendedSchema });
  if (Object.keys(updates).length === 0) {
    return { ok: true, revision: current.revision };
  }

  const nextRevision = current.revision + 1;
  const { data: updated, error: updateError } = await client
    .from("items")
    .update({ ...updates, revision: nextRevision })
    .eq("id", id)
    .eq("revision", expectedRevision)
    .select("*")
    .maybeSingle();

  if (updateError) {
    throw new Error(updateError.message);
  }

  if (!updated) {
    const { data: latest } = await client.from("items").select("*").eq("id", id).single();
    if (latest) {
      return { conflict: true, serverItem: itemFromDbRow(latest as DbItemRow) };
    }
    throw new Error("Item not found");
  }

  return { ok: true, revision: nextRevision };
}

export async function deleteItem(client: Client, userId: string, id: string): Promise<void> {
  const { data, error } = await client.from("items").delete().eq("id", id).eq("owner_id", userId).select("id");

  if (error) {
    throw new Error(error.message);
  }

  if (!data?.length) {
    throw new Error("Could not delete item");
  }
}

export async function restoreItem(client: Client, userId: string, item: Item): Promise<void> {
  const { data, error } = await client
    .from("items")
    .insert(itemToDbInsert(item, userId))
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Could not restore item");
  }
}
