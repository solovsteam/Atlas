import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyPatch,
  cleanTitle,
  itemFromDbRow,
  newItemInsert,
  parseJson,
  type CreateItemResult,
  type Item,
  type ItemPatch,
  type UpdateItemResult
} from "@shared/item";
import type { Database, DbItemRow } from "../types/database";

type Client = SupabaseClient<Database>;

export async function listOwnedItems(client: Client, userId: string): Promise<Item[]> {
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

export async function createItem(client: Client, userId: string, title: string): Promise<CreateItemResult> {
  const clean = cleanTitle(title);
  if (!clean) {
    throw new Error("Title required");
  }

  const { data, error } = await client
    .from("items")
    .insert(newItemInsert(userId, clean))
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
  expectedRevision: number
): Promise<UpdateItemResult> {
  const { data: row, error: fetchError } = await client.from("items").select("*").eq("id", id).single();

  if (fetchError || !row) {
    throw new Error("Item not found");
  }

  const dbRow = row as DbItemRow;
  if (dbRow.owner_id !== userId) {
    throw new Error("Item not found");
  }

  const current = itemFromDbRow(dbRow);
  if (current.revision !== expectedRevision) {
    return { conflict: true, serverItem: current };
  }

  const patch = parseJson<ItemPatch>(patchJson, {});
  const updates = applyPatch(current, patch);
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

export async function deleteItem(client: Client, userId: string, id: string): Promise<boolean> {
  const { data: row } = await client.from("items").select("owner_id").eq("id", id).maybeSingle();
  if (!row || row.owner_id !== userId) {
    return false;
  }

  const { error } = await client.from("items").delete().eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
  return true;
}
