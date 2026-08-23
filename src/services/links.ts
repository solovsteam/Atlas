import type { SupabaseClient } from "@supabase/supabase-js";
import { linkFromDbRow, type ItemLink, type LinkKind } from "@shared/links";
import type { Database, DbItemLinkRow } from "../types/database";

type Client = SupabaseClient<Database>;

export async function fetchOwnedLinks(client: Client, userId: string): Promise<ItemLink[]> {
  const { data, error } = await client.from("item_links").select("*").eq("owner_id", userId).order("created_at", { ascending: true });
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => linkFromDbRow(row as DbItemLinkRow));
}

export async function createLink(
  client: Client,
  userId: string,
  fromId: string,
  toId: string,
  kind: LinkKind
): Promise<ItemLink> {
  if (fromId === toId) {
    throw new Error("Cannot link an item to itself");
  }
  const { data, error } = await client
    .from("item_links")
    .insert({ owner_id: userId, from_id: fromId, to_id: toId, kind })
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create link");
  }
  return linkFromDbRow(data as DbItemLinkRow);
}

export async function deleteLink(client: Client, userId: string, id: string): Promise<void> {
  const { data, error } = await client.from("item_links").delete().eq("id", id).eq("owner_id", userId).select("id");
  if (error) {
    throw new Error(error.message);
  }
  if (!data?.length) {
    throw new Error("Could not delete link");
  }
}

export async function restoreLink(client: Client, userId: string, link: ItemLink): Promise<ItemLink> {
  const { data, error } = await client
    .from("item_links")
    .insert({
      id: link.id,
      owner_id: userId,
      from_id: link.fromId,
      to_id: link.toId,
      kind: link.kind
    })
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "Could not restore link");
  }
  return linkFromDbRow(data as DbItemLinkRow);
}

export async function deleteLinksByIds(client: Client, userId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  const { error } = await client.from("item_links").delete().eq("owner_id", userId).in("id", ids);
  if (error) {
    throw new Error(error.message);
  }
}
