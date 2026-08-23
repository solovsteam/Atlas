import type { SupabaseClient } from "@supabase/supabase-js";
import { itemLinkFromDbRow, type ItemLink } from "@shared/links";
import type { Database, DbItemLinkRow } from "../types/database";

type Client = SupabaseClient<Database>;

export async function fetchOwnedItemLinks(client: Client, userId: string): Promise<ItemLink[]> {
  const { data, error } = await client.from("item_links").select("*").eq("owner_id", userId);

  if (error) {
    if (error.message.toLowerCase().includes("item_links") || error.message.toLowerCase().includes("schema cache")) {
      return [];
    }
    throw new Error(error.message);
  }

  return (data ?? [])
    .map((row) => itemLinkFromDbRow(row as DbItemLinkRow))
    .filter((link): link is ItemLink => Boolean(link));
}

export async function createScheduledInLink(
  client: Client,
  userId: string,
  taskId: string,
  intervalId: string
): Promise<ItemLink> {
  const { data, error } = await client
    .from("item_links")
    .insert({
      owner_id: userId,
      from_id: taskId,
      to_id: intervalId,
      kind: "scheduled_in"
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const link = itemLinkFromDbRow(data as DbItemLinkRow);
  if (!link) {
    throw new Error("Could not create link");
  }
  return link;
}

export async function deleteItemLink(client: Client, linkId: string): Promise<void> {
  const { error } = await client.from("item_links").delete().eq("id", linkId);
  if (error) {
    throw new Error(error.message);
  }
}

export async function replaceScheduledInLink(
  client: Client,
  userId: string,
  taskId: string,
  intervalId: string | null,
  existingLinks: ItemLink[]
): Promise<ItemLink[]> {
  const current = existingLinks.filter((link) => link.kind === "scheduled_in" && link.fromId === taskId);

  for (const link of current) {
    await deleteItemLink(client, link.id);
  }

  if (!intervalId) {
    return existingLinks.filter((link) => !current.some((entry) => entry.id === link.id));
  }

  const created = await createScheduledInLink(client, userId, taskId, intervalId);
  return [...existingLinks.filter((link) => !current.some((entry) => entry.id === link.id)), created];
}
